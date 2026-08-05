/* Tapping Print must NEVER take the user out of the app by itself.
   Covers a normal browser tab and an installed (standalone) app. */
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
let pass=0,fail=0; const t=(n,o,x)=>{o?pass++:fail++;console.log(`${o?'PASS':'FAIL'}  ${n}${x?' — '+x:''}`)};

async function session(b, standalone){
  const c = await b.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,deviceScaleFactor:2.6,
    userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126 Mobile Safari/537.36'});
  const p = await c.newPage();
  await p.addInitScript((sa)=>{
    if(sa){ const real=window.matchMedia.bind(window);
      window.matchMedia=(q)=>/display-mode:\s*standalone/.test(q)
        ? {matches:true,media:q,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}} : real(q); }
    window.__pc=0; window.print=()=>{window.__pc++};   // Android: no-op
  }, standalone);
  await p.goto('http://localhost:3000/'); await p.waitForTimeout(1200);
  await p.fill('#lu','admin'); await p.fill('#lp','Test@1234'); await p.click('#lb'); await p.waitForTimeout(2300);
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  return {c,p};
}
const BILL = {no:'169',type:'bill',date:'2026-08-05',pname:'Ann Mary Joseph',preg:'2T 12682',page:'34',psex:'F',
  paddress:'Kottayam',items:[{name:'Root Canal Treatment',desc:'46',qty:1,rate:4500,amount:4500}],
  sub:4500,disc:0,tax:0,total:4500,paid:4500,bal:0,payments:[],notes:'',doctorId:null};

(async()=>{
  const b = await chromium.launch();

  // ---------- 1. normal browser tab ----------
  {
    const {c,p} = await session(b,false);
    const url0 = p.url();
    let popups=0; c.on('page',()=>popups++);
    await p.evaluate(inv=>printBill(inv,false), BILL);
    await p.waitForTimeout(2500);
    t('[browser] stays on the same page', p.url()===url0, p.url());
    t('[browser] no tab opened behind the user\'s back', popups===0, 'popups='+popups);
    t('[browser] no interruption modal', await p.evaluate(()=>!document.querySelector('#modal .mask')));
    t('[browser] print fired', await p.evaluate(()=>window.__pc)===1);
    t('[browser] bill still on the page', await p.evaluate(()=>document.querySelector('#printarea').innerHTML.length)>500);
    await c.close();
  }

  // ---------- 2. installed app ----------
  {
    const {c,p} = await session(b,true);
    const url0 = p.url();
    let popups=0; c.on('page',()=>popups++);
    await p.evaluate(inv=>printBill(inv,false), BILL);
    await p.waitForTimeout(2500);
    t('[installed] app is NOT navigated away', p.url()===url0, p.url());
    t('[installed] nothing opens on its own', popups===0, 'popups='+popups);
    const m = await p.evaluate(()=>{const x=document.querySelector('#modal .mask');
      return x?{txt:x.innerText.replace(/\n/g,' ').slice(0,150),stay:!!document.querySelector('#pkStay'),open:!!document.querySelector('#pkOpen')}:null;});
    t('[installed] a choice is offered instead', !!m && m.stay && m.open, m?m.txt:'no modal');
    t('[installed] wording explains the cause', !!m && /does not allow printing inside the installed app/i.test(m.txt));
    t('[installed] bill is rendered ready to print', await p.evaluate(()=>document.querySelector('#printarea').innerHTML.length)>500);

    // "Try printing here" must keep the user in the app
    await p.evaluate(()=>{window.__pc=0; document.querySelector('#pkStay').click();});
    await p.waitForTimeout(1500);
    t('[installed] "Try printing here" stays in the app', p.url()===url0 && popups===0);
    t('[installed] "Try printing here" retries the print', await p.evaluate(()=>window.__pc)>=1);

    // only a deliberate tap on the other button opens a tab
    await p.evaluate(inv=>printBill(inv,false), BILL);
    await p.waitForTimeout(800);
    const popP = c.waitForEvent('page',{timeout:12000}).catch(()=>null);
    await p.evaluate(()=>document.querySelector('#pkOpen').click());
    const w = await popP;
    t('[installed] "Open bill in browser" opens the bill only when tapped', !!w);
    if(w){
      await w.waitForTimeout(1200);
      const txt = await w.evaluate(()=>document.body.innerText);
      t('[installed] that tab shows the bill', /Ann Mary Joseph/.test(txt) && /Root Canal/.test(txt));
      t('[installed] and offers a Print button', await w.evaluate(()=>!!document.querySelector('.hkbar button')));
    }
    t('[installed] the app itself is still open behind it', p.url()===url0);
    await c.close();
  }

  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
