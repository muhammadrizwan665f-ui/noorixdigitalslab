import type { Env } from '../types';
import { AppError, bad } from './http';
import { uid } from './crypto';

const MAGIC: Record<string, (b: Uint8Array) => boolean> = {
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45,
  'application/pdf': (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
  'application/zip': (b) => b[0] === 0x50 && b[1] === 0x4b,
  'text/plain': () => true,
};
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf', 'application/zip': 'zip', 'text/plain': 'txt' };

/** Validates a multipart upload (size + declared type + magic bytes) and stores it in R2. */
export async function storeUpload(env: Env, form: FormData, o: { field?: string; prefix: string; allowed: string[]; maxBytes: number }) {
  const f = form.get(o.field ?? 'file');
  if (!(f instanceof File)) throw bad('No file was uploaded');
  if (f.size === 0) throw bad('The file is empty');
  if (f.size > o.maxBytes) throw new AppError(413, 'too_large', `File is too large (max ${Math.round(o.maxBytes / 1024 / 1024 * 10) / 10} MB)`);
  const type = f.type;
  if (!o.allowed.includes(type)) throw bad(`File type not allowed. Allowed: ${o.allowed.map((t) => EXT[t]).join(', ')}`, 'bad_type');
  const buf = new Uint8Array(await f.arrayBuffer());
  if (!MAGIC[type]?.(buf)) throw bad('File content does not match its type', 'bad_type');
  const key = `${o.prefix}${uid()}.${EXT[type]}`;
  await env.FILES.put(key, buf, { httpMetadata: { contentType: type } });
  const safeName = f.name.replace(/[^\w.\- ]+/g, '_').slice(0, 80);
  return { key, name: safeName, type, size: f.size };
}
export const IMAGES = ['image/png', 'image/jpeg', 'image/webp'];
export const PROOF_TYPES = [...IMAGES, 'application/pdf'];
export const DELIVERY_TYPES = [...IMAGES, 'application/pdf', 'application/zip', 'text/plain'];

export async function serveObject(env: Env, key: string, download = false): Promise<Response> {
  const o = await env.FILES.get(key);
  if (!o) return new Response('Not found', { status: 404 });
  const h = new Headers();
  h.set('Content-Type', o.httpMetadata?.contentType ?? 'application/octet-stream');
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  if (download || o.httpMetadata?.contentType === 'application/pdf') h.set('Content-Disposition', 'attachment');
  return new Response(o.body as ReadableStream, { headers: h });
}
