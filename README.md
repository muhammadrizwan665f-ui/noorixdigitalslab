# B-MART — Digital Products & Subscriptions Marketplace

_Powered by Noorix Digital Lab. The marketplace name is not final: change it any time in **Admin → Settings** (marketplace name, tagline, parent company, social links). No redeploy needed._

*All-in-One Digital Solutions Under One Roof.* · https://noorixdigitallab.online · WhatsApp 03154429417

A complete marketplace built **only on Cloudflare**: one Worker serves the React app and the REST API; data lives in **D1**, uploads in **R2**.

| Layer | Tech |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS (own tiny router, no extra libraries) |
| API | Cloudflare Workers + Hono + Zod (`worker/`) |
| Database | Cloudflare D1 (SQLite) — migrations in `migrations/` |
| Files | Cloudflare R2 (product images, payment proofs, ticket attachments, delivery files) |
| Config | `wrangler.jsonc` (secrets are Cloudflare secrets — never in Git) |

No PHP, MySQL, cPanel, Node server or local-disk storage anywhere.

## What is included
* **Storefront** — home (banners/announcement managed in admin), all products with search / category / price filters / sort / pagination, categories, trending, today's deals, product detail (plans, features, terms, refund info, customer inputs), track order, support + FAQ, CMS pages, sitemap.xml, robots.txt, Open Graph + JSON-LD.
* **Accounts** — register, login, logout, forgot/reset password, email verification, profile, change password. PBKDF2-SHA256 hashing, HTTP-only SameSite cookies, session rotation, CSRF protection, D1-backed rate limiting, suspend/ban.
* **Customer dashboard** — Overview, Wallet (add funds, ledger, deposit history), Orders (delivery details, timeline, refund requests), Support tickets (attachments), Notifications, Profile & Security.
* **Wallet** — integer paisa, immutable ledger (DB triggers forbid UPDATE/DELETE), balance can never go negative (CHECK constraint), idempotent business events (UNIQUE ledger keys). Deposits: Bank Transfer, Easypaisa, JazzCash (manual, proof upload + admin approval).
* **Checkout** — server-side price/plan/stock/coupon validation, one atomic D1 batch (order + items + debit + ledger + stock + coupon + delivery), idempotency key (no double charge), oversell-proof.
* **Delivery** — *automatic* (AES-GCM-encrypted inventory, never delivered twice), *manual* (admin delivers text/file), *API* (provider adapter with timeout/retry/log; never marked complete unless the provider confirms).
* **Admin `/admin`** — dashboard, customers, wallet ledger, deposits, products/plans, categories, orders, refunds, inventory, payment methods, API providers, support, marketing (banners, coupons, announcement), content (pages, FAQs), reports + CSV exports, staff & RBAC (Super Admin, Order Manager, Finance Manager, Support Agent, Product Manager), system settings, audit log.

## Honest status — read this
* **Demo products** (Netflix, Spotify, ChatGPT Pro …) are seeded and clearly marked *Demo*. They use coloured monograms, not third-party logos. Edit or delete them in Admin → Products. Prices are placeholders.
* **Payment account numbers are empty** — enable Easypaisa/JazzCash/Bank in Admin → Payment Methods after entering your real account details.
* **PayFast (cards) is NOT live.** It needs your merchant credentials and the callback signature scheme from your PayFast documentation. The endpoint returns 503/501 and the method stays hidden. See `docs/INTEGRATIONS.md`.
* **No supplier API is connected.** The provider framework is ready; see `docs/INTEGRATIONS.md`.
* **Email** is recorded in an outbox and only actually sent if you add `EMAIL_API_KEY` + `EMAIL_FROM` (Resend).
* Legal pages (Terms/Privacy/Refund) are **drafts** — have them reviewed.
* Verified here with automated tests and a real-browser run against the real Worker code on a SQLite shim of D1. It has **not** been run on live Cloudflare yet — follow `docs/DEPLOYMENT.md` and do the checklist at the end.

## Quick start (local)
```bash
npm install
cp .dev.vars.example .dev.vars        # set ENCRYPTION_KEY (openssl rand -base64 32) and SETUP_TOKEN
npx wrangler d1 migrations apply noorix-db --local
npm run build && npx wrangler dev      # app + API on http://localhost:8787
npm test                               # needs Node 22.5+ (tests use node:sqlite as a D1 stand-in)
```
Deploying: see **docs/DEPLOYMENT.md**.


## Look & feel
- Premium dark-navy design with electric-blue accents by default. The palette icon in the header switches Light / Dark / Auto and five accent colours; the choice is remembered per browser.
- Brand defaults live in `src/lib/brand.ts`; live values come from Admin → Settings. The logo is the SVG in `src/components/Brand.tsx`; favicon and share image are `public/favicon.svg` and `public/og-image.png`.
- Static page title/meta in `index.html` say "B-MART"; edit them too if the name changes.


## Google sign-in
Optional "Continue with Google" — setup, redirect URI and security notes: [docs/GOOGLE_LOGIN.md](docs/GOOGLE_LOGIN.md).
