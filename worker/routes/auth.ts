import { Hono } from 'hono';
import { z } from 'zod';
import type { HonoEnv } from '../types';
import { body, bad, conflict, AppError, addMinutes, forbidden } from '../lib/http';
import { hashPassword, randomToken, sha256Hex, timingSafeEqual, uid, verifyPassword } from '../lib/crypto';
import { createSession, destroyAllSessions, destroySession, requireAuth } from '../lib/auth';
import { rateLimit } from '../lib/ratelimit';
import { audit, getSettings, sendEmail } from '../lib/notify';

export const auth = new Hono<HonoEnv>();

const password = z.string().min(8, 'Password must be at least 8 characters').max(128);
const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);
const DUMMY = 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

async function issueVerification(c: any, userId: string, to: string) {
  const token = randomToken(32);
  await c.env.DB.prepare('INSERT INTO email_verification_tokens(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await sha256Hex(token), userId, addMinutes(60 * 48)).run();
  await sendEmail(c.env, to, 'Verify your Noorix Digital Lab email', `Open this link to verify your email:\n${c.env.SITE_URL}/verify-email?token=${token}\n\nIf you did not create an account, ignore this message.`);
}

export async function meResponse(c: any) {
  const u = c.get('user');
  if (!u) return { user: null };
  const [bal, unread] = await Promise.all([
    c.env.DB.prepare('SELECT balance FROM wallet_accounts WHERE user_id=?').bind(u.id).first(),
    c.env.DB.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read_at IS NULL').bind(u.id).first(),
  ]);
  return {
    user: { id: u.id, email: u.email, name: u.name, phone: u.phone, isStaff: !!u.is_staff, emailVerified: !!u.email_verified_at },
    csrf: c.get('csrf'), balance: bal?.balance ?? 0, unread: unread?.n ?? 0,
    perms: [...c.get('perms')], isSuper: c.get('isSuper'),
  };
}

auth.post('/register', async (c) => {
  const s = await getSettings(c.env);
  if (s.registration_open === '0') throw forbidden('Registration is currently closed');
  const i = await body(c, z.object({ name: z.string().trim().min(2).max(80), email, phone: z.string().trim().max(20).optional().nullable(), password }));
  await rateLimit(c.env, `reg:${c.get('ip')}`, 10, 3600);
  const exists = await c.env.DB.prepare('SELECT 1 x FROM users WHERE email=?').bind(i.email).first();
  if (exists) throw conflict('An account with this email already exists', 'email_taken');
  const id = uid();
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO users(id,email,name,phone,password_hash) VALUES(?,?,?,?,?)').bind(id, i.email, i.name, i.phone ?? null, await hashPassword(i.password)),
    c.env.DB.prepare('INSERT INTO wallet_accounts(user_id,balance) VALUES(?,0)').bind(id),
    c.env.DB.prepare('INSERT INTO notifications(id,user_id,type,title,body,link) VALUES(?,?,?,?,?,?)').bind(uid(), id, 'system', 'Welcome to Noorix Digital Lab', 'Add funds to your wallet to start shopping.', '/dashboard/wallet'),
  ]);
  await issueVerification(c, id, i.email);
  await createSession(c, id);
  const u = await c.env.DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first<any>();
  c.set('user', { id, email: u.email, name: u.name, phone: u.phone, status: u.status, is_staff: 0, email_verified_at: null });
  const sess = await c.env.DB.prepare('SELECT csrf_token FROM sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 1').bind(id).first<any>();
  c.set('csrf', sess.csrf_token);
  return c.json(await meResponse(c), 201);
});

auth.post('/login', async (c) => {
  const i = await body(c, z.object({ email, password: z.string().min(1).max(128) }));
  await rateLimit(c.env, `login:${c.get('ip')}`, 30, 900);
  await rateLimit(c.env, `login:${i.email}`, 8, 900);
  const u = await c.env.DB.prepare('SELECT * FROM users WHERE email=?').bind(i.email).first<any>();
  const ok = await verifyPassword(i.password, u?.password_hash ?? DUMMY);   // constant-ish time for unknown emails
  if (!u || !ok) throw new AppError(401, 'invalid_credentials', 'Incorrect email or password');
  if (u.status !== 'active') throw new AppError(403, 'account_' + u.status, u.status === 'banned' ? 'This account has been banned. Contact support.' : 'This account is suspended. Contact support.');
  await c.env.DB.prepare("UPDATE users SET last_login_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(u.id).run();
  await createSession(c, u.id);
  const sess = await c.env.DB.prepare('SELECT csrf_token FROM sessions WHERE user_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1').bind(u.id).first<any>();
  c.set('user', { id: u.id, email: u.email, name: u.name, phone: u.phone, status: u.status, is_staff: u.is_staff, email_verified_at: u.email_verified_at });
  c.set('csrf', sess.csrf_token);
  if (u.is_staff) {
    const rs = await c.env.DB.prepare('SELECT r.code role, rp.permission_code perm FROM user_roles ur JOIN roles r ON r.id=ur.role_id LEFT JOIN role_permissions rp ON rp.role_id=r.id WHERE ur.user_id=?').bind(u.id).all<any>();
    c.set('perms', new Set(rs.results.filter((r: any) => r.perm).map((r: any) => r.perm)));
    c.set('isSuper', rs.results.some((r: any) => r.role === 'super_admin'));
    await audit(c.env, u.id, 'staff.login', 'user', u.id, {}, c.get('ip'));
  }
  return c.json(await meResponse(c));
});

auth.post('/logout', async (c) => { await destroySession(c); return c.json({ ok: true }); });
auth.get('/me', async (c) => c.json(await meResponse(c)));

auth.post('/forgot', async (c) => {
  const i = await body(c, z.object({ email }));
  await rateLimit(c.env, `forgot:${c.get('ip')}`, 5, 3600);
  await rateLimit(c.env, `forgot:${i.email}`, 3, 3600);
  const u = await c.env.DB.prepare("SELECT id FROM users WHERE email=? AND status='active'").bind(i.email).first<any>();
  if (u) {
    const token = randomToken(32);
    await c.env.DB.prepare('INSERT INTO password_reset_tokens(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await sha256Hex(token), u.id, addMinutes(30)).run();
    await sendEmail(c.env, i.email, 'Reset your Noorix password', `Use this link within 30 minutes:\n${c.env.SITE_URL}/reset-password?token=${token}\n\nIf you did not request this, ignore this message.`);
  }
  return c.json({ ok: true, message: 'If that email is registered, a reset link has been sent.' });   // same response either way
});

auth.post('/reset', async (c) => {
  const i = await body(c, z.object({ token: z.string().min(20).max(100), password }));
  await rateLimit(c.env, `reset:${c.get('ip')}`, 10, 3600);
  const h = await sha256Hex(i.token);
  const t = await c.env.DB.prepare('SELECT * FROM password_reset_tokens WHERE token_hash=?').bind(h).first<any>();
  if (!t || t.used_at || t.expires_at < new Date().toISOString()) throw bad('This reset link is invalid or has expired', 'bad_token');
  const [r] = await c.env.DB.batch([
    c.env.DB.prepare("UPDATE password_reset_tokens SET used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE token_hash=? AND used_at IS NULL").bind(h),
    c.env.DB.prepare('UPDATE users SET password_hash=? WHERE id=?').bind(await hashPassword(i.password), t.user_id),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(t.user_id),
  ]);
  if (!(r as any).meta.changes) throw bad('This reset link has already been used', 'bad_token');
  return c.json({ ok: true });
});

auth.post('/verify-email', async (c) => {
  const i = await body(c, z.object({ token: z.string().min(20).max(100) }));
  const h = await sha256Hex(i.token);
  const t = await c.env.DB.prepare('SELECT * FROM email_verification_tokens WHERE token_hash=?').bind(h).first<any>();
  if (!t || t.used_at || t.expires_at < new Date().toISOString()) throw bad('This verification link is invalid or has expired', 'bad_token');
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE email_verification_tokens SET used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE token_hash=?").bind(h),
    c.env.DB.prepare("UPDATE users SET email_verified_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(t.user_id),
  ]);
  return c.json({ ok: true });
});

auth.post('/resend-verification', requireAuth, async (c) => {
  const u = c.get('user')!;
  if (u.email_verified_at) return c.json({ ok: true });
  await rateLimit(c.env, `resend:${u.id}`, 3, 3600);
  await issueVerification(c, u.id, u.email);
  return c.json({ ok: true });
});

auth.post('/change-password', requireAuth, async (c) => {
  const u = c.get('user')!;
  const i = await body(c, z.object({ current: z.string().min(1).max(128), next: password }));
  await rateLimit(c.env, `chpw:${u.id}`, 10, 900);
  const row = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id=?').bind(u.id).first<any>();
  if (!(await verifyPassword(i.current, row.password_hash))) throw new AppError(400, 'invalid_credentials', 'Current password is incorrect');
  await c.env.DB.prepare('UPDATE users SET password_hash=? WHERE id=?').bind(await hashPassword(i.next), u.id).run();
  await destroyAllSessions(c.env, u.id, c.get('sessionId'));
  return c.json({ ok: true });
});

auth.patch('/profile', requireAuth, async (c) => {
  const u = c.get('user')!;
  const i = await body(c, z.object({ name: z.string().trim().min(2).max(80), phone: z.string().trim().max(20).optional().nullable() }));
  await c.env.DB.prepare("UPDATE users SET name=?, phone=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(i.name, i.phone ?? null, u.id).run();
  return c.json({ ok: true });
});

/** One-time Super Admin bootstrap, guarded by the SETUP_TOKEN secret. Works only while no Super Admin exists. */
export const setup = new Hono<HonoEnv>();
setup.post('/super-admin', async (c) => {
  if (!c.env.SETUP_TOKEN) throw new AppError(404, 'not_found', 'Not found');
  await rateLimit(c.env, `setup:${c.get('ip')}`, 10, 3600);
  const i = await body(c, z.object({ token: z.string().min(1), name: z.string().trim().min(2).max(80), email, password }));
  if (!timingSafeEqual(i.token, c.env.SETUP_TOKEN)) throw new AppError(403, 'forbidden', 'Invalid setup token');
  const id = uid();
  // single statement guards the race: only inserts when no super admin exists yet
  const exists = await c.env.DB.prepare("SELECT 1 x FROM user_roles WHERE role_id='role_super_admin' LIMIT 1").first();
  if (exists) throw conflict('A Super Admin already exists. This endpoint is now disabled.', 'already_setup');
  try {
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO users(id,email,name,password_hash,is_staff,email_verified_at) VALUES(?,?,?,?,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))").bind(id, i.email, i.name, await hashPassword(i.password)),
      c.env.DB.prepare('INSERT INTO wallet_accounts(user_id,balance) VALUES(?,0)').bind(id),
      c.env.DB.prepare("INSERT INTO user_roles(user_id,role_id) SELECT ?, 'role_super_admin' WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE role_id='role_super_admin')").bind(id),
      c.env.DB.prepare("INSERT INTO guards(ok,label) SELECT 0,'setup_race' WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id=? AND role_id='role_super_admin')").bind(id),
      c.env.DB.prepare('INSERT INTO admin_audit_logs(id,actor_id,action,entity_type,entity_id,ip) VALUES(?,?,?,?,?,?)').bind(uid(), id, 'setup.super_admin', 'user', id, c.get('ip')),
    ]);
  } catch (e) {
    if (String((e as Error).message).includes('UNIQUE')) throw conflict('That email is already registered', 'email_taken');
    throw conflict('Setup could not be completed (a Super Admin may already exist).', 'already_setup');
  }
  return c.json({ ok: true, message: 'Super Admin created. You can now sign in and should remove the SETUP_TOKEN secret.' }, 201);
});
