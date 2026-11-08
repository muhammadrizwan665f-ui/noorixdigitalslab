import { useEffect, useState } from 'react';

/** True below Tailwind's `md` breakpoint (768px). Lets a page render a mobile-only layout. */
export function useIsMobile() {
  const q = '(max-width: 767.98px)';
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => { const mq = window.matchMedia(q); const f = () => setM(mq.matches); f(); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); }, []);
  return m;
}
