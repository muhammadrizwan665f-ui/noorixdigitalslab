import type { Env } from '../types';
import { uid } from '../lib/crypto';
import { deliverItem, markItemFailed } from './delivery';
import { NOW } from './sql';

const MAX_ATTEMPTS = 5;
export const providerSecretName = (code: string) => `PROVIDER_${code.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_KEY`;

async function log(env: Env, itemId: string, providerId: string | null, attempt: number, status: string, p: { req?: string; res?: string; err?: string; next?: string | null } = {}) {
  await env.DB.prepare('INSERT INTO provider_order_logs(id,order_item_id,provider_id,attempt,status,request_summary,response_summary,error,next_retry_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind(uid(), itemId, providerId, attempt, status, p.req ?? null, (p.res ?? '').slice(0, 500) || null, p.err ?? null, p.next ?? null).run();
}

/**
 * Sends an API-delivery item to its provider. Never marks the item complete unless the provider confirms.
 * Contract for the Generic HTTP provider (documented in docs/INTEGRATIONS.md):
 *   POST {base_url}{createPath}  { reference, sku, input }  ->  { status: 'completed'|'processing'|'failed', ref?, delivery?: string }
 */
export async function dispatchProvider(env: Env, itemId: string): Promise<void> {
  const it = await env.DB.prepare(
    `SELECT i.id, i.status, i.customer_input, i.provider_ref, pl.provider_sku, p.provider_id, pr.code, pr.base_url, pr.enabled, pr.config
     FROM order_items i JOIN product_plans pl ON pl.id=i.plan_id JOIN products p ON p.id=i.product_id
     LEFT JOIN provider_integrations pr ON pr.id=p.provider_id WHERE i.id=?`).bind(itemId).first<any>();
  if (!it || it.status !== 'processing') return;
  const prev = await env.DB.prepare('SELECT COALESCE(MAX(attempt),0) n FROM provider_order_logs WHERE order_item_id=?').bind(itemId).first<{ n: number }>();
  const attempt = (prev?.n ?? 0) + 1;
  const key = it.code ? (env[providerSecretName(it.code)] as string | undefined) : undefined;
  if (!it.provider_id || !it.enabled || !it.base_url || !key) {
    await log(env, itemId, it.provider_id ?? null, attempt, 'awaiting_credentials', { err: 'Provider is not configured/enabled or its API key secret is missing. Order stays in Processing for manual handling.' });
    return;
  }
  const cfg = JSON.parse(it.config || '{}');
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), cfg.timeoutMs ?? 10000);
  const req = JSON.stringify({ reference: itemId, sku: it.provider_sku, input: JSON.parse(it.customer_input || '{}') });
  try {
    const res = it.provider_ref
      ? await fetch(`${it.base_url}${(cfg.statusPath ?? '/orders/{ref}').replace('{ref}', encodeURIComponent(it.provider_ref))}`, { headers: { Authorization: `Bearer ${key}` }, signal: ctl.signal })
      : await fetch(`${it.base_url}${cfg.createPath ?? '/orders'}`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': itemId }, body: req, signal: ctl.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = JSON.parse(text) as { status?: string; ref?: string; delivery?: string };
    if (j.status === 'completed' && j.delivery) {
      await log(env, itemId, it.provider_id, attempt, 'confirmed', { req, res: text });
      await deliverItem(env, itemId, null, null, { text: j.delivery, note: 'Delivered by provider' });
    } else if (j.status === 'failed') {
      await log(env, itemId, it.provider_id, attempt, 'failed', { req, res: text, err: 'Provider reported failure' });
      await markItemFailed(env, itemId, null, null, 'Provider reported failure');
    } else {
      if (j.ref) await env.DB.prepare('UPDATE order_items SET provider_ref=? WHERE id=?').bind(j.ref, itemId).run();
      await log(env, itemId, it.provider_id, attempt, 'sent', { req, res: text, next: new Date(Date.now() + 5 * 60_000).toISOString() });
    }
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 200);
    if (attempt >= MAX_ATTEMPTS) {
      await log(env, itemId, it.provider_id, attempt, 'failed', { req, err: `Gave up after ${attempt} attempts: ${msg}` });
      await markItemFailed(env, itemId, null, null, 'Provider unreachable after retries');
    } else {
      await log(env, itemId, it.provider_id, attempt, 'retry', { req, err: msg, next: new Date(Date.now() + attempt * attempt * 5 * 60_000).toISOString() });
    }
  } finally { clearTimeout(t); }
}

/** Cron: retry/poll provider items whose next_retry_at has passed. */
export async function runProviderRetries(env: Env): Promise<number> {
  const due = await env.DB.prepare(
    `SELECT DISTINCT l.order_item_id id FROM provider_order_logs l JOIN order_items i ON i.id=l.order_item_id
     WHERE i.status='processing' AND l.status IN ('retry','sent') AND l.next_retry_at <= ${NOW}
       AND l.created_at = (SELECT MAX(created_at) FROM provider_order_logs WHERE order_item_id=l.order_item_id) LIMIT 25`).all<{ id: string }>();
  for (const r of due.results) await dispatchProvider(env, r.id);
  return due.results.length;
}
