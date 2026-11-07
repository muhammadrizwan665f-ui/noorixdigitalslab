import { Link } from '../lib/router';
import { pkr } from '../lib/format';
import { Badge, ProductArt } from './ui';

export function ProductCard({ p }: { p: any }) {
  return (
    <Link to={`/products/${p.slug}`} className="card group flex flex-col p-4 transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lg">
      <div className="flex items-start justify-between">
        <ProductArt name={p.name} color={p.brandColor} imageUrl={p.imageUrl} size="h-16 w-16" text="text-xl" />
        <div className="flex flex-col items-end gap-1">{p.deal && <span className="badge bg-red-100 text-red-700">Deal</span>}{p.trending && <span className="badge bg-brand-50 text-brand">Trending</span>}</div>
      </div>
      <h3 className="mt-3 font-semibold text-navy-900">{p.name}</h3>
      <p className="mt-0.5 line-clamp-2 min-h-[2.5rem] text-xs text-slate-500">{p.shortDescription}</p>
      <div className="mt-3 flex items-end justify-between">
        <div><div className="text-[11px] uppercase tracking-wide text-slate-400">From</div><div className="font-bold text-navy-900">{pkr(p.fromPrice)}{p.comparePrice && p.comparePrice > p.fromPrice && <span className="ml-1.5 text-xs font-normal text-slate-400 line-through">{pkr(p.comparePrice)}</span>}</div></div>
        {p.inStock ? <span className="btn-primary btn-sm">Buy Now</span> : <Badge status="cancelled" label="Out of stock" />}
      </div>
      {p.demo && <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-amber-600">Demo product</p>}
    </Link>
  );
}
