/** HTML-escape. Still needed: the print documents are built as HTML strings
 *  (see features/printing) because the print timing requires raw DOM. */
export const esc = (s: unknown): string =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** A logo is only ever rendered if it is a plain base64 data URL. This is the
 *  gate that stops a stored `javascript:` or SVG payload reaching an <img src>. */
export const safeLogo = (l: unknown): string =>
  typeof l === 'string' && /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(l) ? l : '';

/** "Dr. Sijo P. Mathew MDS" -> "Sijo P." for narrow table columns. */
export const shortDoc = (n?: string): string =>
  (n || '').replace(/^Dr\.?\s*/i, '').split(' ').slice(0, 2).join(' ');

export const debounce = <A extends unknown[]>(fn: (...a: A) => void, ms: number) => {
  let t: ReturnType<typeof setTimeout>;
  return (...a: A) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};
