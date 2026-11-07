export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public extra: Record<string, any> = {}) { super(message); }
}
let csrf = '';
export const setCsrf = (t: string) => { csrf = t || ''; };

export async function api<T = any>(method: string, path: string, data?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  if (data instanceof FormData) body = data; else if (data !== undefined) { body = JSON.stringify(data); headers['Content-Type'] = 'application/json'; }
  if (method !== 'GET' && csrf) headers['X-CSRF-Token'] = csrf;
  let res: Response;
  try { res = await fetch('/api' + path, { method, headers, body, credentials: 'same-origin' }); }
  catch { throw new ApiError(0, 'network', 'Network error. Check your connection and try again.'); }
  const json = await res.json().catch(() => null);
  if (!res.ok) { const e = json?.error ?? {}; const { code, message, ...extra } = e; throw new ApiError(res.status, code ?? 'error', message ?? `Request failed (${res.status})`, extra); }
  return json as T;
}
export const get = <T = any>(p: string) => api<T>('GET', p);
export const post = <T = any>(p: string, d: unknown = {}) => api<T>('POST', p, d);
export const put = <T = any>(p: string, d: unknown = {}) => api<T>('PUT', p, d);
export const del = <T = any>(p: string) => api<T>('DELETE', p);
export const patch = <T = any>(p: string, d: unknown = {}) => api<T>('PATCH', p, d);
