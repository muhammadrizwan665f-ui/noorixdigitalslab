import { Link } from '../lib/router';
import { useApi } from '../lib/store';
import { Badge, Empty, ErrorBox, Icon, Loading, Table } from '../components/ui';
import { fmtDateTime, pkr } from '../lib/format';
import { Page } from './Shell';

function Bars({ data }: { data: { d: string; revenue: number }[] }) {
  if (!data.length) return <Empty title="No sales in the last 30 days" />;
  const max = Math.max(...data.map((x) => x.revenue), 1);
  return <div><div className="flex h-44 items-end gap-1" role="img" aria-label="Daily revenue, last 30 days">{data.map((x) => <div key={x.d} title={`${x.d}: ${pkr(x.revenue)}`} className="flex-1 rounded-t bg-brand/80 hover:bg-brand" style={{ height: `${Math.max(4, (x.revenue / max) * 100)}%` }} />)}</div><div className="mt-1 flex justify-between text-[11px] text-slate-400"><span>{data[0].d}</span><span>{data[data.length - 1].d}</span></div></div>;
}
const COLORS: Record<string, string> = { completed: '#10b981', processing: '#087BFF', pending: '#f59e0b', cancelled: '#94a3b8', refunded: '#a855f7', failed: '#ef4444' };
function Donut({ rows }: { rows: { status: string; n: number }[] }) {
  const total = rows.reduce((s, r) => s + r.n, 0); if (!total) return <Empty title="No orders yet" />;
  let acc = 0; const R = 15.9155;
  return <div className="flex items-center gap-5"><svg viewBox="0 0 36 36" className="h-32 w-32 -rotate-90" role="img" aria-label="Orders by status">{rows.map((r) => { const pct = (r.n / total) * 100; const el = <circle key={r.status} cx="18" cy="18" r={R} fill="none" stroke={COLORS[r.status] ?? '#cbd5e1'} strokeWidth="5" strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={-acc} />; acc += pct; return el; })}</svg>
    <ul className="space-y-1 text-sm">{rows.map((r) => <li key={r.status} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[r.status] ?? '#cbd5e1' }} /><span className="capitalize">{r.status}</span><b>{r.n}</b></li>)}</ul></div>;
}

export default function AdminOverview() {
  const { data: d, loading, error, reload } = useApi<any>('/admin/dashboard');
  if (loading) return <Loading />; if (error || !d) return <ErrorBox message={error} retry={reload} />;
  const S = ({ label, value, to, icon, warn }: any) => <Link to={to} className="card flex items-center gap-4 p-5 hover:border-brand/40"><span className={`grid h-11 w-11 place-items-center rounded-lg ${warn ? 'bg-amber-100 text-amber-700' : 'bg-brand-50 text-brand'}`}><Icon name={icon} /></span><div><div className="text-xs text-slate-500">{label}</div><div className="text-xl font-bold text-navy-900">{value}</div></div></Link>;
  return <Page title="Dashboard">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {d.revenue != null && <S label="Total sales" value={pkr(d.revenue)} to="/admin/reports" icon="chart" />}<S label="Total orders" value={d.totalOrders} to="/admin/orders" icon="box" /><S label="Customers" value={d.customers} to="/admin/customers" icon="users" /><S label="Pending deliveries" value={d.pendingDeliveries} to="/admin/orders?status=processing" icon="bolt" warn={d.pendingDeliveries > 0} />
      <S label="Pending deposits" value={d.pendingDeposits} to="/admin/deposits" icon="wallet" warn={d.pendingDeposits > 0} /><S label="Open tickets" value={d.openTickets} to="/admin/tickets" icon="headset" warn={d.openTickets > 0} /><S label="Refund requests" value={d.refundRequests} to="/admin/refunds" icon="refresh" warn={d.refundRequests > 0} />{d.walletLiability != null && <S label="Customer wallet balances" value={pkr(d.walletLiability)} to="/admin/wallets" icon="wallet" />}
    </div>
    <div className="mt-6 grid gap-4 lg:grid-cols-3"><div className="card p-5 lg:col-span-2"><h2 className="mb-3 font-bold">Sales — last 30 days</h2><Bars data={d.series} /></div><div className="card p-5"><h2 className="mb-3 font-bold">Orders by status</h2><Donut rows={d.byStatus} /></div></div>
    <div className="mt-6 grid gap-4 lg:grid-cols-3"><div className="card lg:col-span-2"><h2 className="border-b border-slate-100 p-4 font-bold">Recent orders</h2>{d.recent.length === 0 ? <Empty title="No orders yet" /> : <Table head={['Order', 'Customer', 'Total', 'Status', 'Date']}>{d.recent.map((o: any) => <tr key={o.order_no}><td className="td"><Link className="font-semibold text-brand" to={`/admin/orders/${o.order_no}`}>{o.order_no}</Link></td><td className="td">{o.customer}</td><td className="td">{pkr(o.total)}</td><td className="td"><Badge status={o.status} /></td><td className="td text-slate-500">{fmtDateTime(o.created_at)}</td></tr>)}</Table>}</div>
      <div className="card"><h2 className="border-b border-slate-100 p-4 font-bold">Automatic stock</h2><ul className="divide-y divide-slate-100">{d.lowStock.length === 0 ? <li className="p-4 text-sm text-slate-500">No automatic products.</li> : d.lowStock.map((x: any, k: number) => <li key={k} className="flex justify-between p-3 text-sm"><span>{x.product} · {x.plan}</span><b className={x.n === 0 ? 'text-red-600' : x.n < 5 ? 'text-amber-600' : ''}>{x.n}</b></li>)}</ul></div></div>
  </Page>;
}
