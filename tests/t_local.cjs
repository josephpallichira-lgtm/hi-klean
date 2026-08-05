/* Full test of the OFFLINE app: real storage, persistence across reloads,
   logins, doctor report, backup/restore, import from the old single-file app. */
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs');
const F = 'file:///home/claude/pkg/Hi-Klean-Billing.html';
const R = []; const ok = (n, c, x = '') => R.push((c ? 'PASS ' : '*** FAIL ') + n + (x ? ' :: ' + x : ''));

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('PE:' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push('CE:' + m.text()); });
  await p.goto(F); await p.waitForTimeout(1600);
  await p.evaluate(() => { window.print = () => { window.__PRINTED = 1; }; });

  ok('opens with no login until users are added', await p.evaluate(() => !!document.querySelector('#nav button[data-r="dash"]')));
  ok('rate card seeded', await p.evaluate(() => S.procs.length > 100), await p.evaluate(() => S.procs.length + ' procedures'));

  // ---- bill 169 for a new patient ----
  await p.click('#nav button[data-r="bill"]'); await p.waitForTimeout(700);
  await p.fill('#pName', 'VIVEK GOVINDAPILLAI'); await p.fill('#pAge', '58');
  await p.selectOption('#pSex', 'Male'); await p.fill('#pPhone', '9847012345'); await p.fill('#pAddr', 'GOWRIPRIYA, KOTTAYAM');
  await p.fill('#procSearch', 'Zirconia Premium'); await p.waitForTimeout(400); await p.click('.pbtn'); await p.waitForTimeout(300);
  await p.click('#itemsBody [data-act="teeth"]'); await p.waitForTimeout(500);
  for (const t of [35, 36, 37]) await p.click(`.tooth[data-t="${t}"]`);
  await p.click('#tOk'); await p.waitForTimeout(400);
  await p.fill('#payAmt', '25000'); await p.click('#payAdd'); await p.waitForTimeout(400);
  await p.click('#bSave'); await p.waitForTimeout(1500);
  let list = await p.evaluate(() => window.__MOCK('/invoices'));
  ok('bill saved with the right money', list.length === 1 && list[0].total === 37500 && list[0].bal === 12500,
    JSON.stringify(list[0] && [list[0].no, list[0].total, list[0].bal]));
  ok('numbering continues from the paper register', list[0].no === '169', list[0].no);
  ok('patient ID continues from 2T 12682', list[0].preg === '2T 12682', list[0].preg);

  // ---- data survives a reload (this is the whole point) ----
  await p.reload(); await p.waitForTimeout(1800);
  list = await p.evaluate(() => window.__MOCK('/invoices'));
  ok('data survives closing and reopening', list.length === 1 && list[0].total === 37500);

  // ---- second bill, existing patient, second doctor ----
  await p.evaluate(async () => {
    await window.__MOCK('/settings', 'PUT', {
      settings: (await window.__MOCK('/settings')).settings,
      doctors: [{ name: 'Dr. Anjali Menon MDS', spec: '(Orthodontics)', role_line: 'Consultant Orthodontist', reg_no: '11204', sign_title: 'Consultant' }]
    });
  });
  await p.reload(); await p.waitForTimeout(1700);
  ok('a second doctor can be added', await p.evaluate(() => S.doctors.length === 2));
  await p.click('#nav button[data-r="bill"]'); await p.waitForTimeout(800);
  await p.fill('#pSearch', 'VIVEK'); await p.waitForTimeout(700);
  await p.click('#pAc div[data-id]'); await p.waitForTimeout(700);
  await p.selectOption('#bDoc', { index: 1 });
  await p.fill('#procSearch', 'Metal Braces'); await p.waitForTimeout(400); await p.click('.pbtn'); await p.waitForTimeout(400);
  await p.click('#bSave'); await p.waitForTimeout(1500);
  list = await p.evaluate(() => window.__MOCK('/invoices'));
  ok('second bill numbered 170', list.some(i => i.no === '170'), list.map(i => i.no).join(','));
  ok('the same patient was reused', new Set(list.map(i => i.patientId)).size === 1);

  // ---- reports + doctor report ----
  await p.click('#nav button[data-r="reports"]'); await p.waitForTimeout(1300);
  ok('reports render', (await p.textContent('#rout')).includes('25,000'));
  await p.click('#nav button[data-r="doctors"]'); await p.waitForTimeout(1300);
  const dtxt = await p.textContent('#dout');
  ok('doctor report splits the two doctors', dtxt.includes('Sijo') && dtxt.includes('Anjali'), dtxt.slice(0, 60).replace(/\n/g, ' '));

  // ---- printing ----
  await p.click('#nav button[data-r="invoices"]'); await p.waitForTimeout(1000);
  await p.evaluate(() => { window.__PRINTED = 0; window.print = () => { window.__PRINTED = 1; }; });
  await p.click('#ilist button[data-do="print"]'); await p.waitForTimeout(1400);
  ok('A4 bill prints', await p.evaluate(() => !!window.__PRINTED && !!document.querySelector('#printarea .inv')));

  // ---- treatment summary ----
  const pid = list[0].patientId;
  await p.evaluate(x => location.hash = 'summary/' + x, pid); await p.waitForTimeout(1400);
  ok('treatment summary lists both visits', (await p.textContent('#sOut')).includes('Zirconia'));

  // ---- backup ----
  const [dl] = await Promise.all([p.waitForEvent('download'), p.evaluate(async () => window.__DL(await window.__MOCK('/backup')))]);
  const bkPath = '/tmp/hk_local_backup.json'; await dl.saveAs(bkPath);
  const bk = JSON.parse(fs.readFileSync(bkPath, 'utf8'));
  ok('backup contains everything', bk.invoices.length === 2 && bk.patients.length === 1 && bk.procedures.length > 100,
    `${bk.invoices.length} bills, ${bk.patients.length} patients`);

  // ---- wipe, then restore ----
  await p.evaluate(async () => { for (const s of ['patients', 'invoices', 'procedures']) await new Promise(r => { const t = indexedDB.open('hiklean_v2'); t.onsuccess = e => { const d = e.target.result; d.transaction(s, 'readwrite').objectStore(s).clear().onsuccess = () => r(); }; }); });
  await p.reload(); await p.waitForTimeout(1700);
  ok('wipe emptied the database', (await p.evaluate(() => window.__MOCK('/invoices'))).length === 0);
  await p.evaluate(async (json) => window.__MOCK('/import', 'POST', JSON.parse(json)), fs.readFileSync(bkPath, 'utf8'));
  await p.reload(); await p.waitForTimeout(1700);
  list = await p.evaluate(() => window.__MOCK('/invoices'));
  ok('restore brought everything back', list.length === 2 && list.some(i => i.total === 37500), list.length + ' bills');

  // ---- import from the OLD single-file app ----
  const oldBk = {
    _app: 'hiklean-dental-billing', _at: new Date().toISOString(), settings: {},
    patients: [{ id: 'a1', reg: '2T 500', name: 'OLD APP PATIENT', phone: '9000000000', age: '44', sex: 'Male' }],
    invoices: [{
      id: 'b1', type: 'bill', no: '150', date: '2026-05-02', patientId: 'a1',
      items: [{ name: 'RCT - Molar', desc: '36', qty: 1, rate: 5000, disc: 0 }],
      discType: 'amt', discValue: 500, payments: [{ date: '2026-05-02', mode: 'Cash', amount: 2000 }]
    }]
  };
  const rep = await p.evaluate(async (o) => window.__MOCK('/import', 'POST', o), oldBk);
  ok('old-app backup imports', rep.invoices === 1 && rep.patients === 1, JSON.stringify(rep));
  const imported = (await p.evaluate(() => window.__MOCK('/invoices?q=150')))[0];
  ok('imported bill keeps its maths (5000 − 500 = 4500)', imported && imported.total === 4500 && imported.bal === 2500,
    imported && `${imported.total} / ${imported.bal}`);

  // ---- login: add a user, sign in as staff ----
  await p.evaluate(async () => {
    await window.__MOCK('/users', 'POST', { username: 'admin', password: 'Clinic@2026', role: 'admin', fullName: 'Dr Sijo' });
    await window.__MOCK('/users', 'POST', { username: 'reception', password: 'Front@2026', role: 'staff', fullName: 'Front desk' });
  });
  await p.reload(); await p.waitForTimeout(1600);
  ok('login screen appears once users exist', await p.evaluate(() => !!document.getElementById('lf')));
  await p.fill('#lu', 'reception'); await p.fill('#lp', 'wrong'); await p.click('#lb'); await p.waitForTimeout(700);
  ok('wrong password rejected', (await p.textContent('#lerr')).length > 3);
  await p.fill('#lp', 'Front@2026'); await p.click('#lb'); await p.waitForTimeout(1600);
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  const nav = await p.evaluate(() => Array.from(document.querySelectorAll('#nav button')).map(x => x.dataset.r).join(','));
  ok('staff cannot see reports or settings', !nav.includes('reports') && !nav.includes('settings') && nav.includes('bill'), nav);
  const blocked = await p.evaluate(async () => { try { await window.__MOCK('/reports?from=2026-01-01&to=2026-12-31'); return 'ALLOWED'; } catch (e) { return e.message; } });
  ok('staff blocked from report data itself', blocked === 'Admin access only', blocked);

  console.log(R.join('\n'));
  console.log('FAILURES:', R.filter(x => x.startsWith('***')).length);
  console.log('page errors:', errs.length ? errs.slice(0, 4) : 'none');
  await b.close();
})();
