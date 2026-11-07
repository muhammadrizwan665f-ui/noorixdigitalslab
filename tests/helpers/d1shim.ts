// Test-only D1 + R2 shims backed by node:sqlite. NOT used in production.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const isRead = (sql: string) => /^\s*(select|with|pragma)\b/i.test(sql) || /\breturning\b/i.test(sql);
const norm = (p: unknown[]) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v)) as any[];

export class Stmt {
  constructor(private db: DatabaseSync, public sql: string, public params: unknown[] = []) {}
  bind(...p: unknown[]) { return new Stmt(this.db, this.sql, p); }
  _run() {
    const s = this.db.prepare(this.sql);
    if (isRead(this.sql)) {
      const results = s.all(...norm(this.params)) as any[];
      return { success: true, results, meta: { changes: 0, last_row_id: 0 } };
    }
    const r = s.run(...norm(this.params));
    return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  async run() { return this._run(); }
  async all() { return this._run(); }
  async first(col?: string) { const r = this._run().results[0] ?? null; return col && r ? (r as any)[col] : r; }
  async raw() { return this._run().results.map((r) => Object.values(r)); }
}

export class TestD1 {
  sqlite: DatabaseSync;
  constructor() { this.sqlite = new DatabaseSync(':memory:'); this.sqlite.exec('PRAGMA foreign_keys = ON;'); }
  prepare(sql: string) { return new Stmt(this.sqlite, sql); }
  async exec(sql: string) { this.sqlite.exec(sql); return { count: 1, duration: 0 }; }
  async batch(stmts: Stmt[]) {
    this.sqlite.exec('BEGIN');
    try {
      const out = stmts.map((s) => s._run());
      this.sqlite.exec('COMMIT');
      return out;
    } catch (e) {
      try { this.sqlite.exec('ROLLBACK'); } catch {}
      throw e;
    }
  }
  migrate(dir = join(import.meta.dirname, '../../migrations')) {
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) this.sqlite.exec(readFileSync(join(dir, f), 'utf8'));
  }
}

export class TestR2 {
  store = new Map<string, { body: Uint8Array; httpMetadata?: any }>();
  async put(key: string, value: ArrayBuffer | Uint8Array | string, opts?: any) {
    const body = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value as ArrayBuffer);
    this.store.set(key, { body, httpMetadata: opts?.httpMetadata });
  }
  async get(key: string) {
    const o = this.store.get(key); if (!o) return null;
    return { body: new Blob([o.body as any]).stream(), httpMetadata: o.httpMetadata, size: o.body.length, arrayBuffer: async () => o.body.buffer };
  }
  async delete(key: string) { this.store.delete(key); }
}
