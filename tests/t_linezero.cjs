/* A freshly added treatment must show its real amount immediately.
   Reported from a live screenshot: a ₹9,000 denture line displayed ₹0.00
   while the sub total was already counting the ₹9,000. */
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
let pass=0,fail=0; const t=(n,o,x)=>{o?pass++:fail++;console.log(`${o?'PASS':'FAIL'}  ${n}${x?' — '+x:''}`)};
const money = s => Number(String(s).replace(/[^0-9.]/g,'')) || 0;

(async()=>{
  const b=await chromium.launch(); const c=await b.newContext(); const p=await c.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(()=>{window.print=()=>{}});
  // offline build: identical bill screen, no database to fall over
  await p.goto('file:///home/claude/pkg/Hi-Klean-Billing.html'); await p.waitForTimeout(2000);
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  await p.click('#nav button[data-r="bill"]'); await p.waitForTimeout(1500);

  const add = async (search) => {
    await p.fill('#procSearch', search); await p.waitForTimeout(700);
    const n = await p.evaluate(()=>document.querySelectorAll('.pbtn').length);
    if (!n) { console.log('DEBUG no match for', search, await p.evaluate(()=>(document.querySelector('#procList')||{}).innerHTML?.slice(0,140))); throw new Error('no procedure button for '+search); }
    await p.evaluate(()=>document.querySelector('.pbtn').click()); await p.waitForTimeout(400);
  };
  await p.fill('#pName','LINE ZERO TEST'); await p.fill('#pAge','40');

  // add four lines the way a receptionist does — never touching the rate boxes
  await add('Consultation');
  await add('RCT');
  await add('Consultation');
  await add('Denture');

  const rows = await p.evaluate(()=>Array.from(document.querySelectorAll('#itemsBody tr')).map(tr=>({
    name: tr.querySelector('[data-f="name"]')?.value,
    rate: Number(tr.querySelector('[data-f="rate"]')?.value)||0,
    qty: Number(tr.querySelector('[data-f="qty"]')?.value)||0,
    amt: tr.querySelector('[data-amt]')?.textContent
  })));
  console.log('rows:', JSON.stringify(rows));

  t('four lines added', rows.length===4, String(rows.length));
  const zero = rows.filter(r => r.rate>0 && money(r.amt)===0);
  t('no line shows ₹0.00 while it has a rate', zero.length===0,
    zero.length ? JSON.stringify(zero) : 'none');

  // every row's amount must equal qty x rate
  const bad = rows.filter(r => Math.abs(money(r.amt) - r.qty*r.rate) > 0.01);
  t('every line amount = qty x rate', bad.length===0, bad.length?JSON.stringify(bad):'all match');

  // and the sub total must equal the sum of what is displayed
  const shown = rows.reduce((a,r)=>a+money(r.amt),0);
  const sub = await p.evaluate(()=>{
    const el=[...document.querySelectorAll('#totBox div')]
      .filter(d=>/Sub total/.test(d.textContent) && !/Net Amount/.test(d.textContent)).pop();
    return el ? el.querySelector('b').textContent : '';
  });
  t('sub total equals the sum of the visible lines', Math.abs(money(sub)-shown)<0.01,
    `lines ₹${shown} vs ${sub.trim()}`);

  // the last-added line specifically — this was the one that read ₹0.00
  t('the most recently added line is priced', money(rows[rows.length-1].amt) > 0,
    rows[rows.length-1].name+' = '+rows[rows.length-1].amt);

  // deleting a line must keep the rest consistent
  await p.evaluate(()=>document.querySelectorAll('#itemsBody [data-act="del"]')[0].click());
  await p.waitForTimeout(400);
  const after = await p.evaluate(()=>Array.from(document.querySelectorAll('#itemsBody tr')).map(tr=>({
    rate:Number(tr.querySelector('[data-f="rate"]')?.value)||0, amt:tr.querySelector('[data-amt]')?.textContent })));
  t('after deleting a line the rest stay priced', after.every(r=>r.rate===0||money(r.amt)>0), JSON.stringify(after));

  console.log('page errors:', errs.length?errs.slice(0,3):'none');
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
})();
