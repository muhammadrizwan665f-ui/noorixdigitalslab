import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearch } from '../lib/router';
import { useApi, useApp } from '../lib/store';
import { Badge, ErrorBox, Icon, Loading, Pagination, ProductArt, Empty } from '../components/ui';
import { ProductCard } from '../components/ProductCard';
import { pkr } from '../lib/format';

import { MobileProductDetail } from './MobileProduct';
import { useIsMobile } from '../lib/useMedia';

export function Products() {
  const sp = useSearch(); const nav = useNavigate(); const { brand } = useApp();
  const q = sp.get('q') ?? '', category = sp.get('category') ?? '', sort = sp.get('sort') ?? 'popular', flag = sp.get('flag') ?? '', min = sp.get('min') ?? '', max = sp.get('max') ?? '', page = Number(sp.get('page') ?? 1);
  const [text, setText] = useState(q); useEffect(() => setText(q), [q]);
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); if (k !== 'page') n.delete('page'); nav('/products?' + n.toString()); };
  const cats = useApi<any[]>('/public/categories');
  const qs = new URLSearchParams({ sort, page: String(page), pageSize: '12' }); if (q) qs.set('q', q); if (category) qs.set('category', category); if (flag) qs.set('flag', flag); if (min) qs.set('min', min); if (max) qs.set('max', max);
  const { data, loading, error, reload } = useApi<any>('/public/products?' + qs.toString());
  const [catOpen, setCatOpen] = useState(false); const catRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setCatOpen(false); }, [category]);
  useEffect(() => { if (!catOpen) return; const off = (e: Event) => { if (!catRef.current?.contains(e.target as Node)) setCatOpen(false); }; const esc = (e: KeyboardEvent) => e.key === 'Escape' && setCatOpen(false); document.addEventListener('pointerdown', off); document.addEventListener('keydown', esc); return () => { document.removeEventListener('pointerdown', off); document.removeEventListener('keydown', esc); }; }, [catOpen]);
  const title = flag === 'deal' ? "Today's Deals" : flag === 'trending' ? 'Trending Products' : cats.data?.find((c) => c.slug === category)?.name ?? 'All Products';
  useEffect(() => { document.title = `${title} — ${brand.name}`; }, [title, brand.name]);
  return (
    <div className="container-x py-8">
      <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-[250px_1fr]">
        <aside className="space-y-5">
          <div ref={catRef} className="relative md:hidden">
            <button type="button" aria-expanded={catOpen} aria-haspopup="listbox" onClick={() => setCatOpen((o) => !o)} className="card flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
              <span className="min-w-0"><span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Category</span><span className="block truncate text-sm font-bold text-navy-900">{cats.data?.find((c) => c.slug === category)?.name ?? 'All categories'}</span></span>
              <Icon name="down" className={`h-5 w-5 shrink-0 text-brand transition-transform ${catOpen ? 'rotate-180' : ''}`} />
            </button>
            {catOpen && <ul role="listbox" aria-label="Categories" className="card absolute inset-x-0 top-full z-30 mt-2 max-h-[60vh] space-y-0.5 overflow-y-auto p-2 text-sm shadow-lift">
              <li><button role="option" aria-selected={!category} onClick={() => { setCatOpen(false); set('category', ''); }} className={`w-full rounded-lg px-3 py-2.5 text-left ${!category ? 'bg-brand-50 font-semibold text-brand' : 'hover:bg-slate-50'}`}>All categories</button></li>
              {cats.data?.map((c) => <li key={c.slug}><button role="option" aria-selected={category === c.slug} onClick={() => { setCatOpen(false); set('category', c.slug); }} className={`flex w-full justify-between rounded-lg px-3 py-2.5 text-left ${category === c.slug ? 'bg-brand-50 font-semibold text-brand' : 'hover:bg-slate-50'}`}><span>{c.name}</span><span className="text-slate-400">{c.n}</span></button></li>)}
            </ul>}
          </div>
          <div className="card hidden p-4 md:block"><h2 className="mb-2 text-sm font-bold">Categories</h2>
            <ul className="space-y-0.5 text-sm"><li><button onClick={() => set('category', '')} className={`w-full rounded-md px-2 py-1.5 text-left ${!category ? 'bg-brand-50 font-semibold text-brand' : 'hover:bg-slate-50'}`}>All categories</button></li>
              {cats.data?.map((c) => <li key={c.slug}><button onClick={() => set('category', c.slug)} className={`flex w-full justify-between rounded-md px-2 py-1.5 text-left ${category === c.slug ? 'bg-brand-50 font-semibold text-brand' : 'hover:bg-slate-50'}`}><span>{c.name}</span><span className="text-xs text-slate-400">{c.n}</span></button></li>)}</ul></div>
          <div className="card p-4"><h2 className="mb-2 text-sm font-bold">Price (PKR)</h2>
            <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const n = new URLSearchParams(sp); ['min', 'max'].forEach((k) => { const v = String(f.get(k) ?? ''); v ? n.set(k, v) : n.delete(k); }); n.delete('page'); nav('/products?' + n.toString()); }}>
              <input name="min" defaultValue={min} type="number" min="0" placeholder="Min" aria-label="Minimum price" className="input !px-2" /><span className="text-slate-400">–</span><input name="max" defaultValue={max} type="number" min="0" placeholder="Max" aria-label="Maximum price" className="input !px-2" /><button className="btn-dark btn-sm">Go</button></form></div>
        </aside>
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <form className="relative min-w-[200px] flex-1" role="search" onSubmit={(e) => { e.preventDefault(); set('q', text.trim()); }}><Icon name="search" className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" /><input className="input !pl-10" placeholder="Search products…" aria-label="Search products" value={text} onChange={(e) => setText(e.target.value)} /></form>
            <select className="input !w-auto" aria-label="Sort" value={sort} onChange={(e) => set('sort', e.target.value)}><option value="popular">Most popular</option><option value="newest">Newest</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option><option value="name">Name A–Z</option></select>
          </div>
          {loading ? <Loading /> : error ? <ErrorBox message={error} retry={reload} /> : data.items.length === 0 ? <div className="card"><Empty title="No products found" hint="Try a different search or clear the filters." action={<Link to="/products" className="btn-outline btn-sm">Clear filters</Link>} /></div> : (
            <><div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">{data.items.map((p: any) => <ProductCard key={p.id} p={p} />)}</div><Pagination page={page} total={data.total} pageSize={12} onChange={(p) => set('page', String(p))} /></>)}
        </div>
      </div>
    </div>
  );
}

export function ProductDetail({ slug }: { slug: string }) {
  const isMobile = useIsMobile();
  const { data: p, loading, error, reload } = useApi<any>('/public/products/' + slug);
  const { addToCart, setInput, me, toast, settings, brand } = useApp(); const nav = useNavigate();
  const [planId, setPlanId] = useState(''); const [input, setIn] = useState<Record<string, string>>({}); const [tab, setTab] = useState('description'); const [err, setErr] = useState('');
  useEffect(() => { if (p) { setPlanId(p.plans.find((x: any) => x.inStock)?.id ?? p.plans[0]?.id ?? ''); document.title = p.seoTitle || `${p.name} — ${brand.name}`; } }, [p]);
  if (loading) return <Loading />; if (error || !p) return <div className="container-x py-10"><ErrorBox message={error || 'Product not found'} /></div>;
  const plan = p.plans.find((x: any) => x.id === planId);
  const line = () => {
    for (const f of p.inputFields) if (f.required && !(input[f.key] ?? '').trim()) { setErr(`${f.label} is required`); return null; }
    setErr(''); return { planId: plan.id, productId: p.id, productName: p.name, planName: plan.name, price: plan.price, brandColor: p.brandColor, inputFields: p.inputFields, input };
  };
  const add = (buy: boolean) => { const l = line(); if (!l) return; addToCart(l); if (buy) nav('/cart'); else toast('Added to cart'); };
  const wa = settings.whatsapp || '923154429417';
  void setInput; void me;
  if (isMobile) return <MobileProductDetail p={p} plan={plan} planId={planId} setPlanId={setPlanId} input={input} setIn={setIn} err={err} add={add} />;
  return (
    <div className="container-x py-8">
      <nav className="mb-4 text-sm text-slate-500"><Link to="/products" className="hover:text-brand">Products</Link> / <Link to={`/products?category=${p.categorySlug}`} className="hover:text-brand">{p.category}</Link> / <span className="text-slate-700">{p.name}</span></nav>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <div className="card flex flex-col gap-5 p-6 sm:flex-row">
            <ProductArt name={p.name} color={p.brandColor} imageUrl={p.imageUrl} size="h-28 w-28" text="text-4xl" />
            <div><h1 className="text-2xl font-bold">{p.name}</h1><p className="mt-1 text-slate-600">{p.shortDescription}</p>
              <div className="mt-3 flex flex-wrap gap-2"><Badge status={p.inStock ? 'completed' : 'cancelled'} label={p.inStock ? 'In stock' : 'Out of stock'} /><span className="badge bg-slate-100 text-slate-600">{p.deliveryType === 'automatic' ? 'Instant delivery' : p.deliveryType === 'api' ? 'Automated delivery' : 'Delivered by our team'}</span>{p.refundEligible && <span className="badge bg-emerald-100 text-emerald-700">Refund eligible</span>}{p.demo && <span className="badge bg-amber-100 text-amber-700">Demo product</span>}</div>
              <ul className="mt-4 space-y-1 text-sm text-slate-700">{p.features.map((f: string) => <li key={f} className="flex gap-2"><Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{f}</li>)}</ul></div>
          </div>
          <div className="card"><div className="flex gap-1 border-b border-slate-200 px-4" role="tablist">{['description', 'terms', 'refund'].map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`border-b-2 px-3 py-3 text-sm font-semibold capitalize ${tab === t ? 'border-brand text-brand' : 'border-transparent text-slate-500'}`}>{t === 'refund' ? 'Refund policy' : t}</button>)}</div>
            <div className="whitespace-pre-line p-5 text-sm leading-relaxed text-slate-700">{tab === 'description' ? p.description || p.shortDescription : tab === 'terms' ? p.terms || 'No special terms.' : p.refundEligible ? (p.refundPolicy || 'Refund eligible — see our Refund Policy page.') : 'This product is not eligible for refunds.'}</div></div>
          {p.related.length > 0 && <div><h2 className="mb-3 text-lg font-bold">Related products</h2><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{p.related.map((r: any) => <ProductCard key={r.id} p={r} />)}</div></div>}
        </div>
        <aside className="lg:sticky lg:top-24 lg:self-start"><div className="card space-y-4 p-5">
          <div><span className="label">Choose a plan</span><div className="space-y-2">{p.plans.map((x: any) => (
            <label key={x.id} className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 text-sm ${planId === x.id ? 'border-brand bg-brand-50' : 'border-slate-200'} ${!x.inStock ? 'opacity-50' : ''}`}>
              <span className="flex items-center gap-2"><input type="radio" name="plan" checked={planId === x.id} disabled={!x.inStock} onChange={() => setPlanId(x.id)} /><span><span className="font-semibold">{x.name}</span>{x.duration && <span className="block text-xs text-slate-500">{x.duration}</span>}</span></span>
              <span className="text-right"><span className="font-bold text-navy-900">{pkr(x.price)}</span>{x.comparePrice > x.price && <span className="block text-xs text-slate-400 line-through">{pkr(x.comparePrice)}</span>}{!x.inStock && <span className="block text-xs text-red-600">Sold out</span>}</span></label>))}</div></div>
          {p.inputFields.map((f: any) => <label key={f.key} className="block"><span className="label">{f.label}{f.required && ' *'}</span><input className="input" type={f.type === 'number' ? 'text' : f.type} value={input[f.key] ?? ''} onChange={(e) => setIn({ ...input, [f.key]: e.target.value })} />{f.help && <span className="mt-1 block text-xs text-slate-500">{f.help}</span>}</label>)}
          {err && <p className="text-sm text-red-600" role="alert">{err}</p>}
          <button className="btn-primary w-full py-3" disabled={!plan?.inStock} onClick={() => add(true)}>Buy Now · {plan && pkr(plan.price)}</button>
          <button className="btn-outline w-full" disabled={!plan?.inStock} onClick={() => add(false)}><Icon name="cart" className="h-4 w-4" />Add to Cart</button>
          <a className="btn-ghost w-full text-emerald-700" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hi, I have a question about ${p.name}`)}`}><Icon name="whatsapp" className="h-4 w-4" />Ask on WhatsApp</a>
        </div></aside>
      </div>
    </div>
  );
}
