/* The printed letterhead and signature must always be the clinic's billing
   doctor (Dr. Sijo P. Mathew), no matter which doctor treated the patient —
   while the treating doctor is still recorded for the Doctor Report. */
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const { execFileSync } = require('child_process');
let pass = 0, fail = 0;
const t = (n, o, x) => { o ? pass++ : fail++; console.log(`${o ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`) };

(async () => {
  const b = await chromium.launch(); const c = await b.newContext(); const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { window.print = () => { }; });
  await p.goto('http://localhost:3000/'); await p.waitForTimeout(1200);
  await p.fill('#lu', 'admin'); await p.fill('#lp', 'Test@1234'); await p.click('#lb'); await p.waitForTimeout(2200);
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);

  // add a second, very different doctor
  const added = await p.evaluate(async () => {
    const s = await api('/settings');
    const docs = s.doctors.slice();
    docs.push({ name: 'Dr. Locum Stand-In BDS', spec: '(General Dentistry)', role_line: 'Visiting Consultant', reg_no: '99999', sign_title: 'Visiting Consultant', active: true });
    await api('/settings', 'PUT', { settings: s.settings, doctors: docs });
    const s2 = await api('/settings');
    S.set = s2.settings; S.doctors = s2.doctors;
    return { names: s2.doctors.map(d => d.name), billing: billingDoctor().name };
  });
  t('two doctors on record', added.names.length >= 2, added.names.join(' | '));
  t('billing doctor is Dr. Sijo', /Sijo/.test(added.billing), added.billing);

  const locumId = await p.evaluate(() => (S.doctors.find(d => /Locum/.test(d.name)) || {}).id);
  const sijoId = await p.evaluate(() => (S.doctors.find(d => /Sijo/.test(d.name)) || {}).id);

  // a bill explicitly attributed to the locum
  const html = await p.evaluate((did) => billHTML({
    no: '900', type: 'bill', date: '2026-08-05', pname: 'LOCUM PATIENT', preg: '2T 99001',
    page: '30', psex: 'M', paddress: 'Kottayam',
    items: [{ name: 'Extraction', desc: '38', qty: 1, rate: 900, amount: 900 }],
    sub: 900, disc: 0, tax: 0, total: 900, paid: 900, bal: 0, payments: [], notes: '', doctorId: did
  }), locumId);
  t('bill for the locum still prints Dr. Sijo', /Sijo P\. Mathew/.test(html));
  t("locum's name never appears on the bill", !/Locum Stand-In/.test(html));
  t('Sijo reg. no. on the bill', /8982/.test(html));
  t("locum's reg. no. absent", !/99999/.test(html));

  // and a bill attributed to Sijo is unchanged
  const html2 = await p.evaluate((did) => billHTML({
    no: '901', type: 'bill', date: '2026-08-05', pname: 'SIJO PATIENT', preg: '2T 99002',
    page: '30', psex: 'F', paddress: 'Kottayam',
    items: [{ name: 'Consultation', desc: '', qty: 1, rate: 200, amount: 200 }],
    sub: 200, disc: 0, tax: 0, total: 200, paid: 200, bal: 0, payments: [], notes: '', doctorId: did
  }), sijoId);
  t('bill for Sijo unchanged', /Sijo P\. Mathew/.test(html2) && /8982/.test(html2));

  // estimate too
  const est = await p.evaluate((did) => billHTML({
    no: 'E1', type: 'estimate', date: '2026-08-05', pname: 'EST PATIENT', preg: '2T 99003',
    page: '30', psex: 'M', paddress: '', items: [{ name: 'Implant', desc: '', qty: 1, rate: 30000, amount: 30000 }],
    sub: 30000, disc: 0, tax: 0, total: 30000, paid: 0, bal: 30000, payments: [], notes: '', doctorId: did
  }), locumId);
  t('estimate also prints Dr. Sijo', /Sijo P\. Mathew/.test(est) && !/Locum/.test(est));

  // treatment summary: letterhead AND the "Yours faithfully" sign-off
  const sum = await p.evaluate((did) => summaryHTML(
    { name: 'SUMMARY PATIENT', reg: '2T 99004', age: '41', sex: 'M' },
    [{ date: '2026-08-05', doctorId: did, total: 900, paid: 900, disc: 0, tax: 0,
       items: [{ name: 'Extraction', desc: '38', qty: 1, amount: 900 }] }], true), locumId);
  t('treatment summary letterhead is Dr. Sijo', /Sijo P\. Mathew/.test(sum));
  t('treatment summary sign-off is Dr. Sijo', !/Locum/.test(sum) && !/Visiting Consultant/.test(sum), 'no locum text anywhere');

  // thermal receipt carries no doctor name at all — confirm still true
  const th = await p.evaluate((did) => thermalHTML({
    no: '902', date: '2026-08-05', pname: 'T', preg: '2T 99005', page: '1', psex: 'M',
    items: [{ name: 'Consultation', desc: '', qty: 1, rate: 200, amount: 200 }],
    sub: 200, disc: 0, tax: 0, total: 200, paid: 200, bal: 0, payments: [{ mode: 'Cash' }], doctorId: did
  }), locumId);
  t('thermal receipt shows no other doctor', !/Locum/.test(th));

  // ---- the attribution must SURVIVE for reporting ----
  const rep = await p.evaluate(async (ids) => {
    const mk = async (docId, rate) => {
      const pat = await api('/patients', 'POST', { name: 'ATTR ' + docId + '-' + rate, phone: '9000000009' });
      return api('/invoices', 'POST', {
        type: 'bill', date: new Date().toISOString().slice(0, 10), patientId: pat.id, autoNumber: true,
        items: [{ name: 'Extraction', qty: 1, rate, disc: 0, docId }], discType: 'amt', discValue: 0,
        doctorId: docId, payments: [{ amount: rate, mode: 'Cash' }]
      });
    };
    await mk(ids.locum, 1500);
    await mk(ids.sijo, 2500);
    const d = new Date().toISOString().slice(0, 10);
    return api(`/reports/doctors?from=${d}&to=${d}`);
  }, { locum: locumId, sijo: sijoId });

  const locumRow = rep.find(r => /Locum/.test(r.name)) || {};
  const sijoRow = rep.find(r => /Sijo/.test(r.name)) || {};
  t('doctor report still lists the locum separately', !!locumRow.name, JSON.stringify(rep.map(r => r.name)));
  console.log('locum row:', JSON.stringify(locumRow));
  t('locum revenue attributed to the locum', Number(locumRow.billed) === 1500, 'billed=' + locumRow.billed);
  t('locum collection attributed to the locum', Number(locumRow.collected) === 1500, 'collected=' + locumRow.collected);
  t('Sijo revenue attributed to Sijo', Number(sijoRow.billed) >= 2500, 'billed=' + sijoRow.billed);

  // ---- deleting the billing doctor must not blank the letterhead ----
  const fallback = await p.evaluate(async () => {
    const before = billingDoctor().name;
    S.set = Object.assign({}, S.set, { defaultDoctorId: 999999 });   // dangling id
    const h = billHTML({ no: '903', type: 'bill', date: '2026-08-05', pname: 'X', preg: 'r', page: '1', psex: 'M',
      items: [{ name: 'C', desc: '', qty: 1, rate: 1, amount: 1 }], sub: 1, disc: 0, tax: 0, total: 1, paid: 1, bal: 0, payments: [], doctorId: null });
    return { before, name: billingDoctor().name, blank: !/font-size:12px;font-weight:800;color:#d32f2f">\s*</.test(h) };
  });
  t('dangling billing-doctor id falls back, never blank', !!fallback.name && fallback.blank, 'fell back to: ' + fallback.name);

  console.log('page errors:', errs.length ? errs.slice(0, 3) : 'none');
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
