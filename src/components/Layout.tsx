import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from '../lib/router';
import { useApp } from '../lib/store';
import { Icon } from './ui';
import { pkr, waLink } from '../lib/format';

export function Header() {
  const { me, cart, settings, logout } = useApp(); const nav = useNavigate(); const [open, setOpen] = useState(false); const [q, setQ] = useState('');
  const go = (e: React.FormEvent) => { e.preventDefault(); nav(`/products${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`); setOpen(false); };
  return (
    <>
      {settings.announcement_active === '1' && settings.announcement && <div className="bg-brand px-4 py-2 text-center text-sm font-medium text-white">{settings.announcement}</div>}
      <header className="sticky top-0 z-40 bg-navy-900 text-white shadow-lg">
        <div className="container-x flex h-16 items-center gap-4">
          <Link to="/" className="shrink-0" aria-label="NOORIX DIGITAL LAB home"><img src="/logo.png" alt="NOORIX DIGITAL LAB" className="logo-blend h-12 w-auto" width="170" height="60" /></Link>
          <form onSubmit={go} className="relative hidden flex-1 md:block md:max-w-md" role="search">
            <Icon name="search" className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" aria-label="Search products" className="w-full rounded-lg border border-white/10 bg-white/10 py-2 pl-10 pr-3 text-sm text-white placeholder:text-slate-400 focus:border-brand focus:outline-none" />
          </form>
          <nav className="ml-auto hidden items-center gap-1 text-sm font-medium lg:flex">
            <Link to="/products" className="rounded-md px-3 py-2 hover:bg-white/10">Products</Link>
            <Link to="/track-order" className="rounded-md px-3 py-2 hover:bg-white/10">Track Order</Link>
            <Link to="/support" className="rounded-md px-3 py-2 hover:bg-white/10">Support</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            {me.user && <Link to="/dashboard/wallet" className="hidden items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20 sm:flex"><Icon name="wallet" className="h-4 w-4 text-cyan2" />{pkr(me.balance)}</Link>}
            <Link to="/cart" className="relative rounded-lg p-2 hover:bg-white/10" aria-label={`Cart, ${cart.length} items`}><Icon name="cart" />{cart.length > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 w-5 place-items-center rounded-full bg-brand text-[11px] font-bold">{cart.length}</span>}</Link>
            {me.user ? (
              <div className="hidden items-center gap-1 sm:flex">
                <Link to="/dashboard" className="btn-primary btn-sm"><Icon name="user" className="h-4 w-4" />Dashboard</Link>
                {me.user.isStaff && <Link to="/admin" className="btn btn-sm border border-white/20 text-white hover:bg-white/10">Admin</Link>}
                <button className="rounded-lg p-2 hover:bg-white/10" aria-label="Log out" onClick={async () => { await logout(); nav('/'); }}><Icon name="logout" className="h-4 w-4" /></button>
              </div>
            ) : <div className="hidden gap-2 sm:flex"><Link to="/login" className="btn btn-sm text-white hover:bg-white/10">Log in</Link><Link to="/register" className="btn-primary btn-sm">Sign up</Link></div>}
            <button className="rounded-lg p-2 hover:bg-white/10 lg:hidden" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name={open ? 'x' : 'menu'} /></button>
          </div>
        </div>
        {open && (
          <div className="border-t border-white/10 bg-navy-800 lg:hidden">
            <form onSubmit={go} className="container-x py-3"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" aria-label="Search" className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm placeholder:text-slate-400" /></form>
            <div className="container-x flex flex-col pb-3 text-sm font-medium" onClick={() => setOpen(false)}>
              {[['/products', 'All Products'], ['/track-order', 'Track Order'], ['/support', 'Support']].map(([to, l]) => <Link key={to} to={to} className="rounded-md px-2 py-2.5 hover:bg-white/10">{l}</Link>)}
              {me.user ? (<><Link to="/dashboard" className="rounded-md px-2 py-2.5 hover:bg-white/10">My Dashboard · {pkr(me.balance)}</Link>{me.user.isStaff && <Link to="/admin" className="rounded-md px-2 py-2.5 hover:bg-white/10">Admin panel</Link>}<button className="rounded-md px-2 py-2.5 text-left hover:bg-white/10" onClick={async () => { await logout(); nav('/'); }}>Log out</button></>)
                : (<><Link to="/login" className="rounded-md px-2 py-2.5 hover:bg-white/10">Log in</Link><Link to="/register" className="rounded-md px-2 py-2.5 hover:bg-white/10">Create account</Link></>)}
            </div>
          </div>
        )}
      </header>
    </>
  );
}

export function Footer() {
  const { settings } = useApp(); const wa = settings.whatsapp || '923154429417';
  return (
    <footer className="mt-16 bg-navy-900 text-slate-300">
      <div className="container-x grid gap-8 py-12 md:grid-cols-4">
        <div className="md:col-span-2"><img src="/logo.png" alt="NOORIX DIGITAL LAB" className="logo-blend h-14 w-auto" /><p className="mt-3 max-w-sm text-sm">{settings.tagline || 'All-in-One Digital Solutions Under One Roof.'}</p>
          <a href={waLink(wa, 'Hello Noorix Digital Lab')} target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm mt-4"><Icon name="whatsapp" className="h-4 w-4" />WhatsApp 0{wa.replace(/^92/, '')}</a></div>
        <div><h4 className="mb-3 text-sm font-semibold text-white">Shop</h4><ul className="space-y-2 text-sm"><li><Link to="/products" className="hover:text-white">All Products</Link></li><li><Link to="/products?flag=deal" className="hover:text-white">Today&apos;s Deals</Link></li><li><Link to="/products?flag=trending" className="hover:text-white">Trending</Link></li><li><Link to="/track-order" className="hover:text-white">Track Order</Link></li></ul></div>
        <div><h4 className="mb-3 text-sm font-semibold text-white">Company</h4><ul className="space-y-2 text-sm"><li><Link to="/page/about" className="hover:text-white">About</Link></li><li><Link to="/support" className="hover:text-white">Support &amp; FAQ</Link></li><li><Link to="/page/terms" className="hover:text-white">Terms of Service</Link></li><li><Link to="/page/privacy" className="hover:text-white">Privacy Policy</Link></li><li><Link to="/page/refund" className="hover:text-white">Refund Policy</Link></li></ul></div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-slate-400">© {new Date().getFullYear()} NOORIX DIGITAL LAB · All prices in PKR</div>
    </footer>
  );
}

export function PublicShell({ children }: { children: ReactNode }) {
  const { settings } = useApp(); const wa = settings.whatsapp || '923154429417';
  return (<div className="flex min-h-screen flex-col"><Header /><main className="flex-1">{children}</main><Footer />
    <a href={waLink(wa, 'Hello Noorix Digital Lab, I need help')} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp" className="fixed bottom-5 right-5 z-30 grid h-12 w-12 place-items-center rounded-full bg-emerald-500 text-white shadow-lg hover:bg-emerald-600"><Icon name="whatsapp" /></a></div>);
}
