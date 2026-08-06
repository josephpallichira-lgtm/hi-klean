/* Dashboard drill-downs — RUN AGAINST A FRESH DATABASE
   (dropdb hiklean && createdb hiklean) — it creates bills and will double-count
   against a database that already holds its own fixtures.

   Dashboard drill-downs: every KPI tile must open the rows behind it,
   and those rows must add up to the number on the tile. */
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const { spawn, execFileSync } = require('child_process');
const http = require('http');

let P = 0, F = 0;
const ok = (c, m) => { c ? (P++, console.log('  ✓ ' + m)) : (F++, console.log('  ✗ ' + m)); };
const wait = ms => new Promise(r => setTimeout(r, ms));

const PORT = 3999, BASE = `http://127.0.0.1:${PORT}`;
const ENV = { ...process.env, PORT: String(PORT), DATABASE_URL: 'postgres://postgres@/hiklean?host=/var/run/postgresql',
  JWT_SECRET: 'x'.repeat(40), ADMIN_USER: 'admin', ADMIN_PASSWORD: 'Testpass@123', NODE_ENV: 'test' };

function req(path, method, body, cookie) {
  return new Promise((res, rej) => {
    const d = body ? JSON.stringify(body) : null;
    const r = http.request(BASE + path, { method: method || 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'hk', ...(cookie ? { Cookie: cookie } : {}),
        ...(d ? { 'Content-Length': Buffer.byteLength(d) } : {}) } },
      x => { let s = ''; x.on('data', c => s += c); x.on('end', () => res({ status: x.statusCode, headers: x.headers, body: s ? JSON.parse(s) : null })); });
    r.on('error', rej); if (d) r.write(d); r.end();
  });
}

(async () => {
  const srv = spawn('node', ['src/server.js'], { env: ENV, cwd: require('path').join(__dirname,'..'), stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data',d=>process.stdout.write('[E]'+d));srv.stdout.on('data',d=>process.stdout.write('[O]'+d));
  for (let i = 0; i < 60; i++) { try { const h = await req('/api/health'); if (h.body?.up) break; } catch {} await wait(400); }

  // --- log in
  let r = await req('/api/auth/login', 'POST', { username: 'admin', password: 'Testpass@123' });
  const cookie = (r.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
  ok(r.status === 200, 'admin logged in');
  await req('/api/auth/password', 'POST', { current: 'Testpass@123', next: 'Testpass@1234' }, cookie);
  const c2 = (await req('/api/auth/login', 'POST', { username: 'admin', password: 'Testpass@1234' })).headers['set-cookie'];
  const CK = c2 ? c2.map(x => x.split(';')[0]).join('; ') : cookie;
  ok(!!CK, 'password set, re-authenticated');

  const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const TODAY = iso(new Date());
  const OLD = iso(new Date(Date.now() - 45 * 864e5));

  const procs = (await req('/api/procedures', 'GET', null, CK)).body;
  const pr = procs[0];

  // patients
  const pa = (await req('/api/patients', 'POST', { name: 'DRILL ONE', phone: '9847000001' }, CK)).body;
  const pb = (await req('/api/patients', 'POST', { name: 'DRILL TWO', phone: '9847000002' }, CK)).body;

  // Bill A — raised TODAY, 1000, paid 400 today  -> billed today 1000, collected today 400
  const A = (await req('/api/invoices', 'POST', { type: 'bill', date: TODAY, patientId: pa.id, autoNumber: true,
    items: [{ name: 'A-ITEM', qty: 1, rate: 1000, disc: 0 }], discType: 'amt', discValue: 0,
    payments: [{ amount: 400, mode: 'Cash', date: TODAY }] }, CK)).body;
  ok(!!A?.id, 'bill A created today');

  // Bill B — raised 45 DAYS AGO, 2000, paid 500 TODAY -> NOT billed today, but collected today 500
  const B = (await req('/api/invoices', 'POST', { type: 'bill', date: OLD, patientId: pb.id, autoNumber: true,
    items: [{ name: 'B-ITEM', qty: 1, rate: 2000, disc: 0 }], discType: 'amt', discValue: 0, payments: [] }, CK)).body;
  await req(`/api/invoices/${B.id}/payments`, 'POST', { amount: 500, mode: 'UPI', date: TODAY, ref: 'UPI-XYZ' }, CK);
  ok(!!B?.id, 'bill B created 45 days ago, paid today');

  // ---------- server endpoint ----------
  const pays = (await req(`/api/reports/payments?from=${TODAY}&to=${TODAY}`, 'GET', null, CK)).body;
  ok(Array.isArray(pays) && pays.length === 2, `payments endpoint returns both receipts (got ${pays?.length})`);
  const sum = pays.reduce((a, p) => a + p.amount, 0);
  ok(Math.abs(sum - 900) < 0.005, `receipts add to 900 (got ${sum})`);
  const rep = (await req(`/api/reports?from=${TODAY}&to=${TODAY}`, 'GET', null, CK)).body;
  ok(Math.abs(rep.collected - sum) < 0.005, 'receipt list total === "Collected today" tile');
  ok(Math.abs(rep.billed.total - 1000) < 0.005, `"Billed today" excludes the old bill (got ${rep.billed.total})`);
  ok(pays.some(p => p.mode === 'UPI' && p.ref === 'UPI-XYZ'), 'mode and reference come through');
  ok(pays.every(p => p.enteredBy === 'admin'), 'entered-by is recorded');
  ok(pays.some(p => p.billDate === OLD), 'a payment on an OLD bill appears under collected TODAY');

  // staff must not reach it
  const anon = await req(`/api/reports/payments?from=${TODAY}&to=${TODAY}`);
  ok(anon.status === 401 || anon.status === 403, `payments endpoint refuses anonymous (${anon.status})`);

  // ---------- browser ----------
  const br = await chromium.launch();
  const pg = await br.newPage();
  const logs = [];
  // the app probes /api/auth/me before login; a 401 there is the expected answer
  pg.on('console', m => { if (m.type() === 'error' && !/401 \(Unauthorized\)/.test(m.text())) logs.push(m.text()); });
  pg.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await pg.goto(BASE, { waitUntil: 'networkidle' });
  await pg.fill('#lu', 'admin'); await pg.fill('#lp', 'Testpass@1234');
  await pg.click('#lb');
  await pg.waitForSelector('.stats .stat', { timeout: 15000 });

  const tiles = await pg.$$('.stats .stat');
  ok(tiles.length === 4, `4 tiles on the dashboard (got ${tiles.length})`);
  const taps = await pg.$$('.stats .stat.tap');
  ok(taps.length === 4, `all 4 tiles are clickable (got ${taps.length})`);
  const tagNames = await pg.$$eval('.stats .stat', ns => ns.map(n => n.tagName));
  ok(tagNames.every(t => t === 'BUTTON'), 'tiles are real <button>s — keyboard + screen-reader reachable');
  const cur = await pg.$eval('.stats .stat', n => getComputedStyle(n).cursor);
  ok(cur === 'pointer', `tile shows a pointer cursor (got ${cur})`);

  // --- tile 1: Collected today
  await pg.click('.stats .stat[data-k="collected"]');
  await pg.waitForSelector('.modal .drill table tbody tr', { timeout: 10000 });
  let txt = await pg.textContent('.modal');
  ok(/Collected/.test(txt), 'collected drill-down opens');
  ok(/DRILL ONE/.test(txt) && /DRILL TWO/.test(txt), 'both receipts listed');
  ok(/UPI-XYZ/.test(txt), 'reference visible');
  ok(/₹900/.test(txt.replace(/\s/g, '')) || /900\.00/.test(txt), 'total 900 shown');
  const rows = await pg.$$('.modal .drill tbody tr[data-inv]');
  ok(rows.length === 2, `2 clickable receipt rows (got ${rows.length})`);
  // clicking a row opens that bill
  await rows[0].click();
  await pg.waitForSelector('.modal .mh h3', { timeout: 8000 });
  txt = await pg.textContent('.modal .mh h3');
  ok(/^Bill /.test(txt), `row click opens the bill (title "${txt}")`);
  await pg.click('.modal .x');

  // --- tile 2: Billed today
  await pg.click('.stats .stat[data-k="billed"]');
  await pg.waitForSelector('.modal .drill table tbody tr', { timeout: 10000 });
  txt = await pg.textContent('.modal');
  ok(/DRILL ONE/.test(txt), 'today\'s bill listed under Billed today');
  ok(!/DRILL TWO/.test(txt), 'the 45-day-old bill is NOT listed under Billed today');
  await pg.click('.modal .x');

  // --- tile 3: This month -> Reports
  await pg.click('.stats .stat[data-k="month"]');
  await pg.waitForSelector('#rout', { timeout: 10000 });
  ok((await pg.textContent('h1')).includes('Reports'), 'This month opens the full Reports page');
  await pg.goto(BASE + '/#dash'); await pg.waitForSelector('.stats .stat.tap');

  // --- tile 4: Outstanding dues
  await pg.click('.stats .stat[data-k="dues"]');
  await pg.waitForSelector('.modal .drill table tbody tr', { timeout: 10000 });
  txt = await pg.textContent('.modal');
  ok(/DRILL ONE/.test(txt) && /DRILL TWO/.test(txt), 'both unpaid bills listed');
  ok(/9847000001/.test(txt), 'patient phone shown for chasing payment');
  ok(/45d/.test(txt), 'age in days shown (45d)');
  const waHref = await pg.$$eval('.modal a[href^="https://wa.me/"]', a => a.map(x => x.href));
  ok(waHref.length === 2, `WhatsApp reminder link on each due (got ${waHref.length})`);
  ok(waHref[0].includes('919847'), 'WhatsApp link carries 91 country code');
  const telHref = await pg.$$eval('.modal a[href^="tel:"]', a => a.length);
  ok(telHref === 2, 'phone numbers are tap-to-call');
  // dues total must equal sum of rows
  const bals = await pg.$$eval('.modal .drill tbody tr[data-inv] .tag.r', ns => ns.map(n => Number(n.textContent.replace(/[^0-9.]/g, ''))));
  const duesSum = bals.reduce((a, b) => a + b, 0);
  ok(Math.abs(duesSum - 2100) < 0.01, `dues rows add to 2100 = 600 + 1500 (got ${duesSum})`);
  const tileDues = await pg.$eval('.stats .stat[data-k="dues"] .v', n => Number(n.textContent.replace(/[^0-9.]/g, '')));
  ok(Math.abs(tileDues - duesSum) < 1, `tile figure ${tileDues} === sum of the rows behind it`);
  await pg.click('.modal .x');

  // keyboard reachable
  await pg.focus('.stats .stat[data-k="dues"]');
  await pg.keyboard.press('Enter');
  await pg.waitForSelector('.modal .drill', { timeout: 8000 });
  ok(true, 'tile opens with the Enter key, not just a mouse click');
  await pg.click('.modal .x');

  ok(logs.length === 0, `no console errors (${logs.slice(0, 2).join(' | ')})`);

  await br.close(); srv.kill();
  console.log(`\n  ${P} passed, ${F} failed`);
  process.exit(F ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
