/**
 * The OFFLINE edition — one self-contained .html opened from file://, no server.
 * This is the clinic's fallback when the internet is down, so it has to work
 * with zero network and store everything in IndexedDB.
 */
const { chromium } = require('playwright');
const FILE = process.env.HK_FILE || '/tmp/hk/dist/Hi-Klean-Billing.html';

let P = 0, F = 0;
const ok = (c, m, x) => { c ? (P++, console.log('  ✓ ' + m)) : (F++, console.log('  ✗ ' + m + (x ? ' :: ' + x : ''))); };

(async () => {
  const br = await chromium.launch();
  const ctx = await br.newContext();
  // Prove it needs no server at all: fail every network request.
  await ctx.route(/^https?:/, route => route.abort());
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push('C:' + m.text()); });

  await pg.goto('file://' + FILE);
  await pg.waitForSelector('#nav button[data-r="dash"]', { timeout: 25000 });
  ok(true, 'the offline app boots from file:// with the network blocked');

  ok(await pg.evaluate(() => typeof window.__MOCK === 'function'), 'the local IndexedDB backend is installed');
  const procs = await pg.evaluate(() => window.__PROCS__.length);
  ok(procs === 126, `the full 126-procedure rate card is embedded (got ${procs})`);

  // --- build a bill entirely offline
  await pg.click('#nav button[data-r="bill"]');
  await pg.waitForSelector('#pName', { timeout: 20000 });
  await pg.fill('#pName', 'OFFLINE PATIENT');
  await pg.fill('#pPhone', '9847005555');
  await pg.fill('#procSearch', 'Zirconia Premium');
  await pg.waitForTimeout(600);
  await pg.click('.pbtn');
  await pg.waitForTimeout(400);
  ok((await pg.$$('#itemsBody tr[data-i]')).length === 1, 'a treatment can be added with no server');

  const amt = await pg.$eval('#itemsBody [data-amt]', n => n.textContent);
  ok(/12,500/.test(amt), `line priced from the embedded rate card (got ${amt})`);

  await pg.fill('#payAmt', '12500');
  await pg.click('#payAdd');
  await pg.waitForTimeout(400);
  await pg.evaluate(() => { window.print = () => {}; });
  await pg.click('#bSave');
  await pg.waitForTimeout(2500);

  const saved = await pg.evaluate(() => window.__MOCK('/invoices', 'GET'));
  ok(saved.length === 1, `bill stored in IndexedDB (got ${saved.length})`);
  ok(saved[0] && saved[0].total === 12500, `total 12500 offline (got ${saved[0] && saved[0].total})`);
  ok(saved[0] && saved[0].bal === 0, 'fully paid offline');

  // --- it survives a reload (that is the whole point of IndexedDB)
  await pg.reload();
  await pg.waitForSelector('#nav button[data-r="dash"]', { timeout: 25000 });
  const after = await pg.evaluate(() => window.__MOCK('/invoices', 'GET'));
  ok(after.length === 1 && after[0].pname === 'OFFLINE PATIENT', 'the bill survives a browser restart');

  // --- printing works offline too
  await pg.evaluate(() => { window.print = () => {}; });
  await pg.evaluate(() => { location.hash = 'invoices'; });
  await pg.waitForTimeout(1800);
  await pg.click('#ilist tbody tr button');
  await pg.waitForSelector('.modal', { timeout: 15000 });
  await pg.click('.mf .btn.p');
  await pg.waitForTimeout(900);
  const area = await pg.evaluate(() => document.querySelector('#printarea').innerText);
  ok(/OFFLINE PATIENT/.test(area), 'the A4 bill prints offline');
  ok(/Sijo/.test(area), 'the offline bill carries the billing doctor');

  const realErrs = errs.filter(e => !/Failed to fetch|net::ERR|Failed to load resource/i.test(e));
  ok(realErrs.length === 0, `no page errors (${realErrs.slice(0, 2).join(' | ')})`);

  await br.close();
  console.log(`\n  ${P} passed, ${F} failed`);
  process.exit(F ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
