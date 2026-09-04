/**
 * Doctor report: period maths + the doctor picker — RUN AGAINST A FRESH DATABASE.
 *
 * Rebuilds the exact case that reached the clinic: a ₹1,20,000 aligner bill
 * raised in June, part-paid then and part-paid inside the report window. The
 * old header showed `billed - collected` as "Outstanding" and printed
 * −₹10,400, which reads as though the doctor was paid for treatment nobody
 * billed. It was simply older work being settled.
 *
 * Guarantees asserted here:
 *   - collected − billed is fully explained by `collectedPrior`
 *   - `unpaid` counts only bills raised INSIDE the window and is never negative
 *   - no negative rupee figure appears anywhere on the page
 *   - the doctor tiles filter the page and restore it
 */
const { chromium } = require('playwright');
const http = require('http');

let P = 0, F = 0;
const ok = (c, m) => { c ? (P++, console.log('  ✓ ' + m)) : (F++, console.log('  ✗ ' + m)); };
const BASE = process.env.HKURL || 'http://127.0.0.1:3000';
const PW = process.env.HKPASS || 'Test@12345';

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
  let r = await req('/api/auth/login', 'POST', { username: 'admin', password: PW });
  ok(r.status === 200, 'signed in');
  const CK = (r.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');

  const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const TODAY = iso(new Date());
  const M_START = TODAY.slice(0, 8) + '01';
  const JUNE = iso(new Date(Date.now() - 47 * 864e5));

  const cfg = (await req('/api/settings', 'GET', null, CK)).body;
  const VIN = cfg.doctors[0].id;

  const pat = (await req('/api/patients', 'POST', { name: 'PERIOD CASE', phone: '9847000009' }, CK)).body;
  const inv = (await req('/api/invoices', 'POST', {
    type: 'bill', date: JUNE, patientId: pat.id, doctorId: VIN, autoNumber: true,
    items: [{ name: 'CLEAR ALIGNERS', qty: 1, rate: 120000, disc: 0, docId: VIN }],
    discType: 'amt', discValue: 0,
    payments: [{ amount: 55000, mode: 'Card', date: JUNE }, { amount: 10000, mode: 'Cash', date: JUNE }],
  }, CK)).body;
  await req(`/api/invoices/${inv.id}/payments`, 'POST', { amount: 10000, mode: 'Cash', date: TODAY }, CK);
  ok(!!inv?.id, 'June aligner bill created, part-paid today');

  const rep = (await req(`/api/reports/doctors?from=${M_START}&to=${TODAY}`, 'GET', null, CK)).body;
  const d = rep.find(x => x.doctorId === VIN);
  ok(!!d, "doctor appears in this month's report");
  ok(Math.abs(d.billed - 0) < 0.005, `billed this month is 0 — the bill was raised in June (got ${d.billed})`);
  ok(Math.abs(d.collected - 10000) < 0.005, `collected this month is 10,000 (got ${d.collected})`);
  ok(Math.abs(d.collectedPrior - 10000) < 0.005, `all 10,000 flagged as settling an EARLIER bill (got ${d.collectedPrior})`);
  ok(Math.abs(d.unpaid - 0) < 0.005, `unpaid on THIS month's bills is 0 — the 45,000 belongs to June (got ${d.unpaid})`);
  ok(d.collected - d.billed === d.collectedPrior, 'collected minus billed is exactly the earlier-bill collection');

  // a bill raised AND part-paid inside the window must show a real unpaid figure
  const p2 = (await req('/api/patients', 'POST', { name: 'IN PERIOD', phone: '9847000010' }, CK)).body;
  await req('/api/invoices', 'POST', {
    type: 'bill', date: TODAY, patientId: p2.id, doctorId: VIN, autoNumber: true,
    items: [{ name: 'RCT - Molar', qty: 1, rate: 5000, disc: 0, docId: VIN }],
    discType: 'amt', discValue: 0, payments: [{ amount: 2000, mode: 'Cash', date: TODAY }],
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

  /* ---------- the screen ---------- */
  const br = await chromium.launch();
  const pg = await br.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/401 \(Unauthorized\)/.test(m.text())) errs.push(m.text()); });

  await pg.goto(BASE, { waitUntil: 'networkidle' });
  await pg.fill('#lu', 'admin'); await pg.fill('#lp', PW); await pg.click('#lb');
  await pg.waitForSelector('#nav button[data-r="doctors"]', { timeout: 20000 });
  await pg.click('#nav button[data-r="doctors"]');
  await pg.waitForSelector('#dout table', { timeout: 20000 });

  const txt = await pg.textContent('#dout');
  ok(!/₹-/.test(txt), 'no negative rupee figure anywhere on the doctor report');
  ok(/against earlier bills/.test(txt), 'the earlier-bill amount is stated on screen');
  ok(/Why collected can exceed billed/.test(txt), 'the explanation banner appears when it applies');
  ok(/Unpaid on this period's bills/.test(txt), 'the header says what the figure actually is');
  ok(/earlier bill/.test(txt), 'the 0-billed aligner row is tagged');

  /* ---------- the doctor picker ---------- */
  const docs2 = (await req('/api/settings', 'GET', null, CK)).body;
  let SECOND = docs2.doctors[1] && docs2.doctors[1].id;
  if (!SECOND) {
    await req('/api/settings', 'PUT', {
      settings: docs2.settings,
      doctors: [...docs2.doctors, { name: 'Dr. Second Tester', spec: '', role_line: '', reg_no: '', sign_title: '', active: true }],
    }, CK);
    SECOND = ((await req('/api/settings', 'GET', null, CK)).body.doctors.find(x => x.name === 'Dr. Second Tester') || {}).id;
  }
  ok(!!SECOND, 'a second doctor exists so filtering is meaningful');

  const p3 = (await req('/api/patients', 'POST', { name: 'OTHER DOC PATIENT', phone: '9847000011' }, CK)).body;
  await req('/api/invoices', 'POST', {
    type: 'bill', date: TODAY, patientId: p3.id, doctorId: SECOND, autoNumber: true,
    items: [{ name: 'SCALING TEST', qty: 1, rate: 1500, disc: 0, docId: SECOND }],
    discType: 'amt', discValue: 0, payments: [{ amount: 1500, mode: 'Cash', date: TODAY }],
  }, CK);

  await pg.click('#nav button[data-r="dash"]');
  await pg.waitForTimeout(600);
  await pg.click('#nav button[data-r="doctors"]');
  await pg.waitForSelector('#dout .doccard', { timeout: 20000 });

  const tags = await pg.$$eval('#dout .stats .stat', ns => ns.map(n => n.tagName));
  ok(tags.length >= 2, `at least 2 doctor tiles (got ${tags.length})`);
  ok(tags.every(t => t === 'BUTTON'), 'doctor tiles are real <button>s');
  const cur = await pg.$eval('#dout .stats .stat', n => getComputedStyle(n).cursor);
  ok(cur === 'pointer', `doctor tile shows a pointer cursor (got ${cur})`);
  ok((await pg.$$('#dout .doccard')).length >= 2, 'all doctors listed before picking');

  await pg.click(`#dout .stats .stat[data-id="${SECOND}"]`);
  await pg.waitForTimeout(800);
  ok((await pg.$$('#dout .doccard')).length === 1, 'picking a doctor shows exactly one card');
  const dTxt = await pg.textContent('#dout');
  ok(/SCALING TEST/.test(dTxt), "the picked doctor's procedures are shown");
  ok(!/CLEAR ALIGNERS/.test(dTxt), "the other doctor's procedures are hidden");
  ok(/All doctors/.test(dTxt), 'a way back to all doctors is offered');
  ok((await pg.$$eval('#dout .stats .stat.acc', ns => ns.length)) === 1, 'the picked tile is highlighted');

  await pg.click('#dout button[data-do="docall"]');
  await pg.waitForTimeout(700);
  ok((await pg.$$('#dout .doccard')).length >= 2, 'All doctors restores the full list');

  await pg.click(`#dout .stats .stat[data-id="${SECOND}"]`); await pg.waitForTimeout(500);
  await pg.click(`#dout .stats .stat[data-id="${SECOND}"]`); await pg.waitForTimeout(500);
  ok((await pg.$$('#dout .doccard')).length >= 2, 'tapping the open tile again closes it');

  await pg.focus(`#dout .stats .stat[data-id="${SECOND}"]`);
  await pg.keyboard.press('Enter');
  await pg.waitForTimeout(600);
  ok((await pg.$$('#dout .doccard')).length === 1, 'doctor tile opens with the Enter key too');

  ok(errs.length === 0, `no page errors (${errs.slice(0, 2).join(' | ')})`);

  await br.close();
  console.log(`\n  ${P} passed, ${F} failed`);
  process.exit(F ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
