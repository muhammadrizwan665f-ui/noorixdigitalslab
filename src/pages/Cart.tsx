import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from '../lib/router';
import { useApp } from '../lib/store';
import { post, ApiError } from '../lib/api';
import { pkr, uuid } from '../lib/format';
import { Button, Empty, Icon, ProductArt } from '../components/ui';

export default function Cart() {
  const { cart, removeFromCart, setInput, clearCart, me, refresh, toast } = useApp(); const nav = useNavigate();
  const [coupon, setCoupon] = useState(''); const [applied, setApplied] = useState(''); const [quote, setQuote] = useState<any>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [short, setShort] = useState<number | null>(null);
  const idem = useRef(uuid());
  const total = cart.reduce((s, l) => s + l.price, 0);
  useEffect(() => {
    if (!me.user || !cart.length) { setQuote(null); return; }
    let live = true;
    post('/public/quote', { items: cart.map((l) => ({ planId: l.planId, input: l.input })), couponCode: applied || null })
      .then((q) => { if (live) { setQuote(q); setErr(''); } }).catch((e: ApiError) => { if (live) { setQuote(null); setErr(e.message); if (applied) setApplied(''); } });
    return () => { live = false; };
  }, [me.user, cart, applied]);
  if (!cart.length) return <div className="container-x py-12"><div className="card"><Empty title="Your cart is empty" hint="Pick something you like and it will show up here." action={<Link to="/products" className="btn-primary">Browse products</Link>} /></div></div>;
  const missing = cart.find((l) => l.inputFields.some((f: any) => f.required && !(l.input[f.key] ?? '').trim()));
  const place = async () => {
    if (!me.user) { nav('/login?next=/cart'); return; }
    if (missing) { setErr(`Please fill in the required details for ${missing.productName}`); return; }
    setBusy(true); setErr(''); setShort(null);
    try {
      const r = await post('/account/orders', { items: cart.map((l) => ({ planId: l.planId, input: l.input })), couponCode: applied || null, idempotencyKey: idem.current });
      clearCart(); await refresh(); toast('Order placed'); nav(`/dashboard/orders/${r.orderNo}?new=1`);
    } catch (e) { const a = e as ApiError; if (a.code === 'insufficient_funds') setShort(a.extra.shortfall ?? null); setErr(a.message); if (a.code !== 'insufficient_funds' && a.status !== 0) idem.current = uuid(); } finally { setBusy(false); }
  };
  return (
    <div className="container-x py-8"><h1 className="text-2xl font-bold">Checkout</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <div className="card divide-y divide-slate-100">{cart.map((l) => (
            <div key={l.planId} className="p-4"><div className="flex items-center gap-3"><ProductArt name={l.productName} color={l.brandColor} size="h-12 w-12" /><div className="flex-1"><div className="font-semibold">{l.productName}</div><div className="text-sm text-slate-500">{l.planName}</div></div><div className="font-bold">{pkr(l.price)}</div><button aria-label={`Remove ${l.productName}`} className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => removeFromCart(l.planId)}><Icon name="trash" className="h-4 w-4" /></button></div>
              {l.inputFields.length > 0 && <div className="mt-3 grid gap-3 sm:grid-cols-2">{l.inputFields.map((f: any) => <label key={f.key} className="block"><span className="label">{f.label}{f.required && ' *'}</span><input className="input" value={l.input[f.key] ?? ''} onChange={(e) => setInput(l.planId, f.key, e.target.value)} /></label>)}</div>}</div>))}</div>
          <p className="text-xs text-slate-500">Prices are re-checked on the server when you place the order. Delivery details appear in your dashboard under My Orders.</p>
        </div>
        <aside className="lg:sticky lg:top-24 lg:self-start"><div className="card space-y-4 p-5"><h2 className="font-bold">Order Summary</h2>
          {me.user && <div className="flex gap-2"><input className="input" placeholder="Coupon code" value={coupon} onChange={(e) => setCoupon(e.target.value)} aria-label="Coupon code" /><button className="btn-outline" onClick={() => setApplied(coupon.trim())}>Apply</button></div>}
          <dl className="space-y-2 text-sm"><div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd>{pkr(quote?.subtotal ?? total)}</dd></div>{quote?.discount > 0 && <div className="flex justify-between text-emerald-700"><dt>Discount ({quote.coupon})</dt><dd>−{pkr(quote.discount)}</dd></div>}<div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold"><dt>Total</dt><dd>{pkr(quote?.total ?? total)}</dd></div></dl>
          <div className="rounded-lg bg-slate-50 p-3 text-sm"><div className="flex items-center gap-2 font-semibold"><Icon name="wallet" className="h-4 w-4 text-brand" />Pay with Wallet</div>{me.user ? <div className="mt-1 text-slate-600">Balance: <b>{pkr(me.balance)}</b></div> : <div className="mt-1 text-slate-600">Log in to pay from your wallet.</div>}</div>
          {err && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div>}
          {short != null && <Link to="/dashboard/wallet?add=1" className="btn-dark w-full">Add {pkr(short)} to wallet</Link>}
          <Button className="btn-primary w-full py-3" loading={busy} onClick={place}>{me.user ? 'Place Order' : 'Log in to continue'}</Button>
        </div></aside>
      </div></div>
  );
}
