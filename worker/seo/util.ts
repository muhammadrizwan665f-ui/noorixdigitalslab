export const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** JSON for an inline <script>: "<" is escaped so data can never close the tag. */
export const jsonLd = (o: unknown) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
export const clip = (s: string, n: number) => { const t = s.replace(/\s+/g, ' ').trim(); if (t.length <= n) return t; const c = t.slice(0, n - 1); const i = c.lastIndexOf(' '); return (i > n * 0.6 ? c.slice(0, i) : c).replace(/[ ,.;:–—-]+$/, '') + '…'; };
export const pkr = (paisa: number) => `PKR ${(paisa / 100).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
export const money = (paisa: number) => (paisa / 100).toFixed(2);
