import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Mode = 'light' | 'dark' | 'system';
export const ACCENTS = [
  { id: 'ocean', name: 'Ocean', swatch: '#087BFF' },
  { id: 'emerald', name: 'Emerald', swatch: '#059669' },
  { id: 'violet', name: 'Violet', swatch: '#7c3aed' },
  { id: 'sunset', name: 'Sunset', swatch: '#ea580c' },
  { id: 'rose', name: 'Rose', swatch: '#e11d48' },
] as const;
export type Accent = (typeof ACCENTS)[number]['id'];
interface Theme { mode: Mode; accent: Accent }
const KEY = 'nx_theme';
const DEFAULT: Theme = { mode: 'dark', accent: 'ocean' };

const read = (): Theme => {
  try { const t = JSON.parse(localStorage.getItem(KEY) || 'null'); if (t && ['light', 'dark', 'system'].includes(t.mode) && ACCENTS.some((a) => a.id === t.accent)) return t; } catch { /* storage blocked */ }
  return DEFAULT;
};
const resolve = (m: Mode) => (m === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : m);
export function applyTheme(t: Theme) {
  const el = document.documentElement; el.dataset.mode = resolve(t.mode); el.dataset.accent = t.accent;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', el.dataset.mode === 'dark' ? '#030814' : '#071426');
}

const Ctx = createContext<{ theme: Theme; setMode: (m: Mode) => void; setAccent: (a: Accent) => void }>(null as any);
export const useTheme = () => useContext(Ctx);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(read);
  useEffect(() => {
    applyTheme(theme); try { localStorage.setItem(KEY, JSON.stringify(theme)); } catch { /* ignore */ }
    if (theme.mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)'); const on = () => applyTheme(theme); mq.addEventListener('change', on); return () => mq.removeEventListener('change', on);
  }, [theme]);
  const setMode = useCallback((mode: Mode) => setTheme((t) => ({ ...t, mode })), []);
  const setAccent = useCallback((accent: Accent) => setTheme((t) => ({ ...t, accent })), []);
  const value = useMemo(() => ({ theme, setMode, setAccent }), [theme, setMode, setAccent]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
