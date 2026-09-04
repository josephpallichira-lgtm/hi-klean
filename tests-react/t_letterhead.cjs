/**
 * The letterhead is LOCKED to the clinic's billing doctor.
 *
 * Every bill, estimate and treatment summary must carry Dr. Sijo P. Mathew
 * regardless of who actually treated the patient — while the treating doctor is
 * still recorded per line so the Doctor Report can attribute revenue.
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

(async () => {
  let r = await req('/api/auth/login', 'POST', { username: 'admin', password: PW });
  const CK = (r.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
  ok(r.status === 200, 'signed in');

  const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const TODAY = iso(new Date());

  // Two doctors: the billing one, and a visiting consultant.
  const cfg = (await req('/api/settings', 'GET', null, CK)).body;
  const BILLING = cfg.doctors[0];
  await req('/api/settings', 'PUT', {
    settings: { ...cfg.settings, defaultDoctorId: BILLING.id },
    doctors: [...cfg.doctors, { name: 'Dr. Visiting Consultant', spec: '(Orthodontics)', role_line: 'Consultant', reg_no: '99999', sign_title: 'Consultant', active: true }],
  }, CK);
  const after = (await req('/api/settings', 'GET', null, CK)).body;
  const OTHER = after.doctors.find(d => d.name === 'Dr. Visiting Consultant');
  ok(!!OTHER, 'a second, non-billing doctor exists');
  ok(after.settings.defaultDoctorId === BILLING.id, 'billing doctor is the default');

  // A bill TREATED entirely by the other doctor.
  const pat = (await req('/api/patients', 'POST', { name: 'LETTERHEAD TEST', phone: '9847001234', age: '40', sex: 'Female', address: 'Kottayam' }, CK)).body;
  const inv = (await req('/api/invoices', 'POST', {
    type: 'bill', date: TODAY, patientId: pat.id, doctorId: OTHER.id, autoNumber: true,
    items: [{ name: 'Ortho Adjustment', desc: '', qty: 1, rate: 1500, disc: 0, docId: OTHER.id }],
    discType: 'amt', discValue: 0, payments: [{ amount: 1500, mode: 'Cash', date: TODAY }],
  }, CK)).body;
  ok(inv.doctorId === OTHER.id, 'the bill records the TREATING doctor');

  const br = await chromium.launch();
  const pg = await br.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(BASE, { waitUntil: 'networkidle' });
  await pg.fill('#lu', 'admin'); await pg.fill('#lp', PW); await pg.click('#lb');
  await pg.waitForSelector('#nav button[data-r="invoices"]', { timeout: 20000 });
  await pg.evaluate(() => { window.print = () => {}; });

  // --- A4 bill
  await pg.click('#nav button[data-r="invoices"]');
  await pg.waitForSelector('#ilist tbody tr button', { timeout: 20000 });
  await pg.click('#ilist tbody tr button');
  await pg.waitForSelector('.modal', { timeout: 15000 });
  await pg.click('.mf .btn.p');
  await pg.waitForTimeout(900);
  let area = await pg.evaluate(() => document.querySelector('#printarea').innerText);
  ok(new RegExp(BILLING.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(area),
    `A4 bill prints the BILLING doctor (${BILLING.name})`, area.slice(0, 80).replace(/\n/g, ' '));
  ok(!/Visiting Consultant/.test(area), 'A4 bill does NOT print the treating doctor');

  // --- thermal receipt
  const btns = await pg.$$('.mf .btn');
  await btns[btns.length - 2].click();
  await pg.waitForTimeout(800);
  area = await pg.evaluate(() => document.querySelector('#printarea').innerText);
  ok(!/Visiting Consultant/.test(area), 'thermal receipt does not name the treating doctor either');

  await pg.click('.modal .x');
  await pg.waitForTimeout(400);

  // --- treatment summary
  await pg.evaluate((pid) => { location.hash = 'summary/' + pid; }, pat.id);
  await pg.waitForSelector('#sPrint', { timeout: 20000 });
  await pg.click('#sPrint');
  await pg.waitForTimeout(900);
  area = await pg.evaluate(() => document.querySelector('#printarea').innerText);
  ok(new RegExp(BILLING.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(area),
    'treatment summary signs off as the BILLING doctor');
  ok(!/Visiting Consultant/.test(area), 'treatment summary does not name the treating doctor');

  // --- but the doctor report still attributes the work correctly
  const dr = (await req(`/api/reports/doctors?from=${TODAY}&to=${TODAY}`, 'GET', null, CK)).body;
  const row = dr.find(x => x.doctorId === OTHER.id);
  ok(!!row, 'the treating doctor still appears in the Doctor Report');
  ok(row && Math.abs(row.billed - 1500) < 0.005, `revenue is attributed to the treating doctor (got ${row && row.billed})`);
  const billingRow = dr.find(x => x.doctorId === BILLING.id);
  ok(!billingRow || Math.abs(billingRow.billed) < 0.005,
    'the billing doctor is NOT credited with work they did not do');

  ok(errs.length === 0, `no page errors (${errs.slice(0, 2).join(' | ')})`);

  await br.close();
  console.log(`\n  ${P} passed, ${F} failed`);
  process.exit(F ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
