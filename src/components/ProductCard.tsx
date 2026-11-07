import { Link } from '../lib/router';
import { pkr } from '../lib/format';
import { Badge, ProductArt } from './ui';

export function ProductCard({ p }: { p: any }) {
  const off = p.comparePrice && p.comparePrice > p.fromPrice ? Math.round((1 - p.fromPrice / p.comparePrice) * 100) : 0;
  return (
    <Link to={`/products/${p.slug}`} className="card group flex flex-col overflow-hidden transition duration-200 hover:-translate-y-1 hover:border-brand/40 hover:shadow-lift">
      <div className="relative grid h-28 place-items-center overflow-hidden" style={{ background: `linear-gradient(135deg, ${p.brandColor}26, ${p.brandColor}0d)` }}>
        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-20 blur-2xl" style={{ background: p.brandColor }} />
        <ProductArt name={p.name} color={p.brandColor} imageUrl={p.imageUrl} size="h-16 w-16" text="text-xl" />
        <div className="absolute left-3 top-3 flex gap-1.5">{p.deal && <span className="badge bg-red-600 text-white">{off ? `-${off}%` : 'Deal'}</span>}{p.trending && <span className="badge bg-navy-900 text-white">Trending</span>}</div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-semibold leading-snug text-navy-900">{p.name}</h3>
        <p className="mt-1 line-clamp-2 min-h-[2.25rem] text-xs leading-relaxed text-slate-500">{p.shortDescription}</p>
        <div className="mt-4 flex items-end justify-between gap-2">
          <div><div className="text-[11px] text-slate-400">Starting from</div><div className="text-lg font-bold text-navy-900">{pkr(p.fromPrice)}{off > 0 && <span className="ml-1.5 text-xs font-normal text-slate-400 line-through">{pkr(p.comparePrice)}</span>}</div></div>
          {p.inStock ? <span className="btn-primary btn-sm transition group-hover:shadow-glow">View</span> : <Badge status="cancelled" label="Out of stock" />}
        </div>
        {p.demo && <p className="mt-2 text-[11px] font-medium text-amber-600">Demo product</p>}
      </div>
    </Link>
  );
}
