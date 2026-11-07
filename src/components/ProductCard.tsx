import { Link } from '../lib/router';
import { pkr } from '../lib/format';
import { Icon, ProductArt } from './ui';

export function ProductCard({ p }: { p: any }) {
  const off = p.comparePrice && p.comparePrice > p.fromPrice ? Math.round((1 - p.fromPrice / p.comparePrice) * 100) : 0;
  const badge = p.deal ? { t: off ? `Hot Deal · ${off}% off` : 'Hot Deal', c: 'bg-red-600' } : p.bestSeller ? { t: 'Best Seller', c: 'bg-purple-600' } : p.trending ? { t: 'Popular', c: 'bg-brand' } : null;
  return (
    <Link to={`/products/${p.slug}`} className="card group flex h-full flex-col overflow-hidden transition duration-300 hover:-translate-y-1.5 hover:shadow-glow">
      <div className="relative grid h-36 place-items-center overflow-hidden" style={{ background: `radial-gradient(circle at 50% 60%, ${p.brandColor}40, transparent 70%)` }}>
        {badge && <span className={`absolute left-3 top-3 rounded-lg px-2.5 py-1 text-[11px] font-bold text-white shadow-lg ${badge.c}`}>{badge.t}</span>}
        <div className="transition duration-300 group-hover:scale-110" style={{ filter: `drop-shadow(0 12px 22px ${p.brandColor}80)` }}><ProductArt name={p.name} color={p.brandColor} imageUrl={p.imageUrl} size="h-[72px] w-[72px]" text="text-2xl" /></div>
      </div>
      <div className="flex flex-1 flex-col p-4 pt-3">
        <h3 className="text-base font-bold leading-snug text-navy-900">{p.name}</h3>
        <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-[13px] leading-snug text-slate-500">{p.shortDescription}</p>
        <div className="mt-3 flex items-end justify-between gap-2">
          <div><div className="text-[11px] text-slate-400">Starting from</div><div className="text-lg font-extrabold text-navy-900">{pkr(p.fromPrice)}{off > 0 && <span className="ml-1.5 text-xs font-normal text-slate-400 line-through">{pkr(p.comparePrice)}</span>}</div></div>
          <span className={`mb-1 inline-flex items-center gap-1.5 text-[11px] font-semibold ${p.inStock ? 'text-emerald-500' : 'text-slate-400'}`}><span className={`h-1.5 w-1.5 rounded-full ${p.inStock ? 'bg-emerald-500' : 'bg-slate-400'}`} />{p.inStock ? 'In stock' : 'Out of stock'}</span>
        </div>
        <span className="btn-primary mt-4 w-full !rounded-xl !py-2.5 group-hover:brightness-110">View Plans<Icon name="arrow" className="h-4 w-4 transition group-hover:translate-x-0.5" /></span>
        {p.demo && <p className="mt-2 text-center text-[11px] font-medium text-amber-500">Demo product</p>}
      </div>
    </Link>
  );
}
