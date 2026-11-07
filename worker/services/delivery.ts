import type { Env } from '../types';
import { decryptSecret, encryptSecret, uid } from '../lib/crypto';
import { AppError, bad, conflict, notFound } from '../lib/http';
import { auditStmt, notifyStmt } from '../lib/notify';
import { balanceDeltaStmt, ledgerAfterUpdateStmt } from './wallet';
import { NOW, RECOMPUTE_ORDER_SQL } from './sql';

/** Complete an item with manual (or provider-supplied) delivery content. Idempotent: only 'processing' items can be delivered. */
export async function deliverItem(env: Env, itemId: string, actorId: string | null, ip: string | null,
  d: { text?: string; fileKey?: string; fileName?: string; note?: string }) {
  const it = await env.DB.prepare(
    `SELECT i.*, o.user_id, o.order_no FROM order_items i JOIN orders o ON o.id=i.order_id WHERE i.id=?`).bind(itemId).first<any>();
  if (!it) throw notFound('Order item not found');
  if (it.status !== 'processing') throw conflict(`This item is already ${it.status}`, 'invalid_state');
  if (!d.text?.trim() && !d.fileKey) throw bad('Enter the delivery details or attach a file');
  const enc = d.text?.trim() ? await encryptSecret(env.ENCRYPTION_KEY, d.text.trim()) : null;
  const stmts = [
    env.DB.prepare(`UPDATE order_items SET status='completed', completed_at=${NOW} WHERE id=? AND status='processing'`).bind(itemId),
    env.DB.prepare('INSERT INTO order_deliveries(id,order_item_id,kind,content_enc,file_key,file_name,note,delivered_by) VALUES(?,?,?,?,?,?,?,?)')
      .bind(uid(), itemId, d.fileKey ? 'file' : 'text', enc, d.fileKey ?? null, d.fileName ?? null, d.note ?? null, actorId),
    env.DB.prepare(RECOMPUTE_ORDER_SQL).bind(it.order_id),
    env.DB.prepare('INSERT INTO order_events(id,order_id,order_item_id,kind,message,actor_id) VALUES(?,?,?,?,?,?)').bind(uid(), it.order_id, itemId, 'delivered', `${it.product_name} delivered`, actorId),
    notifyStmt(env, it.user_id, 'order', 'Order delivered', `${it.product_name} (${it.order_no}) is ready. Open My Orders to view it.`, `/dashboard/orders/${it.order_no}`),
  ];
  if (actorId) stmts.push(auditStmt(env, actorId, 'order.deliver', 'order_item', itemId, { order: it.order_no }, ip));
  const [r] = await env.DB.batch(stmts);
  if (!(r as any).meta.changes) throw conflict('This item was already handled', 'invalid_state');
}

export async function markItemFailed(env: Env, itemId: string, actorId: string | null, ip: string | null, reason: string) {
  const it = await env.DB.prepare('SELECT i.*, o.order_no, o.user_id FROM order_items i JOIN orders o ON o.id=i.order_id WHERE i.id=?').bind(itemId).first<any>();
  if (!it) throw notFound('Order item not found');
  const [r] = await env.DB.batch([
    env.DB.prepare("UPDATE order_items SET status='failed' WHERE id=? AND status='processing'").bind(itemId),
    env.DB.prepare(RECOMPUTE_ORDER_SQL).bind(it.order_id),
    env.DB.prepare('INSERT INTO order_events(id,order_id,order_item_id,kind,message,actor_id) VALUES(?,?,?,?,?,?)').bind(uid(), it.order_id, itemId, 'failed', `Delivery failed: ${reason}`, actorId),
    auditStmt(env, actorId, 'order.fail', 'order_item', itemId, { reason }, ip),
  ]);
  if (!(r as any).meta.changes) throw conflict('Only processing items can be marked failed', 'invalid_state');
}

/**
 * Credit the wallet for an item and mark it refunded/cancelled. Atomic + idempotent:
 * the unique ledger key (refund, refundId) aborts a duplicate, and refunds has a partial unique index per item.
 */
export async function refundItem(env: Env, itemId: string, actorId: string, ip: string | null, reason: string,
  opts: { refundId?: string; cancelled?: boolean } = {}) {
  const it = await env.DB.prepare('SELECT i.*, o.user_id, o.order_no FROM order_items i JOIN orders o ON o.id=i.order_id WHERE i.id=?').bind(itemId).first<any>();
  if (!it) throw notFound('Order item not found');
  if (['refunded', 'cancelled'].includes(it.status)) throw conflict('This item was already refunded or cancelled', 'invalid_state');
  if (it.paid <= 0) throw bad('Nothing to refund on this item');
  const refundId = opts.refundId ?? uid();
  const stmts: D1PreparedStatement[] = [];
  if (opts.refundId) {
    stmts.push(env.DB.prepare(`UPDATE refunds SET status='processed', reviewed_by=?, review_note=?, processed_at=${NOW} WHERE id=? AND status='requested'`).bind(actorId, reason, refundId));
    stmts.push(env.DB.prepare(`INSERT INTO guards(ok,label) SELECT 0,'refund_not_open' WHERE NOT EXISTS (SELECT 1 FROM refunds WHERE id=? AND status='processed' AND reviewed_by=?)`).bind(refundId, actorId));
  } else {
    stmts.push(env.DB.prepare(`INSERT INTO refunds(id,order_id,order_item_id,user_id,amount,reason,status,requested_by,reviewed_by,review_note,processed_at) VALUES(?,?,?,?,?,?,'processed',?,?,?,${NOW})`)
      .bind(refundId, it.order_id, itemId, it.user_id, it.paid, reason, actorId, actorId, reason));
  }
  stmts.push(
    balanceDeltaStmt(env, it.user_id, it.paid),
    ledgerAfterUpdateStmt(env, { userId: it.user_id, kind: 'refund', amount: it.paid, refType: 'refund', refId: refundId, note: `${opts.cancelled ? 'Cancelled' : 'Refund'}: ${it.product_name} (${it.order_no})`, by: actorId }),
    env.DB.prepare(`UPDATE order_items SET status=? WHERE id=? AND status IN ('processing','completed','failed')`).bind(opts.cancelled ? 'cancelled' : 'refunded', itemId),
    env.DB.prepare(RECOMPUTE_ORDER_SQL).bind(it.order_id),
    env.DB.prepare('INSERT INTO order_events(id,order_id,order_item_id,kind,message,actor_id) VALUES(?,?,?,?,?,?)').bind(uid(), it.order_id, itemId, 'refund', `PKR ${it.paid / 100} returned to wallet (${reason})`, actorId),
    notifyStmt(env, it.user_id, 'wallet', opts.cancelled ? 'Order item cancelled' : 'Refund processed', `PKR ${it.paid / 100} was returned to your wallet for ${it.product_name}.`, '/dashboard/wallet'),
    auditStmt(env, actorId, opts.cancelled ? 'order.cancel' : 'refund.process', 'order_item', itemId, { amount: it.paid, reason }, ip),
  );
  try { await env.DB.batch(stmts); } catch (e) {
    const m = String((e as Error).message);
    if (m.includes('UNIQUE') || m.includes('ok = 1')) throw conflict('This refund was already processed', 'invalid_state');
    throw e;
  }
}

export async function requestRefund(env: Env, userId: string, itemId: string, reason: string) {
  const it = await env.DB.prepare('SELECT i.*, o.user_id, o.order_no FROM order_items i JOIN orders o ON o.id=i.order_id WHERE i.id=?').bind(itemId).first<any>();
  if (!it || it.user_id !== userId) throw notFound('Order item not found');
  if (!it.refund_eligible) throw bad('This product is not eligible for a refund', 'not_refundable');
  if (!['processing', 'completed'].includes(it.status)) throw conflict('This item can no longer be refunded', 'invalid_state');
  if (it.paid <= 0) throw bad('Nothing to refund on this item');
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO refunds(id,order_id,order_item_id,user_id,amount,reason,requested_by) VALUES(?,?,?,?,?,?,?)').bind(uid(), it.order_id, itemId, userId, it.paid, reason, userId),
      env.DB.prepare('INSERT INTO order_events(id,order_id,order_item_id,kind,message,actor_id) VALUES(?,?,?,?,?,?)').bind(uid(), it.order_id, itemId, 'refund_requested', 'Refund requested by customer', userId),
    ]);
  } catch (e) {
    if (String((e as Error).message).includes('UNIQUE')) throw conflict('A refund has already been requested for this item', 'duplicate');
    throw e;
  }
}

export async function rejectRefund(env: Env, refundId: string, actorId: string, ip: string | null, note: string) {
  const r = await env.DB.prepare('SELECT * FROM refunds WHERE id=?').bind(refundId).first<any>();
  if (!r) throw notFound('Refund not found');
  const [u] = await env.DB.batch([
    env.DB.prepare(`UPDATE refunds SET status='rejected', reviewed_by=?, review_note=?, processed_at=${NOW} WHERE id=? AND status='requested'`).bind(actorId, note, refundId),
    notifyStmt(env, r.user_id, 'wallet', 'Refund request declined', note || 'Your refund request was not approved.', '/dashboard/orders'),
    auditStmt(env, actorId, 'refund.reject', 'refund', refundId, { note }, ip),
  ]);
  if (!(u as any).meta.changes) throw conflict('Refund was already reviewed', 'invalid_state');
}

/** Decrypt delivery rows for the order owner (or staff with orders.deliver). */
export async function loadDeliveries(env: Env, itemIds: string[]) {
  if (!itemIds.length) return new Map<string, any[]>();
  const rows = await env.DB.prepare(`SELECT * FROM order_deliveries WHERE order_item_id IN (${itemIds.map(() => '?').join(',')}) ORDER BY created_at`).bind(...itemIds).all<any>();
  const map = new Map<string, any[]>();
  for (const r of rows.results) {
    let content: string | null = null;
    if (r.content_enc) { try { content = await decryptSecret(env.ENCRYPTION_KEY, r.content_enc); } catch { content = '[unable to decrypt — check ENCRYPTION_KEY]'; } }
    const o = { id: r.id, kind: r.kind, content, fileName: r.file_name, hasFile: !!r.file_key, fileKey: r.file_key, note: r.note, createdAt: r.created_at };
    (map.get(r.order_item_id) ?? map.set(r.order_item_id, []).get(r.order_item_id)!).push(o);
  }
  return map;
}
