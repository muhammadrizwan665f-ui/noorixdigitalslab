# Deployment guide (Cloudflare only)

You need: a Cloudflare account, the domain `noorixdigitallab.online` added to Cloudflare, Node 20+, and this repo on GitHub.

## 1. Install and log in
```bash
npm install
npx wrangler login
```

## 2. Create the D1 database and R2 bucket
```bash
npx wrangler d1 create noorix-db
npx wrangler r2 bucket create noorix-files
```
`d1 create` prints a `database_id`. Open **wrangler.jsonc** and replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` with it. (The id is not a secret; commit it.)

## 3. Apply the database migrations (remote)
```bash
npx wrangler d1 migrations apply noorix-db --remote
```
This creates all 38 tables and seeds roles, permissions, the 10 categories, payment-method shells, demo products, settings and draft pages. **Never edit an applied migration** — add `0003_*.sql` for changes.

## 4. Set secrets (never in Git)
```bash
openssl rand -base64 32 | npx wrangler secret put ENCRYPTION_KEY   # protects inventory/delivery data — back it up safely!
npx wrangler secret put SETUP_TOKEN                                  # any long random string; used once in step 6
# optional: npx wrangler secret put EMAIL_API_KEY ; npx wrangler secret put EMAIL_FROM
```
> **Back up `ENCRYPTION_KEY`.** If it is lost, stored deliveries/inventory cannot be decrypted. Changing it later requires re-encrypting data.

## 5. Build and deploy
```bash
npm run deploy      # = vite build + wrangler deploy
```
**Via GitHub (Workers Builds):** Cloudflare dashboard → Workers & Pages → Create → Import a repository. Build command `npm run build`, deploy command `npx wrangler deploy`. Add the secrets under *Settings → Variables and Secrets* (or use the commands above) **before** the first deploy.

## 6. Custom domain
Workers & Pages → `noorix-digital-lab` → Settings → Domains & Routes → add `noorixdigitallab.online` (and `www`). Make sure the `SITE_URL` var in `wrangler.jsonc` matches.

## 7. Create the first Super Admin (one time)
```bash
curl -X POST https://noorixdigitallab.online/api/setup/super-admin \
  -H "Content-Type: application/json" \
  -d '{"token":"<SETUP_TOKEN>","name":"Your Name","email":"you@example.com","password":"a-long-password"}'
```
It works **only while no Super Admin exists** and only with the token. Afterwards delete the secret: `npx wrangler secret delete SETUP_TOKEN`. Log in at `/login`, then open `/admin`. Add other staff in Admin → Staff & Roles.

## 8. First-run checklist (do this before announcing)
1. Admin → **Payment Methods**: enter real account title/number, enable Easypaisa / JazzCash / Bank.
2. Admin → **Products**: delete or edit the demo products; set real prices, delivery type, refund eligibility.
3. Admin → **Settings**: check site name, WhatsApp, support email. Admin → **Content**: review About/Terms/Privacy/Refund drafts.
4. Test end-to-end with a real small deposit: register → add funds → approve → buy → deliver.
5. Confirm `/sitemap.xml` and `/robots.txt` load; submit the sitemap to Google Search Console.
6. Optional: Cloudflare WAF rate-limiting rules on `/api/auth/*` for extra protection.

## Cron
`wrangler.jsonc` schedules `*/10 * * * *`: retries API-provider calls and purges expired sessions/rate-limit rows.

## Rollback
`npx wrangler rollback` restores the previous Worker version. D1 point-in-time recovery: `npx wrangler d1 time-travel restore noorix-db --timestamp=<ISO>`.
