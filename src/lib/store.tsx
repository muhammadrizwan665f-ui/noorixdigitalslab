import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { get, post, setCsrf, ApiError } from './api';
import { brandFrom, type Brand } from './brand';

export interface Me { user: { id: string; email: string; name: string; phone: string | null; isStaff: boolean; emailVerified: boolean } | null; balance: number; unread: number; perms: string[]; isSuper: boolean }
export interface CartLine { planId: string; productId: string; productName: string; planName: string; price: number; brandColor: string; inputFields: any[]; input: Record<string, string> }
type Settings = Record<string, string>;

interface Ctx {
  me: Me; ready: boolean; settings: Settings; brand: Brand;
  refresh: () => Promise<void>; login: (e: string, p: string) => Promise<Me>; register: (d: any) => Promise<Me>; logout: () => Promise<void>;
  can: (perm: string) => boolean;
  cart: CartLine[]; addToCart: (l: CartLine) => void; removeFromCart: (planId: string) => void; setInput: (planId: string, k: string, v: string) => void; clearCart: () => void;
  toast: (msg: string, kind?: 'ok' | 'err') => void; toasts: { id: number; msg: string; kind: string }[];
}
const empty: Me = { user: null, balance: 0, unread: 0, perms: [], isSuper: false };
const C = createContext<Ctx>(null as any);
export const useApp = () => useContext(C);

const readCart = (): CartLine[] => { try { return JSON.parse(localStorage.getItem('nx_cart') || '[]'); } catch { return []; } };

export function AppProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me>(empty); const [ready, setReady] = useState(false); const [settings, setSettings] = useState<Settings>({});
  const [cart, setCart] = useState<CartLine[]>(readCart); const [toasts, setToasts] = useState<{ id: number; msg: string; kind: string }[]>([]);
  const apply = (m: any): Me => { setCsrf(m.csrf ?? ''); const v: Me = { user: m.user, balance: m.balance ?? 0, unread: m.unread ?? 0, perms: m.perms ?? [], isSuper: !!m.isSuper }; setMe(v); return v; };
  const refresh = useCallback(async () => { try { apply(await get('/auth/me')); } catch { /* offline */ } }, []);
  useEffect(() => { (async () => { await Promise.all([refresh(), get('/public/settings').then(setSettings).catch(() => {})]); setReady(true); })(); }, [refresh]);
  useEffect(() => { try { localStorage.setItem('nx_cart', JSON.stringify(cart)); } catch { /* private mode */ } }, [cart]);
  const toast = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => { const id = Date.now() + Math.random(); setToasts((t) => [...t, { id, msg, kind }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500); }, []);
  const value = useMemo<Ctx>(() => ({
    me, ready, settings, brand: brandFrom(settings), refresh, toast, toasts,
    login: async (email, password) => apply(await post('/auth/login', { email, password })),
    register: async (d) => apply(await post('/auth/register', d)),
    logout: async () => { await post('/auth/logout').catch(() => {}); setCsrf(''); setMe(empty); },
    can: (p) => me.isSuper || me.perms.includes(p),
    cart,
    addToCart: (l) => setCart((c) => (c.some((x) => x.planId === l.planId) ? c.map((x) => (x.planId === l.planId ? l : x)) : [...c, l])),
    removeFromCart: (id) => setCart((c) => c.filter((x) => x.planId !== id)),
    setInput: (id, k, v) => setCart((c) => c.map((x) => (x.planId === id ? { ...x, input: { ...x.input, [k]: v } } : x))),
    clearCart: () => setCart([]),
  }), [me, ready, settings, cart, toasts, refresh, toast]);
  return <C.Provider value={value}>{children}</C.Provider>;
}

/** Fetch hook with loading/error + reload. */
export function useApi<T = any>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null); const [error, setError] = useState<string>(''); const [loading, setLoading] = useState(!!path); const [n, setN] = useState(0);
  useEffect(() => {
    if (!path) return; let live = true; setLoading(true);
    get<T>(path).then((d) => { if (live) { setData(d); setError(''); } }).catch((e: ApiError) => { if (live) setError(e.message); }).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [path, n, ...deps]);
  return { data, error, loading, reload: () => setN((x) => x + 1), setData };
}
