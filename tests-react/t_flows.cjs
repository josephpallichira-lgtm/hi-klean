/**
 * The flows that protect the record: estimates, edits, cancellation, payments
 * taken later, and the two dialogs that stop a patient's history being merged
 * or split by accident.
 *
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
  await pg.evaluate(() => { window.print = () => {}; });

  const addTreatment = async (search) => {
    await pg.fill('#procSearch', search);
    await pg.waitForTimeout(500);
    await pg.click('.pbtn');
    await pg.waitForTimeout(350);
  };

  /* ---------- 1. save as ESTIMATE, then convert ---------- */
  await pg.click('#nav button[data-r="bill"]');
  await pg.waitForSelector('#pName', { timeout: 20000 });
  await pg.fill('#pName', 'ESTIMATE PATIENT');
  await pg.fill('#pPhone', '9847007001');
  await addTreatment('Zirconia Premium');
  ok(!!(await pg.$('#bEst')), 'a new bill offers "Save as Estimate"');
  await pg.click('#bEst');
  await pg.waitForTimeout(2500);

  let list = await jget('/api/invoices');
  const est = list.find(i => i.type === 'estimate');
  ok(!!est, 'estimate saved as type=estimate');
  ok(est && est.paid === 0, 'an estimate carries no payment');

  await pg.evaluate(() => { location.hash = 'invoices'; });
  await pg.waitForSelector('#ilist tbody tr', { timeout: 20000 });
  ok(/EST/.test(await pg.textContent('#ilist')), 'the bills list marks it EST');
  const totalsRow = await pg.textContent('#ilist tbody tr:last-child');
  ok(/estimates \(not counted\)/.test(totalsRow), 'estimates are excluded from the totals row');

  await pg.click('#ilist tbody tr button');
  await pg.waitForSelector('.modal', { timeout: 15000 });
  ok(!!(await pg.$('#iConv')), 'an estimate offers "Convert to Bill"');
  await pg.click('#iConv');
  await pg.waitForTimeout(2500);
  list = await jget('/api/invoices');
  ok(list.every(i => i.type !== 'estimate'), 'converting turns it into a real bill');

  /* ---------- 2. take a payment from the bill screen ---------- */
  await pg.evaluate(() => { location.hash = 'invoices'; });
  await pg.waitForSelector('#ilist tbody tr button', { timeout: 20000 });
  await pg.click('#ilist tbody tr button');
  await pg.waitForSelector('#cAmt', { timeout: 15000 });
  await pg.fill('#cAmt', '5000');
  await pg.click('#cAdd');
  await pg.waitForTimeout(2000);
  list = await jget('/api/invoices');
  ok(list[0].paid === 5000, `payment recorded from the bill screen (paid ${list[0].paid})`);
  ok(list[0].bal === 7500, `balance updated (bal ${list[0].bal})`);

  /* ---------- 3. edit a saved bill ---------- */
  const invId = list[0].id;
  await pg.evaluate((id) => { location.hash = 'bill/' + id; }, invId);
  await pg.waitForSelector('#bNo', { timeout: 20000 });
  ok(!(await pg.$('#bEst')), 'editing an existing bill does not offer "Save as Estimate"');
  ok(await pg.$eval('#bNo', n => !n.readOnly), 'the bill number is editable on an edit');
  const payNote = await pg.textContent('#payBox');
  ok(/Open/.test(payNote) && /5,000|5000/.test(payNote),
    'the editor shows recorded payments read-only and points at the Open screen');
  await addTreatment('Consultation');
  await pg.click('#bSave');
  await pg.waitForTimeout(2500);
  list = await jget('/api/invoices');
  ok(list[0].items.length === 2, `the edit added a line (${list[0].items.length} items)`);
  ok(list[0].paid === 5000, 'the edit did NOT disturb the recorded payment');

  /* ---------- 4. duplicate-name guard ---------- */
  await pg.click('#nav button[data-r="bill"]');
  await pg.waitForSelector('#pName', { timeout: 20000 });
  await pg.fill('#pName', 'ESTIMATE PATIENT');
  await addTreatment('Consultation');
  await pg.click('#bSave');
  await pg.waitForSelector('#qUse', { timeout: 15000 });
  ok(true, 'billing a name that already exists asks before creating a second record');
  ok(!!(await pg.$('#qFresh')), 'the dialog offers a deliberate "create a second record"');
  const billsBefore = (await jget('/api/invoices')).length;
  await pg.click('#qUse');
  await pg.waitForTimeout(2800);
  const pats = await jget('/api/patients');
  ok(pats.filter(p => p.name === 'ESTIMATE PATIENT').length === 1,
    'choosing "use existing" did not duplicate the patient');
  // The weak version of this assertion passed even when the save 409'd and no
  // bill was written at all. Demand the bill actually exists, on the right patient.
  const billsAfter = await jget('/api/invoices');
  ok(billsAfter.length === billsBefore + 1,
    `"use existing" actually SAVED the bill (${billsBefore} -> ${billsAfter.length})`);
  const existing = pats.find(p => p.name === 'ESTIMATE PATIENT');
  ok(billsAfter.some(i => i.patientId === existing.id && i.items.length === 1),
    'the new bill is attached to the EXISTING patient record');

  /* ---------- 5. rename guard ---------- */
  await pg.click('#nav button[data-r="bill"]');
  await pg.waitForSelector('#pSearch', { timeout: 20000 });
  await pg.fill('#pSearch', 'ESTIMATE');
  await pg.waitForTimeout(1300);
  await pg.click('#pAc div[data-id]');
  await pg.waitForTimeout(900);
  await pg.fill('#pName', 'RENAMED PERSON');
  await pg.waitForTimeout(400);
  ok(/asked whether to rename/.test(await pg.textContent('#pWarn')),
    'changing a linked patient name warns before saving');
  await addTreatment('Consultation');
  await pg.click('#bSave');
  await pg.waitForSelector('#qNew', { timeout: 15000 });
  ok(!!(await pg.$('#qRen')), 'the dialog offers rename');
  ok(!!(await pg.$('#qNew')), 'the dialog offers create-new instead');
  const bills2Before = (await jget('/api/invoices')).length;
  await pg.click('#qNew');
  await pg.waitForTimeout(2800);
  const pats2 = await jget('/api/patients');
  ok(pats2.some(p => p.name === 'ESTIMATE PATIENT') && pats2.some(p => p.name === 'RENAMED PERSON'),
    'choosing "create new" left the original patient untouched');
  const bills2After = await jget('/api/invoices');
  ok(bills2After.length === bills2Before + 1, '"create new" actually saved the bill too');
  const renamed = pats2.find(p => p.name === 'RENAMED PERSON');
  ok(bills2After.some(i => i.patientId === renamed.id), 'and attached it to the NEW patient');
  ok(renamed.reg && renamed.reg !== existing.reg, 'the new patient got its own ID, not a clash');

  /* ---------- 6. cancelling a bill needs a reason and keeps the number ---------- */
  await pg.evaluate(() => { location.hash = 'invoices'; });
  await pg.waitForSelector('#ilist tbody tr button', { timeout: 20000 });
  const before = (await jget('/api/invoices')).map(i => i.no).sort();
  await pg.click('#ilist tbody tr button');
  await pg.waitForSelector('#iVoid', { timeout: 15000 });
  await pg.click('#iVoid');
  await pg.waitForSelector('#vok', { timeout: 15000 });
  await pg.fill('#vr', 'billed twice by mistake');
  await pg.click('#vok');
  await pg.waitForTimeout(2500);
  const after = (await jget('/api/invoices')).map(i => i.no).sort();
  ok(after.length === before.length - 1, 'the cancelled bill leaves the active list');
  const gone = before.filter(n => !after.includes(n));
  ok(gone.length === 1, `exactly one bill was cancelled (${gone.join(',')})`);
  const audit = await jget('/api/audit');
  ok(audit.some(a => /void/i.test(a.action)), 'the cancellation is in the audit log');

  /* ---------- 7. the unsaved-bill guard on sign out ---------- */
  await pg.click('#nav button[data-r="bill"]');
  await pg.waitForSelector('#pName', { timeout: 20000 });
  await pg.fill('#pName', 'HALF TYPED');
  await addTreatment('Consultation');
  await pg.click('#nav button[data-r="__out"]');
  await pg.waitForTimeout(900);
  const guard = await pg.evaluate(() => document.querySelector('.modal')?.innerText || '');
  ok(/unsaved bill/i.test(guard), 'signing out with a half-typed bill asks first', guard.slice(0, 60));
  await pg.click('.modal .btn:not(.d)');       // Cancel
  await pg.waitForTimeout(600);
  ok(!!(await pg.$('#nav')), 'cancelling the sign-out keeps you in the app');

  /* ---------- 8. the draft survives navigating away and back ---------- */
  await pg.click('#nav button[data-r="dash"]');
  await pg.waitForTimeout(900);
  await pg.evaluate(() => { location.hash = 'bill'; });
  await pg.waitForSelector('#pName', { timeout: 20000 });
  const kept = await pg.$eval('#pName', n => n.value);
  ok(kept === 'HALF TYPED', `a half-typed bill survives leaving the screen (got "${kept}")`);
  ok((await pg.$$('#itemsBody tr[data-i]')).length === 1, 'and so do its treatment lines');

  ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '));

  await br.close();
  console.log(`\n  ${P} passed, ${F} failed`);
  process.exit(F ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
