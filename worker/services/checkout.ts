import type { Env, AuthUser } from '../types';
import { randomCode, uid } from '../lib/crypto';
import { AppError, bad, conflict } from '../lib/http';
import { notifyStmt } from '../lib/notify';
import { balanceDeltaStmt, getBalance, ledgerAfterUpdateStmt } from './wallet';
import { NOW } from './sql';

export interface CheckoutItemInput { planId: string; input?: Record<string, string> }
export interface CheckoutInput { items: CheckoutItemInput[]; couponCode?: string | null; idempotencyKey: string; note?: string | null }

interface PlanRow {
  plan_id: string; plan_name: string; price: number; stock_limit: number | null; plan_status: string;
  product_id: string; product_name: string; product_status: string; delivery_type: 'automatic' | 'manual' | 'api';
  refund_eligible: number; input_fields: string; cat_active: number;
}

export function computeDiscount(coupon: { type: string; value: number; max_discount: number | null }, subtotal: number): number {
  let d = coupon.type === 'percent' ? Math.floor((subtotal * coupon.value) / 100) : coupon.value;
  if (coupon.max_discount != null) d = Math.min(d, coupon.max_discount);
  return Math.max(0, Math.min(d, subtotal - 100));   // customer always pays at least PKR 1
}

/** Validates a coupon for this user/subtotal. Throws a friendly error. */
export async function validateCoupon(env: Env, code: string, userId: string, subtotal: number) {
  const c = await env.DB.prepare('SELECT * FROM coupons WHERE code=?').bind(code.trim()).first<any>();
  const now = new Date().toISOString();
  if (!c || !c.active) throw bad('This coupon code is not valid', 'coupon_invalid');
  if (c.starts_at && c.starts_at > now) throw bad('This coupon is not active yet', 'coupon_invalid');
  if (c.expires_at && c.expires_at < now) throw bad('This coupon has expired', 'coupon_invalid');
  if (c.max_uses != null && c.used_count >= c.max_uses) throw bad('This coupon has been fully used', 'coupon_invalid');
  if (subtotal < c.min_order) throw bad(`Minimum order for this coupon is PKR ${c.min_order / 100}`, 'coupon_invalid');
  const used = await env.DB.prepare('SELECT COUNT(*) n FROM coupon_redemptions WHERE coupon_id=? AND user_id=?').bind(c.id, userId).first<{ n: number }>();
  if ((used?.n ?? 0) >= c.per_user_limit) throw bad('You have already used this coupon', 'coupon_invalid');
  return { coupon: c, discount: computeDiscount(c, subtotal) };
}

function validateInputs(fieldsJson: string, input: Record<string, string> | undefined, productName: string): Record<string, string> {
  const fields: { key: string; label: string; required?: boolean; type?: string }[] = JSON.parse(fieldsJson || '[]');
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = (input?.[f.key] ?? '').toString().trim();
    if (f.required && !v) throw bad(`${productName}: ${f.label} is required`, 'input_required');
    if (v.length > 500) throw bad(`${productName}: ${f.label} is too long`);
    if (v) out[f.key] = v;
  }
  return out;
}

export async function quote(env: Env, userId: string, items: CheckoutItemInput[], couponCode?: string | null) {
  if (!items.length) throw bad('Your cart is empty');
  if (items.length > 20) throw bad('Too many items in one order');
  const ids = [...new Set(items.map((i) => i.planId))];
  const rows = await env.DB.prepare(
    `SELECT pl.id plan_id, pl.name plan_name, pl.price, pl.stock_limit, pl.status plan_status,
            p.id product_id, p.name product_name, p.status product_status, p.delivery_type, p.refund_eligible, p.input_fields, c.active cat_active
     FROM product_plans pl JOIN products p ON p.id=pl.product_id JOIN product_categories c ON c.id=p.category_id
     WHERE pl.id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<PlanRow>();
  const byId = new Map(rows.results.map((r) => [r.plan_id, r]));
  const lines = items.map((it) => {
    const r = byId.get(it.planId);
    if (!r || r.plan_status !== 'active' || r.product_status !== 'active' || !r.cat_active) throw bad('One of the products in your cart is no longer available', 'unavailable');
    return { row: r, input: validateInputs(r.input_fields, it.input, r.product_name) };
  });
  // stock pre-check (authoritative check is inside the atomic batch)
  const need = new Map<string, number>();
  for (const l of lines) need.set(l.row.plan_id, (need.get(l.row.plan_id) ?? 0) + 1);
  for (const [pid, n] of need) {
    const r = byId.get(pid)!;
    let avail: number | null = r.stock_limit;
    if (r.delivery_type === 'automatic') {
      avail = (await env.DB.prepare("SELECT COUNT(*) n FROM product_inventory WHERE plan_id=? AND status='available'").bind(pid).first<{ n: number }>())?.n ?? 0;
    }
    if (avail != null && avail < n) throw conflict(`${r.product_name} (${r.plan_name}) is out of stock`, 'out_of_stock');
  }
  const subtotal = lines.reduce((s, l) => s + l.row.price, 0);
  let discount = 0; let coupon: any = null;
  if (couponCode && couponCode.trim()) { const v = await validateCoupon(env, couponCode, userId, subtotal); discount = v.discount; coupon = v.coupon; }
  return { lines, subtotal, discount, total: subtotal - discount, coupon };
}

export async function placeOrder(env: Env, user: AuthUser, inp: CheckoutInput): Promise<{ orderId: string; orderNo: string; replay: boolean; apiItemIds: string[] }> {
  const prior = await env.DB.prepare('SELECT id, order_no FROM orders WHERE user_id=? AND idempotency_key=?').bind(user.id, inp.idempotencyKey).first<any>();
  if (prior) return { orderId: prior.id, orderNo: prior.order_no, replay: true, apiItemIds: [] };

  const q = await quote(env, user.id, inp.items, inp.couponCode);
  const balance = await getBalance(env, user.id);
  if (balance < q.total) {
    const e = new AppError(402, 'insufficient_funds', `Your wallet balance is too low. You need PKR ${(q.total - balance) / 100} more.`);
    (e as any).extra = { balance, total: q.total, shortfall: q.total - balance };
    throw e;
  }

  const orderId = uid(); const orderNo = 'NX' + randomCode(8);
  const stmts: D1PreparedStatement[] = [];
  const allAuto = q.lines.every((l) => l.row.delivery_type === 'automatic');
  stmts.push(env.DB.prepare(
    `INSERT INTO orders(id,order_no,user_id,status,subtotal,discount,total,coupon_id,coupon_code,idempotency_key,customer_note) VALUES(?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(orderId, orderNo, user.id, allAuto ? 'completed' : 'processing', q.subtotal, q.discount, q.total, q.coupon?.id ?? null, q.coupon?.code ?? null, inp.idempotencyKey, inp.note ?? null));
  stmts.push(env.DB.prepare('INSERT INTO order_events(id,order_id,kind,message,actor_id) VALUES(?,?,?,?,?)').bind(uid(), orderId, 'placed', 'Order placed', user.id));

  // distribute the discount proportionally; the remainder goes to the last line so the sum is exact
  let allocated = 0; const apiItemIds: string[] = [];
  q.lines.forEach((l, idx) => {
    const itemId = uid();
    const share = idx === q.lines.length - 1 ? q.discount - allocated : Math.floor((q.discount * l.row.price) / q.subtotal);
    allocated += share;
    const auto = l.row.delivery_type === 'automatic';
    if (l.row.delivery_type === 'api') apiItemIds.push(itemId);
    stmts.push(env.DB.prepare(
      `INSERT INTO order_items(id,order_id,product_id,plan_id,product_name,plan_name,unit_price,discount,paid,delivery_type,refund_eligible,customer_input,status)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'processing')`
    ).bind(itemId, orderId, l.row.product_id, l.row.plan_id, l.row.product_name, l.row.plan_name, l.row.price, share, l.row.price - share, l.row.delivery_type, l.row.refund_eligible, JSON.stringify(l.input)));
    stmts.push(env.DB.prepare(`UPDATE products SET sales_count = sales_count + 1 WHERE id=?`).bind(l.row.product_id));
    if (auto) {
      stmts.push(env.DB.prepare(
        `UPDATE product_inventory SET status='delivered', order_item_id=?, delivered_at=${NOW}
         WHERE id = (SELECT id FROM product_inventory WHERE plan_id=? AND status='available' ORDER BY created_at, id LIMIT 1)`).bind(itemId, l.row.plan_id));
      stmts.push(env.DB.prepare(`INSERT INTO guards(ok,label) SELECT 0,'out_of_stock' WHERE NOT EXISTS (SELECT 1 FROM product_inventory WHERE order_item_id=?)`).bind(itemId));
      stmts.push(env.DB.prepare(
        `INSERT INTO order_deliveries(id,order_item_id,kind,content_enc,note) SELECT ?, ?, 'credential', secret_enc, 'Automatic delivery' FROM product_inventory WHERE order_item_id=?`).bind(uid(), itemId, itemId));
      stmts.push(env.DB.prepare(`UPDATE order_items SET status='completed', completed_at=${NOW} WHERE id=?`).bind(itemId));
      stmts.push(env.DB.prepare('INSERT INTO order_events(id,order_id,order_item_id,kind,message) VALUES(?,?,?,?,?)').bind(uid(), orderId, itemId, 'delivered', `${l.row.product_name} delivered automatically`));
    } else if (l.row.stock_limit != null) {
      stmts.push(env.DB.prepare('UPDATE product_plans SET stock_limit = stock_limit - 1 WHERE id=?').bind(l.row.plan_id)); // CHECK >= 0 aborts when exhausted
    }
  });
  // payment: atomic debit + immutable ledger row
  stmts.push(balanceDeltaStmt(env, user.id, -q.total));
  stmts.push(ledgerAfterUpdateStmt(env, { userId: user.id, kind: 'purchase', amount: -q.total, refType: 'order', refId: orderId, note: `Order ${orderNo}`, by: user.id }));
  stmts.push(env.DB.prepare('INSERT INTO order_events(id,order_id,kind,message,actor_id) VALUES(?,?,?,?,?)').bind(uid(), orderId, 'paid', `Paid PKR ${q.total / 100} from wallet`, user.id));
  if (q.coupon) {
    stmts.push(env.DB.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE id=?').bind(q.coupon.id));   // CHECK used_count <= max_uses
    stmts.push(env.DB.prepare('INSERT INTO coupon_redemptions(id,coupon_id,user_id,order_id,amount) VALUES(?,?,?,?,?)').bind(uid(), q.coupon.id, user.id, orderId, q.discount));
  }
  stmts.push(notifyStmt(env, user.id, 'order', allAuto ? 'Order delivered' : 'Order received', `Order ${orderNo} ${allAuto ? 'is ready in My Orders.' : 'is being processed.'}`, `/dashboard/orders/${orderNo}`));

  try {
    await env.DB.batch(stmts);
  } catch (e) {
    const m = String((e as Error).message);
    if (m.includes('orders.user_id') || m.includes('idempotency')) {
      const again = await env.DB.prepare('SELECT id, order_no FROM orders WHERE user_id=? AND idempotency_key=?').bind(user.id, inp.idempotencyKey).first<any>();
      if (again) return { orderId: again.id, orderNo: again.order_no, replay: true, apiItemIds: [] };
    }
    if (m.includes('balance')) throw new AppError(402, 'insufficient_funds', 'Your wallet balance is too low');
    if (m.includes('ok = 1') || m.includes('stock_limit')) throw conflict('Sorry, this item just went out of stock. You have not been charged.', 'out_of_stock');
    if (m.includes('used_count') || m.includes('coupons')) throw bad('This coupon has just been fully used. You have not been charged.', 'coupon_invalid');
    throw e;
  }
  return { orderId, orderNo, replay: false, apiItemIds };
}
