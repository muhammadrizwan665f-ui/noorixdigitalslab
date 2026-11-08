import { Suspense, lazy, useEffect, type ReactNode } from 'react';
import { Link, Router, Routes, useNavigate, useRouter } from './lib/router';
import { AppProvider, useApp } from './lib/store';
import { ThemeProvider } from './lib/theme';
import { PublicShell } from './components/Layout';
import { Loading, Toasts } from './components/ui';
import Home from './pages/Home';
import { Products, ProductDetail } from './pages/Catalog';

// Everything except the storefront entry pages is loaded on demand, so the first mobile load downloads far less JavaScript.
const lz = <T extends Record<string, any>>(load: () => Promise<T>, key: keyof T) => lazy(() => load().then((m) => ({ default: m[key] as React.ComponentType<any> })));
const Cart = lazy(() => import('./pages/Cart'));
const auth = () => import('./pages/Auth'); const info = () => import('./pages/Info'); const dash = () => import('./pages/Dashboard');
const Login = lz(auth, 'Login'), Register = lz(auth, 'Register'), Forgot = lz(auth, 'Forgot'), Reset = lz(auth, 'Reset'), VerifyEmail = lz(auth, 'VerifyEmail');
const CmsPage = lz(info, 'CmsPage'), Support = lz(info, 'Support'), TrackOrder = lz(info, 'TrackOrder'), NotFound = lz(info, 'NotFound');
const D = { DashboardShell: lz(dash, 'DashboardShell'), Overview: lz(dash, 'Overview'), Wallet: lz(dash, 'Wallet'), Orders: lz(dash, 'Orders'), OrderDetail: lz(dash, 'OrderDetail'), Tickets: lz(dash, 'Tickets'), TicketDetail: lz(dash, 'TicketDetail'), Notifications: lz(dash, 'Notifications'), Settings: lz(dash, 'Settings') };

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
  const dashPage = (n: ReactNode) => <Guard><D.DashboardShell>{n}</D.DashboardShell></Guard>;
  return <PublicShell>
    {maint && <div className="bg-amber-100 px-4 py-3 text-center text-sm font-medium text-amber-900">The store is under maintenance — browsing is available but orders are paused.</div>}
    <Suspense fallback={<Loading />}><Routes fallback={<NotFound />} routes={[
      ['/', () => <Home />], ['/products', () => <Products />], ['/products/:slug', (p) => <ProductDetail key={p.slug} slug={p.slug} />], ['/cart', () => <Cart />],
      ['/login', () => <Login />], ['/register', () => <Register />], ['/forgot-password', () => <Forgot />], ['/reset-password', () => <Reset />], ['/verify-email', () => <VerifyEmail />],
      ['/track-order', () => <TrackOrder />], ['/support', () => <Support />], ['/page/:slug', (p) => <CmsPage slug={p.slug} />],
      ['/dashboard', () => dashPage(<D.Overview />)], ['/dashboard/wallet', () => dashPage(<D.Wallet />)], ['/dashboard/orders', () => dashPage(<D.Orders />)], ['/dashboard/orders/:no', (p) => dashPage(<D.OrderDetail key={p.no} orderNo={p.no} />)],
      ['/dashboard/tickets', () => dashPage(<D.Tickets />)], ['/dashboard/tickets/:no', (p) => dashPage(<D.TicketDetail key={p.no} no={p.no} />)], ['/dashboard/notifications', () => dashPage(<D.Notifications />)], ['/dashboard/settings', () => dashPage(<D.Settings />)],
    ]} /></Suspense>
  </PublicShell>;
}

export function App() { return <ThemeProvider><Router><AppProvider><Routed /><Toasts /></AppProvider></Router></ThemeProvider>; }
