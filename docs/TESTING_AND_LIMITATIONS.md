# Testing results & known limitations

## Automated tests — `npm test` (27 tests, all passing at hand-over)
* **auth.test.ts (10)** register/login/logout, hashing, rate limiting, CSRF, reset-password (single use, hashed, kills sessions), change-password, suspended accounts, email verification, Super Admin bootstrap, RBAC.
* **money.test.ts (17)** deposits (validation, duplicate TID, approve-once, concurrent double-approve credits once, proofs private), checkout (insufficient funds, server-side price, idempotent + 3 parallel clicks = 1 charge), limited stock race, **automatic delivery race (3 buyers, 1 item → exactly 1 sale, losers not charged)**, encryption at rest, manual delivery + secrets hidden from support role, coupons, refunds (request → approve once, cancel+refund), wallet adjustments + immutable ledger + non-negative balance, API provider (no credentials → stays Processing; confirmed → completed; down → retry → failed → refundable), tickets (internal notes hidden), catalogue/search/sort/pagination, admin CRUD, tracking, sitemap, dashboard, reports, CSV formula-injection guard, audit log, last-Super-Admin protection.
Every money test also asserts `wallet balance == SUM(ledger)` and `balance_after` consistency.

## Browser test
A real Chromium run (Playwright) against the real Worker code: register → add funds with proof upload → admin approves → buy → admin delivers → customer sees delivery; all admin pages opened; mobile viewport checked for horizontal overflow. No console errors.

## What was NOT verified (be aware)
* **Not run on live Cloudflare.** Tests use a SQLite-backed shim of D1 and an in-memory R2, and Hono/Zod from source. `vite build` and `wrangler deploy` could not be executed in the build sandbox (no npm registry access); the SPA was bundled with esbuild and styled with the Tailwind CLI instead. Run `npm run build` once and fix anything it reports.
* D1 `batch()` atomicity (all-or-nothing) is relied on — this is documented D1 behaviour.
* Type-checking of the React code was not run against `@types/react` (not installable here). `npm run typecheck` is provided; `npm run build` deliberately does **not** type-check so a type nit cannot block a deploy.
* PBKDF2 uses 100,000 iterations (the Workers maximum); OWASP recommends more — acceptable here, noted.
* Email sending, PayFast and supplier APIs are untested (no credentials).

## Known limitations
* One quantity per item; no multi-quantity lines. No reviews/ratings (no fake testimonials are shown).
* Manual deposit verification is by a human; no bank-statement automation.
* Reports use UTC days for the range filter; the dashboard chart buckets by Asia/Karachi.
* Rich-text editing is plain text (CMS pages). Product images are single-image.
* Customer email notifications for deliveries are in-app only unless the email adapter is configured (and even then only auth emails are sent today).
* Rate limiting is D1-based (good for abuse, not a DDoS shield) — add Cloudflare WAF rules for the auth endpoints.
