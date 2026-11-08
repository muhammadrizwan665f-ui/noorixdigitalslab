import { Hono, type Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { HonoEnv } from '../types';
import { AppError, addMinutes } from '../lib/http';
import { hashPassword, randomToken, sha256Hex, timingSafeEqual, uid } from '../lib/crypto';
import { createSession } from '../lib/auth';
import { rateLimit } from '../lib/ratelimit';
import { audit, brandName, getSettings, notifyStmt, sendEmail } from '../lib/notify';
import { GoogleAuthError, buildAuthUrl, exchangeCode, pkceChallenge, safeNext, verifyIdToken, type GoogleClaims } from '../lib/google';

/**
 * Google Sign-In / Sign-Up — OAuth 2.0 Authorization Code flow with state, nonce and PKCE.
 *   GET /api/auth/google/start?next=/path   → redirects to Google
 *   GET /api/auth/google/callback           → verifies everything, signs the user in with the normal session, redirects
 * Failures never expose details: the browser is sent to /login?error=<code>.
 */
export const googleAuth = new Hono<HonoEnv>();

const STATE_COOKIE = 'nx_oauth';
const STATE_MINUTES = 10;
const siteBase = (c: Context<HonoEnv>) => c.env.SITE_URL.replace(/\/+$/, '');
const redirectUri = (c: Context<HonoEnv>) => `${siteBase(c)}/api/auth/google/callback`;
const isHttps = (c: Context<HonoEnv>) => c.env.SITE_URL.startsWith('https:');
const fail = (c: Context<HonoEnv>, code: string, next?: string) => {
  deleteCookie(c, STATE_COOKIE, { path: '/api/auth/google' });
  const q = new URLSearchParams({ error: code });
  if (next && next !== '/dashboard') q.set('next', next);
  return c.redirect(`${siteBase(c)}/login?${q}`, 302);
};

googleAuth.get('/start', async (c) => {
  const next = safeNext(c.req.query('next'));
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) return fail(c, 'google_unavailable');
  // The state cookie must be set on the same host Google will return to.
  const here = new URL(c.req.url);
  if (here.host !== new URL(siteBase(c)).host) return c.redirect(`${siteBase(c)}/api/auth/google/start?${new URLSearchParams({ next })}`, 302);
  try { await rateLimit(c.env, `gstart:${c.get('ip')}`, 30, 3600); } catch { return fail(c, 'rate_limited'); }

  const state = randomToken(32), nonce = randomToken(24), verifier = randomToken(48);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM oauth_states WHERE expires_at < strftime('%Y-%m-%dT%H:%M:%fZ','now')"),
    c.env.DB.prepare('INSERT INTO oauth_states(state_hash,nonce,code_verifier,next_path,expires_at) VALUES(?,?,?,?,?)').bind(await sha256Hex(state), nonce, verifier, next, addMinutes(STATE_MINUTES)),
  ]);
  // Binds the flow to THIS browser: a forged callback link opened in another browser has no matching cookie (login-CSRF protection).
  setCookie(c, STATE_COOKIE, state, { httpOnly: true, secure: isHttps(c), sameSite: 'Lax', path: '/api/auth/google', maxAge: STATE_MINUTES * 60 });
  return c.redirect(buildAuthUrl({ clientId: c.env.GOOGLE_CLIENT_ID, redirectUri: redirectUri(c), state, nonce, challenge: await pkceChallenge(verifier) }), 302);
});

googleAuth.get('/callback', async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) return fail(c, 'google_unavailable');
  let next = '/dashboard';
  try {
    await rateLimit(c.env, `gcb:${c.get('ip')}`, 40, 900);
    const state = c.req.query('state') ?? '';
    const cookie = getCookie(c, STATE_COOKIE) ?? '';
    if (!state || !cookie || !timingSafeEqual(state, cookie)) throw new GoogleAuthError('google_state');
    // Single use: the row is consumed atomically, so a replayed callback finds nothing.
    const row = await c.env.DB.prepare('DELETE FROM oauth_states WHERE state_hash=? RETURNING nonce, code_verifier, next_path, expires_at').bind(await sha256Hex(state)).first<any>();
    if (!row || row.expires_at < new Date().toISOString()) throw new GoogleAuthError('google_state');
    next = safeNext(row.next_path);

    const gerr = c.req.query('error');
    if (gerr) throw new GoogleAuthError(gerr === 'access_denied' ? 'google_cancelled' : 'google_failed');
    const code = c.req.query('code');
    if (!code || code.length > 2048) throw new GoogleAuthError('google_failed');

    const idToken = await exchangeCode({ clientId: c.env.GOOGLE_CLIENT_ID, clientSecret: c.env.GOOGLE_CLIENT_SECRET, redirectUri: redirectUri(c), code, verifier: row.code_verifier });
    const claims = await verifyIdToken(idToken, { clientId: c.env.GOOGLE_CLIENT_ID, nonce: row.nonce });
    const userId = await resolveUser(c, claims);
    deleteCookie(c, STATE_COOKIE, { path: '/api/auth/google' });
    await c.env.DB.prepare("UPDATE users SET last_login_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(userId).run();
    await createSession(c, userId);
    return c.redirect(`${siteBase(c)}${next}`, 302);
  } catch (e) {
    if (e instanceof GoogleAuthError) { console.warn('google oauth rejected:', e.code, e.message); return fail(c, e.code, next); }
    if (e instanceof AppError) return fail(c, e.code === 'rate_limited' ? 'rate_limited' : e.code, next);
    console.error('google oauth error', e);
    return fail(c, 'google_failed', next);
  }
});

const MARK = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

/** Maps a verified Google identity to a B-MART user: returning Google user → linked account → brand-new customer. */
async function resolveUser(c: Context<HonoEnv>, g: GoogleClaims): Promise<string> {
  const env = c.env; const ip = c.get('ip');
  const assertActive = (u: any) => {
    if (u.status !== 'active') throw new AppError(403, 'account_' + u.status, 'This account is not active');
  };

  // 1) Already linked: the stable Google "sub" is the key (an email change at Google can never hijack anything).
  const linked = await env.DB.prepare("SELECT u.id, u.status FROM oauth_identities i JOIN users u ON u.id=i.user_id WHERE i.provider='google' AND i.subject=?").bind(g.sub).first<any>();
  if (linked) {
    assertActive(linked);
    await env.DB.prepare(`UPDATE oauth_identities SET last_login_at=${MARK} WHERE provider='google' AND subject=?`).bind(g.sub).run();
    return linked.id;
  }

  // 2) Same email as an existing account.
  const existing = await env.DB.prepare('SELECT id, name, status, is_staff, email_verified_at FROM users WHERE email=?').bind(g.email).first<any>();
  if (existing) {
    assertActive(existing);
    // Privileged accounts are never linked through a third party: staff must use their password.
    if (existing.is_staff) throw new GoogleAuthError('google_staff_blocked');
    const brand = await brandName(env);
    const stmts = [
      env.DB.prepare('INSERT INTO oauth_identities(provider,subject,user_id,email,last_login_at) VALUES(?,?,?,?,' + MARK + ')').bind('google', g.sub, existing.id, g.email),
      notifyStmt(env, existing.id, 'system', 'Google sign-in linked', 'Your Google account was linked to this account. If this was not you, change your password and contact support.', '/dashboard/profile'),
    ];
    if (!existing.email_verified_at) {
      // The email was never proven by whoever created this password account — it may have been pre-registered by someone else.
      // Google has just proven ownership of the mailbox, so the Google owner takes the account: the unknown password is
      // invalidated and every existing session is destroyed. (The owner can set a new password via "Forgot password".)
      stmts.push(
        env.DB.prepare(`UPDATE users SET email_verified_at=${MARK}, password_hash=?, updated_at=${MARK} WHERE id=?`).bind(await hashPassword(randomToken(32)), existing.id),
        env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(existing.id),
      );
    }
    try { await env.DB.batch(stmts); } catch (e) {
      if (String((e as Error).message).includes('UNIQUE')) throw new GoogleAuthError('google_failed', 'identity already linked elsewhere');
      throw e;
    }
    await audit(env, existing.id, 'auth.google_link', 'user', existing.id, { verifiedBefore: !!existing.email_verified_at }, ip);
    await sendEmail(env, g.email, `Google sign-in was linked to your ${brand} account`, `A Google account (${g.email}) was just linked to your ${brand} account.\n\nIf this was you, no action is needed. If not, reset your password at ${siteBase(c)}/forgot-password and contact support.`);
    return existing.id;
  }

  // 3) First-time Google user → new customer account.
  if ((await getSettings(env)).registration_open === '0') throw new GoogleAuthError('google_registration_closed');
  const id = uid(); const brand = await brandName(env);
  const name = (g.name.length >= 2 ? g.name : g.email.split('@')[0]).slice(0, 80);
  try {
    await env.DB.batch([
      // password_hash is NOT NULL: Google-only accounts get a random, never-disclosed password (they can set one via "Forgot password").
      env.DB.prepare(`INSERT INTO users(id,email,name,password_hash,email_verified_at) VALUES(?,?,?,?,${MARK})`).bind(id, g.email, name, await hashPassword(randomToken(32))),
      env.DB.prepare('INSERT INTO wallet_accounts(user_id,balance) VALUES(?,0)').bind(id),
      env.DB.prepare('INSERT INTO oauth_identities(provider,subject,user_id,email,last_login_at) VALUES(?,?,?,?,' + MARK + ')').bind('google', g.sub, id, g.email),
      notifyStmt(env, id, 'system', `Welcome to ${brand}`, 'Add funds to your wallet to start shopping.', '/dashboard/wallet'),
    ]);
  } catch (e) {
    if (String((e as Error).message).includes('UNIQUE')) throw new GoogleAuthError('google_failed', 'concurrent sign-up');
    throw e;
  }
  return id;
}
