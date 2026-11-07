// Typecheck-only stand-ins for @cloudflare/workers-types (not installable in the sandbox). Real builds use the real package.
interface D1Result<T = any> { results: T[]; success: boolean; meta: { changes: number; last_row_id: number } }
interface D1PreparedStatement { bind(...v: any[]): D1PreparedStatement; first<T = any>(col?: string): Promise<T | null>; all<T = any>(): Promise<D1Result<T>>; run(): Promise<D1Result>; }
interface D1Database { prepare(q: string): D1PreparedStatement; batch<T = any>(s: D1PreparedStatement[]): Promise<D1Result<T>[]>; exec(q: string): Promise<any>; }
interface R2Bucket { put(k: string, v: any, o?: any): Promise<any>; get(k: string): Promise<any>; delete(k: string): Promise<void>; }
interface Fetcher { fetch(r: Request): Promise<Response>; }
interface ExecutionContext { waitUntil(p: Promise<any>): void; }
interface ScheduledController {}
