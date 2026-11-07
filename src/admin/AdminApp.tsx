import { Routes } from '../lib/router';
import { AdminShell } from './Shell';
import AdminOverview from './Overview';
import * as O from './Ops';
import * as C from './Catalog';
import * as S from './Settings';

export default function AdminApp() {
  return <AdminShell><Routes fallback={<div className="py-20 text-center text-slate-500">Admin page not found.</div>} routes={[
    ['/admin', () => <AdminOverview />], ['/admin/orders', () => <O.Orders />], ['/admin/orders/:no', (p) => <O.OrderDetail key={p.no} orderNo={p.no} />],
    ['/admin/deposits', () => <O.Deposits />], ['/admin/refunds', () => <O.Refunds />], ['/admin/customers', () => <O.Customers />], ['/admin/customers/:id', (p) => <O.CustomerDetail key={p.id} id={p.id} />], ['/admin/wallets', () => <O.Ledger />],
    ['/admin/products', () => <C.Products />], ['/admin/products/:id', (p) => <C.ProductEditor key={p.id} id={p.id} />], ['/admin/categories', () => <C.Categories />], ['/admin/inventory', () => <C.Inventory />],
    ['/admin/payments', () => <S.Payments />], ['/admin/providers', () => <S.Providers />], ['/admin/tickets', () => <O.Tickets />], ['/admin/tickets/:no', (p) => <O.TicketDetail key={p.no} no={p.no} />],
    ['/admin/marketing', () => <S.Marketing />], ['/admin/content', () => <S.Content />], ['/admin/reports', () => <S.Reports />], ['/admin/staff', () => <S.Staff />], ['/admin/settings', () => <S.SettingsPage />], ['/admin/audit', () => <S.Audit />],
  ]} /></AdminShell>;
}
