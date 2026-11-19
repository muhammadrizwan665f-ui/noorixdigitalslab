import { useEffect, useRef } from 'react';
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
  const first = useRef(true);
  useEffect(() => {
    // Google Tag Manager: the first page view is counted by GTM itself; later in-app navigations are reported as a dataLayer event.
    // Private areas (account, admin, order and reset URLs) only report their top-level section, never ids or tokens.
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (first.current) first.current = false;
    else timer = setTimeout(() => { // wait a moment so the new page has set its own <title>
      const w = window as unknown as { dataLayer?: unknown[] };
      (w.dataLayer = w.dataLayer || []).push({ event: 'spa_page_view', page_path: PRIVATE.test(path) ? '/' + path.split('/')[1] : path, page_title: document.title });
    }, 400);
    const filtered = [...search.keys()].length > 0;
    const priv = PRIVATE.test(path);
    const canonical = SITE + (path === '/' ? '/' : path.replace(/\/+$/, ''));
    setMeta('link[rel="canonical"]', () => { const l = document.createElement('link'); l.setAttribute('rel', 'canonical'); return l; }, 'href', canonical);
    og('og:url', canonical);
    meta('robots', priv || noindexFlag ? 'noindex,nofollow' : filtered ? 'noindex,follow' : 'index,follow');
    return () => { if (timer) clearTimeout(timer); };
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
