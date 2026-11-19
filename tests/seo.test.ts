import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../worker/index';
import { Client, makeEnv, newStaff } from './helpers/app';
import { POSTS } from '../src/content/blog';
import { readFileSync } from 'node:fs';
import { resetTemplateCache } from '../worker/seo';

const TEMPLATE = '<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>old</title><meta name="description" content="old" /><link rel="canonical" href="https://old/" /><meta property="og:title" content="old" /><script type="application/ld+json">{"old":1}</script></head><body><div id="root"></div><script type="module" src="/assets/x.js"></script></body></html>';
async function setup() {
  const env = makeEnv({ SITE_URL: 'https://bmart.store', ASSETS: { fetch: async () => new Response(TEMPLATE, { headers: { 'content-type': 'text/html' } }) } });
  const app = createApp(); const admin = await newStaff(app, env, ['root']);
  const c = await admin.post('/api/admin/products', { name: 'Real Tool', shortDescription: 'A real tool for testing.', description: 'Longer original description of the tool.', categoryId: 'cat_ai-tools', status: 'active', deliveryType: 'manual', plans: [{ name: 'Monthly', price: 150000 }, { name: 'Yearly', price: 1200000 }] });
  assert.equal(c.status, 201);
  const slug = (await env.DB.prepare('SELECT slug FROM products WHERE id=?').bind(c.json.id).first()).slug as string; assert.match(slug, /^real-tool/);
  return { env, app, admin, slug, get: (p: string, init?: RequestInit) => app.fetch(new Request('https://bmart.store' + p, init), env) };
}
const ld = (html: string) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const meta = (html: string, name: string) => new RegExp(`<meta (?:name|property)="${name}" content="([^"]*)"`).exec(html)?.[1];
const canonical = (html: string) => /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1];

test('homepage: own title/description, canonical, OG/Twitter, valid Organization + WebSite JSON-LD, crawlable H1 and links', async () => {
  const { get } = await setup(); const r = await get('/'); const h = await r.text();
  assert.equal(r.status, 200); assert.match(h, /<title>B-MART|<title>NOORIX/); assert.ok(!h.includes('>old<') && !h.includes('"old"'), 'template metadata is replaced, not duplicated');
  assert.equal(canonical(h), 'https://bmart.store/'); assert.equal(meta(h, 'robots'), 'index,follow');
  assert.ok(meta(h, 'description')!.length > 50 && meta(h, 'description')!.length <= 165); assert.ok(meta(h, 'og:title') && meta(h, 'twitter:card') === 'summary_large_image' && meta(h, 'og:image')!.startsWith('https://bmart.store/'));
  const types = ld(h).map((x) => x['@type']); assert.ok(types.includes('Organization') && types.includes('WebSite'));
  assert.equal((h.match(/<h1>/g) ?? []).length, 1); assert.match(h, /href="\/category\/ai-tools"/); assert.match(h, /href="\/products\/real-tool/);
});

test('product page: unique head, Product + Offer JSON-LD from real plan data, breadcrumbs, no invented reviews/ratings', async () => {
  const { get, slug } = await setup(); const r = await get('/products/' + slug); const h = await r.text();
  assert.equal(r.status, 200); assert.equal(canonical(h), `https://bmart.store/products/${slug}`); assert.equal(meta(h, 'robots'), 'index,follow');
  assert.match(h, /<title>Real Tool Price in Pakistan/); assert.match(meta(h, 'description')!, /From PKR 1,500/);
  const p = ld(h).find((x) => x['@type'] === 'Product'); assert.ok(p); assert.equal(p.name, 'Real Tool');
  assert.equal(p.offers['@type'], 'AggregateOffer'); assert.equal(p.offers.lowPrice, '1500.00'); assert.equal(p.offers.highPrice, '12000.00'); assert.equal(p.offers.priceCurrency, 'PKR'); assert.equal(p.offers.offerCount, 2); assert.equal(p.offers.availability, 'https://schema.org/InStock');
  const bc = ld(h).find((x) => x['@type'] === 'BreadcrumbList'); assert.deepEqual(bc.itemListElement.map((i: any) => i.item), ['https://bmart.store/', 'https://bmart.store/products', 'https://bmart.store/category/ai-tools', `https://bmart.store/products/${slug}`]);
  assert.ok(!/aggregateRating|"review"|ratingValue|reviewCount/i.test(h), 'no fabricated rating or review data');
  assert.match(h, /<h1>Real Tool<\/h1>/); assert.match(h, /Monthly[^<]*PKR 1,500/);
});

test('demo/seeded products are noindex and carry no Product schema; unknown products and pages are real 404s', async () => {
  const { get } = await setup(); const d = await (await get('/products/netflix')).text();
  assert.equal(meta(d, 'robots'), 'noindex,follow'); assert.ok(!ld(d).some((x) => x['@type'] === 'Product'));
  for (const p of ['/products/does-not-exist', '/category/nope', '/blog/nope', '/page/nope', '/totally/unknown']) { const r = await get(p); assert.equal(r.status, 404, p); assert.match(await r.text(), /noindex,nofollow/); }
});

test('private pages are noindex (meta + X-Robots-Tag) and never server-rendered with data', async () => {
  const { get } = await setup();
  for (const p of ['/login', '/register', '/cart', '/dashboard', '/dashboard/wallet', '/admin', '/admin/orders', '/forgot-password', '/reset-password', '/verify-email', '/track-order']) {
    const r = await get(p); const h = await r.text(); assert.equal(r.status, 200, p); assert.equal(meta(h, 'robots'), 'noindex,nofollow', p); assert.match(r.headers.get('x-robots-tag') ?? '', /noindex/, p); assert.equal(r.headers.get('cache-control'), 'no-store');
  }
});

test('duplicate-content handling: category query redirects, filters noindex, trailing slash and www redirect to the preferred domain', async () => {
  const { get } = await setup();
  const r1 = await get('/products?category=ai-tools', { redirect: 'manual' }); assert.equal(r1.status, 301); assert.equal(r1.headers.get('location'), 'https://bmart.store/category/ai-tools');
  const f = await (await get('/products?sort=price_asc&page=2')).text(); assert.equal(canonical(f), 'https://bmart.store/products'); assert.equal(meta(f, 'robots'), 'noindex,follow');
  const s = await (await get('/products?q=netflix')).text(); assert.equal(meta(s, 'robots'), 'noindex,follow');
  const r2 = await get('/products/', { redirect: 'manual' }); assert.equal(r2.status, 301); assert.equal(r2.headers.get('location'), '/products');
  const www = await createApp().fetch(new Request('https://www.bmart.store/products/abc?x=1'), makeEnv({ SITE_URL: 'https://bmart.store' })); assert.equal(www.status, 301); assert.equal(www.headers.get('location'), 'https://bmart.store/products/abc?x=1');
  const cat = await (await get('/category/ai-tools')).text(); assert.equal(canonical(cat), 'https://bmart.store/category/ai-tools'); assert.match(cat, /<h1>AI Tools/); assert.match(cat, /Before you buy/);
});

test('sitemap.xml: only canonical, public, indexable, live URLs; robots.txt blocks private areas and points to the sitemap', async () => {
  const { get, admin } = await setup();
  const hidden = await admin.post('/api/admin/products', { name: 'Hidden Draft', categoryId: 'cat_ai-tools', status: 'draft', deliveryType: 'manual', plans: [{ name: 'M', price: 5000 }] }); assert.equal(hidden.status, 201);
  const sm = await (await get('/sitemap.xml')).text(); const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.includes('https://bmart.store/') && locs.some((u) => u.startsWith('https://bmart.store/products/real-tool')) && locs.includes('https://bmart.store/category/ai-tools') && locs.includes('https://bmart.store/blog'));
  for (const u of locs) { assert.ok(u.startsWith('https://bmart.store/'), u); assert.ok(!/[?#]/.test(u), 'no query URLs: ' + u); assert.ok(!/\/(admin|dashboard|cart|login|register|track-order)/.test(u), u); }
  assert.ok(!locs.some((u) => /netflix|hidden-draft/.test(u)), 'demo and draft products excluded');
  for (const p of POSTS) assert.ok(locs.includes(`https://bmart.store/blog/${p.slug}`));
  assert.equal(new Set(locs).size, locs.length, 'no duplicate URLs');
  for (const u of locs) { const path = u.replace('https://bmart.store', ''); const r = await get(path); assert.equal(r.status, 200, 'sitemap URL must return 200: ' + path); assert.match(await r.text(), /content="index,follow"/, path); }
  const rb = await (await get('/robots.txt')).text(); assert.match(rb, /Disallow: \/admin/); assert.match(rb, /Disallow: \/dashboard/); assert.match(rb, /Disallow: \/api\//); assert.match(rb, /Sitemap: https:\/\/bmart\.store\/sitemap\.xml/); assert.ok(!/^Disallow: \/$/m.test(rb));
});

test('Search Console verification file path is passed through to static assets, not treated as an app route', async () => {
  const env = makeEnv({ SITE_URL: 'https://bmart.store', ASSETS: { fetch: async (r: Request) => new Response('google-site-verification: x', { status: /google/.test(r.url) ? 200 : 404 }) } });
  for (const p of ['/google69b7376fbb088ee3.html', '/google69b7376fbb088ee3']) { const r = await createApp().fetch(new Request('https://bmart.store' + p), env); assert.equal(r.status, 200, p); assert.match(await r.text(), /google-site-verification/); }
});

test('blog: list + articles with BlogPosting schema, breadcrumbs and canonical', async () => {
  const { get } = await setup(); const list = await (await get('/blog')).text(); assert.equal(canonical(list), 'https://bmart.store/blog'); for (const p of POSTS) assert.match(list, new RegExp(`/blog/${p.slug}`));
  const h = await (await get(`/blog/${POSTS[0].slug}`)).text(); const a = ld(h).find((x) => x['@type'] === 'BlogPosting'); assert.equal(a.headline, POSTS[0].title); assert.equal(a.datePublished, POSTS[0].published); assert.equal(meta(h, 'og:type'), 'article'); assert.match(h, /<h1>How Digital Subscriptions Work/);
});

test('user-controlled text cannot break out of HTML or JSON-LD', async () => {
  const { get, admin } = await setup();
  const r = await admin.post('/api/admin/products', { name: 'Evil </script><img src=x onerror=alert(1)>', shortDescription: '"><script>alert(2)</script>', categoryId: 'cat_ai-tools', status: 'active', deliveryType: 'manual', plans: [{ name: 'M', price: 5000 }] });
  assert.equal(r.status, 201); const slug = (await admin.get('/api/admin/products')).json; void slug;
  const sm = await (await get('/sitemap.xml')).text(); const loc = [...sm.matchAll(/products\/(evil[^<]*)</g)][0]?.[1]; assert.ok(loc);
  const h = await (await get('/products/' + loc)).text();
  assert.ok(!h.includes('<img src=x') && !h.includes('<script>alert'), 'raw markup never appears'); assert.equal((h.match(/<\/script>/g) ?? []).length, (h.match(/<script/g) ?? []).length, 'script tags stay balanced'); ld(h);
});

test('Google Tag Manager: exactly one head script and one noscript iframe (right after <body>) on public, private and 404 pages', async () => {
  const real = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const env = makeEnv({ SITE_URL: 'https://bmart.store', ASSETS: { fetch: async () => new Response(real, { headers: { 'content-type': 'text/html' } }) } });
  const app = createApp(); resetTemplateCache();
  for (const p of ['/', '/products', '/category/ai-tools', '/blog', '/login', '/dashboard', '/nope']) {
    const h = await (await app.fetch(new Request('https://bmart.store' + p), env)).text();
    assert.equal((h.match(/googletagmanager\.com\/gtm\.js\?id=/g) ?? []).length, 1, 'one GTM script on ' + p);
    assert.equal((h.match(/googletagmanager\.com\/ns\.html\?id=GTM-TVLLGQ36/g) ?? []).length, 1, 'one noscript iframe on ' + p);
    assert.match(h, /'dataLayer','GTM-TVLLGQ36'/); assert.ok(h.indexOf('gtm.js') < h.indexOf('<title>'), 'GTM is high in <head>');
    assert.match(h, /<body>\s*<!-- Google Tag Manager \(noscript\) -->\s*<noscript><iframe src="https:\/\/www\.googletagmanager\.com\/ns\.html\?id=GTM-TVLLGQ36"/);
  }
});
