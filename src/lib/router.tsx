import { createContext, useContext, useEffect, useState, type AnchorHTMLAttributes, type ReactNode } from 'react';

// Tiny History-API router (no dependency). Patterns: '/products/:slug', '/admin/*'.
type Ctx = { path: string; search: URLSearchParams; navigate: (to: string, replace?: boolean) => void };
const RouterCtx = createContext<Ctx>({ path: '/', search: new URLSearchParams(), navigate: () => {} });

export function Router({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState(() => ({ path: window.location.pathname, search: window.location.search }));
  useEffect(() => {
    const on = () => setLoc({ path: window.location.pathname, search: window.location.search });
    window.addEventListener('popstate', on); return () => window.removeEventListener('popstate', on);
  }, []);
  const navigate = (to: string, replace = false) => {
    if (/^https?:/i.test(to)) { window.location.href = to; return; }
    replace ? window.history.replaceState({}, '', to) : window.history.pushState({}, '', to);
    setLoc({ path: window.location.pathname, search: window.location.search });
    window.scrollTo(0, 0);
  };
  return <RouterCtx.Provider value={{ path: loc.path, search: new URLSearchParams(loc.search), navigate }}>{children}</RouterCtx.Provider>;
}
export const useRouter = () => useContext(RouterCtx);
export const useNavigate = () => useContext(RouterCtx).navigate;
export const useSearch = () => useContext(RouterCtx).search;

export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const pp = pattern.split('/').filter(Boolean), xp = path.split('/').filter(Boolean);
  const params: Record<string, string> = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i] === '*') return params;
    if (xp[i] === undefined) return null;
    if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(xp[i]); else if (pp[i] !== xp[i]) return null;
  }
  return pp.length === xp.length ? params : null;
}

export function Link({ to, children, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { navigate } = useRouter();
  return <a href={to} {...rest} onClick={(e) => {
    rest.onClick?.(e);
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || rest.target === '_blank') return;
    e.preventDefault(); navigate(to);
  }}>{children}</a>;
}

export function Routes({ routes, fallback }: { routes: [string, (p: Record<string, string>) => ReactNode][]; fallback: ReactNode }) {
  const { path } = useRouter();
  for (const [pat, render] of routes) { const m = matchPath(pat, path); if (m) return <>{render(m)}</>; }
  return <>{fallback}</>;
}
