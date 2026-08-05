const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const U = (process.env.HKURL || 'http://localhost:3000') + '/';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('PE:' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CE:' + m.text()); });
  const R = []; const ok = (n, c, x = '') => R.push((c ? 'PASS ' : 'FAIL ') + n + (x ? ' :: ' + x : ''));
  const jget = (u) => p.evaluate(x => fetch(x, { headers: { 'X-Requested-With': 'hk' } }).then(r => r.json()), u);

  await p.goto(U); await p.waitForTimeout(1200);
  ok('login screen shown', await p.evaluate(() => !!document.getElementById('lf')));
  await p.fill('#lu', 'admin'); await p.fill('#lp', 'wrong'); await p.click('#lb'); await p.waitForTimeout(900);
  ok('bad password rejected', (await p.textContent('#lerr')).includes('Wrong'));
  await p.fill('#lp', 'Test@1234'); await p.click('#lb'); await p.waitForTimeout(2000);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  ok('signed in', await p.evaluate(() => !!document.querySelector('#nav button[data-r="dash"]')));

  await p.click('#nav button[data-r="bill"]'); await p.waitForTimeout(900);
  await p.fill('#pName', 'VIVEK GOVINDAPILLAI'); await p.fill('#pAge', '58');
  await p.selectOption('#pSex', 'Male'); await p.fill('#pPhone', '9847012345'); await p.fill('#pAddr', 'GOWRIPRIYA, KOTTAYAM');
  await p.fill('#procSearch', 'Zirconia Premium'); await p.waitForTimeout(400); await p.click('.pbtn'); await p.waitForTimeout(300);
  await p.click('#itemsBody [data-act="teeth"]'); await p.waitForTimeout(500);
  for (const t of [35, 36, 37]) await p.click(`.tooth[data-t="${t}"]`);
  await p.click('#tOk'); await p.waitForTimeout(400);
  ok('tooth picker sets qty + desc', await p.evaluate(() => B.items[0].qty === 3 && B.items[0].desc === '35, 36, 37'));
  await p.fill('#payAmt', '25000'); await p.click('#payAdd'); await p.waitForTimeout(400);
  await p.evaluate(() => { window.print = () => { }; });
  await p.click('#bSave'); await p.waitForTimeout(1800);
  let list = await jget('/api/invoices');
  ok('bill saved on the server', list.length === 1 && list[0].total === 37500 && list[0].paid === 25000 && list[0].bal === 12500,
    JSON.stringify(list[0] ? [list[0].no, list[0].total, list[0].bal] : null));
  ok('number issued from counter', list[0] && list[0].no === '169', list[0] && list[0].no);

  await p.click('#nav button[data-r="bill"]'); await p.waitForTimeout(800);
  await p.fill('#pSearch', 'VIVEK'); await p.waitForTimeout(1100);
  await p.click('#pAc div[data-id]'); await p.waitForTimeout(900);
  await p.fill('#procSearch', 'Consultation'); await p.waitForTimeout(400); await p.click('.pbtn'); await p.waitForTimeout(300);
  await p.click('#bSave'); await p.waitForTimeout(1800);
  const l2 = await jget('/api/invoices');
  ok('sequential numbering', l2.map(i => i.no).sort().join(',') === '169,170', l2.map(i => i.no).join(','));
  ok('existing patient reused', new Set(l2.map(i => i.patientId)).size === 1);

  await p.click('#nav button[data-r="reports"]'); await p.waitForTimeout(1800);
  const rtxt = await p.textContent('#rout');
  ok('reports render', rtxt.includes('Collected') && rtxt.includes('25,000'));

  await p.click('#nav button[data-r="doctors"]'); await p.waitForTimeout(1800);
  const dtxt = await p.textContent('#dout');
  ok('doctor report renders procedures', dtxt.includes('Sijo') && dtxt.includes('Zirconia'), dtxt.slice(0, 70).replace(/\n/g, ' '));

  const invId = l2.find(i => i.no === '169').id;
  const ph = await p.evaluate(async id => {
    const inv = await fetch('/api/invoices/' + id, { headers: { 'X-Requested-With': 'hk' } }).then(r => r.json());
    return billHTML(inv).length;
  }, invId);
  ok('A4 bill template builds', ph > 3000, String(ph));

  const pid = l2[0].patientId;
  await p.evaluate(x => location.hash = 'summary/' + x, pid); await p.waitForTimeout(1600);
  ok('treatment summary renders', (await p.textContent('#sOut')).includes('Zirconia'));

  console.log(R.join('\n'));
  console.log('ERRORS:', errs.length ? errs.slice(0, 5) : 'none');
  await b.close();
})();
