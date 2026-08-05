const { chromium, devices } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const J = (p, m, b) => `fetch('/api${p}',{method:'${m || 'GET'}',headers:{'Content-Type':'application/json','X-Requested-With':'hk'},body:${b ? JSON.stringify(JSON.stringify(b)) : 'undefined'}}).then(r=>r.json())`;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:3000/'); await p.waitForTimeout(1200);
  await p.fill('#lu', 'admin'); await p.fill('#lp', 'Test@1234'); await p.click('#lb'); await p.waitForTimeout(2200);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  await p.evaluate(async () => {
    const call = (path, method, body) => fetch('/api' + path, {
      method: method || 'GET', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'hk' },
      body: body ? JSON.stringify(body) : undefined
    }).then(r => r.json());
    const s = await call('/settings');
    const docs = s.doctors.concat([
      { name: 'Dr. Anjali Menon MDS', spec: '(Orthodontics)', role_line: 'Consultant Orthodontist', reg_no: '11204', sign_title: 'Consultant' },
      { name: 'Dr. Rahul Nair BDS', spec: '', role_line: 'Dental Surgeon', reg_no: '15782', sign_title: 'Dental Surgeon' }
    ]);
    await call('/settings', 'PUT', { settings: s.settings, doctors: docs });
    const s2 = await call('/settings');
    const D = s2.doctors;
    const procs = await call('/procedures');
    const pick = n => procs.find(x => x.name === n);
    const pats = [
      ['VIVEK GOVINDAPILLAI', '58', 'Male', '9847012345', 'GOWRIPRIYA, KOTTAYAM'],
      ['ANNA MARIYA JOSEPH', '34', 'Female', '9846011223', 'MANARCAD'],
      ['RAHUL KRISHNAN', '27', 'Male', '9995512340', 'CHANGANASSERY'],
      ['SUSAN THOMAS', '61', 'Female', '9744500912', 'ETTUMANOOR'],
      ['ABHIRAM S NAIR', '12', 'Male', '9061223344', 'KOTTAYAM']
    ];
    const ids = [];
    for (const [name, age, sex, phone, address] of pats) ids.push((await call('/patients', 'POST', { name, age, sex, phone, address })).id);
    const d = n => { const x = new Date(); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };
    const mk = (date, pid, doctorId, items, pay) => call('/invoices', 'POST', {
      type: 'bill', date, patientId: pid, doctorId, autoNumber: true, discType: 'amt', discValue: 0,
      items: items.map(i => ({ name: i[0], desc: i[1] || '', qty: i[2], rate: i[3], disc: 0, docId: i[4] || doctorId })),
      payments: pay ? [{ date, mode: pay[1], amount: pay[0] }] : []
    });
    await mk(d(9), ids[0], D[0].id, [['Consultation', '', 1, 200], ['RVG', '', 1, 400], ['Crown / Bridge Removal', '35, 36, 37', 3, 500], ['RCT - Molar', '36', 1, 4680]], [5780, 'UPI']);
    await mk(d(6), ids[0], D[0].id, [['RCT - Molar', '35, 37', 2, 2100]], [4200, 'Cash']);
    await mk(d(2), ids[1], D[2].id, [['Scaling & Polishing (Full Mouth)', '', 1, 1000], ['Composite Filling - 2 Surface', '14, 15', 2, 1300]], [3600, 'UPI']);
    await mk(d(1), ids[2], D[2].id, [['Impacted 3rd Molar - Surgical', '48', 1, 6000]], [3000, 'Card']);
    await mk(d(0), ids[0], D[0].id, [['Zirconia Premium Crown', '35, 36, 37', 3, 12500]], [25000, 'Card']);
    await mk(d(0), ids[3], D[0].id, [['Complete Denture Set (Upper + Lower)', '', 1, 22000]], [10000, 'Cash']);
    await mk(d(0), ids[4], D[1].id, [['Metal Braces (Full Treatment)', '', 1, 30000], ['Ortho Consultation + Records', '', 1, 1000]], [12000, 'UPI']);
    await mk(d(3), ids[1], D[1].id, [['Ortho Monthly Adjustment', '', 1, 500]], [500, 'Cash']);
  });
  await p.waitForTimeout(800);
  await p.reload(); await p.waitForTimeout(2200);
  const shot = async (hash, file, full) => { await p.evaluate(h => location.hash = h, hash); await p.waitForTimeout(1800); await p.screenshot({ path: file, fullPage: !!full }); };
  await shot('dash', 's_dash.png');
  await shot('doctors', 's_doctors.png', true);
  await shot('reports', 's_reports.png', true);
  await shot('settings', 's_settings.png', true);
  await shot('invoices', 's_bills.png');
  await ctx.close();

  const c3 = await b.newContext({ ...devices['Pixel 7'] }); const m = await c3.newPage();
  await m.goto('http://localhost:3000/'); await m.waitForTimeout(1000);
  await m.screenshot({ path: 'm_login.png' });
  await m.fill('#lu', 'admin'); await m.fill('#lp', 'Test@1234'); await m.click('#lb'); await m.waitForTimeout(2200);
  await m.keyboard.press('Escape'); await m.waitForTimeout(300);
  await m.screenshot({ path: 'm_dash.png' });
  await m.evaluate(() => location.hash = 'doctors'); await m.waitForTimeout(1800);
  await m.screenshot({ path: 'm_doctors.png' });
  console.log('errors:', errs.length ? errs.slice(0, 4) : 'none');
  await b.close();
})();
