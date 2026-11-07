import { Link } from '../lib/router';
import { useApi } from '../lib/store';
import { Icon, Loading, ErrorBox } from '../components/ui';
import { ProductCard } from '../components/ProductCard';

const Section = ({ title, to, children }: { title: string; to?: string; children: React.ReactNode }) => (
  <section className="container-x mt-12"><div className="mb-4 flex items-end justify-between"><h2 className="text-xl font-bold sm:text-2xl">{title}</h2>{to && <Link to={to} className="text-sm font-semibold text-brand hover:underline">View all →</Link>}</div>{children}</section>
);

export default function Home() {
  const { data, error, loading, reload } = useApi<any>('/public/home');
  if (loading) return <Loading />; if (error || !data) return <div className="container-x py-10"><ErrorBox message={error || 'Could not load'} retry={reload} /></div>;
  const s = data.settings; const banner = data.banners[0];
  return (
    <>
      <section className="bg-gradient-to-br from-navy-900 via-navy-800 to-navy-700 text-white">
        <div className="container-x grid items-center gap-8 py-14 lg:grid-cols-2 lg:py-20">
          <div>
            <span className="badge bg-brand/20 text-cyan2">{s.tagline}</span>
            <h1 className="mt-4 text-3xl font-extrabold leading-tight !text-white sm:text-5xl">{banner?.title || s.hero_title}</h1>
            <p className="mt-4 max-w-xl text-slate-300">{banner?.subtitle || s.hero_subtitle}</p>
            <div className="mt-7 flex flex-wrap gap-3"><Link to={banner?.cta_url || '/products'} className="btn-primary px-6 py-3">{banner?.cta_label || 'Browse Products'}</Link><Link to="/track-order" className="btn border border-white/25 px-6 py-3 text-white hover:bg-white/10">Track Order</Link></div>
          </div>
          <div className="hidden grid-cols-2 gap-3 lg:grid">
            {[['bolt', 'Instant Delivery', 'Automatic products arrive in seconds'], ['shield', 'Secure & Reliable', 'Encrypted deliveries, wallet protected'], ['headset', 'Real Support', 'Tickets and WhatsApp'], ['globe', 'Global Access', 'Digital goods, anywhere']].map(([i, t, d]) => (
              <div key={t} className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur"><Icon name={i} className="h-7 w-7 text-cyan2" /><div className="mt-3 font-semibold">{t}</div><div className="text-sm text-slate-300">{d}</div></div>))}
          </div>
        </div>
      </section>
      <Section title="Browse Categories">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {data.categories.map((c: any) => <Link key={c.slug} to={`/products?category=${c.slug}`} className="card flex items-center gap-3 p-4 transition hover:border-brand/40 hover:shadow-lg"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand"><Icon name={c.icon || 'box'} /></span><span className="text-sm font-semibold leading-tight text-navy-900">{c.name}</span></Link>)}
        </div>
      </Section>
      {data.trending.length > 0 && <Section title="Trending Products" to="/products?flag=trending"><div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">{data.trending.slice(0, 8).map((p: any) => <ProductCard key={p.id} p={p} />)}</div></Section>}
      {data.deals.length > 0 && <Section title="Today's Deals" to="/products?flag=deal"><div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">{data.deals.slice(0, 4).map((p: any) => <ProductCard key={p.id} p={p} />)}</div></Section>}
      {data.featured.length > 0 && <Section title="Featured" to="/products"><div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">{data.featured.slice(0, 4).map((p: any) => <ProductCard key={p.id} p={p} />)}</div></Section>}
      <section className="container-x mt-14"><div className="grid gap-4 rounded-2xl bg-navy-900 p-8 text-white md:grid-cols-3">
        {[['1. Add funds', 'Top up your wallet with Bank Transfer, Easypaisa or JazzCash.'], ['2. Pick a product', 'Choose a plan, enter the details we need and pay from your wallet.'], ['3. Get it delivered', 'Automatic items arrive instantly; manual items are delivered by our team.']].map(([t, d]) => <div key={t}><div className="font-bold text-cyan2">{t}</div><p className="mt-1 text-sm text-slate-300">{d}</p></div>)}
      </div></section>
    </>
  );
}
