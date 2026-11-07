import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../worker/index';
import { Client, makeEnv, newCustomer, newStaff } from './helpers/app';

test('register → me → logout → login; passwords are hashed', async () => {
  const env = makeEnv(); const app = createApp();
  const { c, email } = await newCustomer(app, env);
  const me = await c.get('/api/auth/me');
  assert.equal(me.json.user.email, email); assert.equal(me.json.balance, 0);
  const row = await env.DB.prepare('SELECT password_hash FROM users WHERE email=?').bind(email).first();
  assert.match(row.password_hash, /^pbkdf2\$100000\$/); assert.ok(!row.password_hash.includes('Password123'));
  await c.post('/api/auth/logout');
  assert.equal((await c.get('/api/auth/me')).json.user, null);
  assert.equal((await c.post('/api/auth/login', { email, password: 'Password123!' })).status, 200);
});

test('wrong password, unknown email, duplicate email, weak password', async () => {
  const env = makeEnv(); const app = createApp();
  const { email } = await newCustomer(app, env);
  const c = new Client(app, env);
  assert.equal((await c.post('/api/auth/login', { email, password: 'nope-nope' })).status, 401);
  assert.equal((await c.post('/api/auth/login', { email: 'ghost@example.com', password: 'nope-nope' })).status, 401);
  assert.equal((await c.post('/api/auth/register', { name: 'A B', email, password: 'Password123!' })).status, 409);
  assert.equal((await c.post('/api/auth/register', { name: 'A B', email: 'new@example.com', password: 'short' })).status, 400);
});

test('login is rate limited per email', async () => {
  const env = makeEnv(); const app = createApp();
  const { email } = await newCustomer(app, env);
  const c = new Client(app, env); let last = 0;
  for (let i = 0; i < 12; i++) last = (await c.post('/api/auth/login', { email, password: 'wrong-pass-1' })).status;
  assert.equal(last, 429);
});

test('CSRF: cross-origin and missing token are blocked', async () => {
  const env = makeEnv(); const app = createApp();
  const { c } = await newCustomer(app, env);
  assert.equal((await c.req('POST', '/api/auth/logout', {}, { origin: 'https://evil.example' })).status, 403);
  const saved = c.csrf; c.csrf = '';
  assert.equal((await c.post('/api/account/tickets', { subject: 'Hello there', message: 'Hi there friend' })).status, 403);
  c.csrf = saved;
  assert.equal((await c.post('/api/account/tickets', { subject: 'Hello there', message: 'Hi there friend' })).status, 201);
});

test('forgot/reset password: token is single-use, hashed, and kills sessions', async () => {
  const env = makeEnv(); const app = createApp();
  const { c, email } = await newCustomer(app, env);
  const anon = new Client(app, env);
  const r1 = await anon.post('/api/auth/forgot', { email }); const r2 = await anon.post('/api/auth/forgot', { email: 'ghost@example.com' });
  assert.equal(r1.status, 200); assert.deepEqual(r1.json, r2.json);   // no account enumeration
  const mail = await env.DB.prepare("SELECT body FROM email_outbox WHERE to_email=? AND subject LIKE 'Reset%'").bind(email).first();
  const token = /token=([\w-]+)/.exec(mail.body)![1];
  const stored = await env.DB.prepare('SELECT token_hash FROM password_reset_tokens').first();
  assert.notEqual(stored.token_hash, token);
  assert.equal((await anon.post('/api/auth/reset', { token, password: 'BrandNewPass99' })).status, 200);
  assert.equal((await anon.post('/api/auth/reset', { token, password: 'AnotherPass99' })).status, 400);
  assert.equal((await c.get('/api/auth/me')).json.user, null);   // old session destroyed
  assert.equal((await anon.post('/api/auth/login', { email, password: 'BrandNewPass99' })).status, 200);
});

test('change password keeps current session, drops the others', async () => {
  const env = makeEnv(); const app = createApp();
  const { c, email } = await newCustomer(app, env);
  const other = new Client(app, env); await other.post('/api/auth/login', { email, password: 'Password123!' });
  assert.equal((await c.post('/api/auth/change-password', { current: 'bad-current', next: 'NewPassword456' })).status, 400);
  assert.equal((await c.post('/api/auth/change-password', { current: 'Password123!', next: 'NewPassword456' })).status, 200);
  assert.ok((await c.get('/api/auth/me')).json.user); assert.equal((await other.get('/api/auth/me')).json.user, null);
});

test('suspended customer is logged out and cannot sign in', async () => {
  const env = makeEnv(); const app = createApp();
  const { c, email, id } = await newCustomer(app, env);
  const admin = await newStaff(app, env, ['root']);
  assert.equal((await admin.post(`/api/admin/customers/${id}/status`, { status: 'suspended' })).status, 200);
  assert.equal((await c.get('/api/auth/me')).json.user, null);
  const r = await new Client(app, env).post('/api/auth/login', { email, password: 'Password123!' });
  assert.equal(r.status, 403); assert.equal(r.json.error.code, 'account_suspended');
});

test('email verification token works once', async () => {
  const env = makeEnv(); const app = createApp();
  const { c, email } = await newCustomer(app, env);
  const mail = await env.DB.prepare("SELECT body FROM email_outbox WHERE to_email=? AND subject LIKE 'Verify%'").bind(email).first();
  const token = /token=([\w-]+)/.exec(mail.body)![1];
  assert.equal((await c.post('/api/auth/verify-email', { token })).status, 200);
  assert.equal((await c.get('/api/auth/me')).json.user.emailVerified, true);
  assert.equal((await c.post('/api/auth/verify-email', { token })).status, 400);
});

test('super admin setup: needs token, works once', async () => {
  const env = makeEnv(); const app = createApp(); const c = new Client(app, env);
  const body = { name: 'Root', email: 'root@noorix.test', password: 'RootPassword123' };
  assert.equal((await c.post('/api/setup/super-admin', { ...body, token: 'wrong' })).status, 403);
  assert.equal((await c.post('/api/setup/super-admin', { ...body, token: 'setup-secret-123' })).status, 201);
  assert.equal((await c.post('/api/setup/super-admin', { ...body, email: 'x@y.com', token: 'setup-secret-123' })).status, 409);
  const noTok = makeEnv({ SETUP_TOKEN: undefined });
  assert.equal((await new Client(app, noTok).post('/api/setup/super-admin', { ...body, token: 'x' })).status, 404);
});

test('RBAC: customers and wrong-role staff are refused; super-only routes protected', async () => {
  const env = makeEnv(); const app = createApp();
  const { c } = await newCustomer(app, env);
  assert.equal((await c.get('/api/admin/dashboard')).status, 403);
  assert.equal((await new Client(app, env).get('/api/admin/dashboard')).status, 401);
  const support = await newStaff(app, env, ['support_agent']);
  assert.equal((await support.get('/api/admin/tickets')).status, 200);
  assert.equal((await support.get('/api/admin/deposits')).status, 403);
  assert.equal((await support.get('/api/admin/staff')).status, 403);
  assert.equal((await support.put('/api/admin/settings', { site_name: 'x' })).status, 403);
  const finance = await newStaff(app, env, ['finance_manager']);
  assert.equal((await finance.get('/api/admin/deposits')).status, 200);
  assert.equal((await finance.post('/api/admin/staff', { name: 'A B', email: 'a@b.com', password: 'LongPassword123', roles: ['super_admin'] })).status, 403);
});
