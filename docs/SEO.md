# B-MART SEO — audit, implementation and Search Console guide

Preferred domain: **https://bmart.store** · Sitemap: **https://bmart.store/sitemap.xml** · robots.txt: **https://bmart.store/robots.txt**

## 1. Audit — what was found before the changes
- The site is a client-rendered React app. Every URL returned the same static `<head>` (same title, description, canonical = homepage, same Organization JSON-LD), so search engines and social bots saw identical metadata on every page.
- Unknown URLs returned HTTP 200 (soft 404). Private pages (login, dashboard, admin, cart) had no `noindex`.
- `/sitemap.xml` and `/robots.txt` existed but listed `/products?category=…` filter URLs, `/support` and `/track-order`, included products with no active plan, and had no blog or category pages.
- Categories only existed as a filter (`/products?category=slug`), so they had no clean URL, unique title or content.
- No blog, no breadcrumb structured data, no Product/Offer structured data, no FAQ content on the homepage.
- About page text (CMS) still says "About Noorix Digital Lab" and the Terms/Privacy/Refund pages still contain the "DRAFT" notice — content issues the owner must fix in Admin (see section 7).

## 2. What was implemented
**Server-side SEO for every public page** (`worker/seo/`). The Worker now answers every page request, looks up the real data in D1 and returns the HTML shell with that page's own:
`<title>`, meta description, canonical, robots, Open Graph, Twitter card, JSON-LD, and a crawler-readable body (H1, text, plans/prices, internal links, breadcrumbs). React then takes over exactly as before — private dashboard/admin code is unchanged.

| Area | Behaviour |
|---|---|
| Canonical host | `www.` → 301 to `https://bmart.store`; trailing slash → 301 to the clean path; canonical always `https://bmart.store/...` |
| Real status codes | Unknown product/category/article/page/URL → **404** + `noindex,nofollow` |
| Private pages | `/admin`, `/dashboard`, `/cart`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/track-order` → `noindex,nofollow` (meta + `X-Robots-Tag`), `Cache-Control: no-store`, no data rendered |
| Duplicate content | `/products?category=x` → 301 `/category/x`; any other filter/sort/page/search URL → canonical `/products` + `noindex,follow`; `Disallow: /*?q=` for internal search |
| Demo products | Products flagged `is_demo` are `noindex`, get no Product schema and are not in the sitemap |
| Sitemap | Home, `/products`, categories that have live products, live non-demo products (with real `lastmod` = product `updated_at`), blog, support, published CMS pages + standard policy pages. No query URLs, no private URLs. |
| Category pages | New clean URLs `/category/:slug` with unique title/description, intro text (admin description, or built-in fallback in `src/content/categories.ts`), "Before you buy" tips, breadcrumbs, product links |
| Product pages | Unique title/description (admin SEO fields win), breadcrumbs (Home › All Products › Category › Product), image alt = product + category |
| Homepage | New text section (what B-MART is, delivery/payment facts, category links, links to guides) and the real FAQs from the database |
| Blog | `/blog` and `/blog/:slug` — 3 original evergreen guides in `src/content/blog.ts` (no prices or brand claims that can go stale) |
| Client navigation | `useSeo` / `useRouteSeo` keep title, description, OG, canonical and robots correct after in-app navigation |

**Structured data** (JSON-LD, built only from database values): `Organization` (parent org, support email/WhatsApp if set, social links only if set; **no address**), `WebSite`, `BreadcrumbList`, `Product` with `Offer` / `AggregateOffer` (real PKR price, real stock status), `BlogPosting`, `FAQPage` (only where the FAQs are visible on the page). **No** ratings, reviews, review counts, discounts or brand-authorisation claims are ever generated (a test asserts this).

## 3. Files
New: `worker/seo/{index,render,util}.ts`, `src/lib/seo.ts`, `src/content/{blog,categories}.ts`, `src/pages/Blog.tsx`, `tests/seo.test.ts`, `scripts/build-sandbox.sh`, `docs/SEO.md`.
Modified: `worker/index.ts` (page handler), `worker/routes/public.ts` (exports; old sitemap/robots moved), `wrangler.jsonc` (`run_worker_first`), `src/App.tsx` (routes + route SEO), `src/pages/{Home,Catalog,Info}.tsx`, `src/components/{Layout,ProductCard}.tsx`, `tests/money.test.ts` (sitemap assertion), `tests/e2e/server.ts`.
No migrations were added or changed and no database rows are modified.

## 4. Test results
`tsx --test tests/*.test.ts` → **58 tests, 58 pass** (50 existing + 8 new SEO tests covering head tags, JSON-LD, 404s, noindex, redirects, sitemap/robots, blog, HTML/JSON-LD injection).
Browser run against a production-style build (desktop 1280 and mobile 390): home, products, category, product, blog, article, support, policy pages and a 404 — correct title/canonical/robots/JSON-LD on each, no console errors, no horizontal overflow.
Not done here: Google's Rich Results Test / Search Console (they need the live site). JSON-LD was validated for JSON syntax and schema.org structure by the tests only.

## 5. Deployment
1. Merge/push to `main` → Cloudflare Workers Build deploys. No migration to run.
2. Check after deploy: `curl -I https://bmart.store/products/<slug>` (200), `https://bmart.store/nope` (404), `https://bmart.store/sitemap.xml`, `https://bmart.store/robots.txt`.
3. `run_worker_first` is now `/*` (minus static asset paths): every page view runs the Worker (2–5 small D1 reads). On the Workers **Free** plan watch for Error 1102 (CPU) and the 100k requests/day limit; the Paid plan removes both worries.

## 6. Google Search Console checklist (manual)
1. Add property: **Domain** `bmart.store` (DNS TXT) — or URL-prefix `https://bmart.store/`.
2. Sitemaps → submit `https://bmart.store/sitemap.xml`.
3. URL Inspection → "Request indexing" for: `/`, `/products`, one category (`/category/ai-tools`), one product, `/blog`, one article, `/page/terms`.
4. Pages report: confirm login/admin/dashboard/cart appear under "Excluded by noindex".
5. Enhancements: check Breadcrumbs and Product snippets for errors (Rich Results Test on a product URL).
6. Make sure Cloudflare redirects `http://` → `https://` (SSL/TLS → Edge Certificates → Always Use HTTPS) and the `www` DNS record is proxied so the Worker can 301 it.
7. Do not expect immediate indexing; do not treat a URL as indexed until Search Console says so.

## 7. Remaining manual tasks (cannot be done in code)
- Admin → Pages: rewrite **About** so it describes B-MART (it currently says "About Noorix Digital Lab"), and replace the "DRAFT — have this reviewed" Terms/Privacy/Refund text with reviewed text.
- Delete or hide the seeded demo products and give every real product a real description, features and image; add per-product SEO title/description in Admin where you want custom wording.
- Fill category descriptions in Admin if you want text other than the built-in intros.
- Set support email, WhatsApp and social links in Settings (they feed the Organization schema). No postal address is published, on purpose.
- Only list products B-MART is genuinely allowed to sell; do not add "official"/"authorised" wording unless true.

## 8. Content plan (blog)
Published now (evergreen, no price/brand claims): *How Digital Subscriptions Work*, *How to Choose Digital Services Safely*, *How the B-MART Wallet Works*.
Next, only when facts can be verified at writing time and updated: (4) Netflix subscription guide for Pakistan, (5) Prime Video guide, (6) Best AI tools for students, (7) AI tools for small businesses, (8) Canva Pro vs free Canva, (9) ChatGPT vs Gemini, (10) productivity tools for freelancers, and a general "Best digital subscription services in Pakistan" round-up. Each needs current plan/feature facts checked against the official source on the day it is written, a "last updated" date, and links to the matching B-MART category/product. One strong article per month beats dozens of thin ones.

## 9. Performance notes
No font or third-party script is loaded; HTML is not cached (`max-age=0, must-revalidate`) so prices stay accurate, hashed JS/CSS are served by Workers Assets with long-lived caching. The new homepage section adds text only (no images). Candidates for a later pass: compress `og-image.png` (580 KB) and `logo.png` (176 KB) to WebP/optimised PNG, and add explicit width/height to remaining product images. A real Lighthouse run needs the deployed site.
