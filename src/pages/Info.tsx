import { useEffect, useState } from 'react';
import { Link } from '../lib/router';
import { useApi, useApp } from '../lib/store';
import { post, ApiError } from '../lib/api';
import { Button, ErrorBox, Field, Loading, Badge } from '../components/ui';
import { fmtDateTime, pkr, waLink } from '../lib/format';

export function CmsPage({ slug }: { slug: string }) {
  const { data, loading, error } = useApi<any>('/public/pages/' + slug); const { brand } = useApp();
  useEffect(() => { if (data) document.title = `${data.title} — ${brand.name}`; }, [data, brand.name]);
  if (loading) return <Loading />;
  return <div className="container-x max-w-3xl py-10">{error || !data ? <ErrorBox message={error || 'Page not found'} /> : <article className="card p-7"><h1 className="text-2xl font-bold">{data.title}</h1><div className="mt-4 whitespace-pre-line leading-relaxed text-slate-700">{data.body}</div></article>}</div>;
}

export function Support() {
  const { settings, me } = useApp(); const faqs = useApi<any[]>('/public/faqs'); const wa = settings.whatsapp || '923154429417';
  return <div className="container-x max-w-4xl py-10"><h1 className="text-2xl font-bold sm:text-3xl">Support</h1><p className="mt-1 text-slate-600">We usually reply within a few hours.</p>
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <div className="card p-5"><h2 className="font-bold">Support tickets</h2><p className="mt-1 text-sm text-slate-600">Best for order and payment issues — you can attach screenshots and follow the conversation.</p><Link to={me.user ? '/dashboard/tickets' : '/login?next=/dashboard/tickets'} className="btn-primary mt-4">{me.user ? 'Open my tickets' : 'Log in to open a ticket'}</Link></div>
      <div className="card p-5"><h2 className="font-bold">WhatsApp</h2><p className="mt-1 text-sm text-slate-600">Quick questions before you buy. Official number: 0{wa.replace(/^92/, '')}</p><a className="btn-dark mt-4" target="_blank" rel="noopener noreferrer" href={waLink(wa, 'Hello Noorix Digital Lab')}>Chat on WhatsApp</a></div></div>
    <h2 className="mt-10 text-xl font-bold">Frequently asked questions</h2>
    <div className="mt-4 space-y-3">{faqs.loading ? <Loading /> : faqs.data?.map((f) => <details key={f.id} className="card group p-4"><summary className="cursor-pointer list-none font-semibold text-navy-900">{f.question}</summary><p className="mt-2 text-sm text-slate-600">{f.answer}</p></details>)}</div></div>;
}

export function TrackOrder() {
  const [orderNo, setNo] = useState(''); const [email, setEmail] = useState(''); const [res, setRes] = useState<any>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setErr(''); setRes(null); try { setRes(await post('/public/track', { orderNo, email })); } catch (x) { setErr((x as ApiError).message); } finally { setBusy(false); } };
  return <div className="container-x max-w-2xl py-10"><h1 className="text-2xl font-bold sm:text-3xl">Track your order</h1><p className="mt-1 text-slate-600">Enter your order number and the email you registered with.</p>
    <form onSubmit={submit} className="card mt-6 grid gap-4 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><Field label="Order number" placeholder="NXABC12345" required value={orderNo} onChange={(e) => setNo(e.target.value)} /><Field label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /><Button loading={busy} className="btn-primary">Track</Button></form>
    {err && <div className="mt-4"><ErrorBox message={err} /></div>}
    {res && <div className="card mt-6 p-5"><div className="flex items-center justify-between"><div><div className="font-bold">{res.orderNo}</div><div className="text-sm text-slate-500">{fmtDateTime(res.createdAt)} · {pkr(res.total)}</div></div><Badge status={res.status} /></div>
      <ul className="mt-4 space-y-1 text-sm">{res.items.map((i: any, k: number) => <li key={k} className="flex justify-between"><span>{i.product_name} — {i.plan_name}</span><Badge status={i.status} /></li>)}</ul>
      <ol className="mt-5 space-y-3 border-l-2 border-brand/30 pl-4">{res.events.map((e: any, k: number) => <li key={k} className="relative text-sm"><span className="absolute -left-[22px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand" /><div className="font-medium">{e.message}</div><div className="text-xs text-slate-500">{fmtDateTime(e.created_at)}</div></li>)}</ol>
      <p className="mt-4 text-xs text-slate-500">Log in to your dashboard to view delivery details.</p></div>}</div>;
}

export function NotFound() { return <div className="container-x py-20 text-center"><h1 className="text-5xl font-extrabold text-brand">404</h1><p className="mt-2 text-slate-600">That page doesn&apos;t exist.</p><Link to="/" className="btn-primary mt-6">Go home</Link></div>; }
