// Local E2E server: real Worker app + in-memory D1/R2 shims + static SPA build. Test-only.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createApp } from '../../worker/index';
import { makeEnv } from '../helpers/app';
import { hashPassword } from '../../worker/lib/crypto';

const WEB = join(import.meta.dirname, '../../.scratch/web');
const TYPES: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.html': 'text/html' };
const env = makeEnv();
env.ASSETS = { async fetch(req: Request) {
  const p = new URL(req.url).pathname; let f = join(WEB, p);
  if (!existsSync(f) || p === '/' || !extname(p)) f = join(WEB, 'index.html');
  return new Response(readFileSync(f), { headers: { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' } });
} };
// bootstrap: super admin + enabled Easypaisa (test only)
const db = env.DB;
const rootId = 'root-1';
db.sqlite.exec(`INSERT INTO users(id,email,name,password_hash,is_staff,email_verified_at) VALUES('${rootId}','root@noorix.test','Root Admin','${await hashPassword('RootPassword123')}',1,datetime('now'));
 INSERT INTO wallet_accounts(user_id) VALUES('${rootId}'); INSERT INTO user_roles VALUES('${rootId}','role_super_admin');
 UPDATE payment_methods SET enabled=1, account_title='Noorix Test', account_number='0300-1234567' WHERE code='easypaisa';
 INSERT INTO product_inventory(id,plan_id,secret_enc,secret_hash) VALUES('x','pln_canva-pro_0','v1.x','h');`);
db.sqlite.exec("DELETE FROM product_inventory");
const app = createApp();
createServer(async (req, res) => {
  const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
  const url = `http://${req.headers.host}${req.url}`;
  const r = await app.fetch(new Request(url, { method: req.method, headers: req.headers as any, body: ['GET', 'HEAD'].includes(req.method!) ? undefined : Buffer.concat(chunks) }), env);
  const h: Record<string, string | string[]> = {}; r.headers.forEach((v, k) => { if (k !== 'set-cookie') h[k] = v; });
  const sc = (r.headers as any).getSetCookie?.(); if (sc?.length) h['set-cookie'] = sc;
  res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(8799, () => console.log('E2E server on 8799'));
