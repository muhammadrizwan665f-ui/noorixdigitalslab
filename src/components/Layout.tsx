import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useRouter } from '../lib/router';
import { useApp } from '../lib/store';
import { Icon, ThemeMenu } from './ui';
import { pkr, waLink } from '../lib/format';

const LINKS: [string, string][] = [['/products', 'Products'], ['/products?flag=deal', 'Deals'], ['/track-order', 'Track order'], ['/support', 'Support']];

export function Header() {
  const { me, cart, settings, logout } = useApp(); const nav = useNavigate(); const { path } = useRouter(); const [open, setOpen] = useState(false); const [q, setQ] = useState('');
  const go = (e: React.FormEvent) => { e.preventDefault(); nav(`/products${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`); setOpen(false); };
  const out = async () => { await logout(); nav('/'); };
  return (
    <>
      {settings.announcement_active === '1' && settings.announcement && <div className="bg-brand px-4 py-2 text-center text-sm font-medium text-white">{settings.announcement}</div>}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-navy-900 text-white">
        <div className="container-x flex h-16 items-center gap-3 lg:gap-6">
          <Link to="/" className="shrink-0" aria-label="NOORIX DIGITAL LAB home"><img src="/logo.png" alt="NOORIX DIGITAL LAB" className="logo-blend h-11 w-auto" width="170" height="60" /></Link>
          <nav className="hidden items-center gap-0.5 text-sm font-medium lg:flex" aria-label="Main">
            {LINKS.map(([to, l]) => <Link key={to} to={to} className={`rounded-lg px-3 py-2 transition hover:bg-white/10 ${path === to.split('?')[0] && !to.includes('?') ? 'text-white' : 'text-slate-300'}`}>{l}</Link>)}
          </nav>
          <form onSubmit={go} className="relative ml-auto hidden max-w-sm flex-1 md:block" role="search">
            <Icon name="search" className="absolute left-3.5 top-2.5 h-[18px] w-[18px] text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" aria-label="Search products" className="w-full rounded-full border border-white/10 bg-white/10 py-2 pl-10 pr-4 text-sm text-white placeholder:text-slate-400 transition focus:border-brand focus:bg-white/15 focus:outline-none" />
          </form>
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            {me.user && <Link to="/dashboard/wallet" className="mr-1 hidden items-center gap-2 rounded-full bg-white/10 py-1.5 pl-3 pr-4 text-sm font-semibold transition hover:bg-white/20 sm:flex" aria-label="Wallet balance"><Icon name="wallet" className="h-4 w-4 text-cyan2" />{pkr(me.balance)}</Link>}
            <ThemeMenu />
            <Link to="/cart" className="relative rounded-lg p-2 hover:bg-white/10" aria-label={`Cart, ${cart.length} items`}><Icon name="cart" />{cart.length > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] font-bold">{cart.length}</span>}</Link>
            {me.user ? (
              <div className="hidden items-center gap-1 sm:flex">
                <Link to="/dashboard" className="btn-primary btn-sm ml-1"><Icon name="user" className="h-4 w-4" />Dashboard</Link>
                {me.user.isStaff && <Link to="/admin" className="btn btn-sm border border-white/20 text-white hover:bg-white/10">Admin</Link>}
                <button className="rounded-lg p-2 hover:bg-white/10" aria-label="Log out" onClick={out}><Icon name="logout" className="h-4 w-4" /></button>
              </div>
            ) : <div className="ml-1 hidden gap-2 sm:flex"><Link to="/login" className="btn btn-sm text-white hover:bg-white/10">Log in</Link><Link to="/register" className="btn-primary btn-sm">Create account</Link></div>}
            <button className="rounded-lg p-2 hover:bg-white/10 lg:hidden" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name={open ? 'x' : 'menu'} /></button>
          </div>
        </div>
        {open && (
          <div className="border-t border-white/10 bg-navy-800 lg:hidden">
            <form onSubmit={go} className="container-x py-3"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" aria-label="Search" className="w-full rounded-full bg-white/10 px-4 py-2.5 text-sm placeholder:text-slate-400" /></form>
            <div className="container-x flex flex-col pb-3 text-sm font-medium" onClick={() => setOpen(false)}>
              {LINKS.map(([to, l]) => <Link key={to} to={to} className="rounded-lg px-2 py-3 hover:bg-white/10">{l}</Link>)}
              {me.user ? (<><Link to="/dashboard" className="rounded-lg px-2 py-3 hover:bg-white/10">My dashboard · {pkr(me.balance)}</Link>{me.user.isStaff && <Link to="/admin" className="rounded-lg px-2 py-3 hover:bg-white/10">Admin panel</Link>}<button className="rounded-lg px-2 py-3 text-left hover:bg-white/10" onClick={out}>Log out</button></>)
                : (<><Link to="/login" className="rounded-lg px-2 py-3 hover:bg-white/10">Log in</Link><Link to="/register" className="btn-primary mt-2">Create account</Link></>)}
            </div>
          </div>
        )}
      </header>
    </>
  );
}

export function Footer() {
  const { settings } = useApp(); const wa = settings.whatsapp || '923154429417';
  const col = (title: string, items: [string, string][]) => (<div><h4 className="mb-4 text-sm font-semibold text-white">{title}</h4><ul className="space-y-2.5 text-sm">{items.map(([to, l]) => <li key={to}><Link to={to} className="text-slate-400 transition hover:text-white">{l}</Link></li>)}</ul></div>);
  return (
    <footer className="mt-20 bg-navy-950 text-slate-300">
      <div className="container-x grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div><img src="/logo.png" alt="NOORIX DIGITAL LAB" className="logo-blend h-14 w-auto" /><p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-400">{settings.tagline || 'All-in-One Digital Solutions Under One Roof.'}</p>
          <a href={waLink(wa, 'Hello Noorix Digital Lab')} target="_blank" rel="noopener noreferrer" className="btn-primary mt-5"><Icon name="whatsapp" className="h-4 w-4" />Chat on WhatsApp</a></div>
        {col('Shop', [['/products', 'All products'], ['/products?flag=deal', "Today's deals"], ['/products?flag=trending', 'Trending'], ['/track-order', 'Track an order']])}
        {col('Account', [['/register', 'Create account'], ['/login', 'Log in'], ['/dashboard/wallet', 'Add funds'], ['/dashboard/tickets', 'Support tickets']])}
        {col('Company', [['/page/about', 'About us'], ['/support', 'Help & FAQ'], ['/page/terms', 'Terms of service'], ['/page/privacy', 'Privacy policy'], ['/page/refund', 'Refund policy']])}
      </div>
      <div className="border-t border-white/10"><div className="container-x flex flex-col items-center justify-between gap-2 py-5 text-xs text-slate-500 sm:flex-row"><span>© {new Date().getFullYear()} NOORIX DIGITAL LAB. All rights reserved.</span><span>Payments accepted: Easypaisa, JazzCash, Bank transfer. Prices in PKR.</span></div></div>
    </footer>
  );
}

export function PublicShell({ children }: { children: ReactNode }) {
  const { settings } = useApp(); const wa = settings.whatsapp || '923154429417';
  return (<div className="flex min-h-screen flex-col"><Header /><main className="flex-1">{children}</main><Footer />
    <a href={waLink(wa, 'Hello Noorix Digital Lab, I need help')} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp" className="fixed bottom-5 right-5 z-30 grid h-13 w-13 place-items-center rounded-full bg-emerald-500 p-3.5 text-white shadow-lift transition hover:scale-105 hover:bg-emerald-600"><Icon name="whatsapp" /></a></div>);
}
