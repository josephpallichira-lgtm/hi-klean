/* First real proof the React client works against the real server:
   sign in, build a bill, save it, and read it back from the API. */
const { chromium } = require('playwright');
const U = process.env.HKURL || 'http://localhost:3000';
let P = 0, F = 0;
const ok = (c, m, x = '') => { c ? (P++, console.log('  ✓ ' + m)) : (F++, console.log('  ✗ ' + m + (x ? ' :: ' + x : ''))); };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/401 \(Unauthorized\)/.test(m.text())) errs.push('CONSOLE ' + m.text()); });

  await p.goto(U, { waitUntil: 'networkidle' });
  ok(await p.$('#lf') !== null, 'login form renders');

  await p.fill('#lu', 'admin'); await p.fill('#lp', 'wrong'); await p.click('#lb');
  await p.waitForTimeout(1200);
  ok((await p.textContent('#lerr')).toLowerCase().includes('wrong'), 'bad password rejected');

  await p.fill('#lp', 'Test@1234'); await p.click('#lb');
  await p.waitForSelector('#cpok', { timeout: 15000 });
  ok(true, 'first login forces a password change');
  await p.fill('#cp0', 'Test@1234'); await p.fill('#cp1', 'Test@12345'); await p.fill('#cp2', 'Test@12345');
  await p.click('#cpok');
  await p.waitForSelector('#nav button[data-r="dash"]', { timeout: 15000 });
  ok(true, 'signed in, dashboard nav present');

  // dashboard tiles
  await p.waitForSelector('.stats .stat', { timeout: 15000 });
  const tiles = await p.$$eval('.stats .stat', ns => ns.map(n => n.tagName));
  ok(tiles.length === 4, `4 dashboard tiles (got ${tiles.length})`);
  ok(tiles.every(t => t === 'BUTTON'), 'tiles are real <button>s');
  const cur = await p.$eval('.stats .stat', n => getComputedStyle(n).cursor);
  ok(cur === 'pointer', `tiles show a pointer cursor (got ${cur})`);

  // ---- build a bill ----
  await p.click('#nav button[data-r="bill"]');
  await p.waitForSelector('#pName', { timeout: 15000 });
  await p.fill('#pName', 'VIVEK GOVINDAPILLAI');
  await p.fill('#pAge', '58');
  await p.selectOption('#pSex', 'Male');
  await p.fill('#pPhone', '9847012345');
  await p.fill('#pAddr', 'GOWRIPRIYA, KOTTAYAM');

  await p.fill('#procSearch', 'Zirconia Premium');
  await p.waitForTimeout(500);
  await p.click('.pbtn');
  await p.waitForTimeout(400);
  ok((await p.$$('#itemsBody tr[data-i]')).length === 1, 'treatment added to the table');

  const amt0 = await p.$eval('#itemsBody tr[data-i] [data-amt]', n => n.textContent);
  ok(!/^₹0\.00$/.test(amt0), `line amount is not 0.00 on the first render (got ${amt0})`);

  // tooth picker
  await p.click('#itemsBody [data-act="teeth"]');
  await p.waitForSelector('#tGrid', { timeout: 10000 });
  for (const t of [35, 36, 37]) await p.click(`.tooth[data-t="${t}"]`);
  await p.click('#tOk');
  await p.waitForTimeout(500);
  const qty = await p.$eval('#itemsBody [data-f="qty"]', n => n.value);
  const desc = await p.$eval('#itemsBody [data-f="desc"]', n => n.value);
  ok(qty === '3', `tooth picker set Nos to 3 (got ${qty})`);
  ok(desc === '35, 36, 37', `tooth picker wrote the numbers (got "${desc}")`);

  await p.fill('#payAmt', '25000');
  await p.click('#payAdd');
  await p.waitForTimeout(400);

  await p.evaluate(() => { window.print = () => {}; });
  await p.click('#bSave');
  await p.waitForTimeout(2500);

  const list = await p.evaluate(() => fetch('/api/invoices', { headers: { 'X-Requested-With': 'hk' } }).then(r => r.json()));
  ok(list.length === 1, `exactly one bill on the server (got ${list.length})`);
  const inv = list[0];
  ok(inv && inv.total === 37500, `total is 37500 (got ${inv && inv.total})`);
  ok(inv && inv.paid === 25000, `paid is 25000 (got ${inv && inv.paid})`);
  ok(inv && inv.bal === 12500, `balance is 12500 (got ${inv && inv.bal})`);
  ok(inv && inv.no === '169', `number issued from the counter (got ${inv && inv.no})`);
  ok(inv && inv.items[0].qty === 3 && inv.items[0].desc === '35, 36, 37', 'tooth data persisted');

  ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '));

  await b.close();
  console.log(`\n  ${P} passed, ${F} failed`);
  process.exit(F ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
