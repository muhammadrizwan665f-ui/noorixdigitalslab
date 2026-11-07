export const pkr = (paisa: number | null | undefined) => 'PKR ' + ((paisa ?? 0) / 100).toLocaleString('en-PK', { maximumFractionDigits: 2 });
const pk = { timeZone: 'Asia/Karachi' } as const;
const d = (s: string) => new Date(s.endsWith('Z') ? s : s + 'Z');
export const fmtDate = (s?: string | null) => (s ? d(s).toLocaleDateString('en-GB', { ...pk, day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (s?: string | null) => (s ? d(s).toLocaleString('en-GB', { ...pk, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const toPaisa = (v: string | number) => Math.round(Number(v) * 100);
export const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
export const waLink = (num: string, text = '') => `https://wa.me/${num.replace(/\D/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
