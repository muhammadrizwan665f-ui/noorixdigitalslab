import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { AuthUser, HonoEnv } from '../types';
import { randomToken, sha256Hex } from './crypto';
import { AppError, forbidden } from './http';

export const COOKIE = 'nx_session';
const SESSION_DAYS = 14;
const ROTATE_AFTER_MS = 12 * 3600_000;

const secureCookie = (c: Context<HonoEnv>) => new URL(c.req.url).protocol === 'https:';

function setSessionCookie(c: Context<HonoEnv>, token: string) {
  setCookie(c, COOKIE, token, { httpOnly: true, secure: secureCookie(c), sameSite: 'Lax', path: '/', maxAge: SESSION_DAYS * 86400 });
}

export async function createSession(c: Context<HonoEnv>, userId: string): Promise<void> {
  const token = randomToken(32);
  const id = await sha256Hex(token);
  const csrf = randomToken(24);
  const exp = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  await c.env.DB.prepare('INSERT INTO sessions(id,user_id,csrf_token,ip,user_agent,expires_at) VALUES(?,?,?,?,?,?)')
    .bind(id, userId, csrf, c.get('ip'), (c.req.header('user-agent') ?? '').slice(0, 200), exp).run();
  setSessionCookie(c, token);
}

export async function destroySession(c: Context<HonoEnv>): Promise<void> {
  const sid = c.get('sessionId');
  if (sid) await c.env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(sid).run();
  deleteCookie(c, COOKIE, { path: '/' });
}

export async function destroyAllSessions(env: { DB: D1Database }, userId: string, exceptId?: string | null) {
  await env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND id<>?').bind(userId, exceptId ?? '').run();
}

/** Loads session + user + permissions on every request (never throws on anonymous). */
export const loadSession: MiddlewareHandler<HonoEnv> = async (c, next) => {
  c.set('user', null); c.set('perms', new Set()); c.set('isSuper', false); c.set('sessionId', null); c.set('csrf', null);
  c.set('ip', c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0');
  const token = getCookie(c, COOKIE);
  if (token) {
    const id = await sha256Hex(token);
    const row = await c.env.DB.prepare(
      `SELECT s.id sid, s.csrf_token, s.expires_at, s.rotated_at, u.id, u.email, u.name, u.phone, u.status, u.is_staff, u.email_verified_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`).bind(id).first<any>();
    if (row && row.expires_at > new Date().toISOString() && row.status === 'active') {
      const user: AuthUser = { id: row.id, email: row.email, name: row.name, phone: row.phone, status: row.status, is_staff: row.is_staff, email_verified_at: row.email_verified_at };
      c.set('user', user); c.set('csrf', row.csrf_token); c.set('sessionId', row.sid);
      if (user.is_staff) {
        const rs = await c.env.DB.prepare(
          `SELECT r.code role, rp.permission_code perm FROM user_roles ur JOIN roles r ON r.id=ur.role_id
           LEFT JOIN role_permissions rp ON rp.role_id=r.id WHERE ur.user_id=?`).bind(user.id).all<any>();
        const perms = new Set<string>(); let sup = false;
        for (const r of rs.results) { if (r.role === 'super_admin') sup = true; if (r.perm) perms.add(r.perm); }
        c.set('perms', perms); c.set('isSuper', sup);
      }
      // session rotation: swap the cookie token periodically
      if (Date.now() - Date.parse(row.rotated_at) > ROTATE_AFTER_MS) {
        const nt = randomToken(32); const nid = await sha256Hex(nt);
        await c.env.DB.prepare("UPDATE sessions SET id=?, rotated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(nid, row.sid).run();
        c.set('sessionId', nid); setSessionCookie(c, nt);
      }
    } else if (row && row.status !== 'active') {
      await c.env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(id).run();
    }
  }
  await next();
};

/** CSRF: Origin must match host for any unsafe method; authenticated requests also need the token header. */
export const csrfGuard: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const m = c.req.method;
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return next();
  const path = new URL(c.req.url).pathname;
  if (path.startsWith('/api/payments/callback/')) return next();   // server-to-server, signature verified instead
  const origin = c.req.header('origin');
  if (origin) {
    let ok = false;
    try { ok = new URL(origin).host === new URL(c.req.url).host; } catch { /* invalid */ }
    if (!ok) throw new AppError(403, 'csrf', 'Cross-site request blocked');
  }
  if (c.get('user')) {
    const t = c.req.header('x-csrf-token');
    if (!t || t !== c.get('csrf')) throw new AppError(403, 'csrf', 'Missing or invalid CSRF token. Refresh the page and try again.');
  }
  await next();
};

export const requireAuth: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (!c.get('user')) throw new AppError(401, 'unauthenticated', 'Please sign in');
  await next();
};
export const requireStaff: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const u = c.get('user');
  if (!u) throw new AppError(401, 'unauthenticated', 'Please sign in');
  if (!u.is_staff) throw forbidden();
  await next();
};
export const can = (c: Context<HonoEnv>, perm: string) => c.get('isSuper') || c.get('perms').has(perm);
export const requirePerm = (perm: string): MiddlewareHandler<HonoEnv> => async (c, next) => {
  const u = c.get('user');
  if (!u) throw new AppError(401, 'unauthenticated', 'Please sign in');
  if (!u.is_staff || !can(c, perm)) throw forbidden();
  await next();
};
export const requireSuper: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const u = c.get('user');
  if (!u) throw new AppError(401, 'unauthenticated', 'Please sign in');
  if (!u.is_staff || !c.get('isSuper')) throw forbidden('Only a Super Admin can do that');
  await next();
};
