import { createApp } from '../../worker/index';
import { TestD1, TestR2 } from './d1shim';

export const KEY = Buffer.alloc(32, 7).toString('base64');
export function makeEnv(extra: Record<string, unknown> = {}) {
  const db = new TestD1(); db.migrate();
  return { DB: db, FILES: new TestR2(), SITE_URL: 'http://localhost', SITE_NAME: 'NOORIX', WHATSAPP: '923154429417', ENCRYPTION_KEY: KEY, SETUP_TOKEN: 'setup-secret-123', ...extra } as any;
}

export class Client {
  cookie = ''; csrf = '';
  constructor(public app: ReturnType<typeof createApp>, public env: any, public ip = '10.0.0.' + Math.floor(Math.random() * 200 + 1)) {}
  async req(method: string, path: string, data?: unknown, extra: Record<string, string> = {}) {
    const h: Record<string, string> = { origin: 'http://localhost', 'cf-connecting-ip': this.ip, ...extra };
    if (this.cookie) h.cookie = this.cookie;
    if (this.csrf) h['x-csrf-token'] = this.csrf;
    let body: any;
    if (data instanceof FormData) body = data; else if (data !== undefined) { body = JSON.stringify(data); h['content-type'] = 'application/json'; }
    const res = await this.app.fetch(new Request('http://localhost' + path, { method, headers: h, body }), this.env);
    const sc = res.headers.get('set-cookie');
    if (sc) { const m = /nx_session=([^;]*)/.exec(sc); if (m) this.cookie = m[1] ? `nx_session=${m[1]}` : ''; }
    let json: any = null; const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('json')) json = await res.json(); else await res.arrayBuffer();
    if (json?.csrf) this.csrf = json.csrf;
    return { status: res.status, json, headers: res.headers };
  }
  get = (p: string) => this.req('GET', p);
  post = (p: string, d?: unknown) => this.req('POST', p, d ?? {});
  put = (p: string, d?: unknown) => this.req('PUT', p, d ?? {});
  del = (p: string) => this.req('DELETE', p);
}

let n = 0;
export async function newCustomer(app: any, env: any, name = 'Test User') {
  const c = new Client(app, env);
  const email = `user${++n}@example.com`;
  const r = await c.post('/api/auth/register', { name, email, password: 'Password123!' });
  if (r.status !== 201) throw new Error('register failed ' + JSON.stringify(r.json));
  return { c, email, id: r.json.user.id as string };
}
export async function newStaff(app: any, env: any, roles: string[]) {
  const sa = new Client(app, env);
  // first staff is created through the one-time setup endpoint, others via the staff API
  const exists = await env.DB.prepare("SELECT 1 x FROM user_roles WHERE role_id='role_super_admin'").first();
  if (!exists) {
    const r = await sa.post('/api/setup/super-admin', { token: 'setup-secret-123', name: 'Root', email: 'root@noorix.test', password: 'RootPassword123' });
    if (r.status !== 201) throw new Error('setup failed ' + JSON.stringify(r.json));
  }
  const root = new Client(app, env);
  const lr = await root.post('/api/auth/login', { email: 'root@noorix.test', password: 'RootPassword123' });
  if (lr.status !== 200) throw new Error('root login ' + JSON.stringify(lr.json));
  if (roles.includes('root')) return root;
  const email = `staff${++n}@noorix.test`;
  const cr = await root.post('/api/admin/staff', { name: 'Staff', email, password: 'StaffPassword123', roles });
  if (cr.status !== 201) throw new Error('staff create ' + JSON.stringify(cr.json));
  const s = new Client(app, env); await s.post('/api/auth/login', { email, password: 'StaffPassword123' });
  return s;
}
export const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])], 'x.png', { type: 'image/png' });
