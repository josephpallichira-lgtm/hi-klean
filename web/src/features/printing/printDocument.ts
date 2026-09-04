/**
 * The print engine. Every comment here records a bug that reached the clinic.
 * Change nothing in this file without running tests/t_print_mobile and
 * tests/t_noexit against a real headless Chromium first.
 */

/** Android runs a home-screen ("installed") app in a stripped window where
 *  window.print() silently does nothing and there is no browser menu to print
 *  from. We detect that only to OFFER a way out — we never navigate on our own. */
export function inStandalone(): boolean {
  try {
    if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
    return ['standalone', 'fullscreen', 'minimal-ui'].some(
      (m) => window.matchMedia('(display-mode: ' + m + ')').matches,
    );
  } catch {
    return false;
  }
}

/** A self-contained page: every app style, the bill, and a Print button the
 *  user can tap. No inline script — the CSP forbids it — so the handler is
 *  attached from here after the document is written. */
export function standaloneDoc(html: string, thermal?: boolean): string {
  const css = Array.from(document.querySelectorAll('style')).map((s) => s.textContent).join('\n');
  const page = thermal ? '@page{size:80mm auto;margin:3mm}' : '@page{size:A4 portrait;margin:10mm 10mm 8mm 10mm}';
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Hi-Klean bill</title><style>' + css + '</style><style>'
    + 'body{margin:0;background:#fff}#app,#side,#main,#root{display:none!important}'
    + '#printarea{display:block!important}' + page
    + '@media screen{body{padding:10px 10px 92px}'
    + '#printarea .inv{width:auto!important;max-width:100%!important}'
    + '.hkbar{position:fixed;left:0;right:0;bottom:0;background:#0a7d78;color:#fff;'
    + 'padding:11px 12px;text-align:center;font:600 14px/1.4 system-ui,sans-serif;z-index:9}'
    + '.hkbar button{font:inherit;background:#fff;color:#0a7d78;border:0;border-radius:9px;'
    + 'padding:10px 18px;margin-top:7px}}'
    + '@media print{.hkbar{display:none!important}'
    + '#printarea .inv{width:190mm!important;max-width:190mm!important}}'
    + '</style></head><body><div id="printarea">' + html + '</div>'
    + '<div class="hkbar">Tap below, or use your browser menu → Share → Print<br>'
    + '<button type="button">Print / Save as PDF</button></div></body></html>';
}

type Toast = (msg: string, bad?: boolean) => void;

/** Opens the bill in a browser tab. Only ever called from a deliberate tap —
 *  never automatically, because silently leaving the app looks like a crash. */
export function openBillTab(html: string, thermal: boolean | undefined, toast: Toast): void {
  let w: Window | null = null;
  try { w = window.open('', '_blank'); } catch { w = null; }
  if (!w || !w.document) {
    toast('Your browser blocked the new tab — allow pop-ups and try again', true);
    return;
  }
  w.document.open();
  w.document.write(standaloneDoc(html, thermal));
  w.document.close();
  const btn = w.document.querySelector('.hkbar button');
  if (btn) btn.addEventListener('click', () => { try { w!.print(); } catch { /* user cancelled */ } });
  setTimeout(() => { try { w!.focus(); w!.print(); } catch { /* user cancelled */ } }, 500);
}

export function printInPlace(html: string, thermal: boolean | undefined, toast: Toast): void {
  const pa = document.getElementById('printarea');
  if (!pa) return;

  // Wipe HERE, not on a timer after printing. On Android, window.print() returns
  // immediately and the system preview renders asynchronously — a delayed wipe
  // emptied the page while the user was still in the preview, so the PDF saved
  // blank. Replacing the content at the START of each print keeps a stale copy
  // from trailing into the next one without ever racing the preview.
  pa.innerHTML = html;

  let st = document.getElementById('pgstyle');
  if (!st) {
    st = document.createElement('style');
    st.id = 'pgstyle';
    document.head.appendChild(st);
  }
  st.textContent = thermal
    ? '@media print{@page{size:80mm auto;margin:3mm}}'
    : '@media print{@page{size:A4 portrait;margin:10mm 10mm 8mm 10mm}}';
  window.onafterprint = null;

  // Let images (the logo) decode before the print engine takes its snapshot.
  const fire = () => {
    try { window.print(); } catch { toast('Could not open the print dialog', true); }
  };
  const imgs = Array.from(pa.querySelectorAll('img'));
  const pending = imgs.filter((i) => !i.complete);
  if (!pending.length) { setTimeout(fire, 80); return; }

  let left = pending.length;
  let fired = false;
  const tick = () => { if (--left <= 0 && !fired) { fired = true; setTimeout(fire, 40); } };
  pending.forEach((i) => {
    i.addEventListener('load', tick, { once: true });
    i.addEventListener('error', tick, { once: true });
  });
  setTimeout(() => { if (!fired) { fired = true; fire(); } }, 1200); // never hang on a broken image
}

export interface PrintHandlers {
  toast: Toast;
  /** Shown only in an installed app, and only as a CHOICE. */
  offerBrowserFallback: (opts: { onStay: () => void; onOpen: () => void }) => void;
}

export function printDocument(html: string, thermal: boolean | undefined, h: PrintHandlers): void {
  // ALWAYS render and print in place first. Nothing here navigates away.
  printInPlace(html, thermal, h.toast);

  // In an installed app the print request above goes nowhere, so offer the way
  // out as a choice the user makes — never as something that just happens.
  if (inStandalone()) {
    h.offerBrowserFallback({
      onStay: () => printInPlace(html, thermal, h.toast),
      onOpen: () => openBillTab(html, thermal, h.toast),
    });
  }
}
