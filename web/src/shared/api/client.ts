/**
 * The single door to the server.
 *
 * Everything the app knows about HTTP lives here: the CSRF header, the cookie
 * credential mode, the 401 handling, and the busy indicator. No feature makes a
 * fetch() call of its own.
 */

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type Unauthorized = () => void;
let onUnauthorized: Unauthorized = () => {};
export const setUnauthorizedHandler = (fn: Unauthorized) => { onUnauthorized = fn; };

/** Offline edition swaps in a local backend that answers the same paths. */
type MockFn = (path: string, method: string, body?: unknown) => Promise<unknown>;
declare global {
  interface Window { __MOCK?: MockFn; __LOCAL_ONLY__?: boolean; __DL?: (d: unknown) => void }
}

let busy = 0;
const setBusy = (on: boolean) => {
  busy += on ? 1 : -1;
  const existing = document.getElementById('bar');
  if (busy > 0 && !existing) {
    const b = document.createElement('div');
    b.id = 'bar';
    b.className = 'saving';
    document.body.appendChild(b);
  }
  if (busy <= 0 && existing) existing.remove();
};

export async function api<T = unknown>(path: string, method = 'GET', body?: unknown): Promise<T> {
  if (typeof window.__MOCK === 'function' && (window.__LOCAL_ONLY__ || location.protocol === 'file:'))
    return window.__MOCK(path, method, body) as Promise<T>;

  setBusy(true);
  try {
    const r = await fetch('/api' + path, {
      method,
      // X-Requested-With is the CSRF gate: a cross-site form post cannot set it.
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'hk' },
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (r.status === 401 && !path.startsWith('/auth/')) {
      onUnauthorized();
      throw new ApiError('Not signed in', 401);
    }

    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('json') ? await r.json() : await r.text();
    if (!r.ok) {
      const msg = (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error)
        || `Request failed (${r.status})`;
      throw new ApiError(String(msg), r.status);
    }
    return data as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof Error && e.message === 'Failed to fetch')
      throw new ApiError('Cannot reach the server — check the internet connection');
    throw e;
  } finally {
    setBusy(false);
  }
}

/** Download something the backend generated — a URL when hosted, a blob offline. */
export async function grabFile(path: string, onToast: (m: string, bad?: boolean) => void) {
  if (typeof window.__DL === 'function') {
    try {
      const d = await api(path);
      window.__DL(d);
      onToast('Downloaded');
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e), true);
    }
  } else {
    window.open('/api' + path, '_blank');
  }
}
