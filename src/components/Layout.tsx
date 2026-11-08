import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useRouter } from '../lib/router';
import { useApi, useApp } from '../lib/store';
import { Icon, ThemeMenu } from './ui';
import { Logo, PoweredBy } from './Brand';
import { pkr, waLink } from '../lib/format';
import { BRAND_DEFAULTS } from '../lib/brand';

/** Desktop dropdown: opens on hover/focus/click, closes on Escape or outside click. */
function NavMenu({ label, items, active }: { label: string; items: [string, string][]; active?: boolean }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null); const { path } = useRouter();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => { if (!open) return; const out = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false); document.addEventListener('mousedown', out); document.addEventListener('keydown', esc); return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc); }; }, [open]);
  return (
    <div ref={ref} className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)} className={`flex items-center gap-1 rounded-full px-3.5 py-2 text-sm font-medium transition hover:bg-white/10 ${active ? 'bg-white/10 text-white' : 'text-slate-200'}`}>{label}<Icon name="down" className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`} /></button>
      {open && <div role="menu" className="absolute left-0 top-full z-50 pt-2"><div className="max-h-[70vh] min-w-56 overflow-y-auto rounded-2xl border border-brand/30 bg-navy-900 p-2 shadow-lift">{items.map(([to, l]) => <Link key={to + l} to={to} className="block rounded-xl px-3 py-2.5 text-sm text-slate-200 transition hover:bg-white/10 hover:text-white">{l}</Link>)}</div></div>}
    </div>
  );
}

export function Header() {
  const { me, cart, settings, logout } = useApp(); const nav = useNavigate(); const { path } = useRouter(); const [open, setOpen] = useState(false); const [q, setQ] = useState('');
  const cats = useApi<any[]>('/public/categories');
  const go = (e: React.FormEvent) => { e.preventDefault(); nav(`/products${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`); setOpen(false); };
  const out = async () => { await logout(); nav('/'); };
  const catItems: [string, string][] = (cats.data ?? []).map((c) => [`/products?category=${c.slug}`, c.name]);
  const promo = settings.announcement_active === '1' && settings.announcement ? settings.announcement : BRAND_DEFAULTS.promo;
  const on = (p: string) => path === p;
  return (
    <>
      <div className="bg-gradient-to-r from-brand-600 via-brand to-brand-600 px-4 py-2 text-center text-xs font-semibold text-white sm:text-sm"><Icon name="sparkles" className="mr-1.5 inline h-4 w-4 align-[-3px]" />{promo}</div>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-navy-900 text-white">
        <div className="container-x flex h-[68px] items-center gap-3 xl:gap-5">
          <Link to="/" className="shrink-0" aria-label="Home"><Logo /></Link>
          <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Main">
            <Link to="/" className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition ${on('/') ? 'bg-brand text-white shadow-glow' : 'text-slate-200 hover:bg-white/10'}`}><Icon name="home" className="h-4 w-4" />Home</Link>
            <NavMenu label="Products" active={path.startsWith('/products') && !path.includes('?')} items={[['/products', 'All products'], ['/products?flag=trending', 'Trending'], ['/products?flag=featured', 'Featured'], ['/products?flag=deal', 'Deals']]} />
            {catItems.length > 0 && <NavMenu label="Categories" items={catItems} />}
            <Link to="/products?flag=deal" className="rounded-full px-3.5 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10">Deals</Link>
            <NavMenu label="Support" active={on('/support') || on('/track-order')} items={[['/support', 'Help & FAQ'], ['/track-order', 'Track an order'], ['/dashboard/tickets?new=1', 'Open a ticket']]} />
          </nav>
          <form onSubmit={go} className="relative ml-auto hidden max-w-xs flex-1 md:block" role="search">
            <Icon name="search" className="absolute left-3.5 top-2.5 h-[18px] w-[18px] text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" aria-label="Search products" className="w-full rounded-full border border-brand/30 bg-white/5 py-2 pl-10 pr-4 text-sm text-white placeholder:text-slate-400 transition focus:border-brand focus:bg-white/10 focus:outline-none" />
          </form>
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            {me.user && <Link to="/dashboard/wallet" className="mr-1 hidden items-center gap-2 rounded-full border border-brand/30 bg-white/5 py-1.5 pl-3 pr-4 text-sm font-semibold transition hover:bg-white/10 2xl:flex" aria-label="Wallet balance"><Icon name="wallet" className="h-4 w-4 text-cyan2" />{pkr(me.balance)}</Link>}
            <ThemeMenu />
            <Link to="/cart" className="relative rounded-full p-2 hover:bg-white/10" aria-label={`Cart, ${cart.length} items`}><Icon name="cart" /><span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] font-bold shadow-glow">{cart.length}</span></Link>
            {me.user ? (
              <div className="hidden items-center gap-1 sm:flex">
                <Link to="/dashboard" className="btn-primary btn-sm ml-1 !rounded-full !px-4 !py-2"><Icon name="user" className="h-4 w-4" />Dashboard</Link>
                {me.user.isStaff && <Link to="/admin" className="btn btn-sm !rounded-full border border-white/20 text-white hover:bg-white/10">Admin</Link>}
                <button className="rounded-full p-2 hover:bg-white/10" aria-label="Log out" onClick={out}><Icon name="logout" className="h-4 w-4" /></button>
              </div>
            ) : <Link to="/login" className="btn-primary btn-sm ml-1 hidden !rounded-full !px-4 !py-2 sm:inline-flex"><Icon name="user" className="h-4 w-4" />Login / Register</Link>}
            <button className="rounded-full p-2 hover:bg-white/10 lg:hidden" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name={open ? 'x' : 'menu'} /></button>
          </div>
        </div>
        {open && (
          <div className="max-h-[80vh] overflow-y-auto border-t border-white/10 bg-navy-800 lg:hidden">
            <form onSubmit={go} className="container-x py-3"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" aria-label="Search" className="w-full rounded-full border border-brand/30 bg-white/5 px-4 py-2.5 text-sm placeholder:text-slate-400" /></form>
            <div className="container-x flex flex-col pb-4 text-sm font-medium" onClick={() => setOpen(false)}>
              {[['/', 'Home'], ['/products', 'All products'], ['/products?flag=deal', 'Deals'], ['/support', 'Help & FAQ'], ['/track-order', 'Track an order']].map(([to, l]) => <Link key={to} to={to} className="rounded-lg px-2 py-3 hover:bg-white/10">{l}</Link>)}
              {catItems.length > 0 && <div className="mt-2 border-t border-white/10 pt-3"><div className="px-2 pb-1 text-xs font-semibold text-slate-400">Categories</div>{catItems.map(([to, l]) => <Link key={to} to={to} className="block rounded-lg px-2 py-2.5 text-slate-300 hover:bg-white/10">{l}</Link>)}</div>}
              <div className="mt-2 border-t border-white/10 pt-3">
                {me.user ? (<><Link to="/dashboard" className="block rounded-lg px-2 py-3 hover:bg-white/10">My dashboard · {pkr(me.balance)}</Link>{me.user.isStaff && <Link to="/admin" className="block rounded-lg px-2 py-3 hover:bg-white/10">Admin panel</Link>}<button className="w-full rounded-lg px-2 py-3 text-left hover:bg-white/10" onClick={out}>Log out</button></>)
                  : <Link to="/login" className="btn-primary w-full">Login / Register</Link>}
              </div>
            </div>
          </div>
        )}
      </header>
    </>
  );
}

const SOCIALS: [string, string, string][] = [['social_facebook', 'facebook', 'Facebook'], ['social_instagram', 'instagram', 'Instagram'], ['social_tiktok', 'tiktok', 'TikTok'], ['social_youtube', 'youtube', 'YouTube'], ['social_x', 'xsocial', 'X']];

const SOCIAL_BG: Record<string, string> = { facebook: 'bg-[#1877f2]', youtube: 'bg-[#ff0000]', tiktok: 'bg-black ring-1 ring-white/30', xsocial: 'bg-black ring-1 ring-white/30', instagram: 'bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600' };

export function Footer() {
  const { settings, brand } = useApp(); const wa = settings.whatsapp || '923154429417';
  const socials = SOCIALS.filter(([k]) => settings[k]);
  const col = (title: string, items: [string, string][]) => (<div><h4 className="mb-4 text-sm font-bold text-white">{title}</h4><ul className="space-y-2.5 text-sm">{items.map(([to, l]) => <li key={to + l}><Link to={to} className="text-slate-400 transition hover:text-white">{l}</Link></li>)}</ul></div>);
  const row = (icon: string, child: ReactNode) => <li className="flex items-center gap-3 text-slate-300"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand/15 text-cyan2"><Icon name={icon} className="h-4 w-4" /></span>{child}</li>;
  return (
    <footer className="relative mt-16 border-t border-brand/25 bg-navy-950 text-slate-300">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand to-transparent" aria-hidden="true" />
      <div className="container-x grid gap-10 py-12 md:grid-cols-3 lg:grid-cols-[1.4fr_1fr_1fr_1.5fr_1fr] lg:divide-x lg:divide-white/10 [&>div]:lg:pl-8 [&>div:first-child]:lg:pl-0">
        <div><Logo size="lg" /><p className="mt-3 text-xs text-slate-400">{brand.tagline}</p><PoweredBy variant="card" /></div>
        {col('Quick Links', [['/', 'Home'], ['/products', 'All Products'], ['/products?flag=deal', 'Deals'], ['/track-order', 'Track an order'], ['/support', 'Support']])}
        {col('Legal', [['/page/terms', 'Terms & Conditions'], ['/page/privacy', 'Privacy Policy'], ['/page/refund', 'Refund Policy'], ['/support', 'FAQ']])}
        <div><h4 className="mb-4 text-sm font-bold text-white">Contact Us</h4>
          <ul className="space-y-3 text-sm">
            {settings.support_email && row('mail', <a href={`mailto:${settings.support_email}`} className="hover:text-white">{settings.support_email}</a>)}
            {row('phone', <a href={waLink(wa, `Hello ${brand.name}`)} target="_blank" rel="noopener noreferrer" className="hover:text-white">0{wa.replace(/^92/, '')}</a>)}
            {settings.contact_address && row('pin', <span>{settings.contact_address}</span>)}
          </ul></div>
        <div><h4 className="mb-4 text-sm font-bold text-white">Follow Us</h4>
          <div className="flex flex-wrap gap-2">
            {socials.map(([k, icon, name]) => <a key={k} href={settings[k]} target="_blank" rel="noopener noreferrer" aria-label={name} className={`grid h-10 w-10 place-items-center rounded-full text-white transition hover:scale-110 ${SOCIAL_BG[icon]}`}><Icon name={icon} className="h-[18px] w-[18px]" /></a>)}
            <a href={waLink(wa, `Hello ${brand.name}`)} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="grid h-10 w-10 place-items-center rounded-full bg-emerald-500 text-white transition hover:scale-110"><Icon name="whatsapp" className="h-[18px] w-[18px]" /></a>
          </div></div>
      </div>
      <div className="border-t border-white/10"><div className="container-x flex flex-col items-center justify-between gap-2 py-4 text-xs text-slate-500 sm:flex-row"><span>© {new Date().getFullYear()} {brand.name}. All Rights Reserved. <span className="mx-1 text-slate-600">|</span> Powered by <b className="font-bold text-white">{brand.parent}</b></span><span className="flex items-center gap-3 italic text-slate-300"><span className="hidden h-px w-16 bg-brand sm:block" />{brand.slogan.includes(',') ? <>{brand.slogan.split(',')[0]}, <b className="text-brand">{brand.slogan.split(',').slice(1).join(',').trim()}</b></> : brand.slogan}</span></div></div>
    </footer>
  );
}

export function PublicShell({ children }: { children: ReactNode }) {
  const { settings, brand } = useApp(); const { path } = useRouter(); const onProduct = /^\/products\/[^/]+/.test(path); const wa = settings.whatsapp || '923154429417';
  return (<div className={`flex min-h-screen flex-col ${onProduct ? 'max-md:pb-24' : ''}`}><Header /><main className="flex-1">{children}</main><Footer />
    <a href={waLink(wa, `Hello ${brand.name}, I need help`)} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp" className={`fixed bottom-5 right-5 z-30 grid h-14 w-14 place-items-center rounded-full bg-emerald-500 text-white shadow-lift transition hover:scale-105 hover:bg-emerald-600 ${onProduct ? 'max-md:hidden' : ''}`}><Icon name="whatsapp" /></a></div>);
}
