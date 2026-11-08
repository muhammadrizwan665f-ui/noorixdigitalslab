import { Link } from '../lib/router';
import { useApi, useApp } from '../lib/store';
import { Badge, Icon, ProductArt } from '../components/ui';
import { ProductCard } from '../components/ProductCard';
import { pkr } from '../lib/format';

interface Props {
  p: any; plan: any; planId: string; setPlanId: (id: string) => void;
  input: Record<string, string>; setIn: (v: Record<string, string>) => void; err: string; add: (buy: boolean) => void;
}

const DELIVERY: Record<string, [string, string]> = {
  automatic: ['Instant delivery', 'Your login or key appears in your dashboard right after payment.'],
  manual: ['Delivered by our team', 'We prepare your order and notify you as soon as it is ready.'],
  api: ['Automated delivery', 'Your order is processed automatically after payment and shown in your dashboard.'],
};

const dur = (x: any) => (x?.duration && x.duration.trim().toLowerCase() !== x.name.trim().toLowerCase() ? x.duration : '');
const Block = ({ title, children }: { title: string; children: React.ReactNode }) => <section className="mt-6"><h2 className="mb-3 text-lg font-extrabold">{title}</h2>{children}</section>;

/** Mobile-only product page (below 768px). Desktop keeps its own layout in Catalog.tsx. */
export function MobileProductDetail({ p, plan, planId, setPlanId, input, setIn, err, add }: Props) {
  const { me } = useApp(); const faqs = useApi<any[]>('/public/faqs');
  const off = plan && plan.comparePrice > plan.price ? Math.round((1 - plan.price / plan.comparePrice) * 100) : 0;
  const [dTitle, dText] = DELIVERY[p.deliveryType] ?? DELIVERY.manual;
  const short = me.user && plan && me.balance < plan.price ? plan.price - me.balance : 0;
  return (
    <div className="pb-4">
      <div className="container-x pt-3">
        <Link to="/products" className="inline-flex items-center gap-1.5 py-2 text-sm font-semibold text-slate-500"><Icon name="arrow" className="h-4 w-4 rotate-180" />{p.category}</Link>

        <div className="relative overflow-hidden rounded-3xl border border-brand/25 px-6 pb-6 pt-9 text-center" style={{ background: `radial-gradient(circle at 50% 35%, ${p.brandColor}55, transparent 70%), linear-gradient(160deg, rgb(var(--n800)), rgb(var(--n950)))` }}>
          {off > 0 && <span className="absolute right-3 top-3 rounded-lg bg-red-600 px-2.5 py-1 text-xs font-bold text-white shadow-lg">{off}% OFF</span>}
          <div className="mx-auto grid place-items-center" style={{ filter: `drop-shadow(0 16px 30px ${p.brandColor}99)` }}>
            {p.imageUrl ? <img src={p.imageUrl} alt={p.name} className="max-h-32 max-w-[70%] object-contain" /> : <ProductArt name={p.name} color={p.brandColor} size="h-28 w-28" text="text-4xl" />}
          </div>
        </div>

        <h1 className="mt-5 text-2xl font-extrabold leading-tight">{p.name}</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{p.shortDescription}</p>
        <div className="mt-3 flex flex-wrap gap-2"><Badge status={p.inStock ? 'completed' : 'cancelled'} label={p.inStock ? 'In stock' : 'Out of stock'} /><span className="badge bg-slate-100 text-slate-600">{dTitle}</span>{p.refundEligible && <span className="badge bg-emerald-100 text-emerald-700">Refund eligible</span>}{p.demo && <span className="badge bg-amber-100 text-amber-700">Demo product</span>}</div>

        {plan && <div className="card mt-5 flex items-end justify-between gap-3 p-4" aria-live="polite">
          <div><div className="text-xs text-slate-500">{plan.name}{dur(plan) ? ` · ${dur(plan)}` : ''}</div><div className="text-3xl font-extrabold text-navy-900">{pkr(plan.price)}</div></div>
          {off > 0 && <div className="text-right"><div className="text-sm text-slate-400 line-through">{pkr(plan.comparePrice)}</div><span className="badge bg-red-600 text-white">Save {off}%</span></div>}
        </div>}

        <Block title="Choose your plan">
          <div role="radiogroup" aria-label="Subscription plans" className="grid grid-cols-2 gap-3">
            {p.plans.map((x: any) => { const on = planId === x.id; const d = x.comparePrice > x.price ? Math.round((1 - x.price / x.comparePrice) * 100) : 0; return (
              <button key={x.id} type="button" role="radio" aria-checked={on} disabled={!x.inStock} onClick={() => setPlanId(x.id)}
                className={`relative rounded-2xl border-2 p-3.5 text-left transition disabled:opacity-50 ${on ? 'border-brand bg-brand-50 shadow-glow' : 'border-line bg-surface'}`}>
                {on && <span className="absolute right-2.5 top-2.5 grid h-5 w-5 place-items-center rounded-full bg-brand text-white"><Icon name="check" className="h-3 w-3" /></span>}
                <div className="pr-6 text-sm font-bold text-navy-900">{x.name}</div>
                {dur(x) && <div className="text-xs text-slate-500">{dur(x)}</div>}
                <div className="mt-2 text-lg font-extrabold text-navy-900">{pkr(x.price)}</div>
                {x.comparePrice > x.price && <div className="text-xs text-slate-400"><span className="line-through">{pkr(x.comparePrice)}</span> <span className="font-semibold text-red-500">-{d}%</span></div>}
                {!x.inStock && <div className="mt-1 text-xs font-semibold text-red-500">Sold out</div>}
              </button>); })}
          </div>
        </Block>

        {p.inputFields.length > 0 && <Block title="Your details"><div className="card space-y-3 p-4">{p.inputFields.map((f: any) => <label key={f.key} className="block"><span className="label">{f.label}{f.required && ' *'}</span><input className="input" type={f.type === 'number' ? 'text' : f.type} value={input[f.key] ?? ''} onChange={(e) => setIn({ ...input, [f.key]: e.target.value })} />{f.help && <span className="mt-1 block text-xs text-slate-500">{f.help}</span>}</label>)}</div></Block>}

        {p.features.length > 0 && <Block title="Features & benefits"><ul className="card space-y-3 p-4 text-sm">{p.features.map((f: string) => <li key={f} className="flex gap-3"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand/15 text-brand"><Icon name="check" className="h-3 w-3" /></span>{f}</li>)}</ul></Block>}

        <Block title="Delivery information"><div className="card space-y-3 p-4 text-sm">
          <div className="flex gap-3"><Icon name="bolt" className="h-6 w-6 shrink-0 text-cyan2" /><div><div className="font-bold text-navy-900">{dTitle}</div><div className="text-slate-500">{dText}</div></div></div>
          <div className="flex gap-3"><Icon name="wallet" className="h-6 w-6 shrink-0 text-cyan2" /><div><div className="font-bold text-navy-900">Pay from your wallet</div><div className="text-slate-500">{me.user ? <>Wallet balance: <b className="text-navy-900">{pkr(me.balance)}</b>{short > 0 && <> · <Link to="/dashboard/wallet?add=1" className="font-semibold text-brand">Add {pkr(short)} more</Link></>}</> : <><Link to="/login" className="font-semibold text-brand">Log in</Link> to pay from your wallet at checkout.</>}</div></div></div>
          <div className="flex gap-3"><Icon name="shield" className="h-6 w-6 shrink-0 text-cyan2" /><div><div className="font-bold text-navy-900">{p.refundEligible ? 'Refund eligible' : 'Not eligible for refunds'}</div><div className="text-slate-500">{p.refundEligible ? (p.refundPolicy || 'See our Refund Policy page for details.') : 'Please check the details before you buy.'}</div></div></div>
        </div></Block>

        {(p.description || p.terms) && <Block title="About this product"><div className="space-y-2">
          {p.description && <details className="card group p-4" open><summary className="cursor-pointer list-none font-bold text-navy-900">Description</summary><p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-500">{p.description}</p></details>}
          {p.terms && <details className="card group p-4"><summary className="cursor-pointer list-none font-bold text-navy-900">Terms</summary><p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-500">{p.terms}</p></details>}
        </div></Block>}

        {faqs.data && faqs.data.length > 0 && <Block title="FAQs"><div className="space-y-2">{faqs.data.slice(0, 6).map((f) => <details key={f.id} className="card group p-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-navy-900">{f.question}<Icon name="down" className="h-4 w-4 shrink-0 transition group-open:rotate-180" /></summary><p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-500">{f.answer}</p></details>)}</div><Link to="/support" className="mt-3 inline-block text-sm font-semibold text-brand">More help & FAQs</Link></Block>}
      </div>

      {p.related.length > 0 && <section className="mt-6"><h2 className="container-x mb-3 text-lg font-extrabold">Related products</h2>
        <div className="flex snap-x gap-3 overflow-x-auto px-4 pb-2 scrollbar-none">{p.related.map((r: any) => <div key={r.id} className="w-44 shrink-0 snap-start"><ProductCard p={r} compact /></div>)}</div></section>}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-brand/30 bg-navy-900 px-4 pt-3 text-white shadow-[0_-12px_30px_-10px_rgb(0_0_0/.6)]" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + .75rem)' }}>
        {err && <p className="mb-2 text-xs font-semibold text-red-300" role="alert">{err}</p>}
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1"><div className="truncate text-xs text-slate-300">{plan ? `${plan.name}${dur(plan) ? ` · ${dur(plan)}` : ''}` : p.name}</div><div className="text-xl font-extrabold">{plan ? pkr(plan.price) : ''}</div></div>
          <button type="button" aria-label="Add to cart" disabled={!plan?.inStock} onClick={() => add(false)} className="grid h-12 w-12 place-items-center rounded-xl border border-white/25 transition hover:bg-white/10 disabled:opacity-50"><Icon name="cart" /></button>
          <button type="button" disabled={!plan?.inStock} onClick={() => add(true)} className="btn-primary h-12 px-7 text-base">{plan?.inStock === false ? 'Sold out' : 'Buy Now'}</button>
        </div>
      </div>
    </div>
  );
}
