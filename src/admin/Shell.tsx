import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useRouter } from '../lib/router';
import { useApp } from '../lib/store';
import { Icon, ThemeMenu } from '../components/ui';
import { Logo } from '../components/Brand';

const NAV: [string, string, string, string | null][] = [
  ['/admin', 'Dashboard', 'chart', 'dashboard.view'], ['/admin/orders', 'Orders', 'box', 'orders.view'], ['/admin/deposits', 'Deposits', 'wallet', 'deposits.review'], ['/admin/refunds', 'Refunds', 'refresh', 'refunds.manage'],
  ['/admin/customers', 'Customers', 'users', 'customers.view'], ['/admin/wallets', 'Wallet Ledger', 'list', 'wallets.view'], ['/admin/products', 'Products', 'tag', 'products.manage'], ['/admin/categories', 'Categories', 'layers', 'categories.manage'],
  ['/admin/inventory', 'Inventory', 'box', 'inventory.manage'], ['/admin/payments', 'Payment Methods', 'wallet', 'payments.settings'], ['/admin/providers', 'API Providers', 'bolt', 'providers.manage'], ['/admin/tickets', 'Support', 'headset', 'support.manage'],
  ['/admin/marketing', 'Marketing', 'sparkles', 'marketing.manage'], ['/admin/content', 'Content', 'file', 'content.manage'], ['/admin/reports', 'Reports', 'chart', 'reports.view'], ['/admin/staff', 'Staff & Roles', 'shield', 'staff.manage'],
  ['/admin/settings', 'Settings', 'cog', 'settings.manage'], ['/admin/audit', 'Audit Log', 'list', 'audit.view'],
];

export function AdminShell({ children }: { children: ReactNode }) {
  const { me, can, logout } = useApp(); const { path } = useRouter(); const nav = useNavigate(); const [open, setOpen] = useState(false);
  const items = NAV.filter(([, , , p]) => !p || can(p));
  const side = (
    <nav className="flex h-full flex-col" aria-label="Admin">
      <Link to="/admin" className="block px-5 py-4"><Logo size="md" tagline={false} /></Link>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">{items.map(([to, label, icon]) => { const on = to === '/admin' ? path === to : path.startsWith(to); return <Link key={to} to={to} onClick={() => setOpen(false)} aria-current={on ? 'page' : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${on ? 'bg-brand text-white shadow-sm' : 'text-slate-300 hover:bg-white/10'}`}><Icon name={icon} className="h-4 w-4" />{label}</Link>; })}</div>
      <div className="border-t border-white/10 p-3 text-xs text-slate-400"><div className="flex items-center justify-between px-2 pb-2"><span className="truncate">{me.user?.email}</span><ThemeMenu dropUp className="text-slate-300" /></div><Link to="/" className="block rounded-lg px-2 py-2 hover:bg-white/10">View store →</Link><button className="w-full rounded-lg px-2 py-2 text-left hover:bg-white/10" onClick={async () => { await logout(); nav('/login'); }}>Log out</button></div>
    </nav>
  );
  return (
    <div className="min-h-screen bg-mist lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="sticky top-0 hidden h-screen bg-navy-900 lg:block">{side}</aside>
      {open && <div className="fixed inset-0 z-50 lg:hidden"><div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} /><aside className="absolute inset-y-0 left-0 w-64 bg-navy-900">{side}</aside></div>}
      <div className="min-w-0"><div className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface px-4 py-3 lg:hidden"><button aria-label="Open menu" onClick={() => setOpen(true)}><Icon name="menu" /></button><span className="font-bold text-navy-900">Admin</span></div>
        <main className="p-4 sm:p-6 lg:p-8">{children}</main></div>
    </div>
  );
}
export const Page = ({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) => <><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-bold sm:text-2xl">{title}</h1>{right}</div>{children}</>;
