/**
 * Android print regression test.
 *
 * Reproduces the reported failure: on a phone, "Save as PDF" showed a blank
 * preview and saved nothing. Two independent causes are covered here:
 *
 *   1. doPrint() wiped #printarea 1.5s after calling window.print(). On desktop
 *      window.print() blocks until the dialog closes, so the wipe was harmless.
 *      On Android Chrome it returns immediately, so the content vanished while
 *      the user was still looking at the preview -> blank page, blank PDF.
 *
 *   2. The mobile stylesheet sets `table{min-width:560px}` / `min-width:500px`
 *      below 820px. Chrome on Android lays out the printed page using the
 *      mobile viewport, so those rules also hit the invoice table and pushed it
 *      off the right edge of the A4 sheet.
 *
 * The test drives the real built client at a phone viewport, emulates print
 * media, and renders an actual PDF.
 */
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const FILE = process.env.HK_FILE || '/home/claude/pkg/Hi-Klean-Billing.html';
const PHONE = { width: 412, height: 915 };   // Pixel-class Android

let pass = 0, fail = 0;
const t = (name, ok, extra) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: 2.6,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36'
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message));

  // window.print() on Android returns immediately. Model that exactly.
  await page.addInitScript(() => {
    window.__printCalls = 0;
    window.print = () => { window.__printCalls++; };   // returns at once, like Android
  });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(1200);

  // --- build a bill straight through the app's own API layer
  const built = await page.evaluate(async () => {
    const inv = {
      no: '169', type: 'bill', date: new Date().toISOString().slice(0, 10),
      pname: 'Ann Mary Joseph', preg: '2T 12682', page: '34', psex: 'F',
      paddress: 'Kanjikuzhy, Kottayam',
      items: [
        { name: 'Root Canal Treatment', desc: '46', qty: 1, rate: 4500, amount: 4500 },
        { name: 'Porcelain Crown', desc: '46', qty: 1, rate: 6000, amount: 6000 },
        { name: 'Scaling & Polishing', desc: 'Full mouth', qty: 1, rate: 1200, amount: 1200 }
      ],
      sub: 11700, disc: 700, tax: 0, total: 11000, paid: 11000, bal: 0,
      payments: [{ date: new Date().toISOString().slice(0, 10), mode: 'UPI', amount: 11000, ref: '' }],
      notes: '', doctorId: null
    };
    if (typeof printBill !== 'function') return { err: 'printBill missing' };
    printBill(inv, false);
    return { ok: true };
  });
  t('app exposes printBill', built.ok === true, built.err);

  // Immediately after print() the content must be there.
  await page.waitForTimeout(300);
  const immediate = await page.evaluate(() => document.querySelector('#printarea').innerHTML.length);
  t('print area populated right after print()', immediate > 500, `${immediate} chars`);

  // THE BUG: on Android the user is still in the preview seconds later.
  await page.waitForTimeout(4000);
  const later = await page.evaluate(() => ({
    len: document.querySelector('#printarea').innerHTML.length,
    calls: window.__printCalls
  }));
  t('window.print() was called', later.calls === 1, `calls=${later.calls}`);
  t('print area STILL populated 4s later (Android preview is async)', later.len > 500, `${later.len} chars`);

  // --- print-media layout at a phone viewport
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(200);

  const layout = await page.evaluate(() => {
    const pa = document.querySelector('#printarea');
    const tbl = pa.querySelector('table');
    const cs = tbl ? getComputedStyle(tbl) : null;
    return {
      areaVisible: getComputedStyle(pa).display !== 'none',
      appHidden: getComputedStyle(document.querySelector('#app')).display === 'none',
      tableMinWidth: cs ? cs.minWidth : 'none',
      tableWidth: tbl ? Math.round(tbl.getBoundingClientRect().width) : 0,
      areaWidth: Math.round(pa.getBoundingClientRect().width),
      invWidth: (() => { const i = pa.querySelector('.inv'); return i ? Math.round(i.getBoundingClientRect().width) : 0; })(),
      clipped: (() => { const i = pa.querySelector('.inv'); return i ? i.scrollWidth > i.clientWidth + 1 : false; })(),
      text: pa.innerText.slice(0, 400)
    };
  });

  t('#printarea visible in print media', layout.areaVisible);
  t('app chrome hidden in print media', layout.appHidden);
  t('invoice table has no mobile min-width', layout.tableMinWidth === '0px' || layout.tableMinWidth === 'auto' || layout.tableMinWidth === 'none', layout.tableMinWidth);
  t('invoice table fits inside the sheet', layout.tableWidth <= layout.invWidth + 1, `table ${layout.tableWidth}px vs sheet ${layout.invWidth}px`);
  t('nothing clipped horizontally', layout.clipped === false);
  t('sheet width is paper-based, not phone-based', layout.invWidth > 600, `${layout.invWidth}px (190mm ~ 718px)`);
  t('bill number rendered', /169/.test(layout.text));
  t('patient name rendered', /Ann Mary Joseph/.test(layout.text));

  // --- the real proof: render an actual A4 PDF from the phone-sized page
  const out = '/tmp/hk-mobile-print.pdf';
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: out, format: 'A4', printBackground: true, margin: { top: '10mm', right: '10mm', bottom: '8mm', left: '10mm' } });
  const size = fs.statSync(out).size;
  t('PDF produced', size > 3000, `${(size / 1024).toFixed(1)} KB`);

  const { execFileSync } = require('child_process');
  let pdfText = '';
  try { pdfText = execFileSync('pdftotext', [out, '-'], { encoding: 'utf8' }); } catch (e) { pdfText = 'ERR ' + e.message; }
  t('PDF is not blank', pdfText.trim().length > 80, `${pdfText.trim().length} chars of text`);
  t('PDF contains the patient', /Ann Mary Joseph/.test(pdfText));
  t('PDF contains the bill number', /169/.test(pdfText));
  t('PDF contains every treatment line',
    /Root Canal/.test(pdfText) && /Porcelain Crown/.test(pdfText) && /Scaling/.test(pdfText));
  t('PDF contains the net amount', /11000\.00|11,000/.test(pdfText));
  t('PDF is a single page', (pdfText.match(/\f/g) || []).length <= 1, `${(pdfText.match(/\f/g) || []).length} form feeds`);

  // --- second print must not stack on top of the first
  await page.emulateMedia({ media: null });
  await page.evaluate(() => {
    printBill({
      no: '170', type: 'bill', date: new Date().toISOString().slice(0, 10),
      pname: 'Second Patient', preg: '2T 12683', page: '20', psex: 'M', paddress: 'X',
      items: [{ name: 'Extraction', desc: '38', qty: 1, rate: 900, amount: 900 }],
      sub: 900, disc: 0, tax: 0, total: 900, paid: 900, bal: 0, payments: [], notes: '', doctorId: null
    }, false);
  });
  await page.waitForTimeout(300);
  const second = await page.evaluate(() => document.querySelector('#printarea').innerText);
  t('second print replaces the first, no stale copy', /Second Patient/.test(second) && !/Ann Mary Joseph/.test(second));

  // --- thermal path still works on mobile
  await page.evaluate(() => {
    printBill({
      no: '171', type: 'bill', date: new Date().toISOString().slice(0, 10),
      pname: 'Thermal Test', preg: '2T 12684', page: '20', psex: 'M', paddress: '',
      items: [{ name: 'Consultation', desc: '', qty: 1, rate: 300, amount: 300 }],
      sub: 300, disc: 0, tax: 0, total: 300, paid: 300, bal: 0, payments: [{ mode: 'Cash', amount: 300, date: '2026-08-04', ref: '' }], notes: '', doctorId: null
    }, true);
  });
  await page.waitForTimeout(2500);
  const thermal = await page.evaluate(() => document.querySelector('#printarea').innerText);
  t('thermal receipt survives on mobile too', /Thermal Test/.test(thermal), thermal.slice(0, 40));

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
