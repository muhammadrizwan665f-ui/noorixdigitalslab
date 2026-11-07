import { Hono } from 'hono';
import { z } from 'zod';
import type { HonoEnv } from '../types';
import { AppError, bad, body, conflict, notFound, parse, toCsv } from '../lib/http';
import { requirePerm, requireStaff, can } from '../lib/auth';
import { DELIVERY_TYPES, storeUpload } from '../lib/files';
import { approveDeposit, rejectDeposit, adjustWallet } from '../services/wallet';
import { deliverItem, markItemFailed, refundItem, rejectRefund, loadDeliveries } from '../services/delivery';
import { dispatchProvider } from '../services/providers';
import { audit, auditStmt, notifyStmt } from '../lib/notify';
import { encryptSecret, sha256Hex, uid, decryptSecret } from '../lib/crypto';
import { NOW } from '../services/sql';

export const ops = new Hono<HonoEnv>();
ops.use('*', requireStaff);
const pg = (c: any) => parse(z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), q: z.string().trim().max(80).optional(), status: z.string().max(30).optional() }), c.req.query());
const like = (q: string) => `%${q.replace(/[%_]/g, '')}%`;

// ── dashboard
ops.get('/dashboard', requirePerm('dashboard.view'), async (c) => {
  const db = c.env.DB; const sees = (p: string) => can(c, p);
  const one = async (sql: string, ...a: unknown[]) => (await db.prepare(sql).bind(...a).first<any>()) ?? {};
  const [rev, ords, cust, pendO, pendD, tick, liab, ref] = await Promise.all([
    one("SELECT COALESCE(SUM(total),0) n FROM orders WHERE status IN ('processing','completed')"),
    one('SELECT COUNT(*) n FROM orders'), one('SELECT COUNT(*) n FROM users WHERE is_staff=0'),
    one("SELECT COUNT(*) n FROM order_items WHERE status='processing'"),
    one("SELECT COUNT(*) n FROM deposits WHERE status='pending'"),
    one("SELECT COUNT(*) n FROM support_tickets WHERE status IN ('open','in_progress')"),
    one('SELECT COALESCE(SUM(balance),0) n FROM wallet_accounts'),
    one("SELECT COUNT(*) n FROM refunds WHERE status='requested'"),
  ]);
  // daily series in Asia/Karachi (UTC+5)
  const series = (await db.prepare("SELECT date(created_at,'+5 hours') d, COUNT(*) orders, SUM(total) revenue FROM orders WHERE status IN ('processing','completed') AND created_at >= datetime('now','-30 days') GROUP BY d ORDER BY d").all()).results;
  const byStatus = (await db.prepare('SELECT status, COUNT(*) n FROM orders GROUP BY status').all()).results;
  const recent = (await db.prepare('SELECT o.order_no,o.status,o.total,o.created_at,u.name customer FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC LIMIT 8').all()).results;
  const lowStock = (await db.prepare(`SELECT p.name product, pl.name plan, (SELECT COUNT(*) FROM product_inventory i WHERE i.plan_id=pl.id AND i.status='available') n
    FROM product_plans pl JOIN products p ON p.id=pl.product_id WHERE p.delivery_type='automatic' AND p.status='active' ORDER BY n LIMIT 5`).all()).results;
  return c.json({
    revenue: sees('reports.view') || sees('orders.view') ? rev.n : null, totalOrders: ords.n, customers: cust.n, pendingDeliveries: pendO.n, pendingDeposits: pendD.n, openTickets: tick.n,
    walletLiability: sees('wallets.view') ? liab.n : null, refundRequests: ref.n, series, byStatus, recent, lowStock,
  });
});

// ── customers
ops.get('/customers', requirePerm('customers.view'), async (c) => {
  const p = pg(c); const w = ['u.is_staff=0']; const a: unknown[] = [];
  if (p.q) { w.push('(u.email LIKE ? OR u.name LIKE ? OR u.phone LIKE ?)'); a.push(like(p.q), like(p.q), like(p.q)); }
  if (p.status) { w.push('u.status=?'); a.push(p.status); }
  const where = w.join(' AND ');
  const n = await c.env.DB.prepare(`SELECT COUNT(*) n FROM users u WHERE ${where}`).bind(...a).first<any>();
  const rows = await c.env.DB.prepare(`SELECT u.id,u.name,u.email,u.phone,u.status,u.created_at,u.last_login_at,COALESCE(w.balance,0) balance,(SELECT COUNT(*) FROM orders o WHERE o.user_id=u.id) orders
    FROM users u LEFT JOIN wallet_accounts w ON w.user_id=u.id WHERE ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`).bind(...a, p.pageSize, (p.page - 1) * p.pageSize).all();
  return c.json({ items: rows.results, total: n.n });
});
ops.get('/customers/:id', requirePerm('customers.view'), async (c) => {
  const id = c.req.param('id'); const db = c.env.DB;
  const u = await db.prepare('SELECT id,name,email,phone,status,email_verified_at,created_at,last_login_at FROM users WHERE id=? AND is_staff=0').bind(id).first();
  if (!u) throw notFound('Customer not found');
  const [bal, orders, tx, deps] = await Promise.all([
    db.prepare('SELECT balance FROM wallet_accounts WHERE user_id=?').bind(id).first<any>(),
    db.prepare('SELECT order_no,status,total,created_at FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 20').bind(id).all(),
    can(c, 'wallets.view') ? db.prepare('SELECT kind,amount,balance_after,note,created_at FROM wallet_transactions WHERE user_id=? ORDER BY created_at DESC, rowid DESC LIMIT 30').bind(id).all() : Promise.resolve({ results: [] }),
    db.prepare('SELECT id,method_code,amount,status,created_at FROM deposits WHERE user_id=? ORDER BY created_at DESC LIMIT 10').bind(id).all(),
  ]);
  return c.json({ ...u, balance: bal?.balance ?? 0, orders: orders.results, transactions: tx.results, deposits: deps.results });
});
ops.post('/customers/:id/status', requirePerm('customers.manage'), async (c) => {
  const i = await body(c, z.object({ status: z.enum(['active', 'suspended', 'banned']) }));
  const id = c.req.param('id');
  const r = await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET status=? WHERE id=? AND is_staff=0').bind(i.status, id),
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id=? AND ?<>'active'").bind(id, i.status),
    auditStmt(c.env, c.get('user')!.id, 'customer.status', 'user', id, { status: i.status }, c.get('ip')),
  ]);
  if (!(r[0] as any).meta.changes) throw notFound('Customer not found');
  return c.json({ ok: true });
});
ops.post('/customers/:id/wallet', requirePerm('wallets.adjust'), async (c) => {
  const i = await body(c, z.object({ amount: z.number().int(), note: z.string().trim().min(3).max(200) }));
  await adjustWallet(c.env, c.req.param('id'), i.amount, i.note, c.get('user')!.id, c.get('ip'));
  return c.json({ ok: true });
});

// ── wallets & deposits
ops.get('/wallet-transactions', requirePerm('wallets.view'), async (c) => {
  const p = pg(c); const a: unknown[] = []; let w = '1=1';
  if (p.q) { w = '(u.email LIKE ? OR u.name LIKE ?)'; a.push(like(p.q), like(p.q)); }
  const n = await c.env.DB.prepare(`SELECT COUNT(*) n FROM wallet_transactions t JOIN users u ON u.id=t.user_id WHERE ${w}`).bind(...a).first<any>();
  const rows = await c.env.DB.prepare(`SELECT t.id,t.kind,t.amount,t.balance_after,t.note,t.created_at,u.name,u.email FROM wallet_transactions t JOIN users u ON u.id=t.user_id WHERE ${w} ORDER BY t.created_at DESC, t.rowid DESC LIMIT ? OFFSET ?`).bind(...a, p.pageSize, (p.page - 1) * p.pageSize).all();
  return c.json({ items: rows.results, total: n.n });
});
ops.get('/deposits', requirePerm('deposits.review'), async (c) => {
  const p = pg(c); const a: unknown[] = []; const w = p.status ? 'd.status=?' : '1=1'; if (p.status) a.push(p.status);
  const n = await c.env.DB.prepare(`SELECT COUNT(*) n FROM deposits d WHERE ${w}`).bind(...a).first<any>();
  const rows = await c.env.DB.prepare(`SELECT d.*,u.name,u.email FROM deposits d JOIN users u ON u.id=d.user_id WHERE ${w} ORDER BY (d.status='pending') DESC, d.created_at DESC LIMIT ? OFFSET ?`).bind(...a, p.pageSize, (p.page - 1) * p.pageSize).all();
  return c.json({ items: rows.results, total: n.n });
});
ops.post('/deposits/:id/approve', requirePerm('deposits.review'), async (c) => {
  const i = await body(c, z.object({ note: z.string().max(200).optional() }).default({}));
  await approveDeposit(c.env, c.req.param('id'), c.get('user')!.id, c.get('ip'), i.note); return c.json({ ok: true });
});
ops.post('/deposits/:id/reject', requirePerm('deposits.review'), async (c) => {
  const i = await body(c, z.object({ note: z.string().trim().min(3).max(200) }));
  await rejectDeposit(c.env, c.req.param('id'), c.get('user')!.id, c.get('ip'), i.note); return c.json({ ok: true });
});

// ── orders
ops.get('/orders', requirePerm('orders.view'), async (c) => {
  const p = pg(c); const w: string[] = []; const a: unknown[] = [];
  if (p.status) { w.push('o.status=?'); a.push(p.status); }
  if (p.q) { w.push('(o.order_no LIKE ? OR u.email LIKE ? OR u.name LIKE ?)'); a.push(like(p.q), like(p.q), like(p.q)); }
  const where = w.length ? w.join(' AND ') : '1=1';
  const n = await c.env.DB.prepare(`SELECT COUNT(*) n FROM orders o JOIN users u ON u.id=o.user_id WHERE ${where}`).bind(...a).first<any>();
  const rows = await c.env.DB.prepare(`SELECT o.id,o.order_no,o.status,o.total,o.created_at,u.name,u.email,(SELECT group_concat(product_name,', ') FROM order_items WHERE order_id=o.id) items,
      (SELECT COUNT(*) FROM order_items WHERE order_id=o.id AND status='processing') pending_items FROM orders o JOIN users u ON u.id=o.user_id WHERE ${where} ORDER BY (pending_items>0) DESC, o.created_at DESC LIMIT ? OFFSET ?`).bind(...a, p.pageSize, (p.page - 1) * p.pageSize).all();
  return c.json({ items: rows.results, total: n.n });
});
ops.get('/orders/:orderNo', requirePerm('orders.view'), async (c) => {
  const o = await c.env.DB.prepare('SELECT o.*,u.name,u.email,u.phone FROM orders o JOIN users u ON u.id=o.user_id WHERE o.order_no=?').bind(c.req.param('orderNo')).first<any>();
  if (!o) throw notFound('Order not found');
  const items = (await c.env.DB.prepare('SELECT * FROM order_items WHERE order_id=?').bind(o.id).all<any>()).results;
  const showSecrets = can(c, 'orders.deliver') || can(c, 'orders.manage');
  const dl = showSecrets ? await loadDeliveries(c.env, items.map((i) => i.id)) : new Map();
  const events = (await c.env.DB.prepare('SELECT kind,message,created_at FROM order_events WHERE order_id=? ORDER BY created_at, rowid').bind(o.id).all()).results;
  const logs = (await c.env.DB.prepare('SELECT order_item_id,attempt,status,error,created_at FROM provider_order_logs WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id=?) ORDER BY created_at').bind(o.id).all()).results;
  const refunds = (await c.env.DB.prepare('SELECT * FROM refunds WHERE order_id=?').bind(o.id).all()).results;
  return c.json({ order: { ...o, idempotency_key: undefined }, items: items.map((i) => ({ ...i, customer_input: JSON.parse(i.customer_input), deliveries: dl.get(i.id) ?? [] })), events, logs, refunds });
});
ops.post('/uploads/delivery', requirePerm('orders.deliver'), async (c) => {
  const f = await storeUpload(c.env, await c.req.formData(), { prefix: 'deliveries/', allowed: DELIVERY_TYPES, maxBytes: 5 * 1024 * 1024 });
  return c.json({ key: f.key, name: f.name });
});
ops.post('/order-items/:id/deliver', requirePerm('orders.deliver'), async (c) => {
  const i = await body(c, z.object({ text: z.string().max(5000).optional(), fileKey: z.string().max(200).optional(), fileName: z.string().max(100).optional(), note: z.string().max(500).optional() }));
  if (i.fileKey && !i.fileKey.startsWith('deliveries/')) throw bad('Invalid file');
  await deliverItem(c.env, c.req.param('id'), c.get('user')!.id, c.get('ip'), i); return c.json({ ok: true });
});
ops.post('/order-items/:id/fail', requirePerm('orders.manage'), async (c) => {
  const i = await body(c, z.object({ reason: z.string().trim().min(3).max(200) }));
  await markItemFailed(c.env, c.req.param('id'), c.get('user')!.id, c.get('ip'), i.reason); return c.json({ ok: true });
});
ops.post('/order-items/:id/refund', requirePerm('refunds.manage'), async (c) => {
  const i = await body(c, z.object({ reason: z.string().trim().min(3).max(200), cancelled: z.boolean().optional() }));
  await refundItem(c.env, c.req.param('id'), c.get('user')!.id, c.get('ip'), i.reason, { cancelled: i.cancelled }); return c.json({ ok: true });
});
ops.post('/order-items/:id/dispatch', requirePerm('orders.manage'), async (c) => { await dispatchProvider(c.env, c.req.param('id')); return c.json({ ok: true }); });

ops.get('/refunds', requirePerm('refunds.manage'), async (c) => {
  const p = pg(c); const a: unknown[] = []; const w = p.status ? 'r.status=?' : '1=1'; if (p.status) a.push(p.status);
  const rows = await c.env.DB.prepare(`SELECT r.*,o.order_no,u.name,u.email,i.product_name,i.plan_name FROM refunds r JOIN orders o ON o.id=r.order_id JOIN users u ON u.id=r.user_id JOIN order_items i ON i.id=r.order_item_id WHERE ${w} ORDER BY (r.status='requested') DESC, r.created_at DESC LIMIT 100`).bind(...a).all();
  return c.json({ items: rows.results });
});
ops.post('/refunds/:id/approve', requirePerm('refunds.manage'), async (c) => {
  const r = await c.env.DB.prepare('SELECT * FROM refunds WHERE id=?').bind(c.req.param('id')).first<any>();
  if (!r) throw notFound('Refund not found');
  if (r.status !== 'requested') throw conflict('Refund was already reviewed', 'invalid_state');
  await refundItem(c.env, r.order_item_id, c.get('user')!.id, c.get('ip'), 'Refund approved', { refundId: r.id }); return c.json({ ok: true });
});
ops.post('/refunds/:id/reject', requirePerm('refunds.manage'), async (c) => {
  const i = await body(c, z.object({ note: z.string().trim().min(3).max(300) }));
  await rejectRefund(c.env, c.req.param('id'), c.get('user')!.id, c.get('ip'), i.note); return c.json({ ok: true });
});

// ── inventory (secrets are encrypted at rest; only masked hints are ever listed)
ops.get('/inventory', requirePerm('inventory.manage'), async (c) => {
  const rows = (await c.env.DB.prepare(`SELECT pl.id plan_id, p.name product, pl.name plan, p.delivery_type,
    (SELECT COUNT(*) FROM product_inventory i WHERE i.plan_id=pl.id AND i.status='available') available,
    (SELECT COUNT(*) FROM product_inventory i WHERE i.plan_id=pl.id AND i.status='delivered') delivered, pl.stock_limit
    FROM product_plans pl JOIN products p ON p.id=pl.product_id ORDER BY p.name, pl.sort_order`).all()).results;
  return c.json({ items: rows });
});
ops.get('/inventory/:planId', requirePerm('inventory.manage'), async (c) => {
  const rows = (await c.env.DB.prepare("SELECT id,status,created_at,delivered_at,order_item_id FROM product_inventory WHERE plan_id=? ORDER BY created_at DESC LIMIT 200").bind(c.req.param('planId')).all()).results;
  return c.json({ items: rows });
});
ops.post('/inventory/:planId/bulk', requirePerm('inventory.manage'), async (c) => {
  const planId = c.req.param('planId');
  const i = await body(c, z.object({ lines: z.array(z.string().trim().min(1).max(2000)).min(1).max(500) }));
  const plan = await c.env.DB.prepare('SELECT pl.id,p.delivery_type FROM product_plans pl JOIN products p ON p.id=pl.product_id WHERE pl.id=?').bind(planId).first<any>();
  if (!plan) throw notFound('Plan not found');
  if (plan.delivery_type !== 'automatic') throw bad('Only products with automatic delivery use inventory');
  const stmts = []; const seen = new Set<string>();
  for (const line of i.lines) {
    const h = await sha256Hex(line); if (seen.has(h)) continue; seen.add(h);
    stmts.push(c.env.DB.prepare('INSERT OR IGNORE INTO product_inventory(id,plan_id,secret_enc,secret_hash,created_by) VALUES(?,?,?,?,?)').bind(uid(), planId, await encryptSecret(c.env.ENCRYPTION_KEY, line), h, c.get('user')!.id));
  }
  const res = await c.env.DB.batch([...stmts, auditStmt(c.env, c.get('user')!.id, 'inventory.add', 'plan', planId, { submitted: i.lines.length }, c.get('ip'))]);
  const added = res.slice(0, stmts.length).reduce((s, r: any) => s + r.meta.changes, 0);
  return c.json({ added, skippedDuplicates: i.lines.length - added });
});
ops.delete('/inventory/item/:id', requirePerm('inventory.manage'), async (c) => {
  const r = await c.env.DB.prepare("UPDATE product_inventory SET status='void' WHERE id=? AND status='available'").bind(c.req.param('id')).run();
  if (!r.meta.changes) throw conflict('Only available items can be voided');
  await audit(c.env, c.get('user')!.id, 'inventory.void', 'inventory', c.req.param('id'), {}, c.get('ip'));
  return c.json({ ok: true });
});

// ── support tickets
ops.get('/tickets', requirePerm('support.manage'), async (c) => {
  const p = pg(c); const w: string[] = []; const a: unknown[] = [];
  if (p.status) { w.push('t.status=?'); a.push(p.status); }
  if (p.q) { w.push('(t.ticket_no LIKE ? OR t.subject LIKE ? OR u.email LIKE ?)'); a.push(like(p.q), like(p.q), like(p.q)); }
  const where = w.length ? w.join(' AND ') : '1=1';
  const rows = await c.env.DB.prepare(`SELECT t.ticket_no,t.subject,t.status,t.priority,t.category,t.updated_at,t.created_at,u.name,u.email,s.name assignee FROM support_tickets t JOIN users u ON u.id=t.user_id LEFT JOIN users s ON s.id=t.assigned_to WHERE ${where} ORDER BY t.status IN ('resolved','closed'), t.updated_at DESC LIMIT ? OFFSET ?`).bind(...a, p.pageSize, (p.page - 1) * p.pageSize).all();
  return c.json({ items: rows.results });
});
ops.get('/tickets/:no', requirePerm('support.manage'), async (c) => {
  const t = await c.env.DB.prepare('SELECT t.*,u.name,u.email,o.order_no FROM support_tickets t JOIN users u ON u.id=t.user_id LEFT JOIN orders o ON o.id=t.order_id WHERE t.ticket_no=?').bind(c.req.param('no')).first<any>();
  if (!t) throw notFound('Ticket not found');
  const msgs = (await c.env.DB.prepare('SELECT m.id,m.is_staff,m.is_internal,m.body,m.attachment_key,m.attachment_name,m.created_at,u.name author FROM support_messages m JOIN users u ON u.id=m.author_id WHERE m.ticket_id=? ORDER BY m.created_at,m.rowid').bind(t.id).all()).results;
  const staff = (await c.env.DB.prepare('SELECT id,name FROM users WHERE is_staff=1 AND status=\'active\'').all()).results;
  return c.json({ ticket: t, messages: msgs, staff });
});
ops.post('/tickets/:no/reply', requirePerm('support.manage'), async (c) => {
  const u = c.get('user')!;
  const i = await body(c, z.object({ message: z.string().trim().min(1).max(4000), internal: z.boolean().default(false), attachmentKey: z.string().max(200).optional().nullable(), attachmentName: z.string().max(100).optional().nullable() }));
  const t = await c.env.DB.prepare('SELECT id,user_id,status FROM support_tickets WHERE ticket_no=?').bind(c.req.param('no')).first<any>();
  if (!t) throw notFound('Ticket not found');
  const st: D1PreparedStatement[] = [c.env.DB.prepare('INSERT INTO support_messages(id,ticket_id,author_id,is_staff,is_internal,body,attachment_key,attachment_name) VALUES(?,?,?,1,?,?,?,?)').bind(uid(), t.id, u.id, i.internal ? 1 : 0, i.message, i.attachmentKey ?? null, i.attachmentName ?? null)];
  if (!i.internal) {
    st.push(c.env.DB.prepare(`UPDATE support_tickets SET status='waiting_customer', updated_at=${NOW}, assigned_to=COALESCE(assigned_to,?) WHERE id=? AND status IN ('open','in_progress')`).bind(u.id, t.id));
    st.push(notifyStmt(c.env, t.user_id, 'ticket', 'Support replied to your ticket', i.message.slice(0, 120), `/dashboard/tickets/${c.req.param('no')}`));
  }
  await c.env.DB.batch(st); return c.json({ ok: true }, 201);
});
ops.post('/tickets/:no/update', requirePerm('support.manage'), async (c) => {
  const i = await body(c, z.object({ status: z.enum(['open', 'in_progress', 'waiting_customer', 'resolved', 'closed']).optional(), assignedTo: z.string().nullable().optional(), priority: z.enum(['low', 'normal', 'high', 'urgent']).optional() }));
  const t = await c.env.DB.prepare('SELECT id,user_id FROM support_tickets WHERE ticket_no=?').bind(c.req.param('no')).first<any>();
  if (!t) throw notFound('Ticket not found');
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE support_tickets SET status=COALESCE(?,status), priority=COALESCE(?,priority), assigned_to=CASE WHEN ? THEN ? ELSE assigned_to END, updated_at=${NOW} WHERE id=?`).bind(i.status ?? null, i.priority ?? null, i.assignedTo !== undefined ? 1 : 0, i.assignedTo ?? null, t.id),
    auditStmt(c.env, c.get('user')!.id, 'ticket.update', 'ticket', t.id, i, c.get('ip')),
  ]);
  return c.json({ ok: true });
});
