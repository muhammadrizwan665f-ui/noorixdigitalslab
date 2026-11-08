import { b64url, unb64, timingSafeEqual } from './crypto';

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export class GoogleAuthError extends Error {
  constructor(public code: string, message?: string) { super(message ?? code); }
}

/** Only same-site relative paths are allowed as post-login destinations (prevents open redirects). */
export function safeNext(n: unknown, fallback = '/dashboard'): string {
  if (typeof n !== 'string' || n.length === 0 || n.length > 300) return fallback;
  if (!n.startsWith('/') || n.startsWith('//') || n.includes('\\') || /[\x00-\x1f\x7f]/.test(n)) return fallback;
  if (n.startsWith('/api/') || n.startsWith('/files/')) return fallback;
  return n;
}

export const pkceChallenge = async (verifier: string) => b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));

export function buildAuthUrl(p: { clientId: string; redirectUri: string; state: string; nonce: string; challenge: string }): string {
  const u = new URL(GOOGLE_AUTH_URL);
  u.search = new URLSearchParams({
    client_id: p.clientId, redirect_uri: p.redirectUri, response_type: 'code', scope: 'openid email profile',
    state: p.state, nonce: p.nonce, code_challenge: p.challenge, code_challenge_method: 'S256', prompt: 'select_account',
  }).toString();
  return u.toString();
}

export async function exchangeCode(p: { clientId: string; clientSecret: string; redirectUri: string; code: string; verifier: string }): Promise<string> {
  let res: Response;
  try {
    res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: p.code, client_id: p.clientId, client_secret: p.clientSecret, redirect_uri: p.redirectUri, grant_type: 'authorization_code', code_verifier: p.verifier }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch { throw new GoogleAuthError('google_failed', 'token endpoint unreachable'); }
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || typeof data.id_token !== 'string') throw new GoogleAuthError('google_failed', `token exchange rejected: ${data?.error ?? res.status}`);
  return data.id_token;
}

let jwksCache: { keys: any[]; exp: number } | null = null;
export const resetJwksCache = () => { jwksCache = null; };
async function getKey(kid: string, force = false): Promise<any | null> {
  if (force || !jwksCache || jwksCache.exp < Date.now()) {
    const res = await fetch(GOOGLE_JWKS_URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new GoogleAuthError('google_failed', 'could not load Google signing keys');
    const j: any = await res.json();
    jwksCache = { keys: Array.isArray(j.keys) ? j.keys : [], exp: Date.now() + 3600_000 };
  }
  return jwksCache.keys.find((k) => k.kid === kid) ?? null;
}

export type GoogleClaims = { sub: string; email: string; name: string; picture?: string };

/** Verifies the RS256 signature against Google's published keys, then iss / aud / exp / nonce / verified email. */
export async function verifyIdToken(idToken: string, o: { clientId: string; nonce: string; now?: number }): Promise<GoogleClaims> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new GoogleAuthError('google_failed', 'malformed id_token');
  const dec = (s: string) => JSON.parse(new TextDecoder().decode(unb64(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='))));
  let header: any, claims: any;
  try { header = dec(parts[0]); claims = dec(parts[1]); } catch { throw new GoogleAuthError('google_failed', 'undecodable id_token'); }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new GoogleAuthError('google_failed', 'unsupported id_token algorithm');

  let jwk = await getKey(header.kid);
  if (!jwk) jwk = await getKey(header.kid, true);          // Google rotates keys: refetch once
  if (!jwk) throw new GoogleAuthError('google_failed', 'unknown signing key');
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const sig = unb64(parts[2].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parts[2].length / 4) * 4, '='));
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig as BufferSource, new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new GoogleAuthError('google_failed', 'bad id_token signature');

  const now = Math.floor((o.now ?? Date.now()) / 1000);
  if (!ISSUERS.includes(claims.iss)) throw new GoogleAuthError('google_failed', 'wrong issuer');
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(o.clientId) || (aud.length > 1 && claims.azp !== o.clientId)) throw new GoogleAuthError('google_failed', 'wrong audience');
  if (typeof claims.exp !== 'number' || claims.exp < now - 30) throw new GoogleAuthError('google_failed', 'id_token expired');
  if (typeof claims.iat === 'number' && claims.iat > now + 300) throw new GoogleAuthError('google_failed', 'id_token issued in the future');
  if (typeof claims.nonce !== 'string' || !timingSafeEqual(claims.nonce, o.nonce)) throw new GoogleAuthError('google_state', 'nonce mismatch');
  if (typeof claims.sub !== 'string' || !claims.sub) throw new GoogleAuthError('google_failed', 'missing subject');
  if (typeof claims.email !== 'string' || !claims.email) throw new GoogleAuthError('google_unverified_email', 'no email');
  if (claims.email_verified !== true && claims.email_verified !== 'true') throw new GoogleAuthError('google_unverified_email', 'email not verified by Google');
  const email = claims.email.trim().toLowerCase();
  const name = String(claims.name || claims.given_name || email.split('@')[0]).trim();
  return { sub: claims.sub, email, name, picture: typeof claims.picture === 'string' ? claims.picture : undefined };
}
