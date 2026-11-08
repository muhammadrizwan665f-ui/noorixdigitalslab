import { useEffect, useState } from 'react';
import { Link, useNavigate } from '../lib/router';
import { useApi, useApp } from '../lib/store';
import { Icon, Loading, ErrorBox } from '../components/ui';
import { HeroScene } from '../components/HeroArt';
import { ProductCard } from '../components/ProductCard';
import { splitName } from '../lib/brand';
import { waLink } from '../lib/format';

const Head = ({ eyebrow, title, sub, to, cta = 'View all' }: { eyebrow?: string; title: string; sub?: string; to?: string; cta?: string }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h2 className="text-2xl font-extrabold sm:text-4xl">{title}</h2>{sub && <p className="mt-2 max-w-xl text-sm text-slate-500 sm:text-base">{sub}</p>}</div>
    {to && <Link to={to} className="btn-outline !rounded-full">{cta}<Icon name="arrow" className="h-4 w-4" /></Link>}</div>
);
const Grid = ({ items, cols = 'lg:grid-cols-4' }: { items: any[]; cols?: string }) => <div className={`grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 sm:gap-5 ${cols}`}>{items.map((p) => <ProductCard key={p.id} p={p} />)}</div>;

export default function Home() {
  const { data, error, loading, reload } = useApi<any>('/public/home'); const nav = useNavigate(); const { settings, brand } = useApp(); const [q, setQ] = useState(''); const [slide, setSlide] = useState(0);
  const n = data?.banners?.length ?? 0;
  useEffect(() => { if (n < 2) return; const t = setInterval(() => setSlide((x) => (x + 1) % n), 7000); return () => clearInterval(t); }, [n]);
  if (loading) return <Loading />; if (error || !data) return <div className="container-x py-10"><ErrorBox message={error || 'Could not load'} retry={reload} /></div>;
  const s = data.settings; const banner = data.banners[slide % Math.max(n, 1)]; const wa = settings.whatsapp || '923154429417';
  const [bA, bB] = splitName(brand.name); const words = brand.tagline.trim().split(/\s+/); const tagLast = words.length > 2 ? words.pop() : ''; const tagHead = words.join(' ');
  const search = (e: React.FormEvent) => { e.preventDefault(); nav(`/products${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`); };
  const stage = [...data.trending, ...data.featured, ...data.deals].filter((p: any, i: number, a: any[]) => a.findIndex((x) => x.id === p.id) === i);
  const cats = data.categories as any[];
  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-navy-900 via-navy-950 to-navy-950 text-white">
        <div className="hero-grid absolute inset-0 opacity-60" aria-hidden="true" />
        <div className="absolute -right-32 -top-24 h-[34rem] w-[34rem] rounded-full bg-brand/35 blur-[120px]" aria-hidden="true" />
        <div className="absolute -left-40 bottom-0 h-80 w-80 rounded-full bg-cyan2/15 blur-[100px]" aria-hidden="true" />
        {n > 1 && <><button aria-label="Previous slide" onClick={() => setSlide((slide + n - 1) % n)} className="absolute left-2 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-brand/40 bg-navy-900/80 hover:bg-brand sm:grid"><Icon name="arrow" className="h-5 w-5 rotate-180" /></button><button aria-label="Next slide" onClick={() => setSlide((slide + 1) % n)} className="absolute right-2 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-brand/40 bg-navy-900/80 hover:bg-brand sm:grid"><Icon name="arrow" className="h-5 w-5" /></button></>}
        <div className="container-x relative grid grid-cols-1 items-center gap-6 py-10 sm:px-16 lg:grid-cols-[1fr_1.05fr] lg:py-14">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/50 bg-brand/10 px-4 py-1.5 text-sm font-semibold text-slate-100"><Icon name="crown" className="h-4 w-4 text-amber-400" />{banner?.title || 'Premium Digital Services'}</span>
            <h1 className="mt-5 !text-white"><span className="block text-6xl font-black italic leading-none tracking-tight sm:text-8xl">{bA && <span className="bg-gradient-to-r from-cyan2 to-brand bg-clip-text text-transparent">{bA}</span>}{bB}</span>
              <span className="mt-3 block text-3xl font-extrabold italic leading-tight sm:text-5xl">{tagHead}{tagLast && <> <span className="bg-gradient-to-r from-cyan2 to-brand bg-clip-text text-transparent">{tagLast}</span></>}</span></h1>
            <p className="mt-5 max-w-xl text-lg text-slate-300">{banner?.subtitle || s.hero_subtitle || 'Get your favourite services at the best prices.'}</p>
            <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-slate-100">{['Instant delivery', 'Verified payments', 'Support on WhatsApp'].map((t) => <li key={t} className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-brand"><Icon name="check" className="h-3 w-3" /></span>{t}</li>)}</ul>
            <form onSubmit={search} role="search" className="mt-7 flex max-w-xl items-center gap-1 rounded-full border border-brand/50 bg-navy-900/80 p-1.5 shadow-[0_0_40px_-10px_rgb(var(--brand)/.6)] backdrop-blur transition focus-within:border-brand">
              <Icon name="search" className="ml-3.5 h-5 w-5 shrink-0 text-slate-300" />
              <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products" placeholder="Search streaming, AI tools, software…" className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-white placeholder:text-slate-400 focus:outline-none" />
              <button className="btn-primary !rounded-full px-6"><Icon name="search" className="h-4 w-4" />Search</button>
            </form>
            <div className="mt-5 flex flex-wrap gap-3"><Link to={banner?.cta_url || '/products'} className="btn-primary shine !rounded-full px-7 py-3">{banner?.cta_label || 'Browse products'}<Icon name="arrow" className="h-4 w-4" /></Link><Link to="/track-order" className="btn !rounded-full border border-white/25 px-7 py-3 text-white hover:bg-white/10">Track order</Link></div>
            
          </div>
          <div><HeroScene products={stage} name={brand.name} />{n > 1 && <div className="mt-2 flex justify-center gap-2">{data.banners.map((b: any, i: number) => <button key={b.id} aria-label={`Slide ${i + 1}`} onClick={() => setSlide(i)} className={`h-2.5 rounded-full transition-all ${i === slide % n ? 'w-6 bg-brand' : 'w-2.5 bg-white/30'}`} />)}</div>}</div>
        </div>
      </section>

      <section className="container-x relative z-10 -mt-2">
        <div className="card grid grid-cols-2 divide-line sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
          {[['bolt', 'Instant delivery', 'Automatic products arrive in seconds'], ['shield', 'Secure wallet', 'Every rupee tracked in a ledger'], ['tag', 'Clear pricing', 'Prices shown in PKR, per plan'], ['headset', 'Real support', 'Tickets and WhatsApp'], ['check', 'Verified payments', 'Each deposit is checked by our team']].map(([i, t, d]) => (
            <div key={t} className="flex flex-col items-center gap-1 p-5 text-center"><Icon name={i} className="h-8 w-8 text-brand drop-shadow-[0_0_10px_rgb(var(--brand)/.8)]" /><div className="mt-1 font-bold text-navy-900">{t}</div><div className="text-xs text-slate-500">{d}</div></div>))}
        </div>
      </section>

      {cats.length > 0 && <section className="container-x mt-14"><Head eyebrow="Explore categories" title="Browse by Category" sub="Find exactly what you need from our wide range of digital products." to="/products" cta="View All Products" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {cats.map((c) => <Link key={c.slug} to={`/products?category=${c.slug}`} className="card group flex min-h-[112px] flex-col items-center justify-center gap-3 p-4 text-center transition duration-300 hover:-translate-y-1 hover:shadow-glow"><Icon name={c.icon || 'box'} className="h-9 w-9 text-brand drop-shadow-[0_0_12px_rgb(var(--brand)/.9)] transition group-hover:scale-110 group-hover:text-cyan2" /><span className="text-sm font-bold leading-tight text-navy-900">{c.name}</span></Link>)}
        </div></section>}

      {data.trending.length > 0 && <section className="container-x mt-16"><div className="grid gap-6 xl:grid-cols-[280px_1fr]">
        <div className="flex flex-col justify-center"><div className="eyebrow">Trending Now</div><h2 className="text-3xl font-extrabold sm:text-4xl">Most Popular Digital Products</h2><p className="mt-3 text-slate-500">Picked by our team. Choose a plan and check out from your wallet.</p><Link to="/products?flag=trending" className="btn-primary mt-6 w-fit !rounded-full px-6 py-3">Shop Now<Icon name="arrow" className="h-4 w-4" /></Link></div>
        <Grid items={data.trending.slice(0, 4)} cols="lg:grid-cols-4" /></div></section>}

      {data.bestSellers.length > 0 && <section className="container-x mt-16"><Head eyebrow="Best sellers" title="What customers buy most" sub="Ranked by completed orders." to="/products?sort=popular" /><Grid items={data.bestSellers.slice(0, 4)} /></section>}

      {data.deals.length > 0 && <section className="container-x mt-16">
        <div className="relative mb-6 overflow-hidden rounded-3xl border border-brand/40 bg-gradient-to-r from-navy-700 via-navy-800 to-navy-900 p-7 sm:p-10">
          <div className="absolute -right-10 -top-16 h-64 w-64 rounded-full bg-brand/50 blur-3xl" aria-hidden="true" />
          <div className="relative flex flex-col items-start justify-between gap-5 md:flex-row md:items-center"><div><span className="badge bg-red-600 text-white">Special deals</span><h2 className="mt-3 text-3xl font-extrabold !text-white sm:text-4xl">Reduced prices on {data.deals.length} {data.deals.length === 1 ? 'product' : 'products'}</h2><p className="mt-2 max-w-lg text-slate-300">Limited-time prices set by our team. Compare plans and save before they change.</p></div><Link to="/products?flag=deal" className="btn shrink-0 !rounded-full bg-white px-7 py-3 text-navy-900 hover:bg-slate-100">See all deals<Icon name="arrow" className="h-4 w-4" /></Link></div>
        </div><Grid items={data.deals.slice(0, 4)} /></section>}

      {data.featured.length > 0 && <section className="container-x mt-16"><Head eyebrow="Hand-picked" title="Featured products" to="/products?flag=featured" /><Grid items={data.featured.slice(0, 4)} /></section>}

      <section className="container-x mt-16"><Head eyebrow="How it works" title="Three steps to your first order" />
        <div className="grid gap-4 md:grid-cols-3">
          {[['wallet', 'Add funds', 'Send money by Bank Transfer, Easypaisa or JazzCash and submit the transaction ID. We verify it and credit your wallet.'], ['cart', 'Pick a product', 'Choose a plan, give us any details we need, and pay from your wallet balance.'], ['bolt', 'Get it delivered', 'Automatic items appear in your dashboard instantly. Manual items are delivered by our team and you are notified.']].map(([ic, t, d], i) => (
            <div key={t} className="card relative p-6"><div className="flex items-center justify-between"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand text-white shadow-glow"><Icon name={ic} /></span><span className="text-5xl font-black text-brand/20">{i + 1}</span></div><h3 className="mt-5 text-xl font-bold">{t}</h3><p className="mt-2 text-sm leading-relaxed text-slate-500">{d}</p></div>))}
        </div></section>

      <section className="container-x mt-16"><div className="relative overflow-hidden rounded-3xl border border-brand/30 bg-gradient-to-br from-navy-800 to-navy-950 p-7 sm:p-10">
        <div className="absolute -left-10 bottom-0 h-56 w-56 rounded-full bg-brand/30 blur-3xl" aria-hidden="true" />
        <div className="relative grid items-center gap-8 lg:grid-cols-[1fr_1.4fr]">
          <div><div className="eyebrow">Security & support</div><h2 className="text-3xl font-extrabold !text-white">Built to be trusted with your money</h2><a href={waLink(wa, `Hello ${brand.name}, I have a question`)} target="_blank" rel="noopener noreferrer" className="btn-primary mt-6 !rounded-full px-6 py-3"><Icon name="whatsapp" className="h-5 w-5" />Talk to us on WhatsApp</a></div>
          <div className="grid gap-3 sm:grid-cols-3">{[['lock', 'Encrypted delivery', 'Logins and keys are stored encrypted and shown only to the buyer.'], ['list', 'Permanent ledger', 'Every wallet credit and debit is recorded and cannot be edited.'], ['headset', 'Human support', 'Open a ticket or message us on WhatsApp for help with any order.']].map(([ic, t, d]) => <div key={t} className="rounded-2xl border border-white/10 bg-white/5 p-5"><Icon name={ic} className="h-7 w-7 text-cyan2" /><div className="mt-3 font-bold text-white">{t}</div><p className="mt-1 text-sm text-slate-300">{d}</p></div>)}</div>
        </div></div></section>

      <section className="container-x mt-16"><div className="relative flex flex-col gap-5 overflow-hidden rounded-3xl border border-brand/40 bg-gradient-to-r from-navy-900 via-navy-800 to-navy-900 p-5 sm:p-6 lg:flex-row lg:items-center">
        <div className="flex items-center gap-4 lg:border-r lg:border-white/10 lg:pr-8"><Icon name="shield" className="h-12 w-12 shrink-0 text-brand drop-shadow-[0_0_14px_rgb(var(--brand)/.9)]" /><div className="text-lg font-bold leading-tight text-white">Safe, verified<br />payments</div></div>
        <div className="grid flex-1 gap-4 sm:grid-cols-3">{[['wallet', 'Secure Payments', 'Easypaisa, JazzCash, bank'], ['bolt', 'Instant Activation', 'On automatic products'], ['headset', 'Dedicated Support', 'Tickets and WhatsApp']].map(([ic, t, d]) => <div key={t} className="flex items-center gap-3"><Icon name={ic} className="h-8 w-8 shrink-0 text-cyan2" /><div><div className="text-sm font-bold text-white">{t}</div><div className="text-xs text-slate-400">{d}</div></div></div>)}</div>
        <div className="rounded-2xl bg-gradient-to-r from-brand to-brand-600 px-8 py-3 text-center shadow-glow"><div className="text-xs text-white/80">Powered by</div><div className="text-2xl font-black italic text-white">{brand.name}</div></div>
      </div></section>
    </>
  );
}
