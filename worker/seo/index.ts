import { Hono } from 'hono';
import type { HonoEnv } from '../types';
import { buildSitemap, resolvePage, robotsTxt, type SeoPage } from './render';
import { esc, jsonLd } from './util';

export const seo = new Hono<HonoEnv>();

seo.get('/sitemap.xml', async (c) => c.body(await buildSitemap(c.env), 200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }));
seo.get('/robots.txt', (c) => c.text(robotsTxt(c.env.SITE_URL), 200, { 'Cache-Control': 'public, max-age=3600' }));

const MINIMAL = '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title></title></head><body><div id="root"></div></body></html>';
const CSS = '<style>#ssr{max-width:56rem;margin:0 auto;padding:2rem 1rem;font:16px/1.6 system-ui,sans-serif;color:#0f172a}[data-mode=dark] #ssr{color:#e2e8f0}#ssr h1{font-size:1.75rem;line-height:1.2;margin:.5rem 0 1rem}#ssr h2{font-size:1.25rem;margin:1.5rem 0 .5rem}#ssr a{color:#087bff}#ssr .bc{display:flex;flex-wrap:wrap;gap:.5rem;list-style:none;padding:0;font-size:.85rem}#ssr .bc li+li:before{content:"/";margin-right:.5rem}#ssr .plist{padding-left:1.1rem}</style>';

export function renderHtml(template: string, p: SeoPage, site: string, brand: string): string {
  const head = [
    `<title>${esc(p.title)}</title>`, `<meta name="description" content="${esc(p.description)}" />`, `<meta name="robots" content="${esc(p.robots)}" />`, `<link rel="canonical" href="${esc(p.canonical)}" />`,
    `<meta property="og:type" content="${p.ogType === 'product' ? 'website' : p.ogType}" />`, `<meta property="og:site_name" content="${esc(brand)}" />`, `<meta property="og:locale" content="en_PK" />`,
    `<meta property="og:title" content="${esc(p.title)}" />`, `<meta property="og:description" content="${esc(p.description)}" />`, `<meta property="og:url" content="${esc(p.canonical)}" />`, `<meta property="og:image" content="${esc(p.image)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`, `<meta name="twitter:title" content="${esc(p.title)}" />`, `<meta name="twitter:description" content="${esc(p.description)}" />`, `<meta name="twitter:image" content="${esc(p.image)}" />`,
    ...p.ld.map((o) => `<script type="application/ld+json">${jsonLd(o)}</script>`), p.body ? CSS : '',
  ].join('\n  ');
  let html = template
    .replace(/<title>[\s\S]*?<\/title>\s*/i, '').replace(/<meta\s+name="description"[^>]*>\s*/i, '').replace(/<link\s+rel="canonical"[^>]*>\s*/i, '')
    .replace(/<meta\s+property="og:[^>]*>\s*/gi, '').replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/gi, '');
  html = html.replace('</head>', `  ${head}\n</head>`);
  if (p.body) html = html.replace(/<div id="root">\s*<\/div>/, `<div id="root"><div id="ssr">${p.body}</div></div>`);
  return html;
}

let cached: { html: string; at: number } | null = null;
/** Test helper: forget the cached HTML shell. */
export const resetTemplateCache = () => { cached = null; };
async function template(c: any): Promise<string> {
  if (cached && Date.now() - cached.at < 60_000) return cached.html;
  if (!c.env.ASSETS) return MINIMAL;
  try {
    const r = await c.env.ASSETS.fetch(new Request(new URL('/', c.req.url).toString(), { headers: { accept: 'text/html' } }));
    const html = await r.text();
    if (r.ok && html.includes('<div id="root">')) { cached = { html, at: Date.now() }; return html; }
  } catch { /* fall through */ }
  return MINIMAL;
}

/** Every HTML page request: real status codes, per-page head, crawler-readable body. Files and API calls never get here. */
export async function pageHandler(c: any) {
  const url = new URL(c.req.url); const site: string = c.env.SITE_URL.replace(/\/$/, '');
  const host = new URL(site).hostname;
  if (url.hostname === `www.${host}`) return c.redirect(site + url.pathname + url.search, 301);
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) return c.redirect(url.pathname.replace(/\/+$/, '') + url.search, 301);
  // Google Search Console verification file (served as a static asset, with or without .html)
  if (/^\/google[a-z0-9]+(\.html)?$/i.test(url.pathname)) return c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.text('Not found', 404);
  if (/\.[a-z0-9]{2,5}$/i.test(url.pathname) || url.pathname.startsWith('/assets/') || url.pathname.startsWith('/files/')) return c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.text('Not found', 404);
  let page: SeoPage;
  try { page = await resolvePage(c.env, url.pathname, url.searchParams); } catch (e) { console.error('seo render failed', e); return c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.text('Error', 500); }
  if (page.redirect) return c.redirect(page.redirect, 301);
  const html = renderHtml(await template(c), page, site, page.brand);
  const h: Record<string, string> = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': page.cache ? 'public, max-age=0, must-revalidate' : 'no-store' };
  if (page.robots.startsWith('noindex')) h['X-Robots-Tag'] = page.robots;
  return c.body(c.req.method === 'HEAD' ? null : html, page.status as any, h);
}
