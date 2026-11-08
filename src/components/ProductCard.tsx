import { Link } from '../lib/router';
import { pkr } from '../lib/format';
import { Icon, ProductArt } from './ui';

/**
 * Product card. Every card has the same structure and the same fixed rows (image, 2-line title,
 * 2-line description, price block, stock, button), and the button is pinned to the bottom, so cards in a
 * row always line up. Phones get the compact sizes; md+ keeps the original desktop sizes.
 */
export function ProductCard({ p, priority = false }: { p: any; compact?: boolean; priority?: boolean }) {
  const off = p.comparePrice && p.comparePrice > p.fromPrice ? Math.round((1 - p.fromPrice / p.comparePrice) * 100) : 0;
  const badge = p.deal ? { t: off ? `Hot Deal · ${off}% off` : 'Hot Deal', c: 'bg-red-600' } : p.bestSeller ? { t: 'Best Seller', c: 'bg-purple-600' } : p.trending ? { t: 'Popular', c: 'bg-brand' } : null;
  return (
    <Link to={`/products/${p.slug}`} className="card group flex h-full flex-col overflow-hidden transition duration-300 hover:-translate-y-1.5 hover:shadow-glow">
      <div className="relative grid h-28 place-items-center overflow-hidden md:h-36" style={{ background: `radial-gradient(circle at 50% 60%, ${p.brandColor}40, transparent 70%)` }}>
        {badge && <span className={`absolute left-2 top-2 max-w-[calc(100%-1rem)] truncate rounded-lg px-2 py-0.5 text-[10px] font-bold text-white shadow-lg md:left-3 md:top-3 md:px-2.5 md:py-1 md:text-[11px] ${badge.c}`}>{badge.t}</span>}
        <div className="transition duration-300 group-hover:scale-110" style={{ filter: `drop-shadow(0 12px 22px ${p.brandColor}80)` }}>
          {p.imageUrl
            ? <img src={p.imageUrl} alt={p.name} width={96} height={96} loading={priority ? 'eager' : 'lazy'} decoding="async" {...(priority ? { fetchPriority: 'high' as const } : {})} className="max-h-16 max-w-[80%] object-contain md:max-h-24" />
            : <ProductArt name={p.name} color={p.brandColor} size="h-14 w-14 md:h-[72px] md:w-[72px]" text="text-xl md:text-2xl" />}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-3 md:p-4 md:pt-3">
        <h3 className="line-clamp-2 min-h-[2.4rem] text-sm font-bold leading-snug text-navy-900 md:min-h-0 md:line-clamp-none md:text-base">{p.name}</h3>
        <p className="mt-1 line-clamp-2 min-h-[2rem] text-xs leading-snug text-slate-500 md:min-h-[2.5rem] md:text-[13px]">{p.shortDescription}</p>
        <div className="mt-2 flex min-h-[3.5rem] flex-col items-start gap-1 md:mt-3 md:min-h-0 md:flex-row md:items-end md:justify-between md:gap-2">
          <div>
            <div className="text-[11px] text-slate-400">Starting from</div>
            <div className="whitespace-nowrap text-base font-extrabold text-navy-900 md:text-lg">{pkr(p.fromPrice)}{off > 0 && <span className="ml-1.5 hidden text-xs font-normal text-slate-400 line-through md:inline">{pkr(p.comparePrice)}</span>}</div>
            {off > 0 && <div className="whitespace-nowrap text-xs text-slate-400 line-through md:hidden">{pkr(p.comparePrice)}</div>}
          </div>
          <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold md:mb-1 ${p.inStock ? 'text-emerald-500' : 'text-slate-400'}`}><span className={`h-1.5 w-1.5 rounded-full ${p.inStock ? 'bg-emerald-500' : 'bg-slate-400'}`} />{p.inStock ? 'In stock' : 'Out of stock'}</span>
        </div>
        <div className="mt-auto pt-3 md:pt-4">
          <span className="btn-primary h-10 w-full gap-1.5 whitespace-nowrap !rounded-xl !px-2 !py-0 !text-xs group-hover:brightness-110 md:h-auto md:!px-4 md:!py-2.5 md:!text-sm">View Plans<Icon name="arrow" className="h-4 w-4 shrink-0 transition group-hover:translate-x-0.5" /></span>
        </div>
        {p.demo && <p className="mt-2 text-center text-[11px] font-medium text-amber-500">Demo product</p>}
      </div>
    </Link>
  );
}
