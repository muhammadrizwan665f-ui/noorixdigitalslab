import type { Env } from '../types';
import { AppError } from './http';

/** Fixed-window limiter in D1. Throws 429 when exceeded. */
export async function rateLimit(env: Env, key: string, limit: number, windowSec: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits(key,count,window_start) VALUES(?,1,?)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN window_start <= ? THEN 1 ELSE count + 1 END,
       window_start = CASE WHEN window_start <= ? THEN ? ELSE window_start END
     RETURNING count`
  ).bind(key, now, now - windowSec, now - windowSec, now).first<{ count: number }>();
  if (row && row.count > limit) throw new AppError(429, 'rate_limited', 'Too many attempts. Please wait a few minutes and try again.');
}
