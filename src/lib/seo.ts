import { useEffect } from 'react';
import { useRouter } from './router';

/** The one preferred domain. Canonical and Open Graph URLs always use it, whatever host served the page. */
export const SITE = 'https://bmart.store';
const PRIVATE = /^\/(admin|dashboard|cart|login|register|forgot-password|reset-password|verify-email|track-order)(\/|$)/;

function setMeta(sel: string, make: () => HTMLElement, attr: string, value: string) {
  let el = document.head.querySelector<HTMLElement>(sel);
  if (!el) { el = make(); document.head.appendChild(el); }
  el.setAttribute(attr, value);
}
const meta = (name: string, content: string) => setMeta(`meta[name="${name}"]`, () => { const m = document.createElement('meta'); m.setAttribute('name', name); return m; }, 'content', content);
const og = (prop: string, content: string) => setMeta(`meta[property="${prop}"]`, () => { const m = document.createElement('meta'); m.setAttribute('property', prop); return m; }, 'content', content);

/** Keeps title/description/Open Graph in step with client-side navigation (the Worker already sends the same values on first load). */
export function useSeo(title: string | undefined, description?: string) {
  useEffect(() => {
    if (!title) return;
    document.title = title; og('og:title', title); meta('twitter:title', title);
    if (description) { meta('description', description); og('og:description', description); meta('twitter:description', description); }
  }, [title, description]);
}

/** Canonical URL and robots directive for the current route. Mounted once in the app shell. */
export function useRouteSeo() {
  const { path, search } = useRouter();
  useEffect(() => {
    const filtered = [...search.keys()].length > 0;
    const priv = PRIVATE.test(path);
    const canonical = SITE + (path === '/' ? '/' : path.replace(/\/+$/, ''));
    setMeta('link[rel="canonical"]', () => { const l = document.createElement('link'); l.setAttribute('rel', 'canonical'); return l; }, 'href', canonical);
    og('og:url', canonical);
    meta('robots', priv || noindexFlag ? 'noindex,nofollow' : filtered ? 'noindex,follow' : 'index,follow');
  }, [path, search]);
}

let noindexFlag = false;
/** Pages that exist in the app but have nothing to show (unknown product, category, article, URL) must not be indexed. */
export function useNoindex(when: boolean) {
  useEffect(() => {
    noindexFlag = when;
    if (when) meta('robots', 'noindex,nofollow');
    return () => { noindexFlag = false; };
  }, [when]);
}
