/* GST cannot be switched on without a valid GSTIN — enforced on the server,
   so it cannot be bypassed from the browser. */
const U = 'http://localhost:3000';
let pass=0,fail=0; const t=(n,o,x)=>{o?pass++:fail++;console.log(`${o?'PASS':'FAIL'}  ${n}${x?' — '+x:''}`)};
const call=async(p,m,b,c)=>{const r=await fetch(U+p,{method:m||'GET',
  headers:Object.assign({'Content-Type':'application/json','X-Requested-With':'hk'},c?{cookie:c}:{}),
  body:b===undefined?undefined:JSON.stringify(b)});
  let d=null;try{d=await r.json()}catch{};return{status:r.status,data:d,sc:r.headers.get('set-cookie')}};

(async()=>{
  let r = await call('/api/auth/login','POST',{username:'admin',password:process.env.HKPASS||'Test@12345'});
  const admin=(r.sc||'').split(';')[0];
  t('signed in', r.status===200);
  const base = (await call('/api/settings','GET',undefined,admin)).data;
  const set = base.settings, docs = base.doctors;

  // start from a known state: GST off
  await call('/api/settings','PUT',{settings:{...set,gstEnabled:false,gstin:''},doctors:docs},admin);
  t('starting state is GST off',
    (await call('/api/settings','GET',undefined,admin)).data.settings.gstEnabled === false);

  // 1. GST on with no GSTIN -> refused
  r = await call('/api/settings','PUT',{settings:{...set,gstEnabled:true,gstin:''},doctors:docs},admin);
  t('GST on with blank GSTIN is refused', r.status>=400, `${r.status} ${r.data&&r.data.error}`);
  t('the refusal explains why', /must not charge GST/i.test((r.data&&r.data.error)||''));

  // 2. still off afterwards
  let cur = (await call('/api/settings','GET',undefined,admin)).data.settings;
  t('setting was NOT half-saved', cur.gstEnabled !== true, 'gstEnabled='+cur.gstEnabled);

  // 3. malformed GSTIN -> refused
  r = await call('/api/settings','PUT',{settings:{...set,gstEnabled:true,gstin:'32ABCDE'},doctors:docs},admin);
  t('malformed GSTIN is refused', r.status>=400, `${r.status} ${r.data&&r.data.error}`);

  // 4. valid GSTIN -> allowed
  r = await call('/api/settings','PUT',{settings:{...set,gstEnabled:true,gstin:'32ABCDE1234F1Z5'},doctors:docs},admin);
  t('a valid GSTIN lets GST be switched on', r.status===200, String(r.status));
  cur = (await call('/api/settings','GET',undefined,admin)).data.settings;
  t('GST is now on with the GSTIN stored', cur.gstEnabled===true && cur.gstin==='32ABCDE1234F1Z5',
    `${cur.gstEnabled} / ${cur.gstin}`);

  // 5. lowercase is accepted and normalised
  r = await call('/api/settings','PUT',{settings:{...set,gstEnabled:true,gstin:'32abcde1234f1z5'},doctors:docs},admin);
  cur = (await call('/api/settings','GET',undefined,admin)).data.settings;
  t('lowercase GSTIN normalised to caps', r.status===200 && cur.gstin==='32ABCDE1234F1Z5', cur.gstin);

  // 6. turning GST back off never blocked
  r = await call('/api/settings','PUT',{settings:{...set,gstEnabled:false,gstin:''},doctors:docs},admin);
  cur = (await call('/api/settings','GET',undefined,admin)).data.settings;
  t('switching GST off is always allowed', r.status===200 && cur.gstEnabled===false);

  // 7. saving unrelated settings with GST off is unaffected
  r = await call('/api/settings','PUT',{settings:{...set,gstEnabled:false,gstin:'',phone:'+91 9400114449'},doctors:docs},admin);
  t('ordinary settings still save with GST off', r.status===200, String(r.status));

  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
})();
