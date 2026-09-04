/**
 * Dashboard drill-downs — RUN AGAINST A FRESH DATABASE.
 *
 * Builds a bill raised today and a bill raised 45 days ago that is paid today,
 * then proves the two tiles disagree the way they should: the old bill appears
 * under "Collected today" and NOT under "Billed today". Collection follows the
 * PAYMENT date; billing follows the BILL date. If those two lists ever agree,
 * something is being double counted.
 */
const { chromium } = require('playwright');
const http = require('http');

let P = 0, F = 0;
const ok = (c, m) => { c ? (P++, console.log('  ✓ ' + m)) : (F++, console.log('  ✗ ' + m)); };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const BASE = process.env.HKURL || 'http://127.0.0.1:3000';

function req(path, method, body, cookie) {
  return new Promise((res, rej) => {
    const d = body ? JSON.stringify(body) : null;
    const r = http.request(BASE + path, {
      method: method || 'GET',
      headers: {
        'Content-Type': 'application/json', 'X-Requested-With': 'hk',
        ...(cookie ? { Cookie: cookie } : {}), ...(d ? { 'Content-Length': Buffer.byteLength(d) } : {}),
      },
    }, x => { let s = ''; x.on('data', c => s += c); x.on('end', () => res({ status: x.statusCode, headers: x.headers, body: s ? JSON.parse(s) : null })); });
    r.on('error', rej); if (d) r.write(d); r.end();
  });
}

(async () => {
  const PW = process.env.HKPASS || 'Test@12345';
  let r = await req('/api/auth/login', 'POST', { username: 'admin', password: PW });
  ok(r.status === 200, 'admin logged in');
  const CK = (r.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');

  const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const TODAY = iso(new Date());
  const OLD = iso(new Date(Date.now() - 45 * 864e5));

  const pa = (await req('/api/patients', 'POST', { name: 'DRILL ONE', phone: '9847000001' }, CK)).body;
  const pb = (await req('/api/patients', 'POST', { name: 'DRILL TWO', phone: '9847000002' }, CK)).body;

  // Bill A — raised TODAY, 1000, paid 400 today
  const A = (await req('/api/invoices', 'POST', {
    type: 'bill', date: TODAY, patientId: pa.id, autoNumber: true,
    items: [{ name: 'A-ITEM', qty: 1, rate: 1000, disc: 0 }], discType: 'amt', discValue: 0,
    payments: [{ amount: 400, mode: 'Cash', date: TODAY }],
  }, CK)).body;
  ok(!!A?.id, 'bill A created today');

  // Bill B — raised 45 DAYS AGO, 2000, paid 500 TODAY
  const B = (await req('/api/invoices', 'POST', {
    type: 'bill', date: OLD, patientId: pb.id, autoNumber: true,
    items: [{ name: 'B-ITEM', qty: 1, rate: 2000, disc: 0 }], discType: 'amt', discValue: 0, payments: [],
  }, CK)).body;
  await req(`/api/invoices/${B.id}/payments`, 'POST', { amount: 500, mode: 'UPI', date: TODAY, ref: 'UPI-XYZ' }, CK);
  ok(!!B?.id, 'bill B created 45 days ago, paid today');

  /* ---------- the server endpoint the Collected tile reads ---------- */
  const pays = (await req(`/api/reports/payments?from=${TODAY}&to=${TODAY}`, 'GET', null, CK)).body;
  ok(Array.isArray(pays) && pays.length === 2, `payments endpoint returns both receipts (got ${pays?.length})`);
  const sum = pays.reduce((a, p) => a + p.amount, 0);
  ok(Math.abs(sum - 900) < 0.005, `receipts add to 900 (got ${sum})`);
  const rep = (await req(`/api/reports?from=${TODAY}&to=${TODAY}`, 'GET', null, CK)).body;
  ok(Math.abs(rep.collected - sum) < 0.005, 'receipt list total === the Collected tile');
  ok(Math.abs(rep.billed.total - 1000) < 0.005, `Billed today excludes the old bill (got ${rep.billed.total})`);
  ok(pays.some(p => p.billDate === OLD), 'a payment on an OLD bill appears under collected TODAY');
  const anon = await req(`/api/reports/payments?from=${TODAY}&to=${TODAY}`);
  ok(anon.status === 401 || anon.status === 403, `payments endpoint refuses anonymous (${anon.status})`);

  /* ---------- the screen ---------- */
  const br = await chromium.launch();
  const pg = await br.newPage();
  const logs = [];
  pg.on('console', m => { if (m.type() === 'error' && !/401 \(Unauthorized\)/.test(m.text())) logs.push(m.text()); });
  pg.on('pageerror', e => logs.push('PAGEERROR ' + e.message));

  await pg.goto(BASE, { waitUntil: 'networkidle' });
  await pg.fill('#lu', 'admin'); await pg.fill('#lp', PW); await pg.click('#lb');
  await pg.waitForSelector('.stats .stat', { timeout: 20000 });

  const tiles = await pg.$$('.stats .stat');
  ok(tiles.length === 4, `4 tiles on the dashboard (got ${tiles.length})`);
  ok((await pg.$$('.stats .stat.tap')).length === 4, 'all 4 tiles are clickable');
  const tagNames = await pg.$$eval('.stats .stat', ns => ns.map(n => n.tagName));
  ok(tagNames.every(t => t === 'BUTTON'), 'tiles are real <button>s — keyboard + screen-reader reachable');
  const cur = await pg.$eval('.stats .stat', n => getComputedStyle(n).cursor);
  ok(cur === 'pointer', `tile shows a pointer cursor (got ${cur})`);

  // --- tile 1: Collected today
  await pg.click('.stats .stat[data-k="collected"]');
  await pg.waitForSelector('.modal .drill table tbody tr', { timeout: 15000 });
  let txt = await pg.textContent('.modal');
  ok(/Collected/.test(txt), 'collected drill-down opens');
  ok(/DRILL ONE/.test(txt) && /DRILL TWO/.test(txt), 'both receipts listed');
  ok(/UPI-XYZ/.test(txt), 'reference visible');
  ok(/900/.test(txt.replace(/[\s,]/g, '')), 'total 900 shown');
  const rows = await pg.$$('.modal .drill tbody tr[data-inv]');
  ok(rows.length === 2, `2 clickable receipt rows (got ${rows.length})`);
  await rows[0].click();
  await pg.waitForTimeout(1200);
  txt = await pg.textContent('.modal .mh h3');
  ok(/^Bill /.test(txt), `row click opens the bill (title "${txt}")`);
  await pg.click('.modal .x');
  await pg.waitForTimeout(400);

  // --- tile 2: Billed today
  await pg.click('.stats .stat[data-k="billed"]');
  await pg.waitForSelector('.modal .drill table tbody tr', { timeout: 15000 });
  txt = await pg.textContent('.modal');
  ok(/DRILL ONE/.test(txt), "today's bill listed under Billed today");
  ok(!/DRILL TWO/.test(txt), 'the 45-day-old bill is NOT listed under Billed today');
  await pg.click('.modal .x');
  await pg.waitForTimeout(400);

  // --- tile 3: This month -> the full Reports page
  await pg.click('.stats .stat[data-k="month"]');
  await pg.waitForSelector('#rout', { timeout: 15000 });
  ok((await pg.textContent('h1')).includes('Reports'), 'This month opens the full Reports page');
  await pg.evaluate(() => { location.hash = 'dash'; });
  await pg.waitForSelector('.stats .stat.tap', { timeout: 15000 });

  // --- tile 4: Outstanding dues
  await pg.click('.stats .stat[data-k="dues"]');
  await pg.waitForSelector('.modal .drill table tbody tr', { timeout: 15000 });
  txt = await pg.textContent('.modal');
  ok(/DRILL ONE/.test(txt) && /DRILL TWO/.test(txt), 'both unpaid bills listed');
  ok(/9847000001/.test(txt), 'patient phone shown for chasing payment');
  ok(/45d/.test(txt), 'age in days shown (45d)');
  const waHref = await pg.$$eval('.modal a[href^="https://wa.me/"]', a => a.map(x => x.href));
  ok(waHref.length === 2, `WhatsApp reminder link on each due (got ${waHref.length})`);
  ok(waHref[0].includes('919847'), 'WhatsApp link carries the 91 country code');
  ok((await pg.$$eval('.modal a[href^="tel:"]', a => a.length)) === 2, 'phone numbers are tap-to-call');
  const bals = await pg.$$eval('.modal .drill tbody tr[data-inv] .tag.r', ns => ns.map(n => Number(n.textContent.replace(/[^0-9.]/g, ''))));
  const duesSum = bals.reduce((a, b) => a + b, 0);
  ok(Math.abs(duesSum - 2100) < 0.01, `dues rows add to 2100 = 600 + 1500 (got ${duesSum})`);
  const tileDues = await pg.$eval('.stats .stat[data-k="dues"] .v', n => Number(n.textContent.replace(/[^0-9.]/g, '')));
  ok(Math.abs(tileDues - duesSum) < 1, `tile figure ${tileDues} === sum of the rows behind it`);
  await pg.click('.modal .x');
  await pg.waitForTimeout(400);

  // keyboard reachable
  await pg.focus('.stats .stat[data-k="dues"]');
  await pg.keyboard.press('Enter');
  await pg.waitForSelector('.modal .drill', { timeout: 15000 });
  ok(true, 'tile opens with the Enter key, not just a mouse click');
  await pg.click('.modal .x');

  ok(logs.length === 0, `no console errors (${logs.slice(0, 2).join(' | ')})`);

  await br.close();
  console.log(`\n  ${P} passed, ${F} failed`);
  process.exit(F ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
