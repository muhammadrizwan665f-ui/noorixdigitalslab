import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../worker/index';
import { Client, makeEnv, newCustomer, newStaff } from './helpers/app';

test('brand name and social links are editable in settings and exposed publicly', async () => {
  const env = makeEnv({ SITE_NAME: 'B-MART' }); const app = createApp(); const root = await newStaff(app, env, ['root']);
  assert.equal((await root.put('/api/admin/settings', { brand_name: 'New Name', brand_tagline: 'Fresh tagline', social_facebook: 'https://facebook.com/x' })).status, 200);
  const s = (await new Client(app, env).get('/api/public/settings')).json;
  assert.equal(s.brand_name, 'New Name'); assert.equal(s.brand_tagline, 'Fresh tagline'); assert.equal(s.social_facebook, 'https://facebook.com/x');
  // social links must be https URLs; brand name cannot be blank
  assert.equal((await root.put('/api/admin/settings', { social_x: 'javascript:alert(1)' })).status, 400);
  assert.equal((await root.put('/api/admin/settings', { brand_name: ' ' })).status, 400);
});

test('transactional emails use the configured brand name', async () => {
  const env = makeEnv({ SITE_NAME: 'B-MART' }); const app = createApp(); const root = await newStaff(app, env, ['root']);
  await root.put('/api/admin/settings', { brand_name: 'Renamed Mart' });
  const { email } = await newCustomer(app, env);
  const m = await env.DB.prepare("SELECT subject FROM email_outbox WHERE to_email=? AND subject LIKE 'Verify%'").bind(email).first();
  assert.equal(m.subject, 'Verify your Renamed Mart email');
});

test('home feed lists best sellers only when products have sales', async () => {
  const env = makeEnv(); const app = createApp(); const c = new Client(app, env);
  const h = (await c.get('/api/public/home')).json; assert.ok(Array.isArray(h.bestSellers)); assert.equal(h.bestSellers.length, 0);
});
