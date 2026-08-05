const { chromium, devices } = require('/home/claude/.npm-global/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  // ---- staff role ----
  const c1 = await b.newContext(); const p = await c1.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:3000/'); await p.waitForTimeout(1200);
  await p.fill('#lu', 'admin'); await p.fill('#lp', 'Test@1234'); await p.click('#lb'); await p.waitForTimeout(2000);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.evaluate(() => fetch('/api/users', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'hk' },
    body: JSON.stringify({ username: 'reception', password: 'Front@4567', role: 'staff', fullName: 'Front desk' })
  }));
  await p.waitForTimeout(600);
  // print PDF via the real print path
  const inv = await p.evaluate(() => fetch('/api/invoices', { headers: { 'X-Requested-With': 'hk' } }).then(r => r.json()));
  await p.evaluate(i => {
    document.getElementById('printarea').innerHTML = billHTML(i);
    let st = document.getElementById('pgstyle'); if (!st) { st = document.createElement('style'); st.id = 'pgstyle'; document.head.appendChild(st); }
    st.textContent = '@media print{@page{size:A4 portrait;margin:10mm 10mm 8mm 10mm}}';
  }, inv[0]);
  await p.waitForTimeout(300);
  await p.pdf({ path: '/home/claude/srv/srv_bill.pdf', format: 'A4', printBackground: true });
  await c1.close();

  const c2 = await b.newContext(); const s = await c2.newPage();
  await s.goto('http://localhost:3000/'); await s.waitForTimeout(1200);
  await s.fill('#lu', 'reception'); await s.fill('#lp', 'Front@4567'); await s.click('#lb'); await s.waitForTimeout(2200);
  const forced = await s.evaluate(() => !!document.querySelector('#cpok'));
  console.log('staff forced to set own password:', forced);
  if (forced) {
    await s.fill('#cp0', 'Front@4567'); await s.fill('#cp1', 'Newpass123'); await s.fill('#cp2', 'Newpass123');
    await s.click('#cpok'); await s.waitForTimeout(1200);
  }
  console.log('staff nav:', await s.evaluate(() => Array.from(document.querySelectorAll('#nav button')).map(b => b.dataset.r).join(',')));
  await s.evaluate(() => location.hash = 'reports'); await s.waitForTimeout(700);
  console.log('staff blocked:', (await s.textContent('#main')).slice(0, 45).replace(/\n/g, ' '));
  const apiBlocked = await s.evaluate(() => fetch('/api/reports?from=2026-01-01&to=2026-12-31', { headers: { 'X-Requested-With': 'hk' } }).then(r => r.status));
  console.log('staff blocked at the API too (403 expected):', apiBlocked);
  const csrfBlocked = await s.evaluate(() => fetch('/api/patients', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"name":"x"}'
  }).then(r => r.status));
  console.log('request without the app header rejected (403 expected):', csrfBlocked);
  await c2.close();

  // ---- android phone ----
  const c3 = await b.newContext({ ...devices['Pixel 7'] }); const m = await c3.newPage();
  await m.goto('http://localhost:3000/'); await m.waitForTimeout(1200);
  await m.screenshot({ path: '/home/claude/srv/m_login.png' });
  await m.fill('#lu', 'admin'); await m.fill('#lp', 'Test@1234'); await m.click('#lb'); await m.waitForTimeout(2200);
  await m.keyboard.press('Escape'); await m.waitForTimeout(300);
  await m.screenshot({ path: '/home/claude/srv/m_dash.png' });
  await m.evaluate(() => location.hash = 'bill'); await m.waitForTimeout(1200);
  await m.fill('#pName', 'TEST MOBILE');
  await m.fill('#procSearch', 'RCT - Molar'); await m.waitForTimeout(500);
  await m.click('.pbtn'); await m.waitForTimeout(500);
  await m.screenshot({ path: '/home/claude/srv/m_bill.png', fullPage: true });
  const swOK = await m.evaluate(() => navigator.serviceWorker.getRegistrations().then(r => r.length > 0));
  const manifest = await m.evaluate(() => fetch('/manifest.webmanifest').then(r => r.ok));
  console.log('service worker registered:', swOK, '| manifest served:', manifest);
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})();
