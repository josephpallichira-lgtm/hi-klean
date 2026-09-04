/**
 * Android print regression test — React client, real server.
 *
 * Reproduces the two failures that actually reached the clinic:
 *
 *   1. The print area was wiped ~1.5s AFTER window.print(). On desktop print()
 *      blocks, so the wipe was harmless. On Android Chrome it returns
 *      immediately, so the content vanished while the user was still in the
 *      preview -> blank page, blank PDF.
 *
 *   2. The mobile stylesheet sets table{min-width:560px} below 820px. Chrome on
 *      Android lays the printed page out with the mobile viewport, so that rule
 *      also hit the invoice table and pushed it off the A4 sheet.
 *
 * Unlike the pre-React version this drives the REAL UI — open the bill, click
 * "Print A4" — rather than calling a global, so it also proves the button is
 * wired to the print engine.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const { execFileSync } = require('child_process');

const U = process.env.HKURL || 'http://localhost:3000';
const PW = process.env.HKPASS || 'Test@12345';
const PHONE = { width: 412, height: 915 };

let pass = 0, fail = 0;
const t = (name, ok, extra) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : '*** FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: PHONE, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36',
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message));

  // window.print() on Android returns immediately. Model that exactly.
  await page.addInitScript(() => {
    window.__printCalls = 0;
    Object.defineProperty(window, 'print', { value: () => { window.__printCalls++; }, writable: true });
  });

  await page.goto(U, { waitUntil: 'networkidle' });
  await page.fill('#lu', 'admin'); await page.fill('#lp', PW); await page.click('#lb');
  await page.waitForSelector('#nav button[data-r="dash"]', { timeout: 20000 });
  t('signed in on a phone viewport', true);

  // Seed a bill through the API so the test is about printing, not data entry.
  const made = await page.evaluate(async () => {
    const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'hk' };
    const pat = await fetch('/api/patients', { method: 'POST', headers: H, body: JSON.stringify({ name: 'Ann Mary Joseph', age: '34', sex: 'Female', phone: '9847000123', address: 'Kanjikuzhy, Kottayam' }) }).then(r => r.json());
    const inv = await fetch('/api/invoices', { method: 'POST', headers: H, body: JSON.stringify({
      type: 'bill', date: new Date().toISOString().slice(0, 10), patientId: pat.id, autoNumber: true,
      items: [
        { name: 'Root Canal Treatment', desc: '46', qty: 1, rate: 4500, disc: 0 },
        { name: 'Porcelain Crown', desc: '46', qty: 1, rate: 6000, disc: 0 },
        { name: 'Scaling & Polishing', desc: 'Full mouth', qty: 1, rate: 1200, disc: 0 },
      ],
      discType: 'amt', discValue: 700,
      payments: [{ amount: 11000, mode: 'UPI', date: new Date().toISOString().slice(0, 10) }],
    }) }).then(r => r.json());
    return { id: inv.id, no: inv.no, total: inv.total };
  });
  t('bill seeded via the API', !!made.id, `bill ${made.no}, total ${made.total}`);

  // --- drive the real UI: Bills -> Open -> Print A4
  await page.evaluate(() => { location.hash = 'invoices'; });
  await page.waitForTimeout(1500);
  await page.click('#ilist tbody tr button');           // "Open"
  await page.waitForSelector('.modal', { timeout: 15000 });
  const printBtn = await page.$('.mf .btn.p');
  t('bill detail offers a Print A4 button', !!printBtn);
  await printBtn.click();

  await page.waitForTimeout(400);
  const immediate = await page.evaluate(() => document.querySelector('#printarea').innerHTML.length);
  t('print area populated right after print()', immediate > 500, `${immediate} chars`);

  // THE BUG: on Android the user is still in the preview seconds later.
  await page.waitForTimeout(4000);
  const later = await page.evaluate(() => ({
    len: document.querySelector('#printarea').innerHTML.length,
    calls: window.__printCalls,
  }));
  t('window.print() was called', later.calls >= 1, `calls=${later.calls}`);
  t('print area STILL populated 4s later (Android preview is async)', later.len > 500, `${later.len} chars`);

  // --- print-media layout at a phone viewport
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(250);
  const layout = await page.evaluate(() => {
    const pa = document.querySelector('#printarea');
    const tbl = pa.querySelector('table');
    const cs = tbl ? getComputedStyle(tbl) : null;
    const i = pa.querySelector('.inv');
    return {
      areaVisible: getComputedStyle(pa).display !== 'none',
      appHidden: getComputedStyle(document.querySelector('#app')).display === 'none',
      tableMinWidth: cs ? cs.minWidth : 'none',
      tableWidth: tbl ? Math.round(tbl.getBoundingClientRect().width) : 0,
      invWidth: i ? Math.round(i.getBoundingClientRect().width) : 0,
      clipped: i ? i.scrollWidth > i.clientWidth + 1 : false,
      text: pa.innerText.slice(0, 500),
    };
  });
  t('#printarea visible in print media', layout.areaVisible);
  t('app chrome hidden in print media', layout.appHidden);
  t('invoice table has no mobile min-width', ['0px', 'auto', 'none'].includes(layout.tableMinWidth), layout.tableMinWidth);
  t('invoice table fits inside the sheet', layout.tableWidth <= layout.invWidth + 1, `table ${layout.tableWidth}px vs sheet ${layout.invWidth}px`);
  t('nothing clipped horizontally', layout.clipped === false);
  t('sheet width is paper-based, not phone-based', layout.invWidth > 600, `${layout.invWidth}px (190mm ~ 718px)`);
  t('patient name rendered', /Ann Mary Joseph/.test(layout.text));

  // --- the real proof: render an actual A4 PDF from the phone-sized page
  const out = '/tmp/hk-react-mobile-print.pdf';
  await page.pdf({ path: out, format: 'A4', printBackground: true, margin: { top: '10mm', right: '10mm', bottom: '8mm', left: '10mm' } });
  const size = fs.statSync(out).size;
  t('PDF produced', size > 3000, `${(size / 1024).toFixed(1)} KB`);

  let pdfText = '';
  try { pdfText = execFileSync('pdftotext', [out, '-'], { encoding: 'utf8' }); } catch (e) { pdfText = 'ERR ' + e.message; }
  t('PDF is not blank', pdfText.trim().length > 80, `${pdfText.trim().length} chars of text`);
  t('PDF contains the patient', /Ann Mary Joseph/.test(pdfText));
  t('PDF contains the bill number', new RegExp(made.no).test(pdfText));
  t('PDF contains every treatment line',
    /Root Canal/.test(pdfText) && /Porcelain Crown/.test(pdfText) && /Scaling/.test(pdfText));
  t('PDF contains the net amount', /11000\.00|11,000/.test(pdfText));
  t('PDF is a single page', (pdfText.match(/\f/g) || []).length <= 1, `${(pdfText.match(/\f/g) || []).length} form feeds`);
  t('letterhead carries the billing doctor', /Sijo/.test(pdfText), pdfText.slice(0, 60).replace(/\n/g, ' '));

  // --- a second print must replace the first, never stack
  await page.emulateMedia({ media: null });
  await page.evaluate(() => { document.querySelector('.mask')?.querySelector('.x')?.click(); });
  await page.waitForTimeout(400);
  const second = await page.evaluate(async () => {
    const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'hk' };
    const pat = await fetch('/api/patients', { method: 'POST', headers: H, body: JSON.stringify({ name: 'Second Patient', phone: '9847000999' }) }).then(r => r.json());
    await fetch('/api/invoices', { method: 'POST', headers: H, body: JSON.stringify({
      type: 'bill', date: new Date().toISOString().slice(0, 10), patientId: pat.id, autoNumber: true,
      items: [{ name: 'Extraction', desc: '38', qty: 1, rate: 900, disc: 0 }],
      discType: 'amt', discValue: 0, payments: [],
    }) }).then(r => r.json());
    return true;
  });
  t('second bill seeded', second);
  await page.evaluate(() => { location.hash = 'dash'; });
  await page.waitForTimeout(300);
  await page.evaluate(() => { location.hash = 'invoices'; });
  await page.waitForTimeout(1800);
  await page.click('#ilist tbody tr button');
  await page.waitForSelector('.modal', { timeout: 15000 });
  await page.click('.mf .btn.p');
  await page.waitForTimeout(700);
  const area = await page.evaluate(() => document.querySelector('#printarea').innerText);
  t('second print replaces the first, no stale copy',
    /Second Patient/.test(area) && !/Ann Mary Joseph/.test(area), area.slice(0, 60).replace(/\n/g, ' '));

  // --- thermal path
  await page.evaluate(() => { document.querySelector('.mask')?.querySelector('.x')?.click(); });
  await page.waitForTimeout(300);
  await page.click('#ilist tbody tr button');
  await page.waitForSelector('.modal', { timeout: 15000 });
  const btns = await page.$$('.mf .btn');
  await btns[btns.length - 2].click();                  // "Thermal"
  await page.waitForTimeout(700);
  const thermal = await page.evaluate(() => !!document.querySelector('#printarea .tm'));
  t('thermal receipt renders on mobile too', thermal);

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
