import { useState } from 'react';
import { Link, useNavigate } from '../lib/router';
import { useApi, useApp } from '../lib/store';
import { Icon, Loading, ErrorBox } from '../components/ui';
import { ProductCard } from '../components/ProductCard';
import { waLink } from '../lib/format';

const Section = ({ title, sub, to, children }: { title: string; sub?: string; to?: string; children: React.ReactNode }) => (
  <section className="container-x mt-16"><div className="mb-6 flex items-end justify-between gap-4"><div><h2 className="text-2xl font-bold sm:text-3xl">{title}</h2>{sub && <p className="mt-1 max-w-xl text-sm text-slate-500">{sub}</p>}</div>{to && <Link to={to} className="shrink-0 rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold text-navy-900 transition hover:border-brand hover:text-brand">View all</Link>}</div>{children}</section>
);
const Grid = ({ items }: { items: any[] }) => <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">{items.map((p) => <ProductCard key={p.id} p={p} />)}</div>;

/** Animated walk-through of the buying flow. Illustrative only: it shows the steps, not real orders. */
function FlowCard() {
  const steps: [string, string, string][] = [['wallet', 'Fund your wallet', 'Easypaisa, JazzCash or bank transfer'], ['cart', 'Place the order', 'Paid from your PKR wallet balance'], ['bolt', 'Receive your product', 'Instant, or from our team on manual items']];
  return (
    <div className="relative mx-auto w-full max-w-md animate-float">
      <div className="absolute -inset-6 rounded-[2rem] bg-brand/30 blur-3xl" aria-hidden="true" />
      <div className="glass relative rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center justify-between"><div className="text-sm font-semibold text-white">How buying works</div><span className="badge bg-white/10 text-slate-200">3 steps</span></div>
        <ol className="mt-5 space-y-3">
          {steps.map(([icon, t, d], i) => (
            <li key={t} className="animate-rise flex items-center gap-4 rounded-2xl bg-white/[.07] p-4" style={{ animationDelay: `${0.25 + i * 0.35}s` }}>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand text-white shadow-glow"><Icon name={icon} /></span>
              <div className="min-w-0 flex-1"><div className="font-semibold text-white">{t}</div><div className="text-xs text-slate-300">{d}</div></div>
              <span className="grid h-6 w-6 shrink-0 animate-pop place-items-center rounded-full bg-emerald-400 text-navy-900" style={{ animationDelay: `${0.7 + i * 0.35}s` }}><Icon name="check" className="h-3.5 w-3.5" /></span>
            </li>))}
        </ol>
        <div className="mt-5 flex items-center gap-2 rounded-xl bg-black/20 px-4 py-3 text-xs text-slate-300"><Icon name="shield" className="h-4 w-4 text-cyan2" />Every wallet movement is recorded in a permanent ledger.</div>
      </div>
    </div>
  );
}

export default function Home() {
  const { data, error, loading, reload } = useApi<any>('/public/home'); const nav = useNavigate(); const { settings } = useApp(); const [q, setQ] = useState('');
  if (loading) return <Loading />; if (error || !data) return <div className="container-x py-10"><ErrorBox message={error || 'Could not load'} retry={reload} /></div>;
  const s = data.settings; const banner = data.banners[0]; const wa = settings.whatsapp || '923154429417';
  const search = (e: React.FormEvent) => { e.preventDefault(); nav(`/products${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`); };
  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-br from-navy-950 via-navy-900 to-navy-700 text-white">
        <div className="hero-grid absolute inset-0" aria-hidden="true" />
        <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-brand/30 blur-3xl" aria-hidden="true" />
        <div className="container-x relative grid grid-cols-1 items-center gap-12 py-16 lg:grid-cols-[1.15fr_1fr] lg:py-24">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-slate-200"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{s.tagline}</span>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.08] tracking-tight !text-white sm:text-5xl lg:text-6xl">{banner?.title || s.hero_title}</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-300">{banner?.subtitle || s.hero_subtitle}</p>
            <form onSubmit={search} role="search" className="mt-8 flex max-w-xl gap-2 rounded-2xl border border-white/15 bg-white/10 p-1.5 backdrop-blur transition focus-within:border-brand focus-within:bg-white/15">
              <Icon name="search" className="ml-3 mt-3 h-5 w-5 shrink-0 text-slate-300" />
              <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products" placeholder="Search streaming, AI tools, software" className="min-w-0 flex-1 bg-transparent px-1 text-white placeholder:text-slate-400 focus:outline-none" />
              <button className="btn-primary px-5">Search</button>
            </form>
            {data.categories.length > 0 && <div className="mt-5 flex max-w-xl flex-wrap gap-2">{data.categories.slice(0, 5).map((c: any) => <Link key={c.slug} to={`/products?category=${c.slug}`} className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-white/40 hover:bg-white/10">{c.name}</Link>)}</div>}
          </div>
          <FlowCard />
        </div>
      </section>

      <section className="container-x -mt-8 relative z-10">
        <div className="card grid gap-px overflow-hidden bg-line sm:grid-cols-2 lg:grid-cols-4">
          {[['bolt', 'Instant delivery', 'Automatic products arrive within seconds of payment.'], ['wallet', 'One PKR wallet', 'Top up once, check out in a click.'], ['shield', 'Encrypted delivery', 'Logins and keys are stored encrypted.'], ['headset', 'Real support', 'Tickets and WhatsApp, answered by people.']].map(([i, t, d]) => (
            <div key={t} className="flex items-start gap-4 bg-surface p-5"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand"><Icon name={i} /></span><div><div className="font-semibold text-navy-900">{t}</div><div className="mt-0.5 text-sm text-slate-500">{d}</div></div></div>))}
        </div>
      </section>

      <Section title="Browse by category" sub="Everything you need, grouped so you can find it fast.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {data.categories.map((c: any) => <Link key={c.slug} to={`/products?category=${c.slug}`} className="card group flex flex-col items-start gap-4 p-5 transition duration-200 hover:-translate-y-1 hover:border-brand/40 hover:shadow-lift"><span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-brand transition group-hover:bg-brand group-hover:text-white"><Icon name={c.icon || 'box'} className="h-6 w-6" /></span><span className="font-semibold leading-tight text-navy-900">{c.name}</span></Link>)}
        </div>
      </Section>

      {data.trending.length > 0 && <Section title="Trending now" sub="What customers are buying most." to="/products?flag=trending"><Grid items={data.trending.slice(0, 8)} /></Section>}
      {data.deals.length > 0 && <Section title="Today's deals" sub="Reduced prices for a limited time." to="/products?flag=deal"><Grid items={data.deals.slice(0, 4)} /></Section>}
      {data.featured.length > 0 && <Section title="Featured" to="/products"><Grid items={data.featured.slice(0, 4)} /></Section>}

      <Section title="Three steps to your first order">
        <div className="grid gap-4 md:grid-cols-3">
          {[['Add funds', 'Send money by Bank Transfer, Easypaisa or JazzCash and submit the transaction ID. We verify it and credit your wallet.'], ['Pick a product', 'Choose a plan, give us any details we need, and pay from your wallet balance.'], ['Get it delivered', 'Automatic items appear in your dashboard instantly. Manual items are delivered by our team and you are notified.']].map(([t, d], i) => (
            <div key={t} className="card relative p-6"><span className="grid h-9 w-9 place-items-center rounded-full bg-brand text-sm font-bold text-white">{i + 1}</span><h3 className="mt-4 text-lg font-bold">{t}</h3><p className="mt-2 text-sm leading-relaxed text-slate-500">{d}</p></div>))}
        </div>
      </Section>

      <section className="container-x mt-16">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy-900 to-navy-700 p-8 text-white sm:p-12">
          <div className="absolute -right-10 -top-10 h-56 w-56 rounded-full bg-brand/40 blur-3xl" aria-hidden="true" />
          <div className="relative flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div><h2 className="text-2xl font-bold !text-white sm:text-3xl">Need something we do not list yet?</h2><p className="mt-2 max-w-xl text-slate-300">Message us on WhatsApp with the product you need and we will tell you if we can supply it, and at what price.</p></div>
            <a href={waLink(wa, 'Hello Noorix Digital Lab, I am looking for a product')} target="_blank" rel="noopener noreferrer" className="btn shrink-0 bg-white px-6 py-3 text-navy-900 hover:bg-slate-100"><Icon name="whatsapp" className="h-5 w-5" />Message us</a>
          </div>
        </div>
      </section>
    </>
  );
}
