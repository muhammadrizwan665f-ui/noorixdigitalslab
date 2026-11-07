import { Hono } from 'hono';
import { z } from 'zod';
import type { HonoEnv } from '../types';
import { AppError, body, bad, notFound, parse } from '../lib/http';
import { requireAuth, can } from '../lib/auth';
import { rateLimit } from '../lib/ratelimit';
import { PROOF_TYPES, IMAGES, serveObject, storeUpload } from '../lib/files';
import { placeOrder } from '../services/checkout';
import { createDeposit } from '../services/wallet';
import { dispatchProvider } from '../services/providers';
import { loadDeliveries, requestRefund } from '../services/delivery';
import { randomCode, uid } from '../lib/crypto';
import { notifyStmt } from '../lib/notify';
import { NOW } from '../services/sql';

export const account = new Hono<HonoEnv>();
account.use('*', requireAuth);
const page = (c: any) => parse(z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(10), status: z.string().max(30).optional() }), c.req.query());

account.get('/overview', async (c) => {
  const u = c.get('user')!; const db = c.env.DB;
  const [bal, orders, tickets, recent, spent] = await Promise.all([
    db.prepare('SELECT balance FROM wallet_accounts WHERE user_id=?').bind(u.id).first<any>(),
    db.prepare('SELECT COUNT(*) n FROM orders WHERE user_id=?').bind(u.id).first<any>(),
    db.prepare("SELECT COUNT(*) n FROM support_tickets WHERE user_id=? AND status NOT IN ('resolved','closed')").bind(u.id).first<any>(),
    db.prepare(`SELECT o.order_no,o.status,o.total,o.created_at,(SELECT product_name FROM order_items WHERE order_id=o.id LIMIT 1) first_item,(SELECT COUNT(*) FROM order_items WHERE order_id=o.id) item_count FROM orders o WHERE o.user_id=? ORDER BY o.created_at DESC LIMIT 5`).bind(u.id).all(),
    db.prepare("SELECT COALESCE(SUM(-amount),0) n FROM wallet_transactions WHERE user_id=? AND kind='purchase'").bind(u.id).first<any>(),
  ]);
  return c.json({ balance: bal?.balance ?? 0, totalOrders: orders.n, openTickets: tickets.n, totalSpent: spent.n, recentOrders: recent.results });
});

account.get('/wallet', async (c) => {
  const u = c.get('user')!; const p = page(c);
  const [bal, tx, n, deps] = await Promise.all([
    c.env.DB.prepare('SELECT balance FROM wallet_accounts WHERE user_id=?').bind(u.id).first<any>(),
    c.env.DB.prepare('SELECT id,kind,amount,balance_after,note,created_at FROM wallet_transactions WHERE user_id=? ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?').bind(u.id, p.pageSize, (p.page - 1) * p.pageSize).all(),
    c.env.DB.prepare('SELECT COUNT(*) n FROM wallet_transactions WHERE user_id=?').bind(u.id).first<any>(),
    c.env.DB.prepare('SELECT id,method_code,amount,payment_reference,status,review_note,created_at FROM deposits WHERE user_id=? ORDER BY created_at DESC LIMIT 20').bind(u.id).all(),
  ]);
  return c.json({ balance: bal?.balance ?? 0, transactions: tx.results, total: n.n, deposits: deps.results });
});

account.post('/uploads/proof', async (c) => {
  const u = c.get('user')!; await rateLimit(c.env, `upl:${u.id}`, 20, 3600);
  const f = await storeUpload(c.env, await c.req.formData(), { prefix: `proofs/${u.id}/`, allowed: PROOF_TYPES, maxBytes: 3 * 1024 * 1024 });
  return c.json({ key: f.key, name: f.name });
});
account.post('/uploads/attachment', async (c) => {
  const u = c.get('user')!; await rateLimit(c.env, `upl:${u.id}`, 20, 3600);
  const f = await storeUpload(c.env, await c.req.formData(), { prefix: `attachments/${u.id}/`, allowed: PROOF_TYPES, maxBytes: 3 * 1024 * 1024 });
  return c.json({ key: f.key, name: f.name });
});

account.post('/deposits', async (c) => {
  const u = c.get('user')!;
  const i = await body(c, z.object({
    methodCode: z.string().max(30), amount: z.number().int().positive().max(100_000_000), reference: z.string().trim().min(4).max(60),
    senderName: z.string().trim().max(80).optional(), senderAccount: z.string().trim().max(40).optional(), proofKey: z.string().max(200).optional().nullable(),
  }));
  await rateLimit(c.env, `dep:${u.id}`, 10, 3600);
  if (i.proofKey && !i.proofKey.startsWith(`proofs/${u.id}/`)) throw bad('Invalid proof file');
  const id = await createDeposit(c.env, u.id, i);
  return c.json({ id }, 201);
});

// ── orders
account.post('/orders', async (c) => {
  const u = c.get('user')!;
  const i = await body(c, z.object({
    items: z.array(z.object({ planId: z.string().min(1), input: z.record(z.string()).optional() })).min(1).max(20),
    couponCode: z.string().max(40).optional().nullable(), idempotencyKey: z.string().min(8).max(80), note: z.string().max(500).optional().nullable(),
  }));
  await rateLimit(c.env, `ord:${u.id}`, 30, 3600);
  const r = await placeOrder(c.env, u, i);
  for (const id of r.apiItemIds) {
    const job = dispatchProvider(c.env, id).catch((e) => console.error('provider dispatch failed', e));
    let ctx: ExecutionContext | null = null; try { ctx = c.executionCtx; } catch { /* no ExecutionContext (tests) */ }
    if (ctx) ctx.waitUntil(job); else await job;
  }
  return c.json({ orderId: r.orderId, orderNo: r.orderNo, replay: r.replay }, r.replay ? 200 : 201);
});

account.get('/orders', async (c) => {
  const u = c.get('user')!; const p = page(c);
  const w = p.status ? 'AND o.status=?' : ''; const a: unknown[] = p.status ? [u.id, p.status] : [u.id];
  const n = await c.env.DB.prepare(`SELECT COUNT(*) n FROM orders o WHERE o.user_id=? ${w}`).bind(...a).first<any>();
  const rows = await c.env.DB.prepare(
    `SELECT o.order_no,o.status,o.total,o.created_at,(SELECT group_concat(product_name || ' · ' || plan_name, ', ') FROM order_items WHERE order_id=o.id) items FROM orders o WHERE o.user_id=? ${w} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`)
    .bind(...a, p.pageSize, (p.page - 1) * p.pageSize).all();
  return c.json({ items: rows.results, total: n.n });
});

account.get('/orders/:orderNo', async (c) => {
  const u = c.get('user')!;
  const o = await c.env.DB.prepare('SELECT * FROM orders WHERE order_no=? AND user_id=?').bind(c.req.param('orderNo'), u.id).first<any>();
  if (!o) throw notFound('Order not found');
  const items = (await c.env.DB.prepare('SELECT id,product_id,product_name,plan_name,unit_price,discount,paid,delivery_type,refund_eligible,customer_input,status,created_at,completed_at FROM order_items WHERE order_id=?').bind(o.id).all<any>()).results;
  const dl = await loadDeliveries(c.env, items.map((i) => i.id));
  const events = (await c.env.DB.prepare('SELECT kind,message,created_at FROM order_events WHERE order_id=? ORDER BY created_at, rowid').bind(o.id).all()).results;
  const refunds = (await c.env.DB.prepare('SELECT id,order_item_id,amount,status,reason,review_note,created_at FROM refunds WHERE order_id=?').bind(o.id).all()).results;
  return c.json({
    orderNo: o.order_no, status: o.status, subtotal: o.subtotal, discount: o.discount, total: o.total, couponCode: o.coupon_code, createdAt: o.created_at, completedAt: o.completed_at,
    items: items.map((i) => ({ ...i, customer_input: JSON.parse(i.customer_input), deliveries: dl.get(i.id) ?? [] })), events, refunds,
  });
});

account.post('/order-items/:id/refund', async (c) => {
  const u = c.get('user')!;
  const i = await body(c, z.object({ reason: z.string().trim().min(5).max(500) }));
  await rateLimit(c.env, `rfd:${u.id}`, 10, 3600);
  await requestRefund(c.env, u.id, c.req.param('id'), i.reason);
  return c.json({ ok: true }, 201);
});

// ── tickets
account.get('/tickets', async (c) => {
  const u = c.get('user')!;
  return c.json((await c.env.DB.prepare('SELECT ticket_no,subject,category,priority,status,created_at,updated_at FROM support_tickets WHERE user_id=? ORDER BY updated_at DESC LIMIT 100').bind(u.id).all()).results);
});
account.post('/tickets', async (c) => {
  const u = c.get('user')!;
  const i = await body(c, z.object({
    subject: z.string().trim().min(4).max(120), message: z.string().trim().min(5).max(4000), category: z.enum(['general', 'order', 'payment', 'delivery', 'refund', 'technical']).default('general'),
    orderNo: z.string().max(20).optional().nullable(), attachmentKey: z.string().max(200).optional().nullable(), attachmentName: z.string().max(100).optional().nullable(),
  }));
  await rateLimit(c.env, `tk:${u.id}`, 10, 3600);
  if (i.attachmentKey && !i.attachmentKey.startsWith(`attachments/${u.id}/`)) throw bad('Invalid attachment');
  let orderId: string | null = null;
  if (i.orderNo) { const o = await c.env.DB.prepare('SELECT id FROM orders WHERE order_no=? AND user_id=?').bind(i.orderNo, u.id).first<any>(); if (!o) throw bad('Order not found'); orderId = o.id; }
  const id = uid(); const no = 'TK' + randomCode(6);
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO support_tickets(id,ticket_no,user_id,subject,category,order_id) VALUES(?,?,?,?,?,?)').bind(id, no, u.id, i.subject, i.category, orderId),
    c.env.DB.prepare('INSERT INTO support_messages(id,ticket_id,author_id,is_staff,body,attachment_key,attachment_name) VALUES(?,?,?,0,?,?,?)').bind(uid(), id, u.id, i.message, i.attachmentKey ?? null, i.attachmentName ?? null),
    notifyStmt(c.env, u.id, 'ticket', 'Ticket created', `${no}: ${i.subject}`, `/dashboard/tickets/${no}`),
  ]);
  return c.json({ ticketNo: no }, 201);
});
account.get('/tickets/:no', async (c) => {
  const u = c.get('user')!;
  const t = await c.env.DB.prepare('SELECT * FROM support_tickets WHERE ticket_no=? AND user_id=?').bind(c.req.param('no'), u.id).first<any>();
  if (!t) throw notFound('Ticket not found');
  const msgs = await c.env.DB.prepare(`SELECT m.id,m.is_staff,m.body,m.attachment_key,m.attachment_name,m.created_at,CASE WHEN m.is_staff=1 THEN 'Support' ELSE us.name END author
    FROM support_messages m JOIN users us ON us.id=m.author_id WHERE m.ticket_id=? AND m.is_internal=0 ORDER BY m.created_at, m.rowid`).bind(t.id).all<any>();
  return c.json({ ticketNo: t.ticket_no, subject: t.subject, status: t.status, category: t.category, createdAt: t.created_at,
    messages: msgs.results.map((m) => ({ id: m.id, isStaff: !!m.is_staff, body: m.body, author: m.author, createdAt: m.created_at, attachment: m.attachment_key ? { key: m.attachment_key, name: m.attachment_name } : null })) });
});
account.post('/tickets/:no/reply', async (c) => {
  const u = c.get('user')!;
  const i = await body(c, z.object({ message: z.string().trim().min(1).max(4000), attachmentKey: z.string().max(200).optional().nullable(), attachmentName: z.string().max(100).optional().nullable() }));
  await rateLimit(c.env, `tkr:${u.id}`, 40, 3600);
  if (i.attachmentKey && !i.attachmentKey.startsWith(`attachments/${u.id}/`)) throw bad('Invalid attachment');
  const t = await c.env.DB.prepare('SELECT id,status FROM support_tickets WHERE ticket_no=? AND user_id=?').bind(c.req.param('no'), u.id).first<any>();
  if (!t) throw notFound('Ticket not found');
  if (t.status === 'closed') throw new AppError(409, 'closed', 'This ticket is closed. Please open a new one.');
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO support_messages(id,ticket_id,author_id,is_staff,body,attachment_key,attachment_name) VALUES(?,?,?,0,?,?,?)').bind(uid(), t.id, u.id, i.message, i.attachmentKey ?? null, i.attachmentName ?? null),
    c.env.DB.prepare(`UPDATE support_tickets SET status='open', updated_at=${NOW} WHERE id=?`).bind(t.id),
  ]);
  return c.json({ ok: true }, 201);
});
account.post('/tickets/:no/close', async (c) => {
  const u = c.get('user')!;
  const r = await c.env.DB.prepare(`UPDATE support_tickets SET status='closed', updated_at=${NOW} WHERE ticket_no=? AND user_id=?`).bind(c.req.param('no'), u.id).run();
  if (!r.meta.changes) throw notFound('Ticket not found');
  return c.json({ ok: true });
});

// ── notifications
account.get('/notifications', async (c) => {
  const u = c.get('user')!;
  return c.json((await c.env.DB.prepare('SELECT id,type,title,body,link,read_at,created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC, rowid DESC LIMIT 50').bind(u.id).all()).results);
});
account.post('/notifications/read', async (c) => {
  const u = c.get('user')!;
  const i = await body(c, z.object({ id: z.string().optional() }));
  if (i.id) await c.env.DB.prepare(`UPDATE notifications SET read_at=${NOW} WHERE id=? AND user_id=? AND read_at IS NULL`).bind(i.id, u.id).run();
  else await c.env.DB.prepare(`UPDATE notifications SET read_at=${NOW} WHERE user_id=? AND read_at IS NULL`).bind(u.id).run();
  return c.json({ ok: true });
});

/** Private file download with ownership/permission checks. Key is passed as ?key= */
export const files = new Hono<HonoEnv>();
files.get('/download', requireAuth, async (c) => {
  const u = c.get('user')!; const key = c.req.query('key') ?? '';
  if (key.includes('..')) throw bad('Invalid key');
  const parts = key.split('/');
  let ok = false;
  if ((parts[0] === 'proofs' || parts[0] === 'attachments') && parts.length === 3) {
    ok = parts[1] === u.id || (!!u.is_staff && !!(can(c, "deposits.review") || can(c, "support.manage")));
  } else if (parts[0] === 'deliveries') {
    const r = await c.env.DB.prepare('SELECT o.user_id FROM order_deliveries d JOIN order_items i ON i.id=d.order_item_id JOIN orders o ON o.id=i.order_id WHERE d.file_key=?').bind(key).first<any>();
    ok = !!r && (r.user_id === u.id || (!!u.is_staff && !!(can(c, "orders.deliver") || can(c, "orders.manage"))));
  }
  if (!ok) throw new AppError(404, 'not_found', 'File not found');
  return serveObject(c.env, key, true);
});
