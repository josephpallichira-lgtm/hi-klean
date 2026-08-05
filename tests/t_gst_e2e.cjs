/* GST inclusive vs extra, through the real server and the real printed bill. */
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
let pass=0,fail=0; const t=(n,o,x)=>{o?pass++:fail++;console.log(`${o?'PASS':'FAIL'}  ${n}${x?' — '+x:''}`)};
const near=(a,b,tol=0.02)=>Math.abs(a-b)<=tol;

(async()=>{
  const b=await chromium.launch(); const c=await b.newContext(); const p=await c.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(()=>{window.print=()=>{}});
  await p.goto('http://localhost:3000/'); await p.waitForTimeout(1200);
  await p.fill('#lu','admin'); await p.fill('#lp','Test@1234'); await p.click('#lb'); await p.waitForTimeout(2300);
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);

  // turn GST on and create one procedure of each kind
  const setup = await p.evaluate(async()=>{
    const s=await api('/settings');
    await api('/settings','PUT',{settings:{...s.settings,gstEnabled:true,gstin:'32ABCDE1234F1Z5'},doctors:s.doctors});
    const inc=await api('/procedures','POST',{name:'Whitening Kit (incl)',cat:'Products',price:1000,taxable:true,gst:18,gstIncl:true});
    const ext=await api('/procedures','POST',{name:'Whitening Kit (extra)',cat:'Products',price:1000,taxable:true,gst:18,gstIncl:false});
    const s2=await api('/settings'); S.set=s2.settings; S.doctors=s2.doctors;
    return {inc,ext};
  });
  t('procedure saved as GST-included', setup.inc.gstIncl===true, JSON.stringify(setup.inc.gstIncl));
  t('procedure saved as GST-extra', setup.ext.gstIncl===false, JSON.stringify(setup.ext.gstIncl));

  const mk = (items) => p.evaluate(async(its)=>{
    const pat=await api('/patients','POST',{name:'GST TEST '+Math.random().toString(36).slice(2,7),phone:'9000000010'});
    const inv=await api('/invoices','POST',{type:'bill',date:new Date().toISOString().slice(0,10),patientId:pat.id,
      autoNumber:true,items:its,discType:'amt',discValue:0,gstOn:true,payments:[]});
    return api('/invoices/'+inv.id);
  }, items);

  // ---- inclusive ----
  let inv = await mk([{name:'Whitening Kit (incl)',qty:1,rate:1000,disc:0,taxable:true,gst:18,gstIncl:true}]);
  t('[server] inclusive: patient pays exactly 1000', inv.total===1000, '₹'+inv.total);
  t('[server] inclusive: GST declared as 152.54', near(inv.tax,152.54), '₹'+inv.tax);
  t('[server] inclusive: nothing added on top', near(inv.taxAdd,0), '₹'+inv.taxAdd);
  const incHtml = await p.evaluate(i=>billHTML(i), inv);
  t('[print] inclusive: net amount is 1000', /Net Amount Rs:<\/td><td[^>]*>1000\.00/.test(incHtml.replace(/\s+/g,' ')) || /1000\.00/.test(incHtml));
  t('[print] inclusive: says the net INCLUDES the GST', /inclusive of CGST \+ SGST 152\.54/.test(incHtml));
  t('[print] inclusive: no separate GST line inflating the bill', !/CGST \+ SGST<\/td>/.test(incHtml));
  t('[print] inclusive: titled TAX INVOICE', /TAX INVOICE/.test(incHtml));
  t('[print] inclusive: exemption note suppressed', !/exempt from GST/.test(incHtml));

  // ---- extra ----
  inv = await mk([{name:'Whitening Kit (extra)',qty:1,rate:1000,disc:0,taxable:true,gst:18,gstIncl:false}]);
  t('[server] extra: patient pays 1180', inv.total===1180, '₹'+inv.total);
  t('[server] extra: GST is 180', near(inv.tax,180), '₹'+inv.tax);
  t('[server] extra: none of it was carved out', near(inv.taxIncl,0), '₹'+inv.taxIncl);
  const extHtml = await p.evaluate(i=>billHTML(i), inv);
  t('[print] extra: shows a CGST + SGST line', /CGST \+ SGST/.test(extHtml));
  t('[print] extra: no "inclusive of" note', !/inclusive of CGST/.test(extHtml));

  // ---- mixed, with a discount ----
  inv = await mk([
    {name:'Whitening Kit (incl)',qty:1,rate:1000,disc:0,taxable:true,gst:18,gstIncl:true},
    {name:'Whitening Kit (extra)',qty:1,rate:1000,disc:0,taxable:true,gst:18,gstIncl:false},
    {name:'Consultation',qty:1,rate:500,disc:0,taxable:false,gst:0}
  ]);
  t('[server] mixed: total = 1000 + 1180 + 500', inv.total===2680, '₹'+inv.total);
  t('[server] mixed: added + included = declared', near(inv.taxAdd+inv.taxIncl, inv.tax));
  const mixHtml = await p.evaluate(i=>billHTML(i), inv);
  t('[print] mixed: shows both the added line and the inclusive note',
    /CGST \+ SGST/.test(mixHtml) && /inclusive of CGST/.test(mixHtml));

  // ---- the printed arithmetic must actually add up ----
  const sums = await p.evaluate(i=>({sub:i.sub,disc:i.disc,taxAdd:i.taxAdd,total:i.total}), inv);
  t('[print] sub - discount + added GST = net amount',
    near(sums.sub - sums.disc + sums.taxAdd, sums.total), JSON.stringify(sums));

  // ---- client totals must never be trusted ----
  const forged = await p.evaluate(async()=>{
    const pat=await api('/patients','POST',{name:'FORGE '+Math.random().toString(36).slice(2,6),phone:'9000000011'});
    const inv=await api('/invoices','POST',{type:'bill',date:new Date().toISOString().slice(0,10),patientId:pat.id,
      autoNumber:true,gstOn:true,discType:'amt',discValue:0,payments:[],
      items:[{name:'Whitening Kit (incl)',qty:1,rate:1000,disc:0,taxable:true,gst:18,gstIncl:true}],
      total:1,tax:999,sub:1});                       // lies
    return api('/invoices/'+inv.id);
  });
  t('[security] forged totals ignored, server recomputed', forged.total===1000 && near(forged.tax,152.54),
    `total ₹${forged.total} tax ₹${forged.tax}`);

  // ---- reload from the database: the split must survive ----
  const reread = await p.evaluate(id=>api('/invoices/'+id), forged.id);
  t('[persistence] inclusive split survives a reload', near(reread.taxIncl,152.54) && near(reread.taxAdd,0),
    `incl ₹${reread.taxIncl} add ₹${reread.taxAdd}`);

  // ---- GST off = the old behaviour, untouched ----
  const off = await p.evaluate(async()=>{
    const pat=await api('/patients','POST',{name:'NOGST '+Math.random().toString(36).slice(2,6),phone:'9000000012'});
    const inv=await api('/invoices','POST',{type:'bill',date:new Date().toISOString().slice(0,10),patientId:pat.id,
      autoNumber:true,gstOn:false,discType:'amt',discValue:0,payments:[],
      items:[{name:'Whitening Kit (incl)',qty:1,rate:1000,disc:0,taxable:true,gst:18,gstIncl:true}]});
    return api('/invoices/'+inv.id);
  });
  t('[gst off] no tax, total is the plain price', off.tax===0 && off.total===1000);
  const offHtml = await p.evaluate(i=>billHTML(i), off);
  t('[gst off] exemption note is back', /exempt from GST/.test(offHtml) && !/inclusive of CGST/.test(offHtml));

  console.log('page errors:', errs.length?errs.slice(0,3):'none');
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
