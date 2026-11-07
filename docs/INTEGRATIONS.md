# Integrations that need YOUR credentials

| Integration | Status | What you must provide |
|---|---|---|
| Bank / Easypaisa / JazzCash (manual) | **Working** | Real account title + number (Admin → Payment Methods) |
| PayFast cards | **Not implemented — awaiting credentials & docs** | Merchant ID + Secured Key (`PAYFAST_MERCHANT_ID`, `PAYFAST_SECURED_KEY` secrets) and PayFast's callback-signature documentation |
| Transactional email | Outbox works; sending needs a key | `EMAIL_API_KEY` + `EMAIL_FROM` (Resend, verified domain) |
| Supplier / provider APIs | Framework ready, none connected | Each supplier's base URL + API key + their real API contract |

## PayFast
The callback route `/api/payments/callback/payfast` returns **503** until both secrets exist, then **501** until the signature verification code is written against your merchant documentation. This is deliberate: accepting an unverified callback would let anyone credit a wallet. A gateway integration must (1) verify the signature with the secret, (2) store the event in `payment_events` (unique on provider+event id) and (3) credit the wallet through the same atomic ledger path used for deposits. Do not enable it without that work and testing.

## API providers (Admin → API Providers)
1. Add the supplier's HTTPS base URL and enable it.
2. `npx wrangler secret put PROVIDER_<CODE>_KEY` (the exact name is shown on the card, e.g. `PROVIDER_GENERIC_HTTP_KEY`).
3. Set a product's delivery type to **API**, choose the provider, and set each plan's SKU.

The built-in *Generic HTTP* adapter calls `POST {base}{createPath}` with `{reference, sku, input}` and `Authorization: Bearer <key>` and expects `{status:"completed"|"processing"|"failed", ref?, delivery?}`; while `processing` it polls `GET {base}{statusPath}`. A real supplier almost certainly has a different contract — adapt `worker/services/providers.ts`. Items are completed **only** when the provider returns `completed` with delivery data; unreachable providers are retried (5 attempts, backoff) then the item is marked Failed so you can refund it.
