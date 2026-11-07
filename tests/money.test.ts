import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../worker/index';
import { Client, makeEnv, newCustomer, newStaff, png } from './helpers/app';

async function setup() {
  const env = makeEnv(); const app = createApp();
  const admin = await newStaff(app, env, ['root']);
  // enable a manual method
  const r = await admin.put('/api/admin/payment-methods/easypaisa', { enabled: true, accountTitle: 'Noorix Test', accountNumber: '03001234567', instructions: 'Pay then submit TID', minAmount: 10000, maxAmount: 50_000_000 });
  assert.equal(r.status, 200);
  return { env, app, admin };
}
const fund = async (app: any, env: any, admin: Client, c: Client, amount: number, ref: string) => {
  const d = await c.post('/api/account/deposits', { methodCode: 'easypaisa', amount, reference: ref });
  assert.equal(d.status, 201);
  assert.equal((await admin.post(`/api/admin/deposits/${d.json.id}/approve`, {})).status, 200);
};
const ledgerInvariant = async (env: any) => {
  const bad = await env.DB.prepare(`SELECT w.user_id, w.balance, COALESCE((SELECT SUM(amount) FROM wallet_transactions t WHERE t.user_id=w.user_id),0) s FROM wallet_accounts w WHERE w.balance <> COALESCE((SELECT SUM(amount) FROM wallet_transactions t WHERE t.user_id=w.user_id),0)`).all();
  assert.equal(bad.results.length, 0, 'wallet balance must equal ledger sum');
  const last = await env.DB.prepare(`SELECT COUNT(*) n FROM wallet_accounts w WHERE w.balance <> COALESCE((SELECT balance_after FROM wallet_transactions t WHERE t.user_id=w.user_id ORDER BY t.rowid DESC LIMIT 1),0)`).first();
  assert.equal(last.n, 0, 'latest balance_after must equal balance');
};
const planOf = async (env: any, slug: string) => (await env.DB.prepare('SELECT id FROM product_plans WHERE product_id=? ORDER BY sort_order').bind('prd_' + slug).first()).id as string;
const checkout = (c: Client, planId: string, key: string, extra: any = {}) =>
  c.post('/api/account/orders', { items: [{ planId, input: { account_email: 'me@example.com' } }], idempotencyKey: key, ...extra });

test('deposit: unavailable method rejected, validation, duplicate TID, approve once, balance + ledger', async () => {
  const { env, app, admin } = await setup(); const { c } = await newCustomer(app, env);
  assert.equal((await c.post('/api/account/deposits', { methodCode: 'jazzcash', amount: 100000, reference: 'TID12345' })).status, 400);   // disabled
  assert.equal((await c.post('/api/account/deposits', { methodCode: 'easypaisa', amount: 500, reference: 'TID12345' })).status, 400);        // below min
  const d = await c.post('/api/account/deposits', { methodCode: 'easypaisa', amount: 100000, reference: 'TID12345' });
  assert.equal(d.status, 201);
  assert.equal((await c.post('/api/account/deposits', { methodCode: 'easypaisa', amount: 100000, reference: 'TID12345' })).status, 409);    // duplicate TID
  assert.equal((await c.get('/api/auth/me')).json.balance, 0);                                                                              // not credited before approval
  assert.equal((await admin.post(`/api/admin/deposits/${d.json.id}/approve`, {})).status, 200);
  assert.equal((await admin.post(`/api/admin/deposits/${d.json.id}/approve`, {})).status, 409);                                              // double approve
  assert.equal((await admin.post(`/api/admin/deposits/${d.json.id}/reject`, { note: 'late' })).status, 409);
  assert.equal((await c.get('/api/auth/me')).json.balance, 100000);
  const tx = await env.DB.prepare('SELECT COUNT(*) n FROM wallet_transactions').first(); assert.equal(tx.n, 1);
  await ledgerInvariant(env);
});

test('deposit: concurrent double approval credits exactly once', async () => {
  const { env, app, admin } = await setup(); const { c } = await newCustomer(app, env);
  const d = await c.post('/api/account/deposits', { methodCode: 'easypaisa', amount: 250000, reference: 'RACE0001' });
  const rs = await Promise.all([1, 2, 3].map(() => admin.post(`/api/admin/deposits/${d.json.id}/approve`, {})));
  assert.equal(rs.filter((r) => r.status === 200).length, 1);
  assert.equal((await c.get('/api/auth/me')).json.balance, 250000); await ledgerInvariant(env);
});

test('deposit: rejection credits nothing; proof upload validated and private', async () => {
  const { env, app, admin } = await setup(); const { c } = await newCustomer(app, env); const other = await newCustomer(app, env);
  const fd = new FormData(); fd.set('file', png());
  const up = await c.req('POST', '/api/account/uploads/proof', fd); assert.equal(up.status, 200);
  const bad = new FormData(); bad.set('file', new File([new Uint8Array([1, 2, 3, 4])], 'x.png', { type: 'image/png' }));
  assert.equal((await c.req('POST', '/api/account/uploads/proof', bad)).status, 400);            // magic bytes mismatch
  const exe = new FormData(); exe.set('file', new File([new Uint8Array([0x4d, 0x5a, 0, 0])], 'x.exe', { type: 'application/x-msdownload' }));
  assert.equal((await c.req('POST', '/api/account/uploads/proof', exe)).status, 400);
  assert.equal((await other.c.post('/api/account/deposits', { methodCode: 'easypaisa', amount: 100000, reference: 'STEAL001', proofKey: up.json.key })).status, 400); // someone else's file
  const d = await c.post('/api/account/deposits', { methodCode: 'easypaisa', amount: 100000, reference: 'TID99999', proofKey: up.json.key });
  assert.equal((await other.c.get('/api/files/download?key=' + encodeURIComponent(up.json.key))).status, 404);
  assert.equal((await c.get('/api/files/download?key=' + encodeURIComponent(up.json.key))).status, 200);
  assert.equal((await admin.get('/api/files/download?key=' + encodeURIComponent(up.json.key))).status, 200);
  assert.equal((await admin.post(`/api/admin/deposits/${d.json.id}/reject`, { note: 'Amount mismatch' })).status, 200);
  assert.equal((await c.get('/api/auth/me')).json.balance, 0); await ledgerInvariant(env);
});

test('checkout: insufficient funds → 402 with shortfall, nothing created', async () => {
  const { env, app } = await setup(); const { c } = await newCustomer(app, env);
  const r = await checkout(c, await planOf(env, 'netflix'), 'key-insufficient-1');
  assert.equal(r.status, 402); assert.equal(r.json.error.code, 'insufficient_funds'); assert.equal(r.json.error.shortfall, 29900);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM orders').first()).n, 0);
});

test('checkout: success debits server-side price, is idempotent, no double charge on retries or parallel clicks', async () => {
  const { env, app, admin } = await setup(); const { c } = await newCustomer(app, env);
  await fund(app, env, admin, c, 100000, 'FUND0001');
  const plan = await planOf(env, 'netflix');
  const rs = await Promise.all([1, 2, 3].map(() => checkout(c, plan, 'key-same-click-1')));
  assert.ok(rs.every((r) => [200, 201].includes(r.status)), JSON.stringify(rs.map((r) => r.json)));
  assert.equal(new Set(rs.map((r) => r.json.orderNo)).size, 1);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM orders').first()).n, 1);
  assert.equal((await c.get('/api/auth/me')).json.balance, 100000 - 29900);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM wallet_transactions WHERE kind='purchase'").first()).n, 1);
  const o = (await c.get('/api/account/orders/' + rs[0].json.orderNo)).json;
  assert.equal(o.status, 'processing'); assert.equal(o.items[0].paid, 29900); assert.deepEqual(o.items[0].customer_input, { account_email: 'me@example.com' });
  await ledgerInvariant(env);
});

test('checkout: client cannot influence price; required inputs enforced; hidden/draft products refused', async () => {
  const { env, app, admin } = await setup(); const { c } = await newCustomer(app, env);
  await fund(app, env, admin, c, 100000, 'FUND0002');
  const plan = await planOf(env, 'netflix');
  const r = await c.post('/api/account/orders', { items: [{ planId: plan, input: { account_email: 'x@y.com' }, price: 1 }], idempotencyKey: 'key-price-tamper', total: 1 });
  assert.equal(r.status, 201); assert.equal((await c.get('/api/auth/me')).json.balance, 100000 - 29900);
  assert.equal((await checkout(c, plan, 'key-noinput-1', { items: [{ planId: plan }] })).status, 400);
  await env.DB.prepare("UPDATE products SET status='hidden' WHERE id='prd_netflix'").run();
  assert.equal((await checkout(c, plan, 'key-hidden-1')).status, 400);
  assert.equal((await c.post('/api/account/orders', { items: [{ planId: 'nope' }], idempotencyKey: 'key-nope-0001' })).status, 400);
});

test('stock: limited plan sells out atomically, buyer is not charged for the failure', async () => {
  const { env, app, admin } = await setup();
  await env.DB.prepare("UPDATE product_plans SET stock_limit=1 WHERE id='pln_netflix_0'").run();
  const a = await newCustomer(app, env); const b = await newCustomer(app, env);
  await fund(app, env, admin, a.c, 50000, 'FUND0003'); await fund(app, env, admin, b.c, 50000, 'FUND0004');
  const rs = await Promise.all([checkout(a.c, 'pln_netflix_0', 'stock-key-a1'), checkout(b.c, 'pln_netflix_0', 'stock-key-b1')]);
  assert.deepEqual(rs.map((r) => r.status).sort(), [201, 409]);
  const loser = rs[0].status === 409 ? b : a; const loserClient = rs[0].status === 409 ? a : b;
  void loser; const bal = (await loserClient.c.get('/api/auth/me')).json.balance; assert.equal(bal, 50000);
  await ledgerInvariant(env);
});

test('automatic delivery: encrypted at rest, delivered instantly, never delivered twice (parallel buyers, 1 item)', async () => {
  const { env, app, admin } = await setup();
  await admin.post('/api/admin/products', {
    name: 'Auto Product', categoryId: 'cat_software', status: 'active', deliveryType: 'automatic', plans: [{ name: 'Key', price: 10000 }],
  });
  const pid = (await env.DB.prepare("SELECT id FROM product_plans WHERE name='Key'").first()).id;
  const add = await admin.post(`/api/admin/inventory/${pid}/bulk`, { lines: ['user:a pass:SECRET-ONE', 'user:a pass:SECRET-ONE'] });
  assert.equal(add.json.added, 1);
  const raw = await env.DB.prepare('SELECT secret_enc FROM product_inventory').first(); assert.ok(!raw.secret_enc.includes('SECRET-ONE')); assert.match(raw.secret_enc, /^v1\./);
  const bs = await Promise.all([1, 2, 3].map(() => newCustomer(app, env)));
  for (const [i, b] of bs.entries()) await fund(app, env, admin, b.c, 20000, 'AUTOF00' + i);
  const rs = await Promise.all(bs.map((b, i) => checkout(b.c, pid, 'auto-key-00' + i)));
  assert.equal(rs.filter((r) => r.status === 201).length, 1);
  assert.equal(rs.filter((r) => r.status === 409).length, 2);
  const winner = bs[rs.findIndex((r) => r.status === 201)];
  const order = (await winner.c.get('/api/account/orders/' + rs.find((r) => r.status === 201)!.json.orderNo)).json;
  assert.equal(order.status, 'completed'); assert.equal(order.items[0].deliveries[0].content, 'user:a pass:SECRET-ONE');
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM order_deliveries").first()).n, 1);
  for (const [i, b] of bs.entries()) if (b !== winner) assert.equal((await b.c.get('/api/auth/me')).json.balance, 20000, 'loser #' + i + ' must not be charged');
  await ledgerInvariant(env);
  // out of stock now
  const prod = (await app.fetch(new Request('http://localhost/api/public/products?q=Auto'), env).then((r: Response) => r.json())) as any;
  assert.equal(prod.items[0].inStock, false);
});

test('manual delivery by staff, customer sees decrypted content only for own order; delivered once', async () => {
  const { env, app, admin } = await setup(); const { c } = await newCustomer(app, env); const other = await newCustomer(app, env);
  await fund(app, env, admin, c, 50000, 'FUND0010');
  const r = await checkout(c, 'pln_netflix_0', 'manual-key-0001'); const orderNo = r.json.orderNo;
  const itemId = (await env.DB.prepare('SELECT id FROM order_items').first()).id;
  const support = await newStaff(app, env, ['support_agent']);
  assert.equal((await support.post(`/api/admin/order-items/${itemId}/deliver`, { text: 'x' })).status, 403);
  const ordMgr = await newStaff(app, env, ['order_manager']);
  assert.equal((await ordMgr.post(`/api/admin/order-items/${itemId}/deliver`, {})).status, 400);                               // empty
  assert.equal((await ordMgr.post(`/api/admin/order-items/${itemId}/deliver`, { text: 'login: a / pw: SECRET-TWO' })).status, 200);
  assert.equal((await ordMgr.post(`/api/admin/order-items/${itemId}/deliver`, { text: 'again' })).status, 409);
  const o = (await c.get('/api/account/orders/' + orderNo)).json;
  assert.equal(o.status, 'completed'); assert.equal(o.items[0].deliveries[0].content, 'login: a / pw: SECRET-TWO');
  assert.equal((await other.c.get('/api/account/orders/' + orderNo)).status, 404);
  const stored = await env.DB.prepare('SELECT content_enc FROM order_deliveries').first(); assert.ok(!stored.content_enc.includes('SECRET-TWO'));
  const adm = (await support.get('/api/admin/orders/' + orderNo)).json; assert.deepEqual(adm.items[0].deliveries, []);        // support agents cannot read secrets
});

test('coupons: percent/fixed, per-user limit, max uses, expiry; discount recorded exactly', async () => {
  const { env, app, admin } = await setup();
  assert.equal((await admin.post('/api/admin/coupons', { code: 'SAVE10', type: 'percent', value: 10, maxUses: 1 })).status, 201);
  assert.equal((await admin.post('/api/admin/coupons', { code: 'OLD', type: 'fixed', value: 5000, expiresAt: '2020-01-01T00:00:00.000Z' })).status, 201);
  const a = await newCustomer(app, env); const b = await newCustomer(app, env);
  await fund(app, env, admin, a.c, 100000, 'FUND0020'); await fund(app, env, admin, b.c, 100000, 'FUND0021');
  const q = await a.c.post('/api/public/quote', { items: [{ planId: 'pln_netflix_0', input: { account_email: 'a@b.com' } }], couponCode: 'save10' });
  assert.equal(q.json.discount, 2990); assert.equal(q.json.total, 26910);
  assert.equal((await checkout(a.c, 'pln_netflix_0', 'coupon-key-001', { couponCode: 'SAVE10' })).status, 201);
  assert.equal((await a.c.get('/api/auth/me')).json.balance, 100000 - 26910);
  assert.equal((await checkout(b.c, 'pln_netflix_0', 'coupon-key-002', { couponCode: 'SAVE10' })).status, 400);   // max uses reached
  assert.equal((await checkout(b.c, 'pln_netflix_0', 'coupon-key-003', { couponCode: 'OLD' })).status, 400);      // expired
  assert.equal((await b.c.get('/api/auth/me')).json.balance, 100000); await ledgerInvariant(env);
});

test('refund: eligibility, request → approve credits wallet exactly once; non-eligible refused; ledger consistent', async () => {
  const { env, app, admin } = await setup(); const { c } = await newCustomer(app, env);
  await env.DB.prepare("UPDATE products SET refund_eligible=1 WHERE id='prd_spotify-premium'").run();
  await fund(app, env, admin, c, 100000, 'FUND0030');
  const r1 = await checkout(c, 'pln_netflix_0', 'refund-key-0001'); const r2 = await checkout(c, 'pln_spotify-premium_0', 'refund-key-0002');
  const items = (await env.DB.prepare('SELECT id,product_name FROM order_items').all()).results as any[];
  const net = items.find((i) => i.product_name === 'Netflix'), spo = items.find((i) => i.product_name === 'Spotify Premium');
  assert.equal((await c.post(`/api/account/order-items/${net.id}/refund`, { reason: 'Changed my mind' })).status, 400);   // not eligible
  assert.equal((await c.post(`/api/account/order-items/${spo.id}/refund`, { reason: 'Not working at all' })).status, 201);
  assert.equal((await c.post(`/api/account/order-items/${spo.id}/refund`, { reason: 'Not working at all' })).status, 409); // duplicate
  const rid = (await env.DB.prepare('SELECT id FROM refunds').first()).id;
  const support = await newStaff(app, env, ['support_agent']); assert.equal((await support.post(`/api/admin/refunds/${rid}/approve`, {})).status, 403);
  const fin = await newStaff(app, env, ['finance_manager']);
  const bal0 = (await c.get('/api/auth/me')).json.balance;
  const rs = await Promise.all([1, 2].map(() => fin.post(`/api/admin/refunds/${rid}/approve`, {})));
  assert.equal(rs.filter((r) => r.status === 200).length, 1);
  assert.equal((await c.get('/api/auth/me')).json.balance, bal0 + 29900);
  assert.equal((await fin.post(`/api/admin/refunds/${rid}/approve`, {})).status, 409);
  const o = (await c.get('/api/account/orders/' + r2.json.orderNo)).json; assert.equal(o.status, 'refunded');
  // staff cancel + refund of the unrelated manual item
  assert.equal((await fin.post(`/api/admin/order-items/${net.id}/refund`, { reason: 'Out of stock supplier', cancelled: true })).status, 200);
  assert.equal((await fin.post(`/api/admin/order-items/${net.id}/refund`, { reason: 'again again', cancelled: true })).status, 409);
  assert.equal((await c.get('/api/account/orders/' + r1.json.orderNo)).json.status, 'cancelled');
  assert.equal((await c.get('/api/auth/me')).json.balance, 100000);
  await ledgerInvariant(env);
});

test('manual wallet adjustment: cannot overdraw; ledger rows are immutable', async () => {
  const { env, app, admin } = await setup(); const { c, id } = await newCustomer(app, env);
  assert.equal((await admin.post(`/api/admin/customers/${id}/wallet`, { amount: 5000, note: 'Goodwill credit' })).status, 200);
  assert.equal((await admin.post(`/api/admin/customers/${id}/wallet`, { amount: -9000, note: 'Too much' })).status, 409);
  assert.equal((await c.get('/api/auth/me')).json.balance, 5000);
  await assert.rejects(env.DB.prepare('UPDATE wallet_transactions SET amount=999999').run(), /immutable/);
  await assert.rejects(env.DB.prepare('DELETE FROM wallet_transactions').run(), /immutable/);
  await assert.rejects(env.DB.prepare('UPDATE wallet_accounts SET balance=-1').run(), /CHECK/);
  const fin = await newStaff(app, env, ['support_agent']);
  assert.equal((await fin.post(`/api/admin/customers/${id}/wallet`, { amount: 1000, note: 'nope nope' })).status, 403);
  await ledgerInvariant(env);
});

test('api-delivery items stay Processing without provider credentials and are logged (never auto-completed)', async () => {
  const { env, app, admin } = await setup(); const { c } = await newCustomer(app, env);
  await env.DB.prepare("UPDATE products SET delivery_type='api', provider_id='prov_generic' WHERE id='prd_netflix'").run();
  await fund(app, env, admin, c, 50000, 'FUND0040');
  const r = await checkout(c, 'pln_netflix_0', 'api-key-000001'); assert.equal(r.status, 201);
  const itemId = (await env.DB.prepare('SELECT id FROM order_items').first()).id;
  assert.equal((await admin.post(`/api/admin/order-items/${itemId}/dispatch`, {})).status, 200);
  const log = await env.DB.prepare('SELECT status FROM provider_order_logs').first(); assert.equal(log.status, 'awaiting_credentials');
  assert.equal((await c.get('/api/account/orders/' + r.json.orderNo)).json.status, 'processing');
});

test('provider adapter: confirmed delivery completes; unreachable provider retries then fails safely', async () => {
  const env = makeEnv({ PROVIDER_GENERIC_HTTP_KEY: 'k' }); const app = createApp(); const admin = await newStaff(app, env, ['root']);
  await admin.put('/api/admin/payment-methods/easypaisa', { enabled: true, accountTitle: 'T', accountNumber: '1' });
  const { c } = await newCustomer(app, env);
  await env.DB.prepare("UPDATE provider_integrations SET enabled=1, base_url='https://provider.test'").run();
  await env.DB.prepare("UPDATE products SET delivery_type='api', provider_id='prov_generic' WHERE id='prd_netflix'").run();
  await fund(app, env, admin, c, 100000, 'FUND0050');
  const realFetch = globalThis.fetch; let mode: 'ok' | 'down' = 'ok';
  (globalThis as any).fetch = async () => { if (mode === 'down') throw new Error('network down'); return new Response(JSON.stringify({ status: 'completed', delivery: 'PROVIDER-CODE-1' }), { status: 200 }); };
  try {
    const r = await checkout(c, 'pln_netflix_0', 'prov-key-0001'); assert.equal(r.status, 201);
    await new Promise((r) => setTimeout(r, 50));
    const item = await env.DB.prepare('SELECT id,status FROM order_items').first();
    if (item.status === 'processing') await admin.post(`/api/admin/order-items/${item.id}/dispatch`, {});
    const o = (await c.get('/api/account/orders/' + r.json.orderNo)).json;
    assert.equal(o.status, 'completed'); assert.equal(o.items[0].deliveries[0].content, 'PROVIDER-CODE-1');
    mode = 'down';
    const r2 = await checkout(c, 'pln_netflix_0', 'prov-key-0002'); const id2 = (await env.DB.prepare("SELECT id FROM order_items WHERE status='processing'").first()).id;
    for (let i = 0; i < 6; i++) await admin.post(`/api/admin/order-items/${id2}/dispatch`, {});
    assert.equal((await env.DB.prepare('SELECT status FROM order_items WHERE id=?').bind(id2).first()).status, 'failed');
    assert.equal((await c.get('/api/account/orders/' + r2.json.orderNo)).json.status, 'failed');
    // failed item can then be refunded
    assert.equal((await admin.post(`/api/admin/order-items/${id2}/refund`, { reason: 'Provider failure', cancelled: true })).status, 200);
    await ledgerInvariant(env);
  } finally { globalThis.fetch = realFetch; }
});

test('tickets: customer/staff conversation, internal notes hidden, ownership enforced, closed tickets', async () => {
  const { env, app } = await setup(); const a = await newCustomer(app, env); const b = await newCustomer(app, env);
  const t = await a.c.post('/api/account/tickets', { subject: 'Delivery problem', message: 'Order not delivered' }); assert.equal(t.status, 201);
  assert.equal((await b.c.get('/api/account/tickets/' + t.json.ticketNo)).status, 404);
  const sup = await newStaff(app, env, ['support_agent']);
  assert.equal((await sup.post(`/api/admin/tickets/${t.json.ticketNo}/reply`, { message: 'Checking now' })).status, 201);
  assert.equal((await sup.post(`/api/admin/tickets/${t.json.ticketNo}/reply`, { message: 'INTERNAL fraud?', internal: true })).status, 201);
  const view = (await a.c.get('/api/account/tickets/' + t.json.ticketNo)).json;
  assert.equal(view.status, 'waiting_customer'); assert.equal(view.messages.length, 2); assert.ok(!JSON.stringify(view).includes('INTERNAL'));
  assert.equal((await a.c.post(`/api/account/tickets/${t.json.ticketNo}/reply`, { message: 'Thanks' })).status, 201);
  assert.equal((await sup.post(`/api/admin/tickets/${t.json.ticketNo}/update`, { status: 'closed' })).status, 200);
  assert.equal((await a.c.post(`/api/account/tickets/${t.json.ticketNo}/reply`, { message: 'more' })).status, 409);
  const notes = (await a.c.get('/api/account/notifications')).json; assert.ok(notes.some((n: any) => n.title.includes('Support replied')));
});

test('public catalogue: search, filters, sort, pagination, stock; admin product CRUD; track order; sitemap', async () => {
  const { env, app, admin } = await setup(); const anon = new Client(app, env);
  const all = (await anon.get('/api/public/products?pageSize=5&page=2')).json; assert.equal(all.items.length, 5); assert.ok(all.total >= 13);
  assert.equal((await anon.get('/api/public/products?q=netflix')).json.items[0].name, 'Netflix');
  assert.ok((await anon.get('/api/public/products?category=ai-tools')).json.items.every((p: any) => p.category.includes('AI')));
  const cheap = (await anon.get('/api/public/products?max=300&sort=price_desc')).json.items; assert.ok(cheap.every((p: any) => p.fromPrice <= 30000));
  assert.ok(cheap[0].fromPrice >= cheap[cheap.length - 1].fromPrice);
  const det = (await anon.get('/api/public/products/netflix')).json; assert.equal(det.plans.length, 2); assert.equal(det.demo, true);
  assert.equal((await anon.get('/api/public/products/nope')).status, 404);
  const home = (await anon.get('/api/public/home')).json; assert.ok(home.trending.length && home.categories.length === 10);
  const c = await admin.post('/api/admin/products', { name: 'New Thing', categoryId: 'cat_ai-tools', status: 'active', deliveryType: 'manual', plans: [{ name: 'M', price: 5000 }, { name: 'Y', price: 50000 }] });
  assert.equal(c.status, 201);
  const sup = await newStaff(app, env, ['support_agent']); assert.equal((await sup.post('/api/admin/products', {})).status, 403);
  const { c: cust, email } = await newCustomer(app, env);
  await admin.put('/api/admin/payment-methods/easypaisa', { enabled: true, accountTitle: 'T', accountNumber: '1' });
  await fund(app, env, admin, cust, 50000, 'FUND0060'); const r = await checkout(cust, 'pln_netflix_0', 'track-key-0001');
  const tr = await anon.post('/api/public/track', { orderNo: r.json.orderNo, email }); assert.equal(tr.status, 200); assert.ok(!JSON.stringify(tr.json).includes('PROVIDER'));
  assert.equal((await anon.post('/api/public/track', { orderNo: r.json.orderNo, email: 'other@example.com' })).status, 404);
  const sm = await app.fetch(new Request('http://localhost/sitemap.xml'), env); assert.match(await sm.text(), /products\/netflix/);
  const del = await admin.del('/api/admin/products/' + c.json.id); assert.equal(del.status, 200);
  const hide = await admin.del('/api/admin/products/prd_netflix'); assert.equal(hide.json.hidden, true);
});

test('admin: dashboard, reports, csv export with formula-injection guard, audit log, staff safety', async () => {
  const { env, app, admin } = await setup(); const { c } = await newCustomer(app, env, '=HYPERLINK("x")');
  await fund(app, env, admin, c, 100000, 'FUND0070'); await checkout(c, 'pln_netflix_0', 'dash-key-0001');
  const d = (await admin.get('/api/admin/dashboard')).json; assert.equal(d.revenue, 29900); assert.equal(d.totalOrders, 1); assert.equal(d.pendingDeliveries, 1);
  const today = new Date().toISOString().slice(0, 10);
  const rep = (await admin.get(`/api/admin/reports/summary?from=${today}&to=${today}`)).json; assert.equal(rep.sales.revenue, 29900); assert.equal(rep.deposits.approved, 100000);
  const csv = await app.fetch(new Request('http://localhost/api/admin/export/customers', { headers: { cookie: admin.cookie } }), env);
  assert.match(await csv.text(), /'=HYPERLINK/);
  const logs = (await admin.get('/api/admin/audit-logs')).json.items; assert.ok(logs.some((l: any) => l.action === 'deposit.approve'));
  const root = (await env.DB.prepare("SELECT id FROM users WHERE email='root@noorix.test'").first()).id;
  assert.equal((await admin.put('/api/admin/staff/' + root, { roles: ['order_manager'], status: 'active' })).status, 400);   // cannot demote self
  assert.equal((await admin.put('/api/admin/settings', { site_name: 'NOORIX DIGITAL LAB', whatsapp: '923154429417', evil_key: 'x' })).status, 200);
});
