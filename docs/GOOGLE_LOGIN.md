# Google Sign-In / Sign-Up

"Continue with Google" is on the Login and Register pages. It uses the OAuth 2.0 **Authorization Code flow** with
`state`, `nonce` and **PKCE (S256)**, handled entirely by the Worker (`worker/routes/google.ts`, `worker/lib/google.ts`).
Google users get the **same session cookie** as email/password users — there is no second auth system.

## Values to use (production, SITE_URL = `https://noorixdigitallab.online`)

| Google Cloud Console field | Value |
|---|---|
| Authorized JavaScript origin | `https://noorixdigitallab.online` |
| Authorized redirect URI | `https://noorixdigitallab.online/api/auth/google/callback` |

The redirect URI is always `SITE_URL` + `/api/auth/google/callback`. If you change the domain (or `SITE_URL` in `wrangler.jsonc`), change it in Google too.
Requests that arrive on another host (e.g. `*.workers.dev`) are bounced to the `SITE_URL` host first, because the state cookie must live there.

## Cloudflare variables

| Name | Type | Value |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Secret (or plain text) | OAuth client ID, ends in `.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | **Secret** | OAuth client secret |

Cloudflare dashboard → Workers & Pages → your Worker → **Settings → Variables and Secrets → Add**. Redeploy not required, but
if the page still shows "not available", trigger a deploy. CLI: `npx wrangler secret put GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
Without these two the button stays visible but returns the visitor to /login with "Google sign-in is not available right now".

## Database migration (required, additive)

Run `migrations/0003_google_oauth.sql` once on the production D1 database
(Cloudflare → Storage & Databases → D1 → noorix-db → **Console**, paste the file, Execute; or `npx wrangler d1 migrations apply noorix-db --remote`).
It only **creates two new tables** (`oauth_states`, `oauth_identities`); no existing table or row is changed.

## Google Cloud Console setup

1. Open https://console.cloud.google.com/ and create/select a project (e.g. "B-MART").
2. **APIs & Services → OAuth consent screen** (Google Auth Platform → Branding): choose **External**, set app name `B-MART`, support email, developer email; add your domain under *Authorized domains* (`noorixdigitallab.online`). Scopes: only `openid`, `email`, `profile` (non-sensitive). Click **Publish app** (Testing mode only allows listed test users).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** → Application type **Web application**, name `B-MART web`.
4. *Authorized JavaScript origins* → add `https://noorixdigitallab.online`.
5. *Authorized redirect URIs* → add `https://noorixdigitallab.online/api/auth/google/callback` (exact, no trailing slash).
6. Create → copy the **Client ID** and **Client secret** into Cloudflare (above).
7. Open `/login`, click **Continue with Google**.

## Security design

* **State + browser binding** – a random `state` is stored (hashed, single-use, 10-minute expiry) and also set in an `HttpOnly` cookie; the callback requires both to match, so a forged link opened in another browser (login CSRF) fails.
* **PKCE + nonce** – verifier stays on the server; the ID token's `nonce` must match.
* **ID token verification** – RS256 signature checked against Google's published keys, plus `iss`, `aud` (= your client ID), `exp`, `iat`, `nonce`, `sub`, and `email_verified = true`. Unsigned (`alg:none`) or foreign-key tokens are rejected.
* **Identity key is Google's `sub`**, never the email. A Google account can belong to only one user.
* **Account linking (same email as an existing account)**
  * Existing account with a **verified** email → linked automatically, owner is notified by email + in-app notice. Password login keeps working.
  * Existing account whose email was **never verified** (could be a squatter pre-registering someone's address) → Google proves the mailbox, so the account is linked, marked verified, its old password is **invalidated** and all its sessions are destroyed. The real owner can set a new password with "Forgot password".
  * **Staff/admin accounts are never linked via Google** – they must use their password.
  * Suspended/banned accounts are refused.
* New Google users are normal customers (never staff), email-verified, with a wallet. They receive a random unusable password; "Forgot password" lets them add one.
* `next` redirect targets must be same-site relative paths (open-redirect safe).
* Errors never leak details: the browser is redirected to `/login?error=<code>`; details are logged server-side only.
* `registration_open = 0` (Admin → Settings) also blocks new Google sign-ups; existing users can still sign in.
