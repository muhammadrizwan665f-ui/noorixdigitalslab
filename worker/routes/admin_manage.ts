import { Hono } from 'hono';
import { z } from 'zod';
import type { HonoEnv } from '../types';
import { bad, body, conflict, notFound, parse, toCsv } from '../lib/http';
import { requirePerm, requireStaff, requireSuper } from '../lib/auth';
import { IMAGES, storeUpload } from '../lib/files';
import { audit, auditStmt, getSettings } from '../lib/notify';
import { hashPassword, uid } from '../lib/crypto';
import { NOW } from '../services/sql';
import { providerSecretName } from '../services/providers';

export const manage = new Hono<HonoEnv>();
manage.use('*', requireStaff);
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';
const me = (c: any) => c.get('user')!.id as string;

// ── categories
manage.get('/categories', requirePerm('categories.manage'), async (c) => c.json((await c.env.DB.prepare('SELECT * FROM product_categories ORDER BY sort_order').all()).results));
const catSchema = z.object({ name: z.string().trim().min(2).max(80), description: z.string().max(300).optional().nullable(), icon: z.string().max(30).optional().nullable(), sortOrder: z.number().int().default(0), active: z.boolean().default(true) });
manage.post('/categories', requirePerm('categories.manage'), async (c) => {
  const i = await body(c, catSchema); const id = uid();
  try { await c.env.DB.batch([c.env.DB.prepare('INSERT INTO product_categories(id,slug,name,description,icon,sort_order,active) VALUES(?,?,?,?,?,?,?)').bind(id, slugify(i.name), i.name, i.description ?? null, i.icon ?? null, i.sortOrder, i.active ? 1 : 0), auditStmt(c.env, me(c), 'category.create', 'category', id, i, c.get('ip'))]); }
  catch (e) { if (String((e as Error).message).includes('UNIQUE')) throw conflict('A category with this name already exists'); throw e; }
  return c.json({ id }, 201);
});
manage.put('/categories/:id', requirePerm('categories.manage'), async (c) => {
  const i = await body(c, catSchema);
  await c.env.DB.batch([c.env.DB.prepare('UPDATE product_categories SET name=?,description=?,icon=?,sort_order=?,active=? WHERE id=?').bind(i.name, i.description ?? null, i.icon ?? null, i.sortOrder, i.active ? 1 : 0, c.req.param('id')), auditStmt(c.env, me(c), 'category.update', 'category', c.req.param('id'), i, c.get('ip'))]);
  return c.json({ ok: true });
});
manage.delete('/categories/:id', requirePerm('categories.manage'), async (c) => {
  const n = await c.env.DB.prepare('SELECT COUNT(*) n FROM products WHERE category_id=?').bind(c.req.param('id')).first<any>();
  if (n.n) throw conflict('This category still has products. Move or delete them first, or just deactivate the category.');
  await c.env.DB.batch([c.env.DB.prepare('DELETE FROM product_categories WHERE id=?').bind(c.req.param('id')), auditStmt(c.env, me(c), 'category.delete', 'category', c.req.param('id'), {}, c.get('ip'))]);
  return c.json({ ok: true });
});

// ── products
manage.post('/uploads/image', requirePerm('products.manage'), async (c) => {
  const f = await storeUpload(c.env, await c.req.formData(), { prefix: 'img/', allowed: IMAGES, maxBytes: 2 * 1024 * 1024 });
  return c.json({ key: f.key, url: `/files/${f.key}` });
});
manage.get('/products', requirePerm('products.manage'), async (c) => {
  const rows = (await c.env.DB.prepare(`SELECT p.id,p.slug,p.name,p.status,p.delivery_type,p.is_featured,p.is_trending,p.is_deal,p.is_demo,p.sales_count,c.name category,
    (SELECT MIN(price) FROM product_plans WHERE product_id=p.id) from_price,(SELECT COUNT(*) FROM product_plans WHERE product_id=p.id) plans FROM products p JOIN product_categories c ON c.id=p.category_id ORDER BY p.created_at DESC`).all()).results;
  return c.json({ items: rows });
});
manage.get('/products/:id', requirePerm('products.manage'), async (c) => {
  const p = await c.env.DB.prepare('SELECT * FROM products WHERE id=?').bind(c.req.param('id')).first<any>();
  if (!p) throw notFound('Product not found');
  const plans = (await c.env.DB.prepare('SELECT * FROM product_plans WHERE product_id=? ORDER BY sort_order,price').bind(p.id).all()).results;
  return c.json({ ...p, features: JSON.parse(p.features), input_fields: JSON.parse(p.input_fields), plans });
});
const productSchema = z.object({
  name: z.string().trim().min(2).max(100), categoryId: z.string().min(1), shortDescription: z.string().max(200).default(''), description: z.string().max(8000).default(''),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#087BFF'), imageKey: z.string().max(200).optional().nullable(),
  status: z.enum(['draft', 'active', 'hidden']), deliveryType: z.enum(['automatic', 'manual', 'api']),
  features: z.array(z.string().max(120)).max(15).default([]),
  inputFields: z.array(z.object({ key: z.string().regex(/^[a-z0-9_]{1,30}$/), label: z.string().max(60), type: z.enum(['text', 'email', 'number']).default('text'), required: z.boolean().default(false), help: z.string().max(120).optional() })).max(6).default([]),
  terms: z.string().max(4000).default(''), refundEligible: z.boolean().default(false), refundPolicy: z.string().max(2000).default(''),
  isFeatured: z.boolean().default(false), isTrending: z.boolean().default(false), isDeal: z.boolean().default(false),
  providerId: z.string().optional().nullable(), seoTitle: z.string().max(70).optional().nullable(), seoDescription: z.string().max(170).optional().nullable(),
  plans: z.array(z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(60), duration: z.string().max(40).default(''), price: z.number().int().positive().max(1_000_000_000), comparePrice: z.number().int().positive().optional().nullable(),
    stockLimit: z.number().int().min(0).optional().nullable(), providerSku: z.string().max(60).optional().nullable(), status: z.enum(['active', 'hidden']).default('active') })).min(1).max(12),
});
function productStmts(c: any, id: string, i: z.infer<typeof productSchema>, create: boolean) {
  const db = c.env.DB as D1Database;
  const s: D1PreparedStatement[] = [];
  const vals = [i.categoryId, i.name, i.shortDescription, i.description, i.imageKey ?? null, i.brandColor, i.status, i.deliveryType, JSON.stringify(i.features), JSON.stringify(i.inputFields), i.terms, i.refundEligible ? 1 : 0, i.refundPolicy, i.isFeatured ? 1 : 0, i.isTrending ? 1 : 0, i.isDeal ? 1 : 0, i.providerId ?? null, i.seoTitle ?? null, i.seoDescription ?? null];
  if (create) s.push(db.prepare(`INSERT INTO products(category_id,name,short_description,description,image_key,brand_color,status,delivery_type,features,input_fields,terms,refund_eligible,refund_policy,is_featured,is_trending,is_deal,provider_id,seo_title,seo_description,id,slug) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...vals, id, slugify(i.name) + '-' + id.slice(0, 4)));
  else s.push(db.prepare(`UPDATE products SET category_id=?,name=?,short_description=?,description=?,image_key=?,brand_color=?,status=?,delivery_type=?,features=?,input_fields=?,terms=?,refund_eligible=?,refund_policy=?,is_featured=?,is_trending=?,is_deal=?,provider_id=?,seo_title=?,seo_description=?,updated_at=${NOW} WHERE id=?`).bind(...vals, id));
  const keep: string[] = [];
  i.plans.forEach((p, k) => {
    const pid = p.id ?? uid(); keep.push(pid);
    s.push(db.prepare(`INSERT INTO product_plans(id,product_id,name,duration_label,price,compare_price,stock_limit,provider_sku,status,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,duration_label=excluded.duration_label,price=excluded.price,compare_price=excluded.compare_price,stock_limit=excluded.stock_limit,provider_sku=excluded.provider_sku,status=excluded.status,sort_order=excluded.sort_order
      WHERE product_plans.product_id=excluded.product_id`).bind(pid, id, p.name, p.duration, p.price, p.comparePrice ?? null, p.stockLimit ?? null, p.providerSku ?? null, p.status, k));
  });
  // plans removed from the form: hide (they may be referenced by orders)
  s.push(db.prepare(`UPDATE product_plans SET status='hidden' WHERE product_id=? AND id NOT IN (${keep.map(() => '?').join(',')})`).bind(id, ...keep));
  return s;
}
manage.post('/products', requirePerm('products.manage'), async (c) => {
  const i = await body(c, productSchema); const id = uid();
  await c.env.DB.batch([...productStmts(c, id, i, true), auditStmt(c.env, me(c), 'product.create', 'product', id, { name: i.name }, c.get('ip'))]);
  return c.json({ id }, 201);
});
manage.put('/products/:id', requirePerm('products.manage'), async (c) => {
  const i = await body(c, productSchema); const id = c.req.param('id');
  if (!(await c.env.DB.prepare('SELECT 1 x FROM products WHERE id=?').bind(id).first())) throw notFound('Product not found');
  await c.env.DB.batch([...productStmts(c, id, i, false), auditStmt(c.env, me(c), 'product.update', 'product', id, { name: i.name }, c.get('ip'))]);
  return c.json({ ok: true });
});
manage.delete('/products/:id', requirePerm('products.manage'), async (c) => {
  const id = c.req.param('id');
  const used = await c.env.DB.prepare('SELECT COUNT(*) n FROM order_items WHERE product_id=?').bind(id).first<any>();
  if (used.n) { await c.env.DB.prepare(`UPDATE products SET status='hidden', updated_at=${NOW} WHERE id=?`).bind(id).run(); await audit(c.env, me(c), 'product.hide', 'product', id, {}, c.get('ip')); return c.json({ ok: true, hidden: true, message: 'Product has orders, so it was hidden instead of deleted.' }); }
  await c.env.DB.batch([c.env.DB.prepare('DELETE FROM products WHERE id=?').bind(id), auditStmt(c.env, me(c), 'product.delete', 'product', id, {}, c.get('ip'))]);
  return c.json({ ok: true });
});

// ── payment methods
manage.get('/payment-methods', requirePerm('payments.settings'), async (c) => c.json((await c.env.DB.prepare('SELECT * FROM payment_methods ORDER BY sort_order').all()).results.map((m: any) => ({ ...m, gatewayConfigured: m.code === 'payfast' ? !!(c.env.PAYFAST_MERCHANT_ID && c.env.PAYFAST_SECURED_KEY) : undefined }))));
manage.put('/payment-methods/:code', requirePerm('payments.settings'), async (c) => {
  const i = await body(c, z.object({ enabled: z.boolean(), accountTitle: z.string().max(80).default(''), accountNumber: z.string().max(60).default(''), instructions: z.string().max(600).default(''), minAmount: z.number().int().min(100).default(10000), maxAmount: z.number().int().max(1_000_000_000).default(50_000_000) }));
  const code = c.req.param('code');
  const m = await c.env.DB.prepare('SELECT type FROM payment_methods WHERE code=?').bind(code).first<any>();
  if (!m) throw notFound('Payment method not found');
  if (m.type === 'gateway') throw bad('Gateway methods are configured with Cloudflare secrets, not here. See docs/INTEGRATIONS.md.');
  if (i.enabled && (!i.accountNumber.trim() || !i.accountTitle.trim())) throw bad('Enter the account title and number before enabling this method');
  await c.env.DB.batch([c.env.DB.prepare('UPDATE payment_methods SET enabled=?,account_title=?,account_number=?,instructions=?,min_amount=?,max_amount=? WHERE code=?').bind(i.enabled ? 1 : 0, i.accountTitle, i.accountNumber, i.instructions, i.minAmount, i.maxAmount, code), auditStmt(c.env, me(c), 'payment_method.update', 'payment_method', code, { enabled: i.enabled }, c.get('ip'))]);
  return c.json({ ok: true });
});

// ── marketing
manage.get('/banners', requirePerm('marketing.manage'), async (c) => c.json((await c.env.DB.prepare('SELECT * FROM homepage_banners ORDER BY sort_order').all()).results));
const bannerSchema = z.object({ title: z.string().trim().min(2).max(100), subtitle: z.string().max(200).optional().nullable(), imageKey: z.string().max(200).optional().nullable(), ctaLabel: z.string().max(30).optional().nullable(), ctaUrl: z.string().max(200).regex(/^(\/|https:\/\/)/, 'Link must start with / or https://').optional().nullable(), sortOrder: z.number().int().default(0), active: z.boolean().default(true) });
manage.post('/banners', requirePerm('marketing.manage'), async (c) => { const i = await body(c, bannerSchema); const id = uid(); await c.env.DB.prepare('INSERT INTO homepage_banners(id,title,subtitle,image_key,cta_label,cta_url,sort_order,active) VALUES(?,?,?,?,?,?,?,?)').bind(id, i.title, i.subtitle ?? null, i.imageKey ?? null, i.ctaLabel ?? null, i.ctaUrl ?? null, i.sortOrder, i.active ? 1 : 0).run(); return c.json({ id }, 201); });
manage.put('/banners/:id', requirePerm('marketing.manage'), async (c) => { const i = await body(c, bannerSchema); await c.env.DB.prepare('UPDATE homepage_banners SET title=?,subtitle=?,image_key=?,cta_label=?,cta_url=?,sort_order=?,active=? WHERE id=?').bind(i.title, i.subtitle ?? null, i.imageKey ?? null, i.ctaLabel ?? null, i.ctaUrl ?? null, i.sortOrder, i.active ? 1 : 0, c.req.param('id')).run(); return c.json({ ok: true }); });
manage.delete('/banners/:id', requirePerm('marketing.manage'), async (c) => { await c.env.DB.prepare('DELETE FROM homepage_banners WHERE id=?').bind(c.req.param('id')).run(); return c.json({ ok: true }); });

manage.get('/coupons', requirePerm('marketing.manage'), async (c) => c.json((await c.env.DB.prepare('SELECT * FROM coupons ORDER BY created_at DESC').all()).results));
const couponSchema = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, 'Code: 3–30 letters/numbers'), type: z.enum(['percent', 'fixed']), value: z.number().int().positive(), minOrder: z.number().int().min(0).default(0), maxDiscount: z.number().int().positive().optional().nullable(), maxUses: z.number().int().positive().optional().nullable(), perUserLimit: z.number().int().positive().default(1), startsAt: z.string().optional().nullable(), expiresAt: z.string().optional().nullable(), active: z.boolean().default(true) })
  .refine((v) => v.type !== 'percent' || v.value <= 100, { message: 'Percent coupons are max 100' });
manage.post('/coupons', requirePerm('marketing.manage'), async (c) => {
  const i = await body(c, couponSchema); const id = uid();
  try { await c.env.DB.prepare('INSERT INTO coupons(id,code,type,value,min_order,max_discount,max_uses,per_user_limit,starts_at,expires_at,active) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id, i.code, i.type, i.value, i.minOrder, i.maxDiscount ?? null, i.maxUses ?? null, i.perUserLimit, i.startsAt ?? null, i.expiresAt ?? null, i.active ? 1 : 0).run(); }
  catch (e) { if (String((e as Error).message).includes('UNIQUE')) throw conflict('This coupon code already exists'); throw e; }
  await audit(c.env, me(c), 'coupon.create', 'coupon', id, { code: i.code }, c.get('ip')); return c.json({ id }, 201);
});
manage.put('/coupons/:id', requirePerm('marketing.manage'), async (c) => {
  const i = await body(c, couponSchema);
  try { await c.env.DB.prepare('UPDATE coupons SET code=?,type=?,value=?,min_order=?,max_discount=?,max_uses=?,per_user_limit=?,starts_at=?,expires_at=?,active=? WHERE id=?').bind(i.code, i.type, i.value, i.minOrder, i.maxDiscount ?? null, i.maxUses ?? null, i.perUserLimit, i.startsAt ?? null, i.expiresAt ?? null, i.active ? 1 : 0, c.req.param('id')).run(); }
  catch (e) { if (String((e as Error).message).includes('CHECK')) throw bad('Max uses cannot be lower than the number of times it was already used'); throw e; }
  return c.json({ ok: true });
});
manage.delete('/coupons/:id', requirePerm('marketing.manage'), async (c) => { await c.env.DB.prepare('UPDATE coupons SET active=0 WHERE id=?').bind(c.req.param('id')).run(); return c.json({ ok: true, message: 'Coupon deactivated (history is kept).' }); });

// ── content
manage.get('/pages', requirePerm('content.manage'), async (c) => c.json((await c.env.DB.prepare('SELECT slug,title,body,published,updated_at FROM cms_pages ORDER BY slug').all()).results));
manage.put('/pages/:slug', requirePerm('content.manage'), async (c) => {
  const i = await body(c, z.object({ title: z.string().trim().min(2).max(100), body: z.string().max(30000), published: z.boolean().default(true) }));
  const slug = slugify(c.req.param('slug'));
  await c.env.DB.prepare(`INSERT INTO cms_pages(slug,title,body,published) VALUES(?,?,?,?) ON CONFLICT(slug) DO UPDATE SET title=excluded.title,body=excluded.body,published=excluded.published,updated_at=${NOW}`).bind(slug, i.title, i.body, i.published ? 1 : 0).run();
  await audit(c.env, me(c), 'page.save', 'page', slug, {}, c.get('ip')); return c.json({ ok: true });
});
manage.get('/faqs', requirePerm('content.manage'), async (c) => c.json((await c.env.DB.prepare('SELECT * FROM faqs ORDER BY sort_order').all()).results));
const faqSchema = z.object({ question: z.string().trim().min(3).max(200), answer: z.string().trim().min(3).max(2000), sortOrder: z.number().int().default(0), active: z.boolean().default(true) });
manage.post('/faqs', requirePerm('content.manage'), async (c) => { const i = await body(c, faqSchema); const id = uid(); await c.env.DB.prepare('INSERT INTO faqs(id,question,answer,sort_order,active) VALUES(?,?,?,?,?)').bind(id, i.question, i.answer, i.sortOrder, i.active ? 1 : 0).run(); return c.json({ id }, 201); });
manage.put('/faqs/:id', requirePerm('content.manage'), async (c) => { const i = await body(c, faqSchema); await c.env.DB.prepare('UPDATE faqs SET question=?,answer=?,sort_order=?,active=? WHERE id=?').bind(i.question, i.answer, i.sortOrder, i.active ? 1 : 0, c.req.param('id')).run(); return c.json({ ok: true }); });
manage.delete('/faqs/:id', requirePerm('content.manage'), async (c) => { await c.env.DB.prepare('DELETE FROM faqs WHERE id=?').bind(c.req.param('id')).run(); return c.json({ ok: true }); });

// ── reports
manage.get('/reports/summary', requirePerm('reports.view'), async (c) => {
  const q = parse(z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), c.req.query());
  const lo = `${q.from}T00:00:00.000Z`, hi = `${q.to}T23:59:59.999Z`;   // dates are interpreted as UTC days
  const db = c.env.DB;
  const [sales, dep, ref, top, cats] = await Promise.all([
    db.prepare("SELECT COUNT(*) orders, COALESCE(SUM(total),0) revenue, COALESCE(SUM(discount),0) discounts FROM orders WHERE created_at BETWEEN ? AND ? AND status IN ('processing','completed')").bind(lo, hi).first<any>(),
    db.prepare("SELECT COALESCE(SUM(amount),0) approved, COUNT(*) n FROM deposits WHERE status='approved' AND reviewed_at BETWEEN ? AND ?").bind(lo, hi).first<any>(),
    db.prepare("SELECT COALESCE(SUM(amount),0) refunded, COUNT(*) n FROM refunds WHERE status='processed' AND processed_at BETWEEN ? AND ?").bind(lo, hi).first<any>(),
    db.prepare("SELECT i.product_name name, COUNT(*) units, SUM(i.paid) revenue FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.created_at BETWEEN ? AND ? AND i.status IN ('processing','completed') GROUP BY i.product_name ORDER BY revenue DESC LIMIT 10").bind(lo, hi).all(),
    db.prepare("SELECT c.name, COUNT(*) units, SUM(i.paid) revenue FROM order_items i JOIN orders o ON o.id=i.order_id JOIN products p ON p.id=i.product_id JOIN product_categories c ON c.id=p.category_id WHERE o.created_at BETWEEN ? AND ? AND i.status IN ('processing','completed') GROUP BY c.name ORDER BY revenue DESC").bind(lo, hi).all(),
  ]);
  return c.json({ sales, deposits: dep, refunds: ref, topProducts: top.results, byCategory: cats.results });
});
const EXPORTS: Record<string, { perm: string; sql: string; cols: string[] }> = {
  orders: { perm: 'reports.view', cols: ['order_no', 'status', 'customer', 'email', 'subtotal', 'discount', 'total', 'coupon_code', 'created_at'], sql: 'SELECT o.order_no,o.status,u.name customer,u.email,o.subtotal,o.discount,o.total,o.coupon_code,o.created_at FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC LIMIT 20000' },
  deposits: { perm: 'reports.view', cols: ['created_at', 'customer', 'email', 'method_code', 'amount', 'payment_reference', 'status', 'reviewed_at'], sql: 'SELECT d.created_at,u.name customer,u.email,d.method_code,d.amount,d.payment_reference,d.status,d.reviewed_at FROM deposits d JOIN users u ON u.id=d.user_id ORDER BY d.created_at DESC LIMIT 20000' },
  customers: { perm: 'reports.view', cols: ['name', 'email', 'phone', 'status', 'balance', 'created_at'], sql: 'SELECT u.name,u.email,u.phone,u.status,COALESCE(w.balance,0) balance,u.created_at FROM users u LEFT JOIN wallet_accounts w ON w.user_id=u.id WHERE u.is_staff=0 ORDER BY u.created_at DESC LIMIT 20000' },
  ledger: { perm: 'wallets.view', cols: ['created_at', 'email', 'kind', 'amount', 'balance_after', 'reference_type', 'reference_id', 'note'], sql: 'SELECT t.created_at,u.email,t.kind,t.amount,t.balance_after,t.reference_type,t.reference_id,t.note FROM wallet_transactions t JOIN users u ON u.id=t.user_id ORDER BY t.created_at DESC LIMIT 50000' },
};
manage.get('/export/:name', async (c) => {
  const e = EXPORTS[c.req.param('name')]; if (!e) throw notFound('Unknown export');
  const { can } = await import('../lib/auth'); if (!can(c, e.perm)) throw bad('You do not have permission to export this', 'forbidden');
  const rows = (await c.env.DB.prepare(e.sql).all<any>()).results;
  await audit(c.env, me(c), 'export', 'export', c.req.param('name'), { rows: rows.length }, c.get('ip'));
  return new Response('﻿' + toCsv(rows, e.cols), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="noorix-${c.req.param('name')}-${new Date().toISOString().slice(0, 10)}.csv"` } });
});

// ── staff & roles (Super Admin only)
manage.get('/roles', requirePerm('staff.manage'), async (c) => {
  const roles = (await c.env.DB.prepare('SELECT id,code,name,description FROM roles ORDER BY name').all<any>()).results;
  const rp = (await c.env.DB.prepare('SELECT role_id,permission_code FROM role_permissions').all<any>()).results;
  const perms = (await c.env.DB.prepare('SELECT code,description FROM permissions ORDER BY code').all()).results;
  return c.json({ roles: roles.map((r) => ({ ...r, permissions: rp.filter((x) => x.role_id === r.id).map((x) => x.permission_code) })), permissions: perms });
});
manage.get('/staff', requirePerm('staff.manage'), async (c) => {
  const rows = (await c.env.DB.prepare("SELECT u.id,u.name,u.email,u.status,u.last_login_at,u.created_at,(SELECT group_concat(r.code) FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id) roles FROM users u WHERE u.is_staff=1 ORDER BY u.created_at").all<any>()).results;
  return c.json({ items: rows.map((r) => ({ ...r, roles: r.roles ? r.roles.split(',') : [] })) });
});
const roleCodes = z.array(z.enum(['super_admin', 'order_manager', 'finance_manager', 'support_agent', 'product_manager'])).min(1);
manage.post('/staff', requireSuper, async (c) => {
  const i = await body(c, z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().toLowerCase().email(), password: z.string().min(10).max(128), roles: roleCodes }));
  const id = uid();
  try {
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO users(id,email,name,password_hash,is_staff,email_verified_at) VALUES(?,?,?,?,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))").bind(id, i.email, i.name, await hashPassword(i.password)),
      c.env.DB.prepare('INSERT INTO wallet_accounts(user_id,balance) VALUES(?,0)').bind(id),
      ...i.roles.map((r) => c.env.DB.prepare('INSERT INTO user_roles(user_id,role_id) VALUES(?,?)').bind(id, 'role_' + r)),
      auditStmt(c.env, me(c), 'staff.create', 'user', id, { email: i.email, roles: i.roles }, c.get('ip')),
    ]);
  } catch (e) { if (String((e as Error).message).includes('UNIQUE')) throw conflict('That email is already registered'); throw e; }
  return c.json({ id }, 201);
});
manage.put('/staff/:id', requireSuper, async (c) => {
  const i = await body(c, z.object({ roles: roleCodes, status: z.enum(['active', 'suspended']) }));
  const id = c.req.param('id');
  if (id === me(c) && (i.status !== 'active' || !i.roles.includes('super_admin'))) throw bad('You cannot remove your own Super Admin access or suspend yourself');
  const t = await c.env.DB.prepare('SELECT 1 x FROM users WHERE id=? AND is_staff=1').bind(id).first(); if (!t) throw notFound('Staff member not found');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM user_roles WHERE user_id=?').bind(id),
    ...i.roles.map((r) => c.env.DB.prepare('INSERT INTO user_roles(user_id,role_id) VALUES(?,?)').bind(id, 'role_' + r)),
    c.env.DB.prepare('UPDATE users SET status=? WHERE id=?').bind(i.status, id),
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id=? AND ?<>'active'").bind(id, i.status),
    // a Super Admin must always remain
    c.env.DB.prepare("INSERT INTO guards(ok,label) SELECT 0,'no_super_admin' WHERE NOT EXISTS (SELECT 1 FROM user_roles ur JOIN users u ON u.id=ur.user_id WHERE ur.role_id='role_super_admin' AND u.status='active')"),
    auditStmt(c.env, me(c), 'staff.update', 'user', id, i, c.get('ip')),
  ]).catch((e) => { if (String(e.message).includes('ok = 1')) throw bad('At least one active Super Admin must remain'); throw e; });
  return c.json({ ok: true });
});

// ── settings, providers, logs
manage.get('/settings', requireSuper, async (c) => c.json(await getSettings(c.env)));
manage.put('/settings', requireSuper, async (c) => {
  const i = await body(c, z.record(z.string().max(2000)));
  const allowed = ['site_name', 'tagline', 'whatsapp', 'support_email', 'announcement', 'announcement_active', 'hero_title', 'hero_subtitle', 'maintenance', 'min_deposit', 'registration_open', 'require_email_verification', 'brand_name', 'brand_tagline', 'brand_parent', 'social_facebook', 'social_instagram', 'social_tiktok', 'social_youtube', 'social_x'];
  for (const [k, v] of Object.entries(i)) if (k.startsWith('social_') && v && !/^https:\/\/[^\s]+$/.test(v)) throw bad(`${k.replace('social_', '')} link must start with https://`);
  if (i.brand_name !== undefined && i.brand_name.trim().length < 2) throw bad('Brand name is required');
  const st = Object.entries(i).filter(([k]) => allowed.includes(k)).map(([k, v]) => c.env.DB.prepare(`INSERT INTO site_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=${NOW}`).bind(k, v));
  if (!st.length) throw bad('No valid settings supplied');
  await c.env.DB.batch([...st, auditStmt(c.env, me(c), 'settings.update', 'settings', null, Object.keys(i), c.get('ip'))]);
  return c.json({ ok: true });
});
manage.put('/announcement', requirePerm('marketing.manage'), async (c) => {
  const i = await body(c, z.object({ text: z.string().max(300), active: z.boolean() }));
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO site_settings(key,value) VALUES('announcement',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=${NOW}`).bind(i.text),
    c.env.DB.prepare(`INSERT INTO site_settings(key,value) VALUES('announcement_active',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=${NOW}`).bind(i.active ? '1' : '0'),
  ]);
  return c.json({ ok: true });
});
manage.get('/providers', requirePerm('providers.manage'), async (c) => {
  const rows = (await c.env.DB.prepare('SELECT * FROM provider_integrations ORDER BY name').all<any>()).results;
  return c.json({ items: rows.map((r) => ({ ...r, secretName: providerSecretName(r.code), keyConfigured: !!c.env[providerSecretName(r.code)] })) });
});
manage.put('/providers/:id', requirePerm('providers.manage'), async (c) => {
  const i = await body(c, z.object({ name: z.string().max(80), baseUrl: z.string().url().startsWith('https://').optional().nullable(), enabled: z.boolean(), config: z.object({ createPath: z.string().max(100).optional(), statusPath: z.string().max(100).optional(), timeoutMs: z.number().int().min(1000).max(25000).optional() }).default({}) }));
  await c.env.DB.batch([c.env.DB.prepare('UPDATE provider_integrations SET name=?,base_url=?,enabled=?,config=?,status=? WHERE id=?').bind(i.name, i.baseUrl ?? null, i.enabled ? 1 : 0, JSON.stringify(i.config), i.enabled ? 'enabled' : 'awaiting_credentials', c.req.param('id')), auditStmt(c.env, me(c), 'provider.update', 'provider', c.req.param('id'), { enabled: i.enabled }, c.get('ip'))]);
  return c.json({ ok: true });
});
manage.get('/provider-logs', requirePerm('providers.manage'), async (c) => c.json((await c.env.DB.prepare('SELECT l.*,i.product_name FROM provider_order_logs l JOIN order_items i ON i.id=l.order_item_id ORDER BY l.created_at DESC LIMIT 100').all()).results));
manage.get('/email-log', requireSuper, async (c) => c.json((await c.env.DB.prepare('SELECT id,to_email,subject,status,error,created_at FROM email_outbox ORDER BY created_at DESC LIMIT 100').all()).results));
manage.get('/audit-logs', requirePerm('audit.view'), async (c) => {
  const p = parse(z.object({ page: z.coerce.number().int().min(1).default(1), action: z.string().max(60).optional() }), c.req.query());
  const w = p.action ? 'WHERE l.action LIKE ?' : ''; const a = p.action ? [`%${p.action}%`] : [];
  const rows = (await c.env.DB.prepare(`SELECT l.id,l.action,l.entity_type,l.entity_id,l.details,l.ip,l.created_at,u.name actor FROM admin_audit_logs l LEFT JOIN users u ON u.id=l.actor_id ${w} ORDER BY l.created_at DESC, l.rowid DESC LIMIT 50 OFFSET ?`).bind(...a, (p.page - 1) * 50).all()).results;
  return c.json({ items: rows });
});
