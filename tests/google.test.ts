import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../worker/index';
import { Client, makeEnv, newCustomer, newStaff } from './helpers/app';
import { resetJwksCache, safeNext, pkceChallenge } from '../worker/lib/google';
import { b64url } from '../worker/lib/crypto';

const CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
const realFetch = globalThis.fetch;
const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const other = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const pubJwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };

const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
async function signJwt(claims: Record<string, unknown>, o: { key?: CryptoKey; alg?: string; kid?: string } = {}) {
  const head = enc({ alg: o.alg ?? 'RS256', kid: o.kid ?? 'k1', typ: 'JWT' });
  const payload = enc(claims);
  const sig = o.alg === 'none' ? '' : b64url(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', o.key ?? kp.privateKey, new TextEncoder().encode(`${head}.${payload}`))));
  return `${head}.${payload}.${sig}`;
}

let tokenBody: URLSearchParams | null = null;
let tokenResponder: (nonce: string) => Promise<Response> | Response = () => new Response('{}', { status: 400 });
beforeEach(() => {
  resetJwksCache(); tokenBody = null;
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [pubJwk] });
    if (url === 'https://oauth2.googleapis.com/token') { tokenBody = new URLSearchParams(String(init.body)); return tokenResponder(''); }
    return realFetch(input, init);
  }) as any;
});
after(() => { globalThis.fetch = realFetch; });

const mkEnv = (extra: Record<string, unknown> = {}) => makeEnv({ GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: 'shh-secret', ...extra });
const get = (app: any, env: any, path: string, cookie = '', ip = '10.9.9.9') => app.fetch(new Request('http://localhost' + path, { headers: { cookie, 'cf-connecting-ip': ip } }), env) as Promise<Response>;
const cookieOf = (r: Response, name: string) => new RegExp(`${name}=([^;]*)`).exec(r.headers.get('set-cookie') ?? '')?.[1] ?? '';

const goodClaims = (over: Record<string, unknown> = {}) => ({
  iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: 'g-sub-1', email: 'newbie@example.com', email_verified: true, name: 'New Bie',
  iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, ...over,
});

/** Runs start → (Google) → callback. `claims` may be a function of the nonce; returns the callback response. */
async function flow(app: any, env: any, o: { claims?: Record<string, unknown>; next?: string; signWith?: CryptoKey; alg?: string; query?: string; cookieOverride?: string; stateOverride?: string; tokenStatus?: number } = {}) {
  const start = await get(app, env, '/api/auth/google/start' + (o.next ? `?next=${encodeURIComponent(o.next)}` : ''));
  assert.equal(start.status, 302);
  const loc = new URL(start.headers.get('location')!);
  const state = loc.searchParams.get('state')!; const nonce = loc.searchParams.get('nonce')!;
  const stateCookie = cookieOf(start, 'nx_oauth');
  tokenResponder = async () => o.tokenStatus
    ? Response.json({ error: 'invalid_grant' }, { status: o.tokenStatus })
    : Response.json({ id_token: await signJwt({ nonce, ...goodClaims(), ...o.claims }, { key: o.signWith, alg: o.alg }) });
  const cb = await get(app, env, `/api/auth/google/callback?code=auth-code-123&state=${encodeURIComponent(o.stateOverride ?? state)}${o.query ?? ''}`, `nx_oauth=${o.cookieOverride ?? stateCookie}`);
  return { cb, state, nonce, loc, stateCookie };
}
const errOf = (r: Response) => new URL(r.headers.get('location')!, 'http://localhost').searchParams.get('error');
const pathOf = (r: Response) => new URL(r.headers.get('location')!, 'http://localhost').pathname;
const sessionClient = (app: any, env: any, r: Response) => { const c = new Client(app, env); c.cookie = `nx_session=${cookieOf(r, 'nx_session')}`; return c; };

test('start: redirects to Google with state, nonce, PKCE S256, openid scope and exact redirect_uri; sets httpOnly state cookie', async () => {
  const env = mkEnv(); const app = createApp();
  const r = await get(app, env, '/api/auth/google/start?next=/catalog');
  const u = new URL(r.headers.get('location')!);
  assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(u.searchParams.get('client_id'), CLIENT_ID);
  assert.equal(u.searchParams.get('redirect_uri'), 'http://localhost/api/auth/google/callback');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('scope'), 'openid email profile');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(u.searchParams.get('state')!.length >= 40 && u.searchParams.get('nonce')!.length >= 20);
  assert.match(r.headers.get('set-cookie')!, /nx_oauth=.*HttpOnly/i);
  const row = await env.DB.prepare('SELECT state_hash, next_path FROM oauth_states').first();
  assert.notEqual(row.state_hash, u.searchParams.get('state'));   // only the hash is stored
  assert.equal(row.next_path, '/catalog');
});

test('start: not configured → friendly error, no Google redirect', async () => {
  const env = makeEnv(); const app = createApp();
  const r = await get(app, env, '/api/auth/google/start');
  assert.equal(pathOf(r), '/login'); assert.equal(errOf(r), 'google_unavailable');
});

test('start: other host is bounced to the canonical SITE_URL host first (cookie must live there)', async () => {
  const env = mkEnv({ SITE_URL: 'https://shop.example.com' }); const app = createApp();
  const r = await app.fetch(new Request('https://x.workers.dev/api/auth/google/start?next=/a', { headers: { 'cf-connecting-ip': '1.1.1.1' } }), env);
  assert.equal(r.headers.get('location'), 'https://shop.example.com/api/auth/google/start?next=%2Fa');
});

test('sign-up: first-time Google user gets a customer account, wallet, verified email, linked identity and a normal session', async () => {
  const env = mkEnv(); const app = createApp();
  const { cb } = await flow(app, env, { next: '/catalog' });
  assert.equal(cb.status, 302); assert.equal(pathOf(cb), '/catalog');
  assert.equal(tokenBody!.get('grant_type'), 'authorization_code');
  assert.equal(tokenBody!.get('client_secret'), 'shh-secret');
  assert.equal(tokenBody!.get('redirect_uri'), 'http://localhost/api/auth/google/callback');
  const c = sessionClient(app, env, cb);
  const me = await c.get('/api/auth/me');
  assert.equal(me.json.user.email, 'newbie@example.com'); assert.equal(me.json.user.name, 'New Bie');
  assert.equal(me.json.user.emailVerified, true); assert.equal(me.json.user.isStaff, false); assert.equal(me.json.balance, 0);
  assert.ok(me.json.csrf);
  const idn = await env.DB.prepare('SELECT provider, subject FROM oauth_identities').first();
  assert.deepEqual({ ...idn }, { provider: 'google', subject: 'g-sub-1' });
  assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM wallet_accounts').first()).n, 1);
  // the PKCE verifier sent to Google matches the challenge from /start
  const { loc } = await flow(app, env, { claims: { sub: 'g-sub-1' } });
  assert.equal(loc.searchParams.get('code_challenge'), await pkceChallenge(tokenBody!.get('code_verifier')!));
});

test('Google-only accounts cannot be entered with a guessed password, but can use "Forgot password"', async () => {
  const env = mkEnv(); const app = createApp();
  await flow(app, env);
  const c = new Client(app, env);
  assert.equal((await c.post('/api/auth/login', { email: 'newbie@example.com', password: 'Password123!' })).status, 401);
  assert.equal((await c.post('/api/auth/forgot', { email: 'newbie@example.com' })).status, 200);
});

test('sign-in: returning Google user is matched by "sub", not by email', async () => {
  const env = mkEnv(); const app = createApp();
  await flow(app, env);
  const { cb } = await flow(app, env, { claims: { email: 'changed.at.google@example.com' } });
  assert.equal(pathOf(cb), '/dashboard');
  const me = await sessionClient(app, env, cb).get('/api/auth/me');
  assert.equal(me.json.user.email, 'newbie@example.com');
  assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM users').first()).n, 1);
});

test('linking: verified existing account with the same Google-verified email is linked; password login keeps working', async () => {
  const env = mkEnv(); const app = createApp();
  const { c, email, id } = await newCustomer(app, env);
  await env.DB.prepare("UPDATE users SET email_verified_at='2026-01-01T00:00:00Z' WHERE id=?").bind(id).run();
  const { cb } = await flow(app, env, { claims: { email, sub: 'g-link' } });
  assert.equal(pathOf(cb), '/dashboard');
  assert.equal((await sessionClient(app, env, cb).get('/api/auth/me')).json.user.id, id);
  assert.equal((await env.DB.prepare('SELECT user_id FROM oauth_identities WHERE subject=?').bind('g-link').first()).user_id, id);
  assert.equal((await new Client(app, env).post('/api/auth/login', { email, password: 'Password123!' })).status, 200);
  assert.equal((await c.get('/api/auth/me')).json.user.id, id);     // existing session untouched
  assert.ok(await env.DB.prepare("SELECT 1 x FROM email_outbox WHERE to_email=? AND subject LIKE 'Google sign-in%'").bind(email).first());   // owner is told
});

test('ACCOUNT TAKEOVER GUARD: an unverified pre-registered account loses its password and sessions when Google proves the mailbox', async () => {
  const env = mkEnv(); const app = createApp();
  const attacker = new Client(app, env);
  const reg = await attacker.post('/api/auth/register', { name: 'Mallory', email: 'victim@example.com', password: 'AttackerPass123' });
  assert.equal(reg.status, 201);                                   // email never verified
  const { cb } = await flow(app, env, { claims: { email: 'victim@example.com', sub: 'g-victim' } });
  assert.equal(pathOf(cb), '/dashboard');
  assert.equal((await attacker.get('/api/auth/me')).json.user, null);                                       // attacker's session is gone
  assert.equal((await new Client(app, env).post('/api/auth/login', { email: 'victim@example.com', password: 'AttackerPass123' })).status, 401);   // attacker's password is dead
  const me = await sessionClient(app, env, cb).get('/api/auth/me');
  assert.equal(me.json.user.emailVerified, true); assert.equal(me.json.user.id, reg.json.user.id);
});

test('staff accounts are never linked through Google', async () => {
  const env = mkEnv(); const app = createApp();
  await newStaff(app, env, ['root']);
  const { cb } = await flow(app, env, { claims: { email: 'root@noorix.test', sub: 'g-root' } });
  assert.equal(errOf(cb), 'google_staff_blocked');
  assert.equal(cookieOf(cb, 'nx_session'), '');
  assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM oauth_identities').first()).n, 0);
});

test('a Google account already linked to user A cannot be claimed by user B', async () => {
  const env = mkEnv(); const app = createApp();
  await flow(app, env, { claims: { sub: 'g-same', email: 'a@example.com' } });
  const { cb } = await flow(app, env, { claims: { sub: 'g-same', email: 'b@example.com' } });
  assert.equal((await sessionClient(app, env, cb).get('/api/auth/me')).json.user.email, 'a@example.com');
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM users WHERE email='b@example.com'").first()).n, 0);
});

test('suspended / banned users cannot sign in with Google', async () => {
  const env = mkEnv(); const app = createApp();
  await flow(app, env);
  await env.DB.prepare("UPDATE users SET status='banned'").run();
  const { cb } = await flow(app, env);
  assert.equal(errOf(cb), 'account_banned'); assert.equal(cookieOf(cb, 'nx_session'), '');
});

test('registration closed: blocks new Google sign-ups only', async () => {
  const env = mkEnv(); const app = createApp();
  await flow(app, env);
  await env.DB.prepare("INSERT INTO site_settings(key,value) VALUES('registration_open','0') ON CONFLICT(key) DO UPDATE SET value='0'").run();
  assert.equal(errOf((await flow(app, env, { claims: { sub: 'new-sub', email: 'brandnew@example.com' } })).cb), 'google_registration_closed');
  assert.equal(pathOf((await flow(app, env)).cb), '/dashboard');   // existing user still signs in
});

test('STATE: missing cookie, wrong state, replay and expiry are all rejected', async () => {
  const env = mkEnv(); const app = createApp();
  assert.equal(errOf((await flow(app, env, { cookieOverride: '' })).cb), 'google_state');                       // no cookie (forged link in another browser)
  assert.equal(errOf((await flow(app, env, { stateOverride: 'attacker-chosen-state' })).cb), 'google_state');   // wrong state
  const ok = await flow(app, env);
  assert.equal(pathOf(ok.cb), '/dashboard');
  const replay = await get(app, env, `/api/auth/google/callback?code=x&state=${ok.state}`, `nx_oauth=${ok.stateCookie}`);
  assert.equal(errOf(replay), 'google_state');                                                                   // single use
  await env.DB.prepare("UPDATE oauth_states SET expires_at='2000-01-01T00:00:00Z'").run();
  const start = await get(app, env, '/api/auth/google/start');
  await env.DB.prepare("UPDATE oauth_states SET expires_at='2000-01-01T00:00:00Z'").run();
  const st = new URL(start.headers.get('location')!).searchParams.get('state')!;
  assert.equal(errOf(await get(app, env, `/api/auth/google/callback?code=x&state=${st}`, `nx_oauth=${cookieOf(start, 'nx_oauth')}`)), 'google_state');
});

test('ID TOKEN: wrong nonce, audience, issuer, expiry, unverified email, forged signature and alg=none are rejected', async () => {
  const env = mkEnv(); const app = createApp();
  const bad: [string, Record<string, unknown>, { signWith?: CryptoKey; alg?: string }?][] = [
    ['nonce', { nonce: 'not-the-nonce' }], ['aud', { aud: 'someone-elses-client' }], ['iss', { iss: 'https://evil.example' }],
    ['exp', { exp: Math.floor(Date.now() / 1000) - 3600 }], ['unverified', { email_verified: false }],
    ['signature', {}, { signWith: other.privateKey }], ['alg none', {}, { alg: 'none' }],
  ];
  for (const [label, claims, o] of bad) {
    const { cb } = await flow(app, env, { claims, ...o });
    assert.ok(['google_failed', 'google_state', 'google_unverified_email'].includes(errOf(cb)!), `${label} should be rejected (got ${errOf(cb)})`);
    assert.equal(cookieOf(cb, 'nx_session'), '', `${label} must not create a session`);
  }
  assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM users').first()).n, 0);
  assert.equal(errOf((await flow(app, env, { claims: { email_verified: false } })).cb), 'google_unverified_email');
});

test('user cancels on Google, or token exchange fails → clean error redirect, no session', async () => {
  const env = mkEnv(); const app = createApp();
  assert.equal(errOf((await flow(app, env, { query: '&error=access_denied' })).cb), 'google_cancelled');
  const r = await flow(app, env, { tokenStatus: 400 });
  assert.equal(errOf(r.cb), 'google_failed'); assert.equal(cookieOf(r.cb, 'nx_session'), '');
});

test('open redirect: next must be a same-site path', async () => {
  for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', '/api/admin/x', 'javascript:alert(1)', '']) assert.equal(safeNext(bad), '/dashboard', bad);
  assert.equal(safeNext('/product/abc?x=1'), '/product/abc?x=1');
  const env = mkEnv(); const app = createApp();
  assert.equal(pathOf((await flow(app, env, { next: '//evil.com' })).cb), '/dashboard');
});

test('existing email/password flows are unaffected', async () => {
  const env = mkEnv(); const app = createApp();
  const { email } = await newCustomer(app, env);
  assert.equal((await new Client(app, env).post('/api/auth/login', { email, password: 'Password123!' })).status, 200);
});
