import { useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes } from 'react';
import { useApp } from '../lib/store';
import { ApiError } from '../lib/api';
import { initials } from '../lib/format';
import { ACCENTS, useTheme, type Mode } from '../lib/theme';

const ICONS: Record<string, string> = {
  search: 'M21 21l-4.3-4.3M11 18a7 7 0 100-14 7 7 0 000 14z', cart: 'M3 4h2l2.4 10.2a2 2 0 002 1.6h7.7a2 2 0 002-1.5L21 8H6M10 20.5a.5.5 0 100-1 .5.5 0 000 1zM17 20.5a.5.5 0 100-1 .5.5 0 000 1z',
  user: 'M20 21a8 8 0 10-16 0M12 12a4 4 0 100-8 4 4 0 000 8z', wallet: 'M3 7a2 2 0 012-2h13v4M3 7v10a2 2 0 002 2h14a1 1 0 001-1v-3m0-6H6a3 3 0 00-3 3m18-3v6h-4a2 2 0 010-4h4z',
  box: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8', home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10', ticket: 'M3 9V7a1 1 0 011-1h16a1 1 0 011 1v2a3 3 0 000 6v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2a3 3 0 000-6z',
  bell: 'M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 20a2 2 0 01-3.4 0', cog: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9', menu: 'M4 6h16M4 12h16M4 18h16', x: 'M6 6l12 12M18 6L6 18', check: 'M5 13l4 4L19 7', chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  users: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8', tag: 'M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8zM7.5 7.5h.01',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', bolt: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z', headset: 'M3 18v-6a9 9 0 0118 0v6M21 19a2 2 0 01-2 2h-1v-6h3zM3 19a2 2 0 002 2h1v-6H3z', globe: 'M12 22a10 10 0 100-20 10 10 0 000 20zM2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20',
  plus: 'M12 5v14M5 12h14', trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14', edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z', download: 'M12 3v12m0 0l-4-4m4 4l4-4M4 21h16', list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  layers: 'M12 2l10 5-10 5L2 7l10-5zM2 17l10 5 10-5M2 12l10 5 10-5', sparkles: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z', play: 'M5 3l14 9-14 9V3z',
  film: 'M4 4h16v16H4zM4 9h16M4 15h16M9 4v16M15 4v16', palette: 'M12 22a10 10 0 110-20c5.5 0 10 3.6 10 8 0 3-2.5 4-4.5 4H15a2 2 0 00-1.4 3.4c.6.8.4 2.6-1.6 4.6z', share: 'M18 8a3 3 0 100-6 3 3 0 000 6zM6 15a3 3 0 100-6 3 3 0 000 6zM18 22a3 3 0 100-6 3 3 0 000 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  facebook: 'M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z', instagram: 'M7 2h10a5 5 0 015 5v10a5 5 0 01-5 5H7a5 5 0 01-5-5V7a5 5 0 015-5zM16 11.4a4 4 0 11-7.9 1.2 4 4 0 017.9-1.2zM17.5 6.5h.01',
  youtube: 'M22.5 6.4a2.8 2.8 0 00-2-2C18.8 4 12 4 12 4s-6.8 0-8.5.4a2.8 2.8 0 00-2 2C1 8.1 1 12 1 12s0 3.9.5 5.6a2.8 2.8 0 002 2C5.2 20 12 20 12 20s6.8 0 8.5-.4a2.8 2.8 0 002-2c.5-1.7.5-5.6.5-5.6s0-3.9-.5-5.6zM9.7 15.5v-7l6 3.5z', tiktok: 'M16 3v10.5a4.5 4.5 0 11-4.5-4.5M16 3a5 5 0 005 5', xsocial: 'M4 4l16 16M20 4L4 20',
  mail: 'M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zM22 6l-10 7L2 6', phone: 'M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8.1 9.9a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z', arrow: 'M5 12h14M13 6l6 6-6 6', down: 'M6 9l6 6 6-6', star: 'M12 2l3 6.9 7.5.7-5.7 5 1.7 7.4L12 18l-6.5 4 1.7-7.4-5.7-5 7.5-.7z', lock: 'M5 11h14v10H5zM8 11V7a4 4 0 018 0v4', crown: 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z',
  file: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6', refresh: 'M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5', whatsapp: 'M3 21l1.7-5A8.5 8.5 0 1112 20.5a8.4 8.4 0 01-4.1-1.1zM9 8c0 4 3 7 7 7l1.3-1.6-2.2-1.2-1 .8A5 5 0 019.8 9.7l.8-1-1.2-2.2z', chevron: 'M9 6l6 6-6 6',
};
export function Icon({ name, className = 'h-5 w-5' }: { name: string; className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"><path d={ICONS[name] ?? ICONS.box} /></svg>;
}

export function Spinner({ className = '' }: { className?: string }) { return <div className={`h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-brand ${className}`} role="status" aria-label="Loading" />; }
export const Loading = () => <div className="flex justify-center py-16"><Spinner /></div>;
export const ErrorBox = ({ message, retry }: { message: string; retry?: () => void }) => (
  <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message}{retry && <button className="ml-3 font-semibold underline" onClick={retry}>Retry</button>}</div>
);
export const Empty = ({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) => (
  <div className="py-14 text-center"><div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand"><Icon name="box" /></div><p className="font-semibold text-navy-900">{title}</p>{hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}{action && <div className="mt-4">{action}</div>}</div>
);

const BADGE: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700', approved: 'bg-emerald-100 text-emerald-700', active: 'bg-emerald-100 text-emerald-700', resolved: 'bg-emerald-100 text-emerald-700', processed: 'bg-emerald-100 text-emerald-700', sent: 'bg-emerald-100 text-emerald-700', confirmed: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-700', processing: 'bg-blue-100 text-blue-700', in_progress: 'bg-blue-100 text-blue-700', open: 'bg-blue-100 text-blue-700', requested: 'bg-amber-100 text-amber-700', waiting_customer: 'bg-amber-100 text-amber-700', retry: 'bg-amber-100 text-amber-700', awaiting_credentials: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-slate-200 text-slate-600', closed: 'bg-slate-200 text-slate-600', refunded: 'bg-purple-100 text-purple-700', failed: 'bg-red-100 text-red-700', rejected: 'bg-red-100 text-red-700', suspended: 'bg-red-100 text-red-700', banned: 'bg-red-100 text-red-700', draft: 'bg-slate-200 text-slate-600', hidden: 'bg-slate-200 text-slate-600',
};
export const Badge = ({ status, label }: { status: string; label?: string }) => <span className={`badge ${BADGE[status] ?? 'bg-slate-100 text-slate-600'}`}>{label ?? status.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())}</span>;

export function Button({ loading, children, className = 'btn-primary', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return <button {...p} disabled={p.disabled || loading} className={className}>{loading && <Spinner className="!h-4 !w-4" />}{children}</button>;
}
export function Field({ label, error, hint, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  return <label className="block"><span className="label">{label}</span><input {...p} className="input" aria-invalid={!!error} />{hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}{error && <span className="mt-1 block text-xs text-red-600">{error}</span>}</label>;
}
export function TextArea({ label, ...p }: { label: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) { return <label className="block"><span className="label">{label}</span><textarea {...p} className="input min-h-[96px]" /></label>; }
export function Select({ label, children, ...p }: { label?: string } & React.SelectHTMLAttributes<HTMLSelectElement>) { return <label className="block">{label && <span className="label">{label}</span>}<select {...p} className="input">{children}</select></label>; }
export const Check = ({ label, ...p }: { label: string } & InputHTMLAttributes<HTMLInputElement>) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand" {...p} />{label}</label>;

export function Pagination({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize)); if (pages <= 1) return null;
  return <div className="flex items-center justify-between pt-4 text-sm"><span className="text-slate-500">Page {page} of {pages} · {total} total</span><div className="flex gap-2"><button className="btn-outline btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button><button className="btn-outline btn-sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</button></div></div>;
}
export const Table = ({ head, children }: { head: string[]; children: ReactNode }) => (
  <div className="overflow-x-auto"><table className="w-full min-w-[640px]"><thead className="border-b border-slate-200 bg-slate-50"><tr>{head.map((h) => <th key={h} className="th">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{children}</tbody></table></div>
);

/** Product tile: uploaded image or a brand-coloured monogram (we never ship third-party logos). */
export function ProductArt({ name, color, imageUrl, size = 'h-14 w-14', text = 'text-lg' }: { name: string; color: string; imageUrl?: string | null; size?: string; text?: string }) {
  if (imageUrl) return <img src={imageUrl} alt={name} loading="lazy" className={`${size} rounded-xl object-cover`} />;
  return <div className={`${size} ${text} grid shrink-0 place-items-center rounded-xl font-bold text-white shadow-inner`} style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }} aria-hidden="true">{initials(name)}</div>;
}

export function Toasts() {
  const { toasts } = useApp();
  return <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4">{toasts.map((t) => <div key={t.id} role="status" className={`pointer-events-auto max-w-md rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${t.kind === 'err' ? 'bg-red-600' : 'bg-navy-900'}`}>{t.msg}</div>)}</div>;
}

export function useAction() {
  const { toast } = useApp(); const [busy, setBusy] = useState(false);
  const run = async <T,>(fn: () => Promise<T>, okMsg?: string): Promise<T | undefined> => {
    setBusy(true);
    try { const r = await fn(); if (okMsg) toast(okMsg); return r; } catch (e) { toast((e as ApiError).message || 'Something went wrong', 'err'); return undefined; } finally { setBusy(false); }
  };
  return { busy, run };
}
export const Confirm = ({ message, onConfirm, children, className = 'btn-outline btn-sm' }: { message: string; onConfirm: () => void; children: ReactNode; className?: string }) => (
  <button className={className} onClick={() => { if (window.confirm(message)) onConfirm(); }}>{children}</button>
);

/** Light / dark / system + accent colour picker. `dropUp` opens it above (sidebars). */
export function ThemeMenu({ dropUp = false, className = '' }: { dropUp?: boolean; className?: string }) {
  const { theme, setMode, setAccent } = useTheme(); const [open, setOpen] = useState(false);
  const modes: [Mode, string][] = [['light', 'Light'], ['dark', 'Dark'], ['system', 'Auto']];
  return (
    <div className={`relative ${className}`}>
      <button type="button" aria-label="Change theme" aria-expanded={open} onClick={() => setOpen(!open)} className="rounded-lg p-2 text-current hover:bg-white/10"><Icon name="palette" /></button>
      {open && <>
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
        <div role="dialog" aria-label="Theme" className={`absolute z-50 w-64 rounded-2xl border border-line bg-surface p-4 text-slate-700 shadow-lift ${dropUp ? 'bottom-full left-0 mb-2' : 'right-0 top-full mt-2'}`}>
          <div className="label">Appearance</div>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">{modes.map(([m, l]) => <button key={m} onClick={() => setMode(m)} aria-pressed={theme.mode === m} className={`rounded-lg py-1.5 text-xs font-semibold ${theme.mode === m ? 'bg-surface text-navy-900 shadow-sm' : 'text-slate-500'}`}>{l}</button>)}</div>
          <div className="label mt-4">Colour</div>
          <div className="flex gap-2">{ACCENTS.map((a) => <button key={a.id} onClick={() => setAccent(a.id)} aria-label={a.name} aria-pressed={theme.accent === a.id} title={a.name} style={{ background: a.swatch }} className={`grid h-9 w-9 place-items-center rounded-full ring-offset-2 ring-offset-[rgb(var(--surface))] transition ${theme.accent === a.id ? 'ring-2 ring-slate-400' : 'hover:scale-110'}`}>{theme.accent === a.id && <Icon name="check" className="h-4 w-4 text-white" />}</button>)}</div>
        </div>
      </>}
    </div>
  );
}
