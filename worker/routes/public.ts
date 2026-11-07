import { Hono } from 'hono';
import { z } from 'zod';
import type { HonoEnv } from '../types';
import { body, notFound, parse } from '../lib/http';
import { getSettings } from '../lib/notify';
import { rateLimit } from '../lib/ratelimit';
import { quote } from '../services/checkout';
import { requireAuth } from '../lib/auth';

export const pub = new Hono<HonoEnv>();

const IN_STOCK = `EXISTS (SELECT 1 FROM product_plans pl WHERE pl.product_id=p.id AND pl.status='active' AND (
  (p.delivery_type='automatic' AND EXISTS (SELECT 1 FROM product_inventory i WHERE i.plan_id=pl.id AND i.status='available'))
  OR (p.delivery_type<>'automatic' AND (pl.stock_limit IS NULL OR pl.stock_limit>0))))`;
const CARD_SQL = `SELECT p.id, p.slug, p.name, p.short_description, p.brand_color, p.image_key, p.delivery_type, p.is_featured, p.is_trending, p.is_deal, p.is_demo, p.sales_count,
  c.name category_name, c.slug category_slug,
  (SELECT MIN(price) FROM product_plans pl WHERE pl.product_id=p.id AND pl.status='active') from_price,
  (SELECT compare_price FROM product_plans pl WHERE pl.product_id=p.id AND pl.status='active' ORDER BY price LIMIT 1) compare_price,
  ${IN_STOCK} in_stock
  FROM products p JOIN product_categories c ON c.id=p.category_id`;
const WHERE_LIVE = `p.status='active' AND c.active=1 AND EXISTS (SELECT 1 FROM product_plans pl WHERE pl.product_id=p.id AND pl.status='active')`;

const card = (r: any) => ({
  id: r.id, slug: r.slug, name: r.name, shortDescription: r.short_description, brandColor: r.brand_color,
  imageUrl: r.image_key ? `/files/${r.image_key}` : null, deliveryType: r.delivery_type, category: r.category_name, categorySlug: r.category_slug,
  fromPrice: r.from_price, comparePrice: r.compare_price, inStock: !!r.in_stock, featured: !!r.is_featured, trending: !!r.is_trending, deal: !!r.is_deal, demo: !!r.is_demo,
});
const PUBLIC_SETTINGS = ['site_name', 'tagline', 'whatsapp', 'support_email', 'announcement', 'announcement_active', 'hero_title', 'hero_subtitle', 'currency', 'maintenance', 'registration_open', 'min_deposit'];
const pubSettings = (s: Record<string, string>) => Object.fromEntries(PUBLIC_SETTINGS.map((k) => [k, s[k] ?? '']));

pub.get('/settings', async (c) => c.json(pubSettings(await getSettings(c.env))));

pub.get('/home', async (c) => {
  const db = c.env.DB;
  const list = async (flag: string, n: number) => (await db.prepare(`${CARD_SQL} WHERE ${WHERE_LIVE} AND p.${flag}=1 ORDER BY p.sales_count DESC, p.created_at DESC LIMIT ?`).bind(n).all()).results.map(card);
  const [banners, cats, featured, trending, deals, s] = await Promise.all([
    db.prepare('SELECT id,title,subtitle,image_key,cta_label,cta_url FROM homepage_banners WHERE active=1 ORDER BY sort_order').all<any>(),
    db.prepare(`SELECT c.slug,c.name,c.icon,c.description,(SELECT COUNT(*) FROM products p WHERE p.category_id=c.id AND p.status='active') n FROM product_categories c WHERE c.active=1 ORDER BY c.sort_order`).all<any>(),
    list('is_featured', 8), list('is_trending', 8), list('is_deal', 8), getSettings(c.env),
  ]);
  return c.json({ settings: pubSettings(s), banners: banners.results.map((b) => ({ ...b, imageUrl: b.image_key ? `/files/${b.image_key}` : null })), categories: cats.results, featured, trending, deals });
});

pub.get('/categories', async (c) => c.json((await c.env.DB.prepare(`SELECT c.slug,c.name,c.icon,c.description,(SELECT COUNT(*) FROM products p WHERE p.category_id=c.id AND p.status='active') n FROM product_categories c WHERE c.active=1 ORDER BY c.sort_order`).all()).results));

pub.get('/products', async (c) => {
  const q = parse(z.object({
    q: z.string().trim().max(80).optional(), category: z.string().max(60).optional(),
    min: z.coerce.number().int().min(0).optional(), max: z.coerce.number().int().min(0).optional(),
    sort: z.enum(['popular', 'newest', 'price_asc', 'price_desc', 'name']).default('popular'),
    flag: z.enum(['trending', 'deal', 'featured']).optional(),
    page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(48).default(12),
  }), c.req.query());
  const w: string[] = [WHERE_LIVE]; const a: unknown[] = [];
  if (q.q) { w.push('(p.name LIKE ? OR p.short_description LIKE ?)'); const l = `%${q.q.replace(/[%_]/g, '')}%`; a.push(l, l); }
  if (q.category) { w.push('c.slug=?'); a.push(q.category); }
  if (q.flag) w.push(`p.is_${q.flag}=1`);
  if (q.min != null) { w.push('(SELECT MIN(price) FROM product_plans pl WHERE pl.product_id=p.id AND pl.status=\'active\') >= ?'); a.push(q.min * 100); }
  if (q.max != null) { w.push('(SELECT MIN(price) FROM product_plans pl WHERE pl.product_id=p.id AND pl.status=\'active\') <= ?'); a.push(q.max * 100); }
  const order = { popular: 'p.sales_count DESC, p.created_at DESC', newest: 'p.created_at DESC', price_asc: 'from_price ASC', price_desc: 'from_price DESC', name: 'p.name COLLATE NOCASE' }[q.sort];
  const where = w.join(' AND ');
  const total = await c.env.DB.prepare(`SELECT COUNT(*) n FROM products p JOIN product_categories c ON c.id=p.category_id WHERE ${where}`).bind(...a).first<{ n: number }>();
  const rows = await c.env.DB.prepare(`${CARD_SQL} WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...a, q.pageSize, (q.page - 1) * q.pageSize).all();
  return c.json({ items: rows.results.map(card), total: total?.n ?? 0, page: q.page, pageSize: q.pageSize });
});

pub.get('/products/:slug', async (c) => {
  const p = await c.env.DB.prepare(`${CARD_SQL} WHERE ${WHERE_LIVE} AND p.slug=?`).bind(c.req.param('slug')).first<any>();
  if (!p) throw notFound('Product not found');
  const full = await c.env.DB.prepare('SELECT description,features,input_fields,terms,refund_eligible,refund_policy,seo_title,seo_description FROM products WHERE id=?').bind(p.id).first<any>();
  const plans = await c.env.DB.prepare(
    `SELECT pl.id,pl.name,pl.duration_label,pl.price,pl.compare_price,
      CASE WHEN ?='automatic' THEN (SELECT COUNT(*) FROM product_inventory i WHERE i.plan_id=pl.id AND i.status='available') ELSE pl.stock_limit END stock
     FROM product_plans pl WHERE pl.product_id=? AND pl.status='active' ORDER BY pl.sort_order, pl.price`).bind(p.delivery_type, p.id).all<any>();
  const related = await c.env.DB.prepare(`${CARD_SQL} WHERE ${WHERE_LIVE} AND c.slug=? AND p.id<>? ORDER BY p.sales_count DESC LIMIT 4`).bind(p.category_slug, p.id).all();
  return c.json({
    ...card(p), description: full.description, features: JSON.parse(full.features), inputFields: JSON.parse(full.input_fields), terms: full.terms,
    refundEligible: !!full.refund_eligible, refundPolicy: full.refund_policy, seoTitle: full.seo_title, seoDescription: full.seo_description,
    plans: plans.results.map((x) => ({ id: x.id, name: x.name, duration: x.duration_label, price: x.price, comparePrice: x.compare_price, inStock: x.stock == null || x.stock > 0, stock: x.stock })),
    related: related.results.map(card),
  });
});

pub.get('/pages/:slug', async (c) => {
  const p = await c.env.DB.prepare('SELECT slug,title,body,updated_at FROM cms_pages WHERE slug=? AND published=1').bind(c.req.param('slug')).first();
  if (!p) throw notFound('Page not found');
  return c.json(p);
});
pub.get('/faqs', async (c) => c.json((await c.env.DB.prepare('SELECT id,question,answer FROM faqs WHERE active=1 ORDER BY sort_order').all()).results));

/** Public order tracking: needs both order number and the account email. Never returns delivery content. */
pub.post('/track', async (c) => {
  const i = await body(c, z.object({ orderNo: z.string().trim().toUpperCase().min(4).max(20), email: z.string().trim().toLowerCase().email() }));
  await rateLimit(c.env, `track:${c.get('ip')}`, 20, 900);
  const o = await c.env.DB.prepare('SELECT o.id,o.order_no,o.status,o.total,o.created_at FROM orders o JOIN users u ON u.id=o.user_id WHERE o.order_no=? AND u.email=?').bind(i.orderNo, i.email).first<any>();
  if (!o) throw notFound('No order found with those details');
  const events = await c.env.DB.prepare("SELECT kind,message,created_at FROM order_events WHERE order_id=? AND kind<>'refund_requested' ORDER BY created_at").bind(o.id).all();
  const items = await c.env.DB.prepare('SELECT product_name,plan_name,status FROM order_items WHERE order_id=?').bind(o.id).all();
  return c.json({ orderNo: o.order_no, status: o.status, total: o.total, createdAt: o.created_at, items: items.results, events: events.results });
});

pub.post('/quote', requireAuth, async (c) => {
  const i = await body(c, z.object({ items: z.array(z.object({ planId: z.string(), input: z.record(z.string()).optional() })).min(1).max(20), couponCode: z.string().max(40).optional().nullable() }));
  const q = await quote(c.env, c.get('user')!.id, i.items, i.couponCode);
  const bal = await c.env.DB.prepare('SELECT balance FROM wallet_accounts WHERE user_id=?').bind(c.get('user')!.id).first<any>();
  return c.json({ subtotal: q.subtotal, discount: q.discount, total: q.total, balance: bal?.balance ?? 0, coupon: q.coupon?.code ?? null });
});

/** Payment methods customers may use (public details only). */
pub.get('/payment-methods', async (c) =>
  c.json((await c.env.DB.prepare("SELECT code,name,type,account_title,account_number,instructions,min_amount,max_amount FROM payment_methods WHERE enabled=1 ORDER BY sort_order").all<any>()).results
    .map((m) => ({ code: m.code, name: m.name, type: m.type, accountTitle: m.account_title, accountNumber: m.account_number, instructions: m.instructions, minAmount: m.min_amount, maxAmount: m.max_amount }))));

export const seo = new Hono<HonoEnv>();
seo.get('/sitemap.xml', async (c) => {
  const base = c.env.SITE_URL;
  const prods = await c.env.DB.prepare("SELECT slug,updated_at FROM products WHERE status='active'").all<any>();
  const cats = await c.env.DB.prepare('SELECT slug FROM product_categories WHERE active=1').all<any>();
  const pages = await c.env.DB.prepare('SELECT slug FROM cms_pages WHERE published=1').all<any>();
  const u = (p: string, lm?: string) => `<url><loc>${base}${p}</loc>${lm ? `<lastmod>${lm.slice(0, 10)}</lastmod>` : ''}</url>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[u('/'), u('/products'), u('/support'), u('/track-order'),
    ...cats.results.map((x) => u(`/products?category=${x.slug}`)), ...prods.results.map((x) => u(`/products/${x.slug}`, x.updated_at)), ...pages.results.map((x) => u(`/page/${x.slug}`))].join('')}</urlset>`;
  return c.body(xml, 200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
});
seo.get('/robots.txt', (c) => c.text(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /dashboard\nDisallow: /api/\nSitemap: ${c.env.SITE_URL}/sitemap.xml\n`));
