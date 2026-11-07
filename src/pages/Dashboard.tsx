import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useRouter, useSearch } from '../lib/router';
import { useApi, useApp } from '../lib/store';
import { api, get, post, patch, ApiError } from '../lib/api';
import { Badge, Button, Empty, ErrorBox, Field, Icon, Loading, Pagination, Select, Table, TextArea, useAction } from '../components/ui';
import { fmtDate, fmtDateTime, pkr, toPaisa } from '../lib/format';

const NAV: [string, string, string][] = [['/dashboard', 'Dashboard', 'home'], ['/dashboard/wallet', 'Wallet', 'wallet'], ['/dashboard/orders', 'My Orders', 'box'], ['/dashboard/tickets', 'Support Tickets', 'ticket'], ['/dashboard/notifications', 'Notifications', 'bell'], ['/dashboard/settings', 'Profile & Security', 'cog']];

export function DashboardShell({ children }: { children: ReactNode }) {
  const { me, logout } = useApp(); const { path } = useRouter(); const nav = useNavigate();
  return (
    <div className="container-x grid gap-6 py-8 lg:grid-cols-[250px_1fr]">
      <aside className="card h-fit overflow-hidden"><div className="bg-navy-900 p-5 text-white"><div className="grid h-12 w-12 place-items-center rounded-full bg-brand text-lg font-bold">{me.user?.name[0]?.toUpperCase()}</div><div className="mt-3 font-semibold">{me.user?.name}</div><div className="truncate text-xs text-slate-300">{me.user?.email}</div></div>
        <nav className="flex gap-1 overflow-x-auto p-2 lg:flex-col" aria-label="Account">{NAV.map(([to, label, icon]) => { const on = to === '/dashboard' ? path === to : path.startsWith(to); return <Link key={to} to={to} aria-current={on ? 'page' : undefined} className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${on ? 'bg-brand-50 text-brand' : 'text-slate-600 hover:bg-slate-50'}`}><Icon name={icon} className="h-4 w-4" />{label}{to.endsWith('notifications') && me.unread > 0 && <span className="ml-auto rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">{me.unread}</span>}</Link>; })}
          <button onClick={async () => { await logout(); nav('/'); }} className="flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"><Icon name="logout" className="h-4 w-4" />Log out</button></nav></aside>
      <section className="min-w-0">{!me.user?.emailVerified && <VerifyBanner />}{children}</section>
    </div>
  );
}
function VerifyBanner() { const { toast } = useApp(); return <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Please verify your email address.<button className="font-semibold underline" onClick={() => post('/auth/resend-verification').then(() => toast('Verification email queued')).catch((e: ApiError) => toast(e.message, 'err'))}>Resend email</button></div>; }
const H = ({ children, right }: { children: ReactNode; right?: ReactNode }) => <div className="mb-4 flex items-center justify-between"><h1 className="text-xl font-bold sm:text-2xl">{children}</h1>{right}</div>;

export function Overview() {
  const { data, loading, error, reload } = useApi<any>('/account/overview'); const { me } = useApp();
  if (loading) return <Loading />; if (error || !data) return <ErrorBox message={error} retry={reload} />;
  const Stat = ({ icon, label, value, to }: any) => <Link to={to} className="card flex items-center gap-4 p-5 hover:border-brand/40"><span className="grid h-11 w-11 place-items-center rounded-lg bg-brand-50 text-brand"><Icon name={icon} /></span><div><div className="text-xs text-slate-500">{label}</div><div className="text-xl font-bold text-navy-900">{value}</div></div></Link>;
  return <><H>Welcome, {me.user?.name.split(' ')[0]}</H>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat icon="wallet" label="Wallet balance" value={pkr(data.balance)} to="/dashboard/wallet" /><Stat icon="box" label="Total orders" value={data.totalOrders} to="/dashboard/orders" /><Stat icon="chart" label="Total spent" value={pkr(data.totalSpent)} to="/dashboard/orders" /><Stat icon="ticket" label="Open tickets" value={data.openTickets} to="/dashboard/tickets" /></div>
    <div className="card mt-6"><div className="flex items-center justify-between border-b border-slate-100 p-4"><h2 className="font-bold">Recent orders</h2><Link to="/dashboard/orders" className="text-sm font-semibold text-brand">View all →</Link></div>
      {data.recentOrders.length === 0 ? <Empty title="No orders yet" hint="Your purchases will appear here." action={<Link to="/products" className="btn-primary btn-sm">Browse products</Link>} /> : <Table head={['Order', 'Items', 'Total', 'Status', 'Date']}>{data.recentOrders.map((o: any) => <tr key={o.order_no}><td className="td"><Link to={`/dashboard/orders/${o.order_no}`} className="font-semibold text-brand">{o.order_no}</Link></td><td className="td">{o.first_item}{o.item_count > 1 && ` +${o.item_count - 1}`}</td><td className="td">{pkr(o.total)}</td><td className="td"><Badge status={o.status} /></td><td className="td text-slate-500">{fmtDate(o.created_at)}</td></tr>)}</Table>}</div></>;
}

function AddFunds({ onDone, initialOpen }: { onDone: () => void; initialOpen: boolean }) {
  const { toast, refresh } = useApp(); const methods = useApi<any[]>('/public/payment-methods');
  const [open, setOpen] = useState(initialOpen); const [amount, setAmount] = useState(''); const [code, setCode] = useState(''); const [ref, setRef] = useState(''); const [sender, setSender] = useState(''); const [file, setFile] = useState<File | null>(null); const { busy, run } = useAction(); const [err, setErr] = useState('');
  const m = methods.data?.find((x) => x.code === (code || methods.data?.[0]?.code));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); if (!m) return;
    const paisa = toPaisa(amount); if (!(paisa >= m.minAmount)) { setErr(`Minimum amount is ${pkr(m.minAmount)}`); return; }
    await run(async () => {
      try {
        let proofKey: string | null = null;
        if (file) { const fd = new FormData(); fd.set('file', file); proofKey = (await api('POST', '/account/uploads/proof', fd)).key; }
        await post('/account/deposits', { methodCode: m.code, amount: paisa, reference: ref, senderName: sender || undefined, proofKey });
        setAmount(''); setRef(''); setSender(''); setFile(null); setOpen(false); toast('Deposit submitted — we will verify it shortly'); onDone(); refresh();
      } catch (x) { setErr((x as ApiError).message); }
    });
  };
  if (!open) return <button className="btn-primary" onClick={() => setOpen(true)}><Icon name="plus" className="h-4 w-4" />Add Funds</button>;
  return (
    <div className="card mt-4 p-5"><div className="flex items-center justify-between"><h2 className="font-bold">Add funds</h2><button className="text-sm text-slate-500" onClick={() => setOpen(false)}>Close</button></div>
      {methods.loading ? <Loading /> : !methods.data?.length ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Deposit methods have not been set up yet. Please contact support on WhatsApp.</p> : (
        <form onSubmit={submit} className="mt-4 grid gap-5 lg:grid-cols-2">
          <div className="space-y-4"><div><span className="label">Amount (PKR)</span><div className="mb-2 flex flex-wrap gap-2">{[500, 1000, 2000, 5000].map((v) => <button type="button" key={v} onClick={() => setAmount(String(v))} className={`btn-outline btn-sm ${amount === String(v) ? '!border-brand !text-brand' : ''}`}>Rs. {v.toLocaleString()}</button>)}</div><input className="input" type="number" min="1" step="1" required value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount in PKR" /></div>
            <Select label="Payment method" value={m?.code} onChange={(e) => setCode(e.target.value)}>{methods.data.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}</Select>
            {m && <div className="rounded-lg border border-brand/20 bg-brand-50 p-4 text-sm"><div className="font-semibold text-navy-900">Send payment to</div><div className="mt-1">{m.accountTitle}</div><div className="font-mono text-base font-bold">{m.accountNumber}</div><p className="mt-2 text-slate-600">{m.instructions}</p></div>}</div>
          <div className="space-y-4"><Field label="Transaction ID (TID)" required minLength={4} value={ref} onChange={(e) => setRef(e.target.value)} /><Field label="Sender name / account (optional)" value={sender} onChange={(e) => setSender(e.target.value)} />
            <label className="block"><span className="label">Payment screenshot (optional, PNG/JPG/PDF ≤ 3MB)</span><input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2" /></label>
            {err && <p role="alert" className="text-sm text-red-600">{err}</p>}<Button loading={busy} className="btn-primary w-full">Submit for verification</Button><p className="text-xs text-slate-500">Funds are added after an admin verifies your payment.</p></div>
        </form>)}
    </div>
  );
}

export function Wallet() {
  const sp = useSearch(); const [page, setPage] = useState(1); const { data, loading, error, reload } = useApi<any>(`/account/wallet?page=${page}&pageSize=10`); const { refresh } = useApp();
  if (loading && !data) return <Loading />; if (error || !data) return <ErrorBox message={error} retry={reload} />;
  return <><H>Wallet</H>
    <div className="card flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-navy-900 to-navy-700 p-6 text-white"><div><div className="text-sm text-slate-300">Available balance</div><div className="text-3xl font-extrabold">{pkr(data.balance)}</div></div></div>
    <div className="mt-4"><AddFunds initialOpen={sp.get('add') === '1'} onDone={() => { reload(); refresh(); }} /></div>
    <div className="card mt-6"><h2 className="border-b border-slate-100 p-4 font-bold">Deposit requests</h2>{data.deposits.length === 0 ? <Empty title="No deposits yet" /> : <Table head={['Date', 'Method', 'Amount', 'TID', 'Status', 'Note']}>{data.deposits.map((d: any) => <tr key={d.id}><td className="td text-slate-500">{fmtDateTime(d.created_at)}</td><td className="td capitalize">{d.method_code.replace('_', ' ')}</td><td className="td font-semibold">{pkr(d.amount)}</td><td className="td font-mono text-xs">{d.payment_reference}</td><td className="td"><Badge status={d.status} /></td><td className="td text-slate-500">{d.review_note ?? ''}</td></tr>)}</Table>}</div>
    <div className="card mt-6"><h2 className="border-b border-slate-100 p-4 font-bold">Transaction history</h2>{data.transactions.length === 0 ? <Empty title="No transactions yet" /> : <><Table head={['Date', 'Type', 'Details', 'Amount', 'Balance']}>{data.transactions.map((t: any) => <tr key={t.id}><td className="td text-slate-500">{fmtDateTime(t.created_at)}</td><td className="td capitalize">{t.kind}</td><td className="td text-slate-600">{t.note}</td><td className={`td font-semibold ${t.amount > 0 ? 'text-emerald-600' : 'text-slate-800'}`}>{t.amount > 0 ? '+' : '−'}{pkr(Math.abs(t.amount))}</td><td className="td">{pkr(t.balance_after)}</td></tr>)}</Table><div className="px-4 pb-4"><Pagination page={page} total={data.total} pageSize={10} onChange={setPage} /></div></>}</div></>;
}

export function Orders() {
  const [page, setPage] = useState(1); const [status, setStatus] = useState(''); const { data, loading, error, reload } = useApi<any>(`/account/orders?page=${page}&pageSize=10${status ? `&status=${status}` : ''}`);
  return <><H right={<select aria-label="Filter by status" className="input !w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option>{['pending', 'processing', 'completed', 'cancelled', 'refunded', 'failed'].map((s) => <option key={s} value={s}>{s}</option>)}</select>}>My Orders</H>
    <div className="card">{loading ? <Loading /> : error || !data ? <ErrorBox message={error} retry={reload} /> : data.items.length === 0 ? <Empty title="No orders found" action={<Link to="/products" className="btn-primary btn-sm">Browse products</Link>} /> : <><Table head={['Order', 'Items', 'Total', 'Status', 'Date', '']}>{data.items.map((o: any) => <tr key={o.order_no}><td className="td font-semibold">{o.order_no}</td><td className="td max-w-xs truncate text-slate-600">{o.items}</td><td className="td">{pkr(o.total)}</td><td className="td"><Badge status={o.status} /></td><td className="td text-slate-500">{fmtDate(o.created_at)}</td><td className="td"><Link to={`/dashboard/orders/${o.order_no}`} className="btn-outline btn-sm">View</Link></td></tr>)}</Table><div className="px-4 pb-4"><Pagination page={page} total={data.total} pageSize={10} onChange={setPage} /></div></>}</div></>;
}

export function OrderDetail({ orderNo }: { orderNo: string }) {
  const { data: o, loading, error, reload } = useApi<any>('/account/orders/' + orderNo); const sp = useSearch(); const { toast } = useApp(); const { busy, run } = useAction(); const [reason, setReason] = useState(''); const [refundFor, setRefundFor] = useState('');
  if (loading) return <Loading />; if (error || !o) return <ErrorBox message={error} />;
  const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => toast('Copied')).catch(() => toast('Copy failed', 'err'));
  return <>
    {sp.get('new') === '1' && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900"><div className="flex items-center gap-2 font-bold"><Icon name="check" className="h-5 w-5" />{o.status === 'completed' ? 'Order delivered successfully!' : 'Order placed successfully!'}</div><p className="mt-1 text-sm">{o.status === 'completed' ? 'Your product details are shown below.' : 'Our team is processing your order. You will get a notification when it is delivered.'}</p></div>}
    <H right={<Badge status={o.status} />}>Order {o.orderNo}</H>
    <div className="space-y-4">{o.items.map((i: any) => {
      const rf = o.refunds.find((r: any) => r.order_item_id === i.id && r.status !== 'rejected');
      return <div key={i.id} className="card p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-bold">{i.product_name}</div><div className="text-sm text-slate-500">{i.plan_name} · {pkr(i.paid)}</div>{Object.entries(i.customer_input).map(([k, v]) => <div key={k} className="text-xs text-slate-500">{k.replace(/_/g, ' ')}: {String(v)}</div>)}</div><Badge status={i.status} /></div>
        {i.deliveries.map((d: any) => <div key={d.id} className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4"><div className="mb-1 text-xs font-semibold uppercase text-emerald-700">Delivery details</div>{d.content && <div className="flex items-start gap-2"><pre className="flex-1 whitespace-pre-wrap break-all font-mono text-sm">{d.content}</pre><button className="btn-outline btn-sm" onClick={() => copy(d.content)}>Copy</button></div>}{d.hasFile && <a className="btn-primary btn-sm mt-2" href={`/api/files/download?key=${encodeURIComponent(d.fileKey)}`}><Icon name="download" className="h-4 w-4" />Download {d.fileName ?? 'file'}</a>}{d.note && <p className="mt-2 text-xs text-slate-600">{d.note}</p>}</div>)}
        {i.status === 'processing' && <p className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">Being processed. {i.delivery_type === 'manual' ? 'Manual delivery usually completes within the time stated on the product.' : ''}</p>}
        <div className="mt-4 flex flex-wrap gap-2">{rf ? <Badge status={rf.status} label={`Refund ${rf.status}`} /> : i.refund_eligible && ['processing', 'completed'].includes(i.status) ? <button className="btn-outline btn-sm" onClick={() => setRefundFor(refundFor === i.id ? '' : i.id)}>Request refund</button> : null}<Link to={`/dashboard/tickets?new=1&order=${o.orderNo}`} className="btn-ghost btn-sm">Get help</Link></div>
        {refundFor === i.id && <div className="mt-3 space-y-2"><TextArea label="Why do you want a refund?" value={reason} onChange={(e) => setReason(e.target.value)} /><Button loading={busy} className="btn-primary btn-sm" onClick={() => run(async () => { await post(`/account/order-items/${i.id}/refund`, { reason }); setRefundFor(''); setReason(''); reload(); }, 'Refund request sent')}>Submit request</Button></div>}</div>; })}</div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2"><div className="card p-5"><h2 className="font-bold">Payment</h2><dl className="mt-3 space-y-1 text-sm"><div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd>{pkr(o.subtotal)}</dd></div>{o.discount > 0 && <div className="flex justify-between"><dt className="text-slate-500">Discount {o.couponCode && `(${o.couponCode})`}</dt><dd>−{pkr(o.discount)}</dd></div>}<div className="flex justify-between font-bold"><dt>Total paid (wallet)</dt><dd>{pkr(o.total)}</dd></div></dl></div>
      <div className="card p-5"><h2 className="font-bold">Order tracking</h2><ol className="mt-3 space-y-3 border-l-2 border-brand/30 pl-4">{o.events.map((e: any, k: number) => <li key={k} className="relative text-sm"><span className="absolute -left-[22px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand" /><div className="font-medium">{e.message}</div><div className="text-xs text-slate-500">{fmtDateTime(e.created_at)}</div></li>)}</ol></div></div></>;
}

export function Tickets() {
  const sp = useSearch(); const nav = useNavigate(); const { data, loading, error, reload } = useApi<any[]>('/account/tickets'); const [open, setOpen] = useState(sp.get('new') === '1');
  const [f, setF] = useState({ subject: '', message: '', category: 'general', orderNo: sp.get('order') ?? '' }); const [file, setFile] = useState<File | null>(null); const { busy, run } = useAction();
  const submit = async (e: React.FormEvent) => { e.preventDefault(); const r = await run(async () => { let a: any = {}; if (file) { const fd = new FormData(); fd.set('file', file); const u = await api('POST', '/account/uploads/attachment', fd); a = { attachmentKey: u.key, attachmentName: u.name }; } return post('/account/tickets', { ...f, orderNo: f.orderNo || null, ...a }); }, 'Ticket created'); if (r) nav('/dashboard/tickets/' + r.ticketNo); };
  return <><H right={<button className="btn-primary" onClick={() => setOpen(!open)}><Icon name="plus" className="h-4 w-4" />New ticket</button>}>Support Tickets</H>
    {open && <form onSubmit={submit} className="card mb-4 space-y-4 p-5"><Field label="Subject" required minLength={4} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /><div className="grid gap-4 sm:grid-cols-2"><Select label="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{['general', 'order', 'payment', 'delivery', 'refund', 'technical'].map((c) => <option key={c}>{c}</option>)}</Select><Field label="Order number (optional)" value={f.orderNo} onChange={(e) => setF({ ...f, orderNo: e.target.value })} /></div><TextArea label="Message" required minLength={5} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /><input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2" aria-label="Attachment" /><Button loading={busy} className="btn-primary">Submit ticket</Button></form>}
    <div className="card">{loading ? <Loading /> : error || !data ? <ErrorBox message={error} retry={reload} /> : data.length === 0 ? <Empty title="No tickets" hint="Need help? Open a ticket and we'll get back to you." /> : <Table head={['Ticket', 'Subject', 'Status', 'Updated', '']}>{data.map((t) => <tr key={t.ticket_no}><td className="td font-semibold">{t.ticket_no}</td><td className="td">{t.subject}</td><td className="td"><Badge status={t.status} /></td><td className="td text-slate-500">{fmtDateTime(t.updated_at)}</td><td className="td"><Link to={`/dashboard/tickets/${t.ticket_no}`} className="btn-outline btn-sm">Open</Link></td></tr>)}</Table>}</div></>;
}

export function TicketDetail({ no }: { no: string }) {
  const { data: t, loading, error, reload } = useApi<any>('/account/tickets/' + no); const [msg, setMsg] = useState(''); const [file, setFile] = useState<File | null>(null); const { busy, run } = useAction();
  if (loading) return <Loading />; if (error || !t) return <ErrorBox message={error} />;
  const send = async (e: React.FormEvent) => { e.preventDefault(); await run(async () => { let a: any = {}; if (file) { const fd = new FormData(); fd.set('file', file); const u = await api('POST', '/account/uploads/attachment', fd); a = { attachmentKey: u.key, attachmentName: u.name }; } await post(`/account/tickets/${no}/reply`, { message: msg, ...a }); setMsg(''); setFile(null); reload(); }); };
  return <><H right={<Badge status={t.status} />}>{t.subject}</H><p className="-mt-2 mb-4 text-sm text-slate-500">{t.ticketNo} · {fmtDateTime(t.createdAt)}</p>
    <div className="space-y-3">{t.messages.map((m: any) => <div key={m.id} className={`card max-w-2xl p-4 ${m.isStaff ? 'border-brand/30 bg-brand-50' : 'ml-auto'}`}><div className="mb-1 flex justify-between text-xs text-slate-500"><b className="text-slate-700">{m.author}</b>{fmtDateTime(m.createdAt)}</div><p className="whitespace-pre-line text-sm">{m.body}</p>{m.attachment && <a className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand" href={`/api/files/download?key=${encodeURIComponent(m.attachment.key)}`}><Icon name="file" className="h-4 w-4" />{m.attachment.name}</a>}</div>)}</div>
    {t.status !== 'closed' ? <form onSubmit={send} className="card mt-4 space-y-3 p-4"><TextArea label="Reply" required value={msg} onChange={(e) => setMsg(e.target.value)} /><div className="flex flex-wrap items-center justify-between gap-3"><input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2" aria-label="Attachment" /><div className="flex gap-2"><Button type="button" className="btn-ghost" onClick={() => run(async () => { await post(`/account/tickets/${no}/close`); reload(); }, 'Ticket closed')}>Close ticket</Button><Button loading={busy} className="btn-primary">Send reply</Button></div></div></form> : <p className="mt-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-600">This ticket is closed. Open a new ticket if you still need help.</p>}</>;
}

export function Notifications() {
  const { data, loading, error, reload } = useApi<any[]>('/account/notifications'); const { refresh } = useApp(); const nav = useNavigate();
  const read = async (id?: string) => { await post('/account/notifications/read', id ? { id } : {}); reload(); refresh(); };
  return <><H right={<button className="btn-outline btn-sm" onClick={() => read()}>Mark all read</button>}>Notifications</H><div className="card divide-y divide-slate-100">{loading ? <Loading /> : error || !data ? <ErrorBox message={error} /> : data.length === 0 ? <Empty title="Nothing here yet" /> : data.map((n) => <button key={n.id} onClick={async () => { await read(n.id); if (n.link) nav(n.link); }} className={`flex w-full items-start gap-3 p-4 text-left hover:bg-slate-50 ${n.read_at ? '' : 'bg-brand-50/50'}`}><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? 'bg-slate-300' : 'bg-brand'}`} /><span className="flex-1"><span className="block text-sm font-semibold">{n.title}</span><span className="block text-sm text-slate-600">{n.body}</span><span className="text-xs text-slate-400">{fmtDateTime(n.created_at)}</span></span></button>)}</div></>;
}

export function Settings() {
  const { me, refresh, toast } = useApp(); const [p, setP] = useState({ name: me.user?.name ?? '', phone: me.user?.phone ?? '' }); const [pw, setPw] = useState({ current: '', next: '' }); const a = useAction(); const b = useAction();
  void get; void patch;
  return <><H>Profile & Security</H><div className="grid gap-4 lg:grid-cols-2">
    <form className="card space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); a.run(async () => { await patch('/auth/profile', p); await refresh(); }, 'Profile saved'); }}><h2 className="font-bold">Profile</h2><Field label="Full name" required value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /><Field label="Email" value={me.user?.email ?? ''} disabled /><Field label="Phone / WhatsApp" value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} /><Button loading={a.busy} className="btn-primary">Save changes</Button></form>
    <form className="card space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); b.run(async () => { await post('/auth/change-password', pw); setPw({ current: '', next: '' }); }, 'Password changed. Other devices were signed out.'); }}><h2 className="font-bold">Change password</h2><Field label="Current password" type="password" required autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /><Field label="New password" type="password" required minLength={8} autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /><Button loading={b.busy} className="btn-dark">Update password</Button></form></div>
    {!me.user?.emailVerified && <p className="mt-4 text-sm text-slate-500">Email not verified. <button className="font-semibold text-brand" onClick={() => post('/auth/resend-verification').then(() => toast('Verification email queued'))}>Resend</button></p>}</>;
}
