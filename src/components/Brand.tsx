import { useId } from 'react';
import { useApp } from '../lib/store';
import { splitName } from '../lib/brand';

/** Shopping-bag mark. Drawn in SVG so it stays crisp and takes the active accent colour. */
export function BagMark({ className = 'h-10 w-10' }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
      <defs><linearGradient id={`g${id}`} x1="10" y1="6" x2="54" y2="60" gradientUnits="userSpaceOnUse"><stop stopColor="rgb(var(--accent2))" /><stop offset="1" stopColor="rgb(var(--brand))" /></linearGradient></defs>
      <path d="M22 25v-4a10 10 0 0120 0v4" stroke={`url(#g${id})`} strokeWidth="4.5" strokeLinecap="round" />
      <path d="M11 25h42l-3 29a5 5 0 01-5 4.5H19a5 5 0 01-5-4.5z" stroke={`url(#g${id})`} strokeWidth="4.5" strokeLinejoin="round" fill="rgb(var(--brand) / .16)" />
      <path d="M34 33l-7 10h6l-2 8 8-11h-6z" fill={`url(#g${id})`} />
    </svg>
  );
}

export function Logo({ size = 'md', tagline = true, className = '' }: { size?: 'sm' | 'md' | 'lg'; tagline?: boolean; className?: string }) {
  const { brand } = useApp(); const [a, b] = splitName(brand.name);
  const cfg = { sm: ['h-8 w-8', 'text-xl'], md: ['h-10 w-10', 'text-2xl'], lg: ['h-14 w-14', 'text-4xl'] }[size];
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <BagMark className={`${cfg[0]} shrink-0 drop-shadow-[0_0_10px_rgb(var(--brand)/.55)]`} />
      <span className="flex flex-col leading-none">
        <span className={`${cfg[1]} font-extrabold italic tracking-tight text-white`}>{a && <span className="bg-gradient-to-r from-cyan2 to-brand bg-clip-text text-transparent">{a}</span>}{b}</span>
        {tagline && size !== 'sm' && <span className="mt-1 hidden text-[10px] font-medium text-slate-300 sm:block">{brand.tagline}</span>}
      </span>
    </span>
  );
}

/** "Powered by <parent company>" in three sizes. The parent name is editable in Admin → Settings. */
export function PoweredBy({ variant }: { variant: 'chip' | 'card' | 'panel' }) {
  const { brand } = useApp();
  const logo = <img src="/logo.png" alt="" className={`logo-blend w-auto ${variant === 'chip' ? 'h-8' : variant === 'card' ? 'h-10' : 'h-14'}`} />;
  if (variant === 'chip') return <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-brand/40 bg-white/5 py-1.5 pl-3 pr-5">{logo}<span className="leading-tight"><span className="block text-[11px] text-slate-400">Powered by</span><span className="text-sm font-bold text-white">{brand.parent}</span></span></div>;
  if (variant === 'card') return <div className="mt-5 flex w-fit max-w-full flex-col items-start gap-2 rounded-2xl border border-brand/40 bg-gradient-to-br from-brand/15 to-transparent px-4 py-3">{logo}<span className="whitespace-nowrap leading-tight"><span className="block text-[11px] text-slate-400">Powered & operated by</span><span className="text-base font-bold text-white">{brand.parent}</span></span></div>;
  return (
    <div className="relative mt-8 flex flex-col items-start gap-4 overflow-hidden rounded-2xl border border-brand/40 bg-gradient-to-br from-navy-800 to-navy-950 p-5 sm:flex-row sm:items-center sm:p-6">
      <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-brand/30 blur-3xl" aria-hidden="true" />
      <div className="relative shrink-0">{logo}</div>
      <div className="relative"><div className="text-xs font-semibold text-cyan2">Powered by {brand.parent}</div><p className="mt-1 text-lg font-bold leading-snug text-white">{brand.name} is powered and operated by {brand.parent}.</p></div>
    </div>
  );
}
