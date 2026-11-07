import type { Env } from '../types';
import { uid } from './crypto';

export function notifyStmt(env: Env, userId: string, type: string, title: string, body = '', link: string | null = null) {
  return env.DB.prepare('INSERT INTO notifications(id,user_id,type,title,body,link) VALUES(?,?,?,?,?,?)').bind(uid(), userId, type, title, body, link);
}
export async function notify(env: Env, userId: string, type: string, title: string, body = '', link: string | null = null) {
  await notifyStmt(env, userId, type, title, body, link).run();
}

export function auditStmt(env: Env, actorId: string | null, action: string, entityType: string | null, entityId: string | null, details: unknown = {}, ip: string | null = null) {
  return env.DB.prepare('INSERT INTO admin_audit_logs(id,actor_id,action,entity_type,entity_id,details,ip) VALUES(?,?,?,?,?,?,?)')
    .bind(uid(), actorId, action, entityType, entityId, JSON.stringify(details ?? {}), ip);
}
export async function audit(env: Env, actorId: string | null, action: string, entityType: string | null = null, entityId: string | null = null, details: unknown = {}, ip: string | null = null) {
  await auditStmt(env, actorId, action, entityType, entityId, details, ip).run();
}

/**
 * Email adapter. Always writes the outbox row; sends through Resend only when EMAIL_API_KEY is set.
 * Without a key the message is stored as 'skipped' (visible in the admin Settings > Email log).
 */
export async function sendEmail(env: Env, to: string, subject: string, body: string): Promise<'sent' | 'skipped' | 'failed'> {
  const id = uid();
  let status: 'sent' | 'skipped' | 'failed' = 'skipped'; let error: string | null = null;
  if (env.EMAIL_API_KEY && env.EMAIL_FROM) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${env.EMAIL_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text: body }),
      });
      if (r.ok) status = 'sent'; else { status = 'failed'; error = `HTTP ${r.status}`; }
    } catch (e) { status = 'failed'; error = String((e as Error).message).slice(0, 200); }
  }
  await env.DB.prepare('INSERT INTO email_outbox(id,to_email,subject,body,status,error) VALUES(?,?,?,?,?,?)').bind(id, to, subject, body, status, error).run();
  return status;
}

export async function getSettings(env: Env): Promise<Record<string, string>> {
  const r = await env.DB.prepare('SELECT key,value FROM site_settings').all<{ key: string; value: string }>();
  return Object.fromEntries(r.results.map((x) => [x.key, x.value]));
}

/** Public brand name: Admin → Settings "brand_name", falling back to the SITE_NAME var. */
export async function brandName(env: Env): Promise<string> { return (await getSettings(env)).brand_name?.trim() || env.SITE_NAME; }
