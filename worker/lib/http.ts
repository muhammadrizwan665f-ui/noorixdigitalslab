import type { Context } from 'hono';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import type { HonoEnv } from '../types';

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export const bad = (m: string, code = 'bad_request') => new AppError(400, code, m);
export const notFound = (m = 'Not found') => new AppError(404, 'not_found', m);
export const forbidden = (m = 'You do not have permission to do that') => new AppError(403, 'forbidden', m);
export const conflict = (m: string, code = 'conflict') => new AppError(409, code, m);

export async function body<S extends ZodTypeAny>(c: Context<HonoEnv>, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try { raw = await c.req.json(); } catch { throw bad('Request body must be valid JSON'); }
  return parse(schema, raw);
}
export function parse<S extends ZodTypeAny>(schema: S, raw: unknown): z.infer<S> {
  try { return schema.parse(raw); } catch (e) {
    if (e instanceof ZodError) {
      const i = e.issues[0];
      throw bad(`${i.path.join('.') || 'input'}: ${i.message}`, 'validation_error');
    }
    throw e;
  }
}
export const isoNow = () => new Date().toISOString();
export const addMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

export function csvEscape(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;       // neutralise spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const toCsv = (rows: Record<string, unknown>[], cols: string[]) =>
  [cols.join(','), ...rows.map((r) => cols.map((c) => csvEscape(r[c])).join(','))].join('\r\n');

export const pkr = (paisa: number) => `PKR ${(paisa / 100).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
