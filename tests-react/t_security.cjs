/* Reproduces every finding from the adversarial audit. Each must now FAIL to exploit.
   Run against a scratch database only. */
const { chromium } = require('playwright');
const U = process.env.HKURL || 'http://localhost:3000';
const R = []; const ok = (n, c, x = '') => R.push((c ? 'PASS ' : '*** FAIL ') + n + (x ? ' :: ' + x : ''));

const call = async (path, method, body, cookie, hdrs = {}) => {
  const r = await fetch(U + path, {
    method: method || 'GET',
    headers: Object.assign({ 'Content-Type': 'application/json', 'X-Requested-With': 'hk' }, cookie ? { cookie } : {}, hdrs),
    body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual'
  });
  let d = null; try { d = await r.json(); } catch { }
  return { status: r.status, data: d, setCookie: r.headers.get('set-cookie') };
};
const cookieOf = (sc) => (sc || '').split(';')[0];

(async () => {
  // ---- sign in as admin ----
  let r = await call('/api/auth/login', 'POST', { username: 'admin', password: 'Test@1234' });
  const admin = cookieOf(r.setCookie);
  ok('admin login works', r.status === 200, JSON.stringify(r.data).slice(0, 80));

  // ---- create a staff user ----
  await call('/api/users', 'POST', { username: 'recep2', password: 'Front@4567', role: 'staff' }, admin);
  r = await call('/api/auth/login', 'POST', { username: 'recep2', password: 'Front@4567' });
  const staff = cookieOf(r.setCookie);
  ok('new user is forced to change password', r.data?.user?.mustChange === true);

  // =====  FINDING 1: stored XSS via payment ref/mode  =====
  const pat = await call('/api/patients', 'POST', { name: 'XSS TEST', phone: '9000000001' }, staff);
  const inv = await call('/api/invoices', 'POST', {
    type: 'bill', date: new Date().toISOString().slice(0, 10), patientId: pat.data.id, autoNumber: true,
    items: [{ name: 'Consultation', qty: 1, rate: 500, disc: 0 }], discType: 'amt', discValue: 0, payments: []
  }, staff);
  const payload = '<iframe srcdoc="&lt;script&gt;window.parent.__PWNED=1&lt;/script&gt;"></iframe>';
  const payRes = await call(`/api/invoices/${inv.data.id}/payments`, 'POST',
    { amount: 100, mode: payload, ref: payload }, staff);
  const stored = payRes.data?.payments?.[0] || {};
  ok('payment mode is forced to a known mode', stored.mode === 'Cash', String(stored.mode).slice(0, 40));
  ok('payment ref is stripped of angle brackets', !/[<>]/.test(stored.ref || ''), String(stored.ref).slice(0, 40));

  const b = await chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(U + '/'); await p.waitForTimeout(900);
  await p.fill('#lu', 'admin'); await p.fill('#lp', 'Test@1234'); await p.click('#lb'); await p.waitForTimeout(2000);
  ok('first login forces the admin to set a password', await p.evaluate(() => !!document.querySelector('#cpok')));
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);   // dismiss for the rest of the test
  // Drive the REAL print path with a stored payload rather than calling an
  // internal function: this proves the button is wired AND that the template escapes.
  await p.evaluate(() => { window.print = () => {}; });
  await p.evaluate(() => { location.hash = 'invoices'; });
  await p.waitForTimeout(1800);
  await p.click('#ilist tbody tr button');
  await p.waitForSelector('.modal', { timeout: 15000 });
  await p.click('.mf .btn.p');
  await p.waitForTimeout(900);
  const pwned = await p.evaluate(() => ({
    pwned: !!window.__PWNED,
    iframes: document.querySelectorAll('#printarea iframe').length,
    scripts: document.querySelectorAll('#printarea script').length,
    rendered: document.querySelector('#printarea').innerHTML.length,
  }));
  ok('print template cannot execute an injected payload',
    !pwned.pwned && pwned.iframes === 0 && pwned.scripts === 0 && pwned.rendered > 500, JSON.stringify(pwned));
  await p.evaluate(() => { document.querySelector('.mask')?.querySelector('.x')?.click(); });
  await p.waitForTimeout(400);

  // =====  FINDING 11: inline onclick handlers dead under CSP  =====
  await p.evaluate(() => { location.hash = 'invoices'; }); await p.waitForTimeout(1800);
  const btn = await p.$('#ilist tbody tr button');
  ok('bills list has a CSP-safe Open button', !!btn);
  if (btn) { await btn.click(); await p.waitForTimeout(1200); }
  ok('Open button actually opens the bill', await p.evaluate(() => !!document.querySelector('.mask')));
  const closeBtn = await p.$('.mask .x');
  if (closeBtn) { await closeBtn.click(); await p.waitForTimeout(500); }
  ok('modal closes without inline handlers', await p.evaluate(() => !document.querySelector('.mask')));
  ok('no inline onclick attributes remain', await p.evaluate(() => document.querySelectorAll('[onclick]').length === 0));

  // =====  FINDING 4: session survives a password change  =====
  const before = staff;
  await call('/api/users/' + (await call('/api/users', 'GET', undefined, admin)).data.find(u => u.username === 'recep2').id,
    'PATCH', { password: 'Reset@98765' }, admin);
  r = await call('/api/auth/me', 'GET', undefined, before);
  ok('admin password reset kills the old session', r.status === 401, 'got ' + r.status);

  // =====  FINDING 6: username enumeration by timing (run before the rate-limit test,
  //        because a 429 short-circuits bcrypt and would poison the measurement) =====
  const t = async (u) => {
    const s0 = Date.now();
    const rr = await call('/api/auth/login', 'POST', { username: u, password: 'wrongpassword123' });
    return rr.status === 401 ? Date.now() - s0 : null;
  };
  const avg = async (names) => { const v = []; for (const n of names) { const x = await t(n); if (x) v.push(x); } return v.reduce((a, b) => a + b, 0) / (v.length || 1); };
  const tKnown = await avg(['recep2', 'recep2', 'recep2']);
  const tUnknown = await avg(['ghost1x', 'ghost2x', 'ghost3x']);
  ok('login timing does not reveal valid usernames', Math.abs(tKnown - tUnknown) < 120,
    `known ${tKnown.toFixed(0)}ms vs unknown ${tUnknown.toFixed(0)}ms`);

  // =====  FINDING 5: rate limit spoofed via X-Forwarded-For  =====
  // the per-account throttle counts failures after the password check, so rotating the
  // claimed IP does not help; and a correct password must still get through afterwards
  let blocked = 0;
  for (let i = 0; i < 40; i++) {
    const rr = await call('/api/auth/login', 'POST', { username: 'admin', password: 'nope' + i }, null,
      { 'X-Forwarded-For': '9.9.9.' + (i % 250) });
    if (rr.status === 429) blocked++;
  }
  ok('spoofed X-Forwarded-For cannot bypass the account throttle', blocked > 0, blocked + ' of 40 blocked');
  const stillIn = await call('/api/auth/login', 'POST', { username: 'admin', password: 'Test@1234' });
  ok('a brute-force attempt cannot lock the real admin out', stillIn.status === 200, 'got ' + stillIn.status);

  // =====  FINDING 8: CSRF on logout  =====
  r = await fetch(U + '/api/auth/logout', { method: 'POST' });
  ok('logout rejects a request without the app header', r.status === 403, 'got ' + r.status);
  r = await fetch(U + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"username":"admin","password":"Test@1234"}' });
  ok('login rejects a cross-site form post', r.status === 403, 'got ' + r.status);

  // =====  FINDING (money 1): counter pushed below an issued number  =====
  const s0 = await call('/api/settings', 'GET', undefined, admin);
  r = await call('/api/settings', 'PUT', { settings: s0.data.settings, counters: { bill_no: 5 } }, admin);
  ok('bill numbering cannot be moved backwards (clamped, settings still saved)',
    r.status === 200 && r.data.clamped && r.data.clamped.used > 100, JSON.stringify(r.data));

  // =====  FINDING (money 3): estimate money counted as collection  =====
  const est = await call('/api/invoices', 'POST', {
    type: 'estimate', date: new Date().toISOString().slice(0, 10), patientId: pat.data.id,
    items: [{ name: 'Metal Braces (Full Treatment)', qty: 1, rate: 30000, disc: 0 }],
    discType: 'amt', discValue: 0, payments: [{ amount: 15000, mode: 'Cash' }]
  }, admin);
  ok('an estimate cannot carry payments', (est.data.payments || []).length === 0, JSON.stringify(est.data.payments));
  r = await call(`/api/invoices/${est.data.id}/payments`, 'POST', { amount: 15000, mode: 'Cash' }, admin);
  ok('payment on an estimate is refused', r.status === 400, JSON.stringify(r.data));

  // =====  FINDING (money): negative / zero payments  =====
  r = await call(`/api/invoices/${inv.data.id}/payments`, 'POST', { amount: -5000, mode: 'Cash' }, admin);
  ok('negative payment refused', r.status === 400, JSON.stringify(r.data));
  r = await call(`/api/invoices/${inv.data.id}/payments`, 'POST', { amount: 0, mode: 'Cash' }, admin);
  ok('zero payment refused', r.status === 400);

  // =====  FINDING 3: import overwrites a live patient & wrecks numbering  =====
  const before1 = await call('/api/patients/' + pat.data.id, 'GET', undefined, admin);
  const evil = {
    _app: 'hiklean-dental-billing', _at: new Date().toISOString(), settings: {},
    patients: [{ id: 'x1', reg: before1.data.reg, name: 'ATTACKER OVERWRITE', phone: '1' }],
    invoices: [{
      id: 'y1', type: 'bill', no: '999888777', date: '2026-01-01', patientId: 'x1',
      items: [{ name: 'Bogus 50k line', qty: 1, rate: 50000, disc: 0 }], discType: 'amt', discValue: 0, payments: []
    }],
    procedures: []
  };
  r = await call('/api/import', 'POST', evil, admin);
  const after1 = await call('/api/patients/' + pat.data.id, 'GET', undefined, admin);
  ok('import does not rename an existing patient', after1.data.name === before1.data.name,
    `${before1.data.name} -> ${after1.data.name}`);
  ok('import reports the ID clash', (r.data.collisions || []).length === 1, JSON.stringify(r.data.collisions));
  const s1 = await call('/api/settings', 'GET', undefined, admin);
  ok('an absurd imported bill number cannot hijack the counter', s1.data.counters.bill_no < 100000,
    'counter = ' + s1.data.counters.bill_no);

  // =====  import must preserve a cancelled bill  =====
  const v = {
    _app: 'hiklean-dental-billing', patients: [{ id: 'p9', reg: null, name: 'VOID IMPORT TEST' }],
    invoices: [{
      id: 'v9', type: 'bill', no: 'V-900', date: '2026-02-02', patientId: 'p9', voided: true, voidReason: 'duplicate',
      items: [{ name: 'RCT - Molar', qty: 1, rate: 5000, disc: 0 }], discType: 'amt', discValue: 0, payments: []
    }]
  };
  await call('/api/import', 'POST', v, admin);
  const all = await call('/api/invoices?limit=500', 'GET', undefined, admin);
  ok('a cancelled bill does not come back to life on import', !all.data.some(i => i.no === 'V-900'));

  // =====  staff still blocked from admin surfaces  =====
  r = await call('/api/auth/login', 'POST', { username: 'recep2', password: 'Reset@98765' });
  const staff2 = cookieOf(r.setCookie);
  for (const [m, path] of [['GET', '/api/reports?from=2026-01-01&to=2026-12-31'], ['GET', '/api/backup'],
  ['GET', '/api/audit'], ['POST', '/api/import'], ['GET', '/api/reports/doctors?from=2026-01-01&to=2026-12-31']]) {
    const rr = await call(path, m, m === 'POST' ? {} : undefined, staff2);
    ok('staff blocked: ' + path.split('?')[0], rr.status === 403, 'got ' + rr.status);
  }
  // password policy
  r = await call('/api/users', 'POST', { username: 'weak1', password: 'short7', role: 'staff' }, admin);
  ok('short passwords refused', r.status === 400);


  // ================= second-round fixes =================
  const day = new Date().toISOString().slice(0, 10);

  // whitespace-padded username must not open a fresh rate-limit bucket
  let padOk = 0;
  for (let i = 0; i < 40; i++) {
    const rr = await call('/api/auth/login', 'POST', { username: '  admin  ', password: 'nope' + i });
    if (rr.status === 429) { padOk = 1; break; }
  }
  ok('padded username cannot bypass the login limit', padOk === 1);

  // logout must kill the token, not just the cookie
  let lr = await call('/api/auth/login', 'POST', { username: 'admin', password: 'Test@1234' });
  const c1 = cookieOf(lr.setCookie);
  await call('/api/auth/logout', 'POST', {}, c1);
  r = await call('/api/auth/me', 'GET', undefined, c1);
  ok('a copied cookie is dead after sign out', r.status === 401, 'got ' + r.status);

  lr = await call('/api/auth/login', 'POST', { username: 'admin', password: 'Test@1234' });
  const adm2 = cookieOf(lr.setCookie);

  // disable then re-enable must not resurrect an old session
  const uid = (await call('/api/users', 'GET', undefined, adm2)).data.find(u => u.username === 'recep2').id;
  lr = await call('/api/auth/login', 'POST', { username: 'recep2', password: 'Reset@98765' });
  const stale = cookieOf(lr.setCookie);
  await call('/api/users/' + uid, 'PATCH', { active: false }, adm2);
  await call('/api/users/' + uid, 'PATCH', { active: true }, adm2);
  r = await call('/api/auth/me', 'GET', undefined, stale);
  ok('re-enabling a user does not revive their old session', r.status === 401, 'got ' + r.status);

  // every payment keeps its own mode
  const pt2 = await call('/api/patients', 'POST', { name: 'MODE TEST' }, adm2);
  const mi = await call('/api/invoices', 'POST', {
    type: 'bill', date: day, patientId: pt2.data.id, autoNumber: true, discType: 'amt', discValue: 0,
    items: [{ name: 'Consultation', qty: 1, rate: 1000, disc: 0 }],
    payments: [{ amount: 400, mode: 'Cash', date: day }, { amount: 600, mode: 'UPI', date: day }]
  }, adm2);
  ok('each payment keeps its own mode', (mi.data.payments || []).map(p => p.mode).join(',') === 'Cash,UPI',
    JSON.stringify((mi.data.payments || []).map(p => p.mode)));

  // a bill number typed in by hand must not wedge auto numbering
  await call('/api/invoices', 'PUT', undefined, adm2);
  const manual = await call('/api/invoices', 'POST', {
    type: 'bill', date: day, patientId: pt2.data.id, no: '5000', discType: 'amt', discValue: 0,
    items: [{ name: 'Consultation', qty: 1, rate: 100, disc: 0 }], payments: []
  }, adm2);
  ok('a manually numbered bill saves', manual.status === 200, JSON.stringify(manual.data).slice(0, 60));
  let wedged = 0;
  for (let i = 0; i < 3; i++) {
    const rr = await call('/api/invoices', 'POST', {
      type: 'bill', date: day, patientId: pt2.data.id, autoNumber: true, discType: 'amt', discValue: 0,
      items: [{ name: 'Consultation', qty: 1, rate: 100, disc: 0 }], payments: []
    }, adm2);
    if (rr.status !== 200) wedged++;
  }
  ok('auto numbering skips past a taken number instead of failing', wedged === 0, wedged + ' failures');

  // an 18-digit bill number must not turn Settings into a 500
  await call('/api/invoices', 'POST', {
    type: 'bill', date: day, patientId: pt2.data.id, no: '99999999999999999999', discType: 'amt', discValue: 0,
    items: [{ name: 'Consultation', qty: 1, rate: 100, disc: 0 }], payments: []
  }, adm2);
  const st = await call('/api/settings', 'GET', undefined, adm2);
  r = await call('/api/settings', 'PUT', { settings: st.data.settings, counters: { bill_no: 200 } }, adm2);
  ok('a huge bill number does not break Settings', r.status === 200, 'got ' + r.status + ' ' + JSON.stringify(r.data));

  // saving a lower number clamps instead of half-saving
  const st2 = await call('/api/settings', 'GET', undefined, adm2);
  const phone = 'PHONE-' + Math.floor(Math.random() * 9999);
  r = await call('/api/settings', 'PUT',
    { settings: { ...st2.data.settings, phone }, counters: { bill_no: 1, reg_no: 1 } }, adm2);
  const st3 = await call('/api/settings', 'GET', undefined, adm2);
  ok('settings save succeeds and clamps the numbering', r.status === 200 && st3.data.settings.phone === phone,
    'status ' + r.status + ' phone ' + st3.data.settings.phone);
  ok('numbering was clamped upward, not accepted', st3.data.counters.bill_no > 100, 'bill_no ' + st3.data.counters.bill_no);

  // patient registration must not wedge after a low reg_no is attempted
  const np = await call('/api/patients', 'POST', { name: 'AFTER CLAMP' }, adm2);
  ok('patients can still be registered after a numbering clamp', np.status === 200, JSON.stringify(np.data).slice(0, 60));

  // malformed dates are a clear 400, never a 500
  r = await call(`/api/invoices/${mi.data.id}/payments`, 'POST', { amount: 10, mode: 'Cash', date: 'not-a-date' }, adm2);
  ok('a bad payment date does not 500', r.status !== 500, 'got ' + r.status);
  r = await call('/api/invoices', 'POST', {
    type: 'bill', date: 'rubbish', patientId: pt2.data.id, autoNumber: true,
    items: [{ name: 'x', qty: 1, rate: 1, disc: 0 }], discType: 'amt', discValue: 0, payments: []
  }, adm2);
  ok('a bad bill date is rejected with 400', r.status === 400, 'got ' + r.status);

  // import: mode whitelist + records with no id are skipped, not mis-attached
  const imp = await call('/api/import', 'POST', {
    _app: 'hiklean-dental-billing',
    patients: [{ name: 'NO ID PERSON' }, { id: 'ok1', name: 'GOOD IMPORT', reg: null }],
    invoices: [
      { id: 'o1', type: 'bill', no: 'ORPHAN1', date: '2026-03-03', items: [{ name: 'x', qty: 1, rate: 10, disc: 0 }], discType: 'amt', discValue: 0, payments: [] },
      { id: 'o2', type: 'bill', no: 'GOOD1', date: '2026-03-04', patientId: 'ok1', discType: 'amt', discValue: 0, items: [{ name: 'RCT - Molar', qty: 1, rate: 5000, disc: 0 }], payments: [{ amount: 1000, mode: 'MODE"><img src=x>', date: '2026-03-04' }] }
    ]
  }, adm2);
  const gi = (await call('/api/invoices?q=GOOD1', 'GET', undefined, adm2)).data[0];
  ok('imported payment mode is whitelisted', gi && gi.payments[0].mode === 'Cash', gi && gi.payments[0].mode);
  const orphan = (await call('/api/invoices?q=ORPHAN1', 'GET', undefined, adm2)).data;
  ok('an invoice with no patient is skipped, not mis-attached', orphan.length === 0, JSON.stringify(orphan.map(x => x.pname)));

  // doctor report must reconcile with the Reports page for the same period
  const from = '2026-01-01', to = day;
  const rep = (await call(`/api/reports?from=${from}&to=${to}`, 'GET', undefined, adm2)).data;
  const drs = (await call(`/api/reports/doctors?from=${from}&to=${to}`, 'GET', undefined, adm2)).data;
  const sumDoc = drs.reduce((a, d) => a + d.collected, 0);
  ok('doctor report collection reconciles with the reports page',
    Math.abs(sumDoc - rep.collected) < 1, `doctors ${sumDoc} vs reports ${rep.collected}`);

  console.log(R.join('\n'));
  console.log('\nFAILURES:', R.filter(x => x.startsWith('***')).length);
  console.log('page errors:', errs.length ? errs.slice(0, 3) : 'none');
  await b.close();
})();
