// Web-Crypto only (Workers compatible). No Node modules.
const enc = new TextEncoder();
const dec = new TextDecoder();

export const b64 = (buf: ArrayBuffer | Uint8Array): string => {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ''; for (const b of u) s += String.fromCharCode(b);
  return btoa(s);
};
export const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const b64url = (u: Uint8Array) => b64(u).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function randomToken(bytes = 32): string { return b64url(crypto.getRandomValues(new Uint8Array(bytes))); }
export const uid = (): string => crypto.randomUUID();

const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function randomCode(len: number): string {
  const r = crypto.getRandomValues(new Uint8Array(len));
  let s = ''; for (const b of r) s += ALPHA[b % ALPHA.length];
  return s;
}

export async function sha256Hex(s: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqual(a: string, b: string): boolean {
  const x = enc.encode(a), y = enc.encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

// Workers cap PBKDF2 at 100,000 iterations.
const ITER = 100_000;
async function pbkdf2(pw: string, salt: Uint8Array, iter: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: iter }, key, 256));
}
export async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(await pbkdf2(pw, salt, ITER))}`;
}
export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, it, s, h] = stored.split('$');
  if (alg !== 'pbkdf2' || !it || !s || !h) return false;
  const got = b64(await pbkdf2(pw, unb64(s), Math.min(parseInt(it, 10) || ITER, ITER)));
  return timingSafeEqual(got, h);
}

async function aesKey(secret: string | undefined): Promise<CryptoKey> {
  if (!secret) throw new Error('ENCRYPTION_KEY secret is not configured');
  const raw = unb64(secret);
  if (raw.length !== 32) throw new Error('ENCRYPTION_KEY must be base64 of exactly 32 bytes');
  return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, ['encrypt', 'decrypt']);
}
export async function encryptSecret(secret: string | undefined, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), enc.encode(plain)));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return 'v1.' + b64(out);
}
export async function decryptSecret(secret: string | undefined, blob: string): Promise<string> {
  if (!blob.startsWith('v1.')) throw new Error('Unknown ciphertext format');
  const all = unb64(blob.slice(3));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) as BufferSource }, await aesKey(secret), all.slice(12) as BufferSource);
  return dec.decode(pt);
}

export async function hmacSha256Hex(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
