import { Link } from '../lib/router';
import { pkr } from '../lib/format';
import { Icon, ProductArt } from './ui';

export function ProductCard({ p, compact = false }: { p: any; compact?: boolean }) {
  const off = p.comparePrice && p.comparePrice > p.fromPrice ? Math.round((1 - p.fromPrice / p.comparePrice) * 100) : 0;
  const badge = p.deal ? { t: off ? `Hot Deal · ${off}% off` : 'Hot Deal', c: 'bg-red-600' } : p.bestSeller ? { t: 'Best Seller', c: 'bg-purple-600' } : p.trending ? { t: 'Popular', c: 'bg-brand' } : null;
  return (
    <Link to={`/products/${p.slug}`} className="card group flex h-full flex-col overflow-hidden transition duration-300 hover:-translate-y-1.5 hover:shadow-glow">
      <div className={`relative grid place-items-center overflow-hidden ${compact ? 'h-28' : 'h-36'}`} style={{ background: `radial-gradient(circle at 50% 60%, ${p.brandColor}40, transparent 70%)` }}>
        {badge && <span className={`absolute left-2 top-2 rounded-lg font-bold text-white shadow-lg ${compact ? 'px-2 py-0.5 text-[10px]' : 'left-3 top-3 px-2.5 py-1 text-[11px]'} ${badge.c}`}>{badge.t}</span>}
        <div className="transition duration-300 group-hover:scale-110" style={{ filter: `drop-shadow(0 12px 22px ${p.brandColor}80)` }}>{p.imageUrl ? <img src={p.imageUrl} alt={p.name} loading="lazy" className={`max-w-[80%] object-contain ${compact ? 'max-h-16' : 'max-h-24'}`} /> : <ProductArt name={p.name} color={p.brandColor} size={compact ? 'h-14 w-14' : 'h-[72px] w-[72px]'} text={compact ? 'text-xl' : 'text-2xl'} />}</div>
      </div>
      <div className={`flex flex-1 flex-col ${compact ? 'p-3' : 'p-4 pt-3'}`}>
        <h3 className={`font-bold leading-snug text-navy-900 ${compact ? 'text-sm' : 'text-base'}`}>{p.name}</h3>
        <p className={`mt-1 line-clamp-2 leading-snug text-slate-500 ${compact ? 'min-h-[2rem] text-xs' : 'min-h-[2.5rem] text-[13px]'}`}>{p.shortDescription}</p>
        <div className={`mt-3 flex gap-2 ${compact ? 'flex-col items-start' : 'items-end justify-between'}`}>
          <div><div className="text-[11px] text-slate-400">Starting from</div><div className={`font-extrabold text-navy-900 ${compact ? 'text-base' : 'text-lg'}`}>{pkr(p.fromPrice)}{off > 0 && <span className="ml-1.5 text-xs font-normal text-slate-400 line-through">{pkr(p.comparePrice)}</span>}</div></div>
          <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold ${compact ? '' : 'mb-1'} ${p.inStock ? 'text-emerald-500' : 'text-slate-400'}`}><span className={`h-1.5 w-1.5 rounded-full ${p.inStock ? 'bg-emerald-500' : 'bg-slate-400'}`} />{p.inStock ? 'In stock' : 'Out of stock'}</span>
        </div>
        <span className={`btn-primary w-full !rounded-xl group-hover:brightness-110 ${compact ? 'mt-3 !py-2 !text-xs' : 'mt-4 !py-2.5'}`}>View Plans<Icon name="arrow" className="h-4 w-4 transition group-hover:translate-x-0.5" /></span>
        {p.demo && <p className="mt-2 text-center text-[11px] font-medium text-amber-500">Demo product</p>}
      </div>
    </Link>
  );
}
