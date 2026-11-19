import type { Env } from '../types';
import { CARD_SQL, WHERE_LIVE, card } from '../routes/public';
import { getSettings } from '../lib/notify';
import { POSTS, getPost, type Block } from '../../src/content/blog';
import { CATEGORY_COPY, GENERIC_CATEGORY_INTRO } from '../../src/content/categories';
import { clip, esc, jsonLd, money, pkr } from './util';

/** One fully described page: everything the head and the crawler-readable body need. */
export interface SeoPage {
  status: number; brand: string; title: string; description: string; canonical: string; robots: string;
  ogType: 'website' | 'article' | 'product'; image: string; ld: unknown[]; body: string; redirect?: string; cache: boolean;
}

const PRIVATE = /^\/(admin|dashboard|cart|login|register|forgot-password|reset-password|verify-email|track-order)(\/|$)/;
const POLICY_TITLES: Record<string, string> = { terms: 'Terms & Conditions', privacy: 'Privacy Policy', refund: 'Refund Policy', return: 'Return Policy', delivery: 'Digital Delivery Policy', about: 'About' };

const crumbs = (site: string, items: [string, string][]) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: site + path })) });
const crumbHtml = (items: [string, string][]) => `<nav aria-label="Breadcrumb"><ol class="bc">${items.map(([n, p], i) => `<li>${i < items.length - 1 ? `<a href="${esc(p)}">${esc(n)}</a>` : esc(n)}</li>`).join('')}</ol></nav>`;
const blocks = (b: Block[]) => b.map((x) => ('h2' in x ? `<h2>${esc(x.h2)}</h2>` : 'p' in x ? `<p>${esc(x.p)}</p>` : 'ul' in x ? `<ul>${x.ul.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : `<ol>${x.ol.map((i) => `<li>${esc(i)}</li>`).join('')}</ol>`)).join('');
const productList = (items: any[]) => `<ul class="plist">${items.map((p) => `<li><a href="/products/${esc(p.slug)}">${esc(p.name)}</a> — ${esc(p.shortDescription)}${p.fromPrice ? ` <span>From ${esc(pkr(p.fromPrice))}</span>` : ''}</li>`).join('')}</ul>`;
const absImg = (site: string, url: string | null) => (url ? (url.startsWith('http') ? url : site + url) : `${site}/og-image.png`);

export async function resolvePage(env: Env, rawPath: string, query: URLSearchParams): Promise<SeoPage> {
  const site = env.SITE_URL.replace(/\/$/, '');
  const s = await getSettings(env);
  const brand = s.brand_name?.trim() || env.SITE_NAME || 'B-MART';
  const parent = s.brand_parent?.trim() || 'Noorix Digital Lab';
  const tagline = s.brand_tagline?.trim() || 'Your Digital Shopping Destination';
  const path = rawPath;
  const base = { status: 200, brand, robots: 'index,follow', ogType: 'website' as const, image: `${site}/og-image.png`, ld: [] as unknown[], body: '', cache: true };
  const org = {
    '@context': 'https://schema.org', '@type': 'Organization', '@id': `${site}/#organization`, name: brand, url: site, logo: `${site}/logo.png`, slogan: tagline,
    parentOrganization: { '@type': 'Organization', name: parent },
    ...(s.support_email?.trim() ? { email: s.support_email.trim() } : {}),
    contactPoint: [{ '@type': 'ContactPoint', contactType: 'customer support', ...(s.whatsapp ? { telephone: `+${s.whatsapp.replace(/\D/g, '')}` } : {}), areaServed: 'PK', availableLanguage: ['en', 'ur'] }],
    ...(() => { const same = ['social_facebook', 'social_instagram', 'social_tiktok', 'social_youtube', 'social_x'].map((k) => s[k]).filter((u) => /^https?:\/\//.test(u || '')); return same.length ? { sameAs: same } : {}; })(),
  };
  const website = { '@context': 'https://schema.org', '@type': 'WebSite', '@id': `${site}/#website`, url: site, name: brand, inLanguage: 'en', publisher: { '@id': `${site}/#organization` } };
  const faqs = async () => (await env.DB.prepare('SELECT question,answer FROM faqs WHERE active=1 ORDER BY sort_order').all<any>()).results;
  const faqLd = (f: any[]) => ({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: f.map((x) => ({ '@type': 'Question', name: x.question, acceptedAnswer: { '@type': 'Answer', text: x.answer } })) });
  const faqHtml = (f: any[]) => (f.length ? `<h2>Frequently asked questions</h2>${f.map((x) => `<h3>${esc(x.question)}</h3><p>${esc(x.answer)}</p>`).join('')}` : '');
  const cats = async () => (await env.DB.prepare(`SELECT c.slug,c.name,c.description FROM product_categories c WHERE c.active=1 AND EXISTS (SELECT 1 FROM products p WHERE p.category_id=c.id AND p.status='active' AND EXISTS (SELECT 1 FROM product_plans pl WHERE pl.product_id=p.id AND pl.status='active')) ORDER BY c.sort_order`).all<any>()).results;

  // ── private / utility pages: never indexed, no database work
  if (PRIVATE.test(path)) {
    const label = path.startsWith('/admin') ? 'Admin' : path.startsWith('/dashboard') ? 'My account' : path.startsWith('/cart') ? 'Cart' : path.startsWith('/track-order') ? 'Track your order' : 'Account';
    return { ...base, title: `${label} — ${brand}`, description: `${label} on ${brand}.`, canonical: `${site}${path}`, robots: 'noindex,nofollow', body: '', cache: false };
  }

  if (path === '/') {
    const [c, f, feat] = await Promise.all([cats(), faqs(), env.DB.prepare(`${CARD_SQL} WHERE ${WHERE_LIVE} AND p.is_demo=0 ORDER BY p.is_featured DESC, p.is_trending DESC, p.sales_count DESC, p.created_at DESC LIMIT 12`).all()]);
    const items = feat.results.map(card);
    return { ...base, canonical: `${site}/`, title: `${brand} — Buy Digital Subscriptions Online in Pakistan`,
      description: clip(`Buy streaming, AI tools, software and digital subscriptions in Pakistan. Pay in PKR by Easypaisa, JazzCash or bank transfer. Powered by ${parent}.`, 158),
      ld: [org, website, ...(f.length ? [faqLd(f)] : [])],
      body: `<h1>${esc(brand)} — ${esc(tagline)}</h1><p>${esc(brand)} is an online store for digital subscriptions and services in Pakistan. Browse streaming, AI tools, software and other digital products, compare the plans, see the price in PKR and order from your wallet balance. Powered by ${esc(parent)}.</p>
        <h2>Categories</h2><ul>${c.map((x: any) => `<li><a href="/category/${esc(x.slug)}">${esc(x.name)}</a></li>`).join('')}</ul>
        <h2>Featured products</h2>${productList(items)}<p><a href="/products">View all products</a></p>${faqHtml(f)}` };
  }

  if (path === '/products') {
    const keys = [...query.keys()];
    const onlyCat = keys.length === 1 && keys[0] === 'category' && query.get('category');
    if (onlyCat) {
      const ok = await env.DB.prepare('SELECT slug FROM product_categories WHERE slug=? AND active=1').bind(onlyCat).first();
      if (ok) return { ...base, redirect: `${site}/category/${encodeURIComponent(onlyCat)}`, title: '', description: '', canonical: '', robots: '' };
    }
    const filtered = keys.length > 0;
    const rows = await env.DB.prepare(`${CARD_SQL} WHERE ${WHERE_LIVE} ORDER BY p.sales_count DESC, p.created_at DESC LIMIT 48`).all();
    return { ...base, canonical: `${site}/products`, robots: filtered ? 'noindex,follow' : 'index,follow', title: `All Digital Products & Subscriptions — ${brand}`,
      description: `Browse every digital product on ${brand}: streaming, AI tools, software and more. Compare plans and prices in PKR.`,
      ld: [crumbs(site, [['Home', '/'], ['All Products', '/products']])],
      body: `${crumbHtml([['Home', '/'], ['All Products', '/products']])}<h1>All Products</h1>${productList(rows.results.map(card))}` };
  }

  let m: RegExpMatchArray | null;
  if ((m = path.match(/^\/category\/([^/]+)$/))) {
    const slug = decodeURIComponent(m[1]);
    const cat = await env.DB.prepare('SELECT slug,name,description FROM product_categories WHERE slug=? AND active=1').bind(slug).first<any>();
    if (!cat) return notFound(site, brand, path);
    const rows = await env.DB.prepare(`${CARD_SQL} WHERE ${WHERE_LIVE} AND c.slug=? ORDER BY p.sales_count DESC, p.created_at DESC LIMIT 48`).bind(slug).all();
    const items = rows.results.map(card); const copy = CATEGORY_COPY[slug];
    const intro = cat.description?.trim() || copy?.intro || GENERIC_CATEGORY_INTRO(cat.name);
    const trail: [string, string][] = [['Home', '/'], ['All Products', '/products'], [cat.name, `/category/${slug}`]];
    return { ...base, canonical: `${site}/category/${slug}`, robots: items.length ? ([...query.keys()].length ? 'noindex,follow' : 'index,follow') : 'noindex,follow', title: `${cat.name} in Pakistan — Buy Online | ${brand}`,
      description: clip(`${intro} Prices in PKR on ${brand}.`, 158), ld: [crumbs(site, trail)],
      body: `${crumbHtml(trail)}<h1>${esc(cat.name)}</h1><p>${esc(intro)}</p>${copy ? `<h2>Before you buy</h2><ul>${copy.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}<h2>${esc(cat.name)} products</h2>${productList(items)}` };
  }

  if ((m = path.match(/^\/products\/([^/]+)$/))) {
    const slug = decodeURIComponent(m[1]);
    const p = await env.DB.prepare(`${CARD_SQL} WHERE ${WHERE_LIVE} AND p.slug=?`).bind(slug).first<any>();
    if (!p) return notFound(site, brand, path);
    const [full, plans, related] = await Promise.all([
      env.DB.prepare('SELECT description,features,terms,refund_eligible,refund_policy,seo_title,seo_description,updated_at FROM products WHERE id=?').bind(p.id).first<any>(),
      env.DB.prepare(`SELECT pl.name,pl.duration_label,pl.price,pl.compare_price,CASE WHEN ?='automatic' THEN (SELECT COUNT(*) FROM product_inventory i WHERE i.plan_id=pl.id AND i.status='available') ELSE pl.stock_limit END stock FROM product_plans pl WHERE pl.product_id=? AND pl.status='active' ORDER BY pl.sort_order, pl.price`).bind(p.delivery_type, p.id).all<any>(),
      env.DB.prepare(`${CARD_SQL} WHERE ${WHERE_LIVE} AND c.slug=? AND p.id<>? ORDER BY p.sales_count DESC LIMIT 4`).bind(p.category_slug, p.id).all(),
    ]);
    const features: string[] = JSON.parse(full.features || '[]'); const pl = plans.results.map((x: any) => ({ ...x, inStock: x.stock == null || x.stock > 0 }));
    const lo = Math.min(...pl.map((x: any) => x.price)), hi = Math.max(...pl.map((x: any) => x.price));
    const delivery = p.delivery_type === 'automatic' ? 'Delivered instantly after payment.' : p.delivery_type === 'api' ? 'Delivered automatically through our provider.' : 'Delivered by our team after the order is checked.';
    const desc = (full.description || p.short_description || '').trim();
    const trail: [string, string][] = [['Home', '/'], ['All Products', '/products'], [p.category_name, `/category/${p.category_slug}`], [p.name, `/products/${p.slug}`]];
    const image = absImg(site, p.image_key ? `/files/${p.image_key}` : null);
    const offer = (x: any) => ({ '@type': 'Offer', url: `${site}/products/${p.slug}`, priceCurrency: 'PKR', price: money(x.price), availability: x.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', seller: { '@id': `${site}/#organization` } });
    const product: any = { '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: clip(desc || p.name, 500), url: `${site}/products/${p.slug}`, image: [image], category: p.category_name,
      offers: pl.length === 1 ? offer(pl[0]) : { '@type': 'AggregateOffer', priceCurrency: 'PKR', lowPrice: money(lo), highPrice: money(hi), offerCount: pl.length, availability: pl.some((x: any) => x.inStock) ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', url: `${site}/products/${p.slug}`, offers: pl.map(offer) } };
    return { ...base, ogType: 'product', image, canonical: `${site}/products/${p.slug}`, robots: p.is_demo ? 'noindex,follow' : 'index,follow',
      title: clip(full.seo_title?.trim() || `${p.name} Price in Pakistan — Buy Online | ${brand}`, 70),
      description: clip(full.seo_description?.trim() || `${p.short_description || p.name} From ${pkr(lo)}. ${delivery}`, 158),
      ld: [crumbs(site, trail), ...(p.is_demo ? [] : [product])],
      body: `${crumbHtml(trail)}<h1>${esc(p.name)}</h1><p>${esc(p.short_description)}</p>${desc && desc !== p.short_description ? `<h2>About ${esc(p.name)}</h2><p>${esc(desc)}</p>` : ''}
        ${features.length ? `<h2>Features</h2><ul>${features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
        <h2>Plans and prices</h2><ul>${pl.map((x: any) => `<li>${esc(x.name)}${x.duration_label ? ` (${esc(x.duration_label)})` : ''} — ${esc(pkr(x.price))} — ${x.inStock ? 'In stock' : 'Out of stock'}</li>`).join('')}</ul>
        <h2>Delivery</h2><p>${esc(delivery)}</p>${full.terms ? `<h2>Terms</h2><p>${esc(clip(full.terms, 1500))}</p>` : ''}
        ${related.results.length ? `<h2>Related products</h2>${productList(related.results.map(card))}` : ''}` };
  }

  if (path === '/blog') {
    return { ...base, canonical: `${site}/blog`, title: `Blog — Guides to Digital Subscriptions | ${brand}`, description: `Practical guides on digital subscriptions, safe online buying and using your ${brand} wallet.`,
      ld: [crumbs(site, [['Home', '/'], ['Blog', '/blog']])],
      body: `${crumbHtml([['Home', '/'], ['Blog', '/blog']])}<h1>${esc(brand)} Blog</h1><ul>${POSTS.map((x) => `<li><a href="/blog/${x.slug}">${esc(x.title)}</a> — ${esc(x.description)}</li>`).join('')}</ul>` };
  }
  if ((m = path.match(/^\/blog\/([^/]+)$/))) {
    const post = getPost(decodeURIComponent(m[1]));
    if (!post) return notFound(site, brand, path);
    const trail: [string, string][] = [['Home', '/'], ['Blog', '/blog'], [post.title, `/blog/${post.slug}`]];
    return { ...base, ogType: 'article', canonical: `${site}/blog/${post.slug}`, title: clip(`${post.title} | ${brand}`, 70), description: post.description,
      ld: [crumbs(site, trail), { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, description: post.description, datePublished: post.published, dateModified: post.updated, inLanguage: 'en', image: `${site}/og-image.png`, mainEntityOfPage: `${site}/blog/${post.slug}`, author: { '@id': `${site}/#organization` }, publisher: { '@id': `${site}/#organization` } }],
      body: `${crumbHtml(trail)}<article><h1>${esc(post.title)}</h1><p><em>Updated ${esc(post.updated)} · ${post.minutes} min read</em></p>${blocks(post.body)}</article>` };
  }

  if (path === '/support') {
    const f = await faqs();
    return { ...base, canonical: `${site}/support`, title: `Support & FAQ — ${brand}`, description: `Get help with orders, wallet payments and delivery on ${brand}. Contact us on WhatsApp or by support ticket, and read the answers to common questions.`,
      ld: [crumbs(site, [['Home', '/'], ['Support', '/support']]), ...(f.length ? [faqLd(f)] : [])], body: `${crumbHtml([['Home', '/'], ['Support', '/support']])}<h1>Support</h1><p>We reply by support ticket and on WhatsApp.</p>${faqHtml(f)}` };
  }

  if ((m = path.match(/^\/page\/([^/]+)$/))) {
    const slug = decodeURIComponent(m[1]);
    const row = await env.DB.prepare('SELECT slug,title,body,updated_at FROM cms_pages WHERE slug=? AND published=1').bind(slug).first<any>();
    if (!row && !POLICY_TITLES[slug]) return notFound(site, brand, path);
    const title = row?.title || POLICY_TITLES[slug];
    return { ...base, canonical: `${site}/page/${slug}`, title: `${title} — ${brand}`, description: clip(row?.body ? row.body.replace(/^DRAFT[^\n]*\n*/i, '') : `${title} of ${brand}.`, 158),
      ld: [crumbs(site, [['Home', '/'], [title, `/page/${slug}`]])], body: `<h1>${esc(title)}</h1>${row?.body ? row.body.split(/\n{2,}/).map((x: string) => `<p>${esc(x)}</p>`).join('') : ''}` };
  }

  return notFound(site, brand, path);
}

function notFound(site: string, brand: string, path: string): SeoPage {
  return { status: 404, brand, title: `Page not found — ${brand}`, description: 'That page does not exist.', canonical: `${site}${path}`, robots: 'noindex,nofollow', ogType: 'website', image: `${site}/og-image.png`, ld: [], cache: false,
    body: '<h1>404 — Page not found</h1><p>That page does not exist. <a href="/">Go to the homepage</a>.</p>' };
}

export async function buildSitemap(env: Env): Promise<string> {
  const site = env.SITE_URL.replace(/\/$/, '');
  const [prods, cats, pages] = await Promise.all([
    env.DB.prepare(`SELECT p.slug,p.updated_at FROM products p JOIN product_categories c ON c.id=p.category_id WHERE ${WHERE_LIVE} AND p.is_demo=0 ORDER BY p.slug`).all<any>(),
    env.DB.prepare(`SELECT c.slug FROM product_categories c WHERE c.active=1 AND EXISTS (SELECT 1 FROM products p WHERE p.category_id=c.id AND p.status='active' AND EXISTS (SELECT 1 FROM product_plans pl WHERE pl.product_id=p.id AND pl.status='active')) ORDER BY c.sort_order`).all<any>(),
    env.DB.prepare("SELECT slug,updated_at FROM cms_pages WHERE published=1 ORDER BY slug").all<any>(),
  ]);
  const u = (p: string, lm?: string | null) => `<url><loc>${esc(site + p)}</loc>${lm ? `<lastmod>${lm.slice(0, 10)}</lastmod>` : ''}</url>`;
  const cms = new Set(pages.results.map((x) => x.slug));
  const policy = Object.keys(POLICY_TITLES).filter((k) => k !== 'about' && !cms.has(k));
  const urls = [u('/'), u('/products'), ...cats.results.map((x) => u(`/category/${x.slug}`)), ...prods.results.map((x) => u(`/products/${x.slug}`, x.updated_at)),
    u('/blog'), ...POSTS.map((x) => u(`/blog/${x.slug}`, x.updated)), u('/support'), ...pages.results.map((x) => u(`/page/${x.slug}`, x.updated_at)), ...policy.map((k) => u(`/page/${k}`))];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export const robotsTxt = (site: string) => `User-agent: *
Allow: /
Disallow: /admin
Disallow: /dashboard
Disallow: /api/
Disallow: /cart
Disallow: /login
Disallow: /register
Disallow: /forgot-password
Disallow: /reset-password
Disallow: /verify-email
Disallow: /track-order
Disallow: /*?q=

Sitemap: ${site.replace(/\/$/, '')}/sitemap.xml
`;
