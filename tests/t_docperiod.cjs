/* The Dr. Vinaya case — RUN AGAINST A FRESH DATABASE.
   A ₹1,20,000 bill raised in June, part-paid in June, part-paid in August.
   In an August report the doctor must NOT appear to have collected money for
   work that was never billed, and "outstanding" must never read negative. */
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

let P = 0, F = 0;
const ok = (c, m) => { c ? (P++, console.log('  ✓ ' + m)) : (F++, console.log('  ✗ ' + m)); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const PORT = 3997, BASE = `http://127.0.0.1:${PORT}`;
const ENV = { ...process.env, PORT: String(PORT), DATABASE_URL: 'postgres://postgres@/hiklean?host=/var/run/postgresql',
  JWT_SECRET: 'x'.repeat(40), ADMIN_USER: 'admin', ADMIN_PASSWORD: 'Testpass@123', NODE_ENV: 'test' };

function req(p, method, body, cookie) {
  return new Promise((res, rej) => {
    const d = body ? JSON.stringify(body) : null;
    const r = http.request(BASE + p, { method: method || 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'hk', ...(cookie ? { Cookie: cookie } : {}),
        ...(d ? { 'Content-Length': Buffer.byteLength(d) } : {}) } },
      x => { let s = ''; x.on('data', c => s += c); x.on('end', () => res({ status: x.statusCode, headers: x.headers, body: s ? JSON.parse(s) : null })); });
    r.on('error', rej); if (d) r.write(d); r.end();
  });
}

(async () => {
  const srv = spawn('node', ['src/server.js'], { env: ENV, cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  for (let i = 0; i < 60; i++) { try { if ((await req('/api/health')).body?.up) break; } catch {} await wait(400); }

  let r = await req('/api/auth/login', 'POST', { username: 'admin', password: 'Testpass@123' });
  let ck = (r.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
  await req('/api/auth/password', 'POST', { current: 'Testpass@123', next: 'Testpass@1234' }, ck);
  const c2 = (await req('/api/auth/login', 'POST', { username: 'admin', password: 'Testpass@1234' })).headers['set-cookie'];
  const CK = c2.map(x => x.split(';')[0]).join('; ');

  const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const TODAY = iso(new Date()), M_START = TODAY.slice(0, 8) + '01';
  const JUNE = iso(new Date(Date.now() - 47 * 864e5));      // safely before this month

  const docs = (await req('/api/settings', 'GET', null, CK)).body.doctors;
  const VIN = docs[0].id;
  const pat = (await req('/api/patients', 'POST', { name: 'PERIOD CASE', phone: '9847000009' }, CK)).body;

  // ₹1,20,000 aligners billed in June; ₹55,000 + ₹10,000 paid in June
  const inv = (await req('/api/invoices', 'POST', {
    type: 'bill', date: JUNE, patientId: pat.id, doctorId: VIN, autoNumber: true,
    items: [{ name: 'CLEAR ALIGNERS', qty: 1, rate: 120000, disc: 0, docId: VIN }],
    discType: 'amt', discValue: 0,
    payments: [{ amount: 55000, mode: 'Card', date: JUNE }, { amount: 10000, mode: 'Cash', date: JUNE }]
  }, CK)).body;
  // ₹10,000 more paid TODAY
  await req(`/api/invoices/${inv.id}/payments`, 'POST', { amount: 10000, mode: 'Cash', date: TODAY }, CK);
  ok(!!inv?.id, 'June aligner bill created, part-paid today');

  const rep = (await req(`/api/reports/doctors?from=${M_START}&to=${TODAY}`, 'GET', null, CK)).body;
  const d = rep.find(x => x.doctorId === VIN);
  ok(!!d, 'doctor appears in this month\'s report');
  ok(Math.abs(d.billed - 0) < 0.005, `billed this month is 0 — the bill was raised in June (got ${d.billed})`);
  ok(Math.abs(d.collected - 10000) < 0.005, `collected this month is 10,000 (got ${d.collected})`);
  ok(Math.abs(d.collectedPrior - 10000) < 0.005,
    `all 10,000 is flagged as settling an EARLIER bill (got ${d.collectedPrior})`);
  ok(Math.abs(d.unpaid - 0) < 0.005,
    `unpaid on THIS month's bills is 0 — the 45,000 balance belongs to June (got ${d.unpaid})`);
  ok(d.collected - d.billed === d.collectedPrior,
    'collected minus billed is exactly the earlier-bill collection — the gap is fully explained');

  // a bill raised AND part-paid inside the window must show a real unpaid figure
  const p2 = (await req('/api/patients', 'POST', { name: 'IN PERIOD', phone: '9847000010' }, CK)).body;
  await req('/api/invoices', 'POST', {
    type: 'bill', date: TODAY, patientId: p2.id, doctorId: VIN, autoNumber: true,
    items: [{ name: 'RCT - Molar', qty: 1, rate: 5000, disc: 0, docId: VIN }],
    discType: 'amt', discValue: 0, payments: [{ amount: 2000, mode: 'Cash', date: TODAY }]
  }, CK);
  const rep2 = (await req(`/api/reports/doctors?from=${M_START}&to=${TODAY}`, 'GET', null, CK)).body;
  const d2 = rep2.find(x => x.doctorId === VIN);
  ok(Math.abs(d2.billed - 5000) < 0.005, `billed this month now 5,000 (got ${d2.billed})`);
  ok(Math.abs(d2.collected - 12000) < 0.005, `collected this month now 12,000 (got ${d2.collected})`);
  ok(Math.abs(d2.unpaid - 3000) < 0.005, `unpaid on this month's bills is 3,000 — the real figure (got ${d2.unpaid})`);
  ok(d2.unpaid >= 0, 'unpaid is never negative');
  const alg = d2.procedures.find(p => p.name === 'CLEAR ALIGNERS');
  ok(alg && Math.abs(alg.billed) < 0.005 && Math.abs(alg.prior - 10000) < 0.005,
    'the aligner line carries a prior-bill marker so a 0-billed / 10,000-collected row is explained');

  // ---------- screen ----------
  const br = await chromium.launch(); const pg = await br.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(BASE, { waitUntil: 'networkidle' });
  await pg.fill('#lu', 'admin'); await pg.fill('#lp', 'Testpass@1234'); await pg.click('#lb');
  await pg.waitForSelector('#nav button[data-r="doctors"]', { timeout: 15000 });
  await pg.click('#nav button[data-r="doctors"]');
  await pg.waitForSelector('#dout table', { timeout: 15000 });
  const txt = await pg.textContent('#dout');
  ok(!/Outstanding\s*₹-/.test(txt) && !/₹-/.test(txt), 'no negative rupee figure anywhere on the doctor report');
  ok(/against earlier bills/.test(txt), 'the earlier-bill amount is stated on screen');
  ok(/Why collected can exceed billed/.test(txt), 'the explanation banner appears when it applies');
  ok(/Unpaid on this period's bills/.test(txt), 'the header now says what the figure actually is');
  ok(/earlier bill/.test(txt), 'the 0-billed aligner row is tagged');
  ok(errs.length === 0, `no page errors (${errs.slice(0, 2).join(' | ')})`);

  // ---------- doctor tiles must be clickable and filter to that doctor ----------
  // add a second doctor with his own bill so filtering is meaningful
  const docs2 = (await req('/api/settings', 'GET', null, CK)).body.doctors;
  let SECOND = docs2[1] && docs2[1].id;
  if (!SECOND) {
    const cur = (await req('/api/settings', 'GET', null, CK)).body;
    await req('/api/settings', 'PUT', {
      settings: cur.settings,
      doctors: [...cur.doctors, { name: 'Dr. Second Tester', spec: '', role_line: '', reg_no: '', sign_title: '', active: true }]
    }, CK);
    const after = (await req('/api/settings', 'GET', null, CK)).body.doctors;
    SECOND = (after.find(d => d.name === 'Dr. Second Tester') || {}).id;
  }
  if (SECOND) {
    const p3 = (await req('/api/patients', 'POST', { name: 'OTHER DOC PATIENT', phone: '9847000011' }, CK)).body;
    await req('/api/invoices', 'POST', {
      type: 'bill', date: TODAY, patientId: p3.id, doctorId: SECOND, autoNumber: true,
      items: [{ name: 'SCALING TEST', qty: 1, rate: 1500, disc: 0, docId: SECOND }],
      discType: 'amt', discValue: 0, payments: [{ amount: 1500, mode: 'Cash', date: TODAY }]
    }, CK);
    await pg.click('#nav button[data-r="dash"]'); await pg.waitForTimeout(400);
    await pg.click('#nav button[data-r="doctors"]');
    await pg.waitForSelector('#dout table', { timeout: 15000 });

    const tiles = await pg.$$('#dout .stats .stat');
    ok(tiles.length >= 2, `at least 2 doctor tiles (got ${tiles.length})`);
    const tags = await pg.$$eval('#dout .stats .stat', ns => ns.map(n => n.tagName));
    ok(tags.every(t => t === 'BUTTON'), 'doctor tiles are real <button>s');
    const cur = await pg.$eval('#dout .stats .stat', n => getComputedStyle(n).cursor);
    ok(cur === 'pointer', `doctor tile shows a pointer cursor (got ${cur})`);
    const cardsBefore = (await pg.$$('#dout .doccard')).length;
    ok(cardsBefore >= 2, `all doctors listed before picking (got ${cardsBefore} cards)`);

    await pg.click(`#dout .stats .stat[data-id="${SECOND}"]`);
    await pg.waitForTimeout(700);
    const cardsAfter = await pg.$$eval('#dout .doccard', ns => ns.map(n => n.querySelector('b')?.textContent || ''));
    ok(cardsAfter.length === 1, `picking a doctor shows exactly one card (got ${cardsAfter.length})`);
    const dTxt = await pg.textContent('#dout');
    ok(/SCALING TEST/.test(dTxt), 'the picked doctor\'s procedures are shown');
    ok(!/CLEAR ALIGNERS/.test(dTxt), 'the other doctor\'s procedures are hidden');
    ok(/All doctors/.test(dTxt), 'a way back to all doctors is offered');
    const on = await pg.$$eval('#dout .stats .stat.acc', ns => ns.length);
    ok(on === 1, `the picked tile is highlighted (got ${on})`);

    await pg.click('#dout button[data-do="docall"]'); await pg.waitForTimeout(700);
    ok((await pg.$$('#dout .doccard')).length >= 2, 'All doctors restores the full list');

    await pg.click(`#dout .stats .stat[data-id="${SECOND}"]`); await pg.waitForTimeout(600);
    await pg.click(`#dout .stats .stat[data-id="${SECOND}"]`); await pg.waitForTimeout(600);
    ok((await pg.$$('#dout .doccard')).length >= 2, 'tapping the open tile again closes it');

    await pg.focus(`#dout .stats .stat[data-id="${SECOND}"]`);
    await pg.keyboard.press('Enter'); await pg.waitForTimeout(600);
    ok((await pg.$$('#dout .doccard')).length === 1, 'doctor tile opens with the Enter key too');
  }
  ok(errs.length === 0, `still no page errors (${errs.slice(0, 2).join(' | ')})`);

  await br.close(); srv.kill();
  console.log(`\n  ${P} passed, ${F} failed`);
  process.exit(F ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
