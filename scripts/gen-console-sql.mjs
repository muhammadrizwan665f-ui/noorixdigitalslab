// Builds comment-free, one-statement-per-line chunks for pasting into the Cloudflare D1 dashboard console.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
const strip = (s) => s.split('\n').map((l) => l.replace(/\s--\s.*$/, '').replace(/^\s*--.*$/, '')).join('\n');
const all = ['0001_init.sql', '0002_seed.sql'].map((f) => strip(readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8'))).join('\n');
// split on ';' at statement ends, keeping CREATE TRIGGER ... BEGIN ... END; together
const stmts = []; let cur = '';
for (const line of all.split('\n')) {
  if (!line.trim()) continue; cur += (cur ? ' ' : '') + line.trim();
  const inTrigger = /^CREATE TRIGGER/i.test(cur) && !/END;$/.test(cur);
  if (cur.endsWith(';') && !inTrigger) { stmts.push(cur); cur = ''; }
}
const clean = stmts.filter((s) => !/^PRAGMA/i.test(s));
const triggers = clean.filter((s) => /^CREATE TRIGGER/i.test(s)); const rest = clean.filter((s) => !/^CREATE TRIGGER/i.test(s));
rmSync(new URL('../d1-console', import.meta.url), { recursive: true, force: true }); mkdirSync(new URL('../d1-console', import.meta.url));
const schema = rest.filter((s) => /^(CREATE|DROP)/i.test(s)), data = rest.filter((s) => /^INSERT/i.test(s));
const write = (n, a) => writeFileSync(new URL(`../d1-console/${n}.sql`, import.meta.url), a.join('\n') + '\n');
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
chunk(schema, 25).forEach((c, i) => write(`${String(i + 1).padStart(2, '0')}-tables-${i + 1}`, c));
const k = Math.ceil(schema.length / 25);
write(`${String(k + 1).padStart(2, '0')}-ledger-triggers`, triggers);
chunk(data, 40).forEach((c, i) => write(`${String(k + 2 + i).padStart(2, '0')}-data-${i + 1}`, c));
console.log({ schema: schema.length, triggers: triggers.length, data: data.length });
