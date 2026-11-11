import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contactFrom, fmtPhone, BRAND_DEFAULTS } from '../src/lib/brand';
import { policyFallback } from '../src/lib/policies';
import { makeEnv } from './helpers/app';

const brand = { name: BRAND_DEFAULTS.name, tagline: '', parent: BRAND_DEFAULTS.parent, slogan: '' };

test('phone is shown as +92 315 4429417 and contact defaults match the business details', () => {
  assert.equal(fmtPhone('923154429417'), '+92 315 4429417');
  const c = contactFrom({});
  assert.deepEqual({ ...c }, { whatsapp: '923154429417', phone: '+92 315 4429417', email: 'noorixdigitals@gmail.com', address: '3rd Floor, H-Mall, Shalimar Link Road, Lahore, Pakistan' });
  assert.equal(contactFrom({ whatsapp: '+92 300 1112223', support_email: 'a@b.pk', contact_address: 'X' }).phone, '+92 300 1112223');
});

test('Return and Digital Delivery policies exist, carry the contact details and make no registration/legal-number claims', () => {
  const c = contactFrom({});
  for (const slug of ['return', 'delivery']) {
    const p = policyFallback(slug, brand, c)!;
    assert.ok(p.title && p.body.length > 500, slug);
    for (const must of [c.address, c.email, c.phone]) assert.ok(p.body.includes(must), `${slug} must include ${must}`);
    assert.ok(!/DRAFT|NTN|SECP|registration (no|number)|licen[cs]e no/i.test(p.body.replace('software licences', '')), `${slug} must not invent legal claims`);
  }
  assert.equal(policyFallback('return', brand, c)!.title, 'Return Policy');
  assert.equal(policyFallback('delivery', brand, c)!.title, 'Digital Delivery / Service Policy');
  assert.equal(policyFallback('nope', brand, c), null);
});

test('migration 0004 sets WhatsApp, support email and address, and is safe to run twice', async () => {
  const env = makeEnv(); const sql = readFileSync(join(import.meta.dirname, '../migrations/0004_contact_details.sql'), 'utf8');
  await env.DB.prepare("UPDATE site_settings SET value='923000000000' WHERE key='whatsapp'").run();
  for (let i = 0; i < 2; i++) (env.DB as any).sqlite.exec(sql);
  const rows = Object.fromEntries((await env.DB.prepare("SELECT key,value FROM site_settings WHERE key IN ('whatsapp','support_email','contact_address')").all()).results.map((r: any) => [r.key, r.value]));
  assert.deepEqual(rows, { whatsapp: '923154429417', support_email: 'noorixdigitals@gmail.com', contact_address: '3rd Floor, H-Mall, Shalimar Link Road, Lahore, Pakistan' });
});
