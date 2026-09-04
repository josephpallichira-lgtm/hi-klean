import { useEffect, useState } from 'react';

/**
 * Hash routing, deliberately hand-rolled.
 *
 * The old app used bare hashes: #dash, #bill/12, #patients/7. Staff have these
 * bookmarked and the service worker caches against them. react-router's
 * HashRouter would produce #/dash — a different URL — silently breaking every
 * saved link. Twenty lines here is the cheaper trade.
 */
export interface Route {
  /** first segment, e.g. "bill" */
  base: string;
  /** remaining segments, e.g. ["12"] */
  args: string[];
  /** the raw hash, e.g. "bill/12" */
  raw: string;
}

export const parseHash = (h: string): Route => {
  const raw = h.replace(/^#/, '') || 'dash';
  const parts = raw.split('/');
  return { base: parts[0] || 'dash', args: parts.slice(1), raw };
};

export const navigate = (to: string) => { location.hash = to; };

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => { window.scrollTo(0, 0); setRoute(parseHash(location.hash)); };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
