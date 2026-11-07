import { Suspense, lazy, useEffect, type ReactNode } from 'react';
import { Link, Router, Routes, useNavigate, useRouter } from './lib/router';
import { AppProvider, useApp } from './lib/store';
import { ThemeProvider } from './lib/theme';
import { PublicShell } from './components/Layout';
import { Loading, Toasts } from './components/ui';
import Home from './pages/Home';
import { Products, ProductDetail } from './pages/Catalog';
import Cart from './pages/Cart';
import { Login, Register, Forgot, Reset, VerifyEmail } from './pages/Auth';
import { CmsPage, Support, TrackOrder, NotFound } from './pages/Info';
import * as D from './pages/Dashboard';

const AdminApp = lazy(() => import('./admin/AdminApp'));

function Guard({ children, staff }: { children: ReactNode; staff?: boolean }) {
  const { me, ready } = useApp(); const nav = useNavigate(); const { path } = useRouter();
  useEffect(() => { if (ready && !me.user) nav(`/login?next=${encodeURIComponent(path)}`, true); }, [ready, me.user, path]);
  if (!ready) return <Loading />; if (!me.user) return null;
  if (staff && !me.user.isStaff) return <div className="container-x py-20 text-center"><h1 className="text-2xl font-bold">Access denied</h1><p className="mt-2 text-slate-600">Your account does not have access to the admin panel.</p><Link to="/" className="btn-primary mt-5">Home</Link></div>;
  return <>{children}</>;
}

function Routed() {
  const { path } = useRouter(); const { settings, me } = useApp();
  if (path.startsWith('/admin')) return <Guard staff><Suspense fallback={<Loading />}><AdminApp /></Suspense></Guard>;
  const maint = settings.maintenance === '1' && !me.user?.isStaff && !/^\/(login|register|forgot-password|reset-password)/.test(path);
  const dash = (n: ReactNode) => <Guard><D.DashboardShell>{n}</D.DashboardShell></Guard>;
  return <PublicShell>
    {maint && <div className="bg-amber-100 px-4 py-3 text-center text-sm font-medium text-amber-900">The store is under maintenance — browsing is available but orders are paused.</div>}
    <Routes fallback={<NotFound />} routes={[
      ['/', () => <Home />], ['/products', () => <Products />], ['/products/:slug', (p) => <ProductDetail key={p.slug} slug={p.slug} />], ['/cart', () => <Cart />],
      ['/login', () => <Login />], ['/register', () => <Register />], ['/forgot-password', () => <Forgot />], ['/reset-password', () => <Reset />], ['/verify-email', () => <VerifyEmail />],
      ['/track-order', () => <TrackOrder />], ['/support', () => <Support />], ['/page/:slug', (p) => <CmsPage slug={p.slug} />],
      ['/dashboard', () => dash(<D.Overview />)], ['/dashboard/wallet', () => dash(<D.Wallet />)], ['/dashboard/orders', () => dash(<D.Orders />)], ['/dashboard/orders/:no', (p) => dash(<D.OrderDetail key={p.no} orderNo={p.no} />)],
      ['/dashboard/tickets', () => dash(<D.Tickets />)], ['/dashboard/tickets/:no', (p) => dash(<D.TicketDetail key={p.no} no={p.no} />)], ['/dashboard/notifications', () => dash(<D.Notifications />)], ['/dashboard/settings', () => dash(<D.Settings />)],
    ]} />
  </PublicShell>;
}

export function App() { return <ThemeProvider><Router><AppProvider><Routed /><Toasts /></AppProvider></Router></ThemeProvider>; }
