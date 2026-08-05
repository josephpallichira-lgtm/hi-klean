/* Exercises the offline DEMO build end to end, as a real user would in Chrome. */
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const F = 'file:///home/claude/pkg/Hi-Klean-Billing-DEMO.html';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push('PE:' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push('CE:' + m.text()); });
  const R = []; const ok = (n, c, x = '') => R.push((c ? 'PASS ' : '*** FAIL ') + n + (x ? ' :: ' + x : ''));

  await p.goto(F); await p.waitForTimeout(1800);
  ok('app loads with no login wall', await p.evaluate(() => !!document.querySelector('#nav button[data-r="dash"]')));
  ok('dashboard shows demo money', (await p.textContent('#main')).includes('Collected today'));

  // bills list + open + print
  await p.click('#nav button[data-r="invoices"]'); await p.waitForTimeout(1200);
  const rows = await p.$$eval('#ilist tbody tr', r => r.length);
  ok('bills list populated', rows > 5, rows + ' rows');
  await p.click('#ilist button[data-do="open"]'); await p.waitForTimeout(900);
  ok('Open works', await p.evaluate(() => !!document.querySelector('.mask')));
  await p.evaluate(() => { window.print = () => { window.__PRINTED = 1; }; });
  await p.click('.mask button[data-do="print"]'); await p.waitForTimeout(900);
  ok('Print A4 renders the bill', await p.evaluate(() => !!window.__PRINTED && document.querySelector('#printarea .inv') !== null));
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);

  // make a bill
  await p.click('#nav button[data-r="bill"]'); await p.waitForTimeout(900);
  await p.fill('#pName', 'DEMO WALK-IN'); await p.fill('#pAge', '41'); await p.selectOption('#pSex', 'Female');
  await p.fill('#pPhone', '9000012345');
  await p.fill('#procSearch', 'RCT - Molar'); await p.waitForTimeout(400); await p.click('.pbtn'); await p.waitForTimeout(300);
  await p.click('#itemsBody [data-act="teeth"]'); await p.waitForTimeout(500);
  for (const t of [36, 46]) await p.click(`.tooth[data-t="${t}"]`);
  await p.click('#tOk'); await p.waitForTimeout(400);
  ok('tooth picker sets 2 teeth and qty 2', await p.evaluate(() => B.items[0].qty === 2 && B.items[0].desc === '36, 46'));
  await p.fill('#payAmt', '5000'); await p.click('#payAdd'); await p.waitForTimeout(400);
  await p.click('#bSave'); await p.waitForTimeout(1500);
  const saved = await p.evaluate(() => fetch ? null : null);
  ok('new bill appears in the list', (await p.textContent('#ilist')).includes('DEMO WALK-IN'));

  // patients + summary
  await p.click('#nav button[data-r="patients"]'); await p.waitForTimeout(1000);
  await p.click('#plist button[data-do^="go"], #plist button'); await p.waitForTimeout(1200);
  ok('patient history opens', (await p.textContent('#main')).includes('Visits billed'));
  await p.click('button[data-do="go"][data-h^="summary/"]'); await p.waitForTimeout(1400);
  ok('treatment summary builds', (await p.textContent('#main')).includes('DATE') || (await p.textContent('#sOut')).length > 50);

  // reports + doctor report
  await p.click('#nav button[data-r="reports"]'); await p.waitForTimeout(1400);
  ok('reports render', (await p.textContent('#rout')).includes('Collected'));
  await p.click('#nav button[data-r="doctors"]'); await p.waitForTimeout(1400);
  const dtxt = await p.textContent('#dout');
  ok('doctor report renders 3 doctors', ['Sijo', 'Anjali', 'Rahul'].every(n => dtxt.includes(n)), dtxt.slice(0, 60).replace(/\n/g, ' '));

  // procedures + settings
  await p.click('#nav button[data-r="procedures"]'); await p.waitForTimeout(1200);
  ok('rate card loads', (await p.$$eval('#prlist tbody tr', r => r.length)) > 50);
  await p.fill('#prq', 'Zirconia Premium'); await p.waitForTimeout(500);
  await p.fill('#prlist input[data-f="price"]', '13500');
  await p.dispatchEvent('#prlist input[data-f="price"]', 'change'); await p.waitForTimeout(600);
  ok('price edit saves', await p.evaluate(() => S.procs.find(x => x.name.includes('Zirconia Premium')).price === 13500));
  await p.click('#nav button[data-r="settings"]'); await p.waitForTimeout(1400);
  ok('settings render with users', (await p.textContent('#main')).includes('Users'));

  // staff view
  await p.click('#dRole'); await p.waitForTimeout(1400);
  const nav = await p.evaluate(() => Array.from(document.querySelectorAll('#nav button')).map(b => b.dataset.r).join(','));
  ok('staff view hides reports and settings', !nav.includes('reports') && !nav.includes('settings'), nav);
  await p.click('#dRole'); await p.waitForTimeout(1200);

  await p.evaluate(() => location.hash = 'dash'); await p.waitForTimeout(1000);
  await p.screenshot({ path: '/home/claude/srv/demo_dash.png' });
  console.log(R.join('\n'));
  console.log('FAILURES:', R.filter(x => x.startsWith('***')).length);
  console.log('page errors:', errs.length ? errs.slice(0, 4) : 'none');
  await b.close();
})();
