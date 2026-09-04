/**
 * Printing must NEVER navigate away from the app.
 *
 * An earlier build auto-opened the bill in a new tab when it detected an
 * installed (standalone) app. On a phone that looks exactly like the app
 * crashing. The rule now: always render and print in place first, and only
 * OFFER the browser as a choice the user makes.
 *
 * RUN AGAINST A FRESH DATABASE.
 */
const { chromium } = require('playwright');
const http = require('http');

let P = 0, F = 0;
const ok = (c, m, x) => { c ? (P++, console.log('  ✓ ' + m)) : (F++, console.log('  ✗ ' + m + (x ? ' :: ' + x : ''))); };
const BASE = process.env.HKURL || 'http://127.0.0.1:3000';
const PW = process.env.HKPASS || 'Test@12345';

function req(path, method, body, cookie) {
  return new Promise((res, rej) => {
    const d = body ? JSON.stringify(body) : null;
    const r = http.request(BASE + path, {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'hk',
        ...(cookie ? { Cookie: cookie } : {}), ...(d ? { 'Content-Length': Buffer.byteLength(d) } : {}) },
    }, x => { let s = ''; x.on('data', c => s += c); x.on('end', () => res({ status: x.statusCode, headers: x.headers, body: s ? JSON.parse(s) : null })); });
    r.on('error', rej); if (d) r.write(d); r.end();
  });
}

async function session(standalone) {
  const br = await chromium.launch();
  const ctx = await br.newContext({
    viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36',
  });
  const pg = await ctx.newPage();
  await pg.addInitScript((sa) => {
    window.__printCalls = 0;
    window.__opens = 0;
    Object.defineProperty(window, 'print', { value: () => { window.__printCalls++; }, writable: true });
    const realOpen = window.open;
    window.open = function (...a) { window.__opens++; return realOpen ? null : null; };
    if (sa) {
      const mm = window.matchMedia.bind(window);
      window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q)
        ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }
        : mm(q));
    }
  }, standalone);
  return { br, pg };
}

(async () => {
  let r = await req('/api/auth/login', 'POST', { username: 'admin', password: PW });
  const CK = (r.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
  const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const TODAY = iso(new Date());
  const pat = (await req('/api/patients', 'POST', { name: 'NOEXIT TEST', phone: '9847002222' }, CK)).body;
  await req('/api/invoices', 'POST', {
    type: 'bill', date: TODAY, patientId: pat.id, autoNumber: true,
    items: [{ name: 'Consultation', qty: 1, rate: 500, disc: 0 }],
    discType: 'amt', discValue: 0, payments: [{ amount: 500, mode: 'Cash', date: TODAY }],
  }, CK);
  ok(true, 'bill seeded');

  for (const standalone of [false, true]) {
    const label = standalone ? '[installed app]' : '[browser]';
    const { br, pg } = await session(standalone);
    const errs = [];
    pg.on('pageerror', e => errs.push(e.message));

    await pg.goto(BASE, { waitUntil: 'networkidle' });
    await pg.fill('#lu', 'admin'); await pg.fill('#lp', PW); await pg.click('#lb');
    await pg.waitForSelector('#nav button[data-r="invoices"]', { timeout: 20000 });

    const before = pg.url();
    await pg.click('#nav button[data-r="invoices"]');
    await pg.waitForSelector('#ilist tbody tr button', { timeout: 20000 });
    await pg.click('#ilist tbody tr button');
    await pg.waitForSelector('.modal', { timeout: 15000 });
    await pg.click('.mf .btn.p');
    await pg.waitForTimeout(1500);

    const state = await pg.evaluate(() => ({
      calls: window.__printCalls,
      opens: window.__opens,
      area: document.querySelector('#printarea').innerHTML.length,
      appAlive: !!document.querySelector('#app'),
      url: location.href,
    }));

    ok(state.calls >= 1, `${label} window.print() was called`);
    ok(state.area > 500, `${label} the bill was rendered in place (${state.area} chars)`);
    ok(state.opens === 0, `${label} NOTHING opened a new tab on its own (opens=${state.opens})`);
    ok(state.appAlive, `${label} the app itself is still mounted`);
    ok(state.url.split('#')[0] === before.split('#')[0], `${label} the page did not navigate away`);

    if (standalone) {
      const hasChoice = await pg.$('#pkOpen');
      ok(!!hasChoice, `${label} a browser fallback is OFFERED, not taken`);
      const stay = await pg.$('#pkStay');
      ok(!!stay, `${label} "Try printing here" is offered as the first option`);
      // taking the offer is a deliberate act
      await pg.click('#pkStay');
      await pg.waitForTimeout(600);
      const after = await pg.evaluate(() => ({ opens: window.__opens, area: document.querySelector('#printarea').innerHTML.length }));
      ok(after.opens === 0, `${label} choosing "print here" still opens no tab`);
      ok(after.area > 500, `${label} choosing "print here" re-renders the bill`);
    } else {
      ok(!(await pg.$('#pkOpen')), `${label} no fallback dialog in a normal browser`);
    }

    ok(errs.length === 0, `${label} no page errors`, errs.slice(0, 2).join(' | '));
    await br.close();
  }

  console.log(`\n  ${P} passed, ${F} failed`);
  process.exit(F ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
