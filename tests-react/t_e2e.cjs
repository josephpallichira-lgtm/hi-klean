/**
 * Full billing flow, end to end, through the UI only.
 * RUN AGAINST A FRESH DATABASE.
 */
const { chromium } = require('playwright');
const BASE = process.env.HKURL || 'http://127.0.0.1:3000';
const PW = process.env.HKPASS || 'Test@12345';

let P = 0, F = 0;
const ok = (c, m, x) => { c ? (P++, console.log('  ✓ ' + m)) : (F++, console.log('  ✗ ' + m + (x ? ' :: ' + x : ''))); };

(async () => {
  const br = await chromium.launch();
  const pg = await br.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push('PE:' + e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/401 \(Unauthorized\)/.test(m.text())) errs.push('C:' + m.text()); });
  const jget = (u) => pg.evaluate(x => fetch(x, { headers: { 'X-Requested-With': 'hk' } }).then(r => r.json()), u);

  await pg.goto(BASE, { waitUntil: 'networkidle' });
  await pg.fill('#lu', 'admin'); await pg.fill('#lp', PW); await pg.click('#lb');
  await pg.waitForSelector('#nav button[data-r="dash"]', { timeout: 20000 });
  ok(true, 'signed in');
  await pg.evaluate(() => { window.print = () => {}; });

  /* ---------- bill 1: brand new patient ---------- */
  await pg.click('#nav button[data-r="bill"]');
  await pg.waitForSelector('#pName', { timeout: 20000 });
  await pg.fill('#pName', 'VIVEK GOVINDAPILLAI');
  await pg.fill('#pAge', '58');
  await pg.selectOption('#pSex', 'Male');
  await pg.fill('#pPhone', '9847012345');
  await pg.fill('#pAddr', 'GOWRIPRIYA, KOTTAYAM');
  await pg.fill('#procSearch', 'Zirconia Premium');
  await pg.waitForTimeout(500);
  await pg.click('.pbtn');
  await pg.waitForTimeout(400);
  await pg.click('#itemsBody [data-act="teeth"]');
  await pg.waitForSelector('#tGrid', { timeout: 15000 });
  for (const t of [35, 36, 37]) await pg.click(`.tooth[data-t="${t}"]`);
  await pg.click('#tOk');
  await pg.waitForTimeout(500);
  ok(await pg.$eval('#itemsBody [data-f="qty"]', n => n.value) === '3', 'tooth picker sets qty + desc');
  await pg.fill('#payAmt', '25000');
  await pg.click('#payAdd');
  await pg.waitForTimeout(400);
  await pg.click('#bSave');
  await pg.waitForTimeout(2500);

  let list = await jget('/api/invoices');
  ok(list.length === 1 && list[0].total === 37500 && list[0].paid === 25000 && list[0].bal === 12500,
    'bill saved on the server', JSON.stringify(list[0] ? [list[0].no, list[0].total, list[0].bal] : null));
  ok(list[0] && list[0].no === '169', 'number issued from counter', list[0] && list[0].no);

  /* ---------- bill 2: the SAME patient, picked from search ---------- */
  await pg.click('#nav button[data-r="bill"]');
  await pg.waitForSelector('#pSearch', { timeout: 20000 });
  await pg.fill('#pSearch', 'VIVEK');
  await pg.waitForTimeout(1200);
  await pg.click('#pAc div[data-id]');
  await pg.waitForTimeout(900);
  await pg.fill('#procSearch', 'Consultation');
  await pg.waitForTimeout(500);
  await pg.click('.pbtn');
  await pg.waitForTimeout(300);
  await pg.click('#bSave');
  await pg.waitForTimeout(2500);

  const l2 = await jget('/api/invoices');
  ok(l2.map(i => i.no).sort().join(',') === '169,170', 'sequential numbering', l2.map(i => i.no).join(','));
  ok(new Set(l2.map(i => i.patientId)).size === 1, 'existing patient reused, not duplicated');

  /* ---------- reports ---------- */
  await pg.click('#nav button[data-r="reports"]');
  await pg.waitForSelector('#rout .stats', { timeout: 20000 });
  const rtxt = await pg.textContent('#rout');
  ok(/Collected/.test(rtxt) && /25,000/.test(rtxt), 'reports render with the collected figure');

  /* ---------- doctor report ---------- */
  await pg.click('#nav button[data-r="doctors"]');
  await pg.waitForSelector('#dout table', { timeout: 20000 });
  const dtxt = await pg.textContent('#dout');
  ok(/Sijo/.test(dtxt), 'doctor report renders procedures', dtxt.slice(0, 60).replace(/\s+/g, ' '));

  /* ---------- treatment summary ---------- */
  const pid = l2[0].patientId;
  await pg.evaluate((p) => { location.hash = 'summary/' + p; }, pid);
  await pg.waitForSelector('#sPrint', { timeout: 20000 });
  const stxt = await pg.textContent('#sOut');
  ok(/VIVEK GOVINDAPILLAI/.test(stxt), 'treatment summary renders');
  await pg.click('#sPrint');
  await pg.waitForTimeout(900);
  ok((await pg.evaluate(() => document.querySelector('#printarea').innerHTML.length)) > 1000, 'summary prints');

  /* ---------- patients ---------- */
  await pg.click('#nav button[data-r="patients"]');
  await pg.waitForSelector('#plist table', { timeout: 20000 });
  ok(/VIVEK/.test(await pg.textContent('#plist')), 'patient list renders');
  await pg.click('#plist tbody tr button');
  await pg.waitForSelector('.stats', { timeout: 20000 });
  const ptxt = await pg.textContent('#main');
  ok(/Visits billed/.test(ptxt) && /2/.test(ptxt), 'patient card shows both visits');

  /* ---------- procedures ---------- */
  await pg.click('#nav button[data-r="procedures"]');
  await pg.waitForSelector('#prlist table', { timeout: 20000 });
  ok((await pg.$$('#prlist tbody tr')).length > 50, 'rate card lists the procedures');

  /* ---------- settings ---------- */
  await pg.click('#nav button[data-r="settings"]');
  await pg.waitForSelector('#stSave', { timeout: 20000 });
  ok(!!(await pg.$('#usrBody tr')), 'settings renders with the users table');

  ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '));

  await br.close();
  console.log(`\n  ${P} passed, ${F} failed`);
  process.exit(F ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
