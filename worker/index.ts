import { Hono } from 'hono';
import type { HonoEnv, Env } from './types';
import { AppError } from './lib/http';
import { csrfGuard, loadSession } from './lib/auth';
import { auth, setup } from './routes/auth';
import { googleAuth } from './routes/google';
import { pub, seo } from './routes/public';
import { account, files } from './routes/account';
import { ops } from './routes/admin_ops';
import { manage } from './routes/admin_manage';
import { serveObject } from './lib/files';
import { runProviderRetries } from './services/providers';
import { getSettings } from './lib/notify';

export function createApp() {
  const app = new Hono<HonoEnv>();

  app.use('*', async (c, next) => {
    await next();
    const h = c.res.headers;
    h.set('X-Content-Type-Options', 'nosniff');
    h.set('X-Frame-Options', 'DENY');
    h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    const path = new URL(c.req.url).pathname;
    if (path.startsWith('/api/')) {
      // Anonymous catalogue reads may be reused by the browser briefly (faster repeat visits / back navigation); everything else is never cached.
      const publicRead = c.req.method === 'GET' && c.res.status === 200 && !c.get('user') && /^\/api\/public\/(home|categories|products)/.test(path);
      h.set('Cache-Control', publicRead ? 'private, max-age=30, stale-while-revalidate=120' : 'no-store');
    }
  });

  app.onError((err, c) => {
    if (err instanceof AppError) return c.json({ error: { code: err.code, message: err.message, ...(err as any).extra } }, err.status as any);
    console.error('Unhandled error', err);
    return c.json({ error: { code: 'internal', message: 'Something went wrong on our side. Please try again.' } }, 500);
  });

  app.get('/api/health', async (c) => {
    const r = await c.env.DB.prepare('SELECT 1 ok').first();
    return c.json({ ok: !!r, time: new Date().toISOString() });
  });

  app.use('/api/*', loadSession);
  app.use('/api/*', csrfGuard);
  // maintenance mode blocks storefront mutations for customers (staff still work)
  app.use('/api/account/orders', async (c, next) => {
    if (c.req.method === 'POST' && (await getSettings(c.env)).maintenance === '1' && !c.get('user')?.is_staff) throw new AppError(503, 'maintenance', 'The store is under maintenance. Please try again shortly.');
    await next();
  });

  app.route('/api/auth/google', googleAuth);
  app.route('/api/auth', auth);
  app.route('/api/setup', setup);
  app.route('/api/public', pub);
  app.route('/api/account', account);
  app.route('/api/files', files);
  app.route('/api/admin', ops);
  app.route('/api/admin', manage);

  // PayFast: callback endpoint stays closed until merchant credentials + documented signature scheme are configured.
  app.all('/api/payments/callback/:provider', async (c) => {
    if (c.req.param('provider') !== 'payfast' || !c.env.PAYFAST_MERCHANT_ID || !c.env.PAYFAST_SECURED_KEY)
      return c.json({ error: { code: 'not_configured', message: 'Gateway is awaiting merchant credentials' } }, 503);
    return c.json({ error: { code: 'not_implemented', message: 'PayFast signature verification must be completed against your merchant documentation before enabling (see docs/INTEGRATIONS.md)' } }, 501);
  });

  app.route('/', seo);
  // public images only (products/banners)
  app.get('/files/img/:name', async (c) => {
    const r = await serveObject(c.env, `img/${c.req.param('name')}`);
    if (r.ok) r.headers.set('Cache-Control', 'public, max-age=86400');
    return r;
  });
  app.all('/api/*', (c) => c.json({ error: { code: 'not_found', message: 'Unknown API route' } }, 404));
  app.notFound((c) => (c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.text('Not found', 404)));
  return app;
}

const app = createApp();
export default {
  fetch: app.fetch,
  async scheduled(_e: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil((async () => {
      await runProviderRetries(env);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM sessions WHERE expires_at < strftime('%Y-%m-%dT%H:%M:%fZ','now')"),
        env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(Math.floor(Date.now() / 1000) - 86400),
        env.DB.prepare("DELETE FROM password_reset_tokens WHERE expires_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')"),
      ]);
    })());
  },
};
