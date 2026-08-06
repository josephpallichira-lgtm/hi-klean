/* ===========================================================
   DEMO BUILD ONLY — a mock backend so the whole app can be
   tried in Chrome with no server. Data lives in this tab and
   disappears when it is closed. Nothing leaves the computer.
   =========================================================== */
(function () {
  const D = { patients: [], invoices: [], payments: [], users: [], audit: [], counters: { bill_no: 168, reg_no: 12681 } };
  let seq = { p: 1, i: 1, pay: 1, item: 1 };
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() - (n || 0)); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const money = (v) => Math.round((Number(v) || 0) * 100) / 100;

  const SET = {
    clinicName: 'HI-KLEAN DENTAL CLINIC', line2: 'MULTI SPECIALITY DENTAL CLINIC & ROOT CANAL CENTRE',
    address: 'Goodshepherd Complex, Goodshepherd Road, Kottayam-1',
    phone: '+91 9400114449, +91 481 2562960, +91 9496357172',
    website: 'www.hikleandental.com', email: 'hikleanpolyclinic@gmail.com', gstin: '',
    logo: window.__DEMO_LOGO__ || '', regPrefix: '2T ', footer: 'FOR Hi-KLEAN',
    terms: 'Fees once paid are non-refundable. Please bring this bill for follow-up visits.',
    showTerms: false, showWords: false, showSign: true, gstEnabled: false, defaultDoctorId: 1,
    modes: ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Cheque']
  };
  const DOCS = [
    { id: 1, name: 'Dr. Sijo P. Mathew MDS', spec: '(Conservative Dentistry & Endodontics)', role_line: 'Chief Dental Surgeon & Endodontist', reg_no: '8982', sign_title: 'Chief Clinic Director', active: true, sort: 0 },
    { id: 2, name: 'Dr. Anjali Menon MDS', spec: '(Orthodontics)', role_line: 'Consultant Orthodontist', reg_no: '11204', sign_title: 'Consultant', active: true, sort: 1 },
    { id: 3, name: 'Dr. Rahul Nair BDS', spec: '', role_line: 'Dental Surgeon', reg_no: '15782', sign_title: 'Dental Surgeon', active: true, sort: 2 }
  ];
  const PROCS = window.__DEMO_PROCS__ || [];
  D.users = [
    { id: 1, username: 'admin', full_name: 'Dr. Sijo P. Mathew', role: 'admin', active: true, last_login: new Date().toISOString() },
    { id: 2, username: 'reception', full_name: 'Front desk', role: 'staff', active: true, last_login: null }
  ];
  let ME = { id: 1, username: 'admin', role: 'admin', fullName: 'Dr. Sijo P. Mathew', mustChange: false };

  const nextReg = () => SET.regPrefix + (++D.counters.reg_no);
  const nextNo = () => String(++D.counters.bill_no);

  function addPatient(o) {
    const p = Object.assign({ id: seq.p++, reg: o.reg || nextReg(), name: '', phone: '', age: '', sex: '', address: '', note: '', createdAt: new Date().toISOString() }, o);
    if (!o.reg) p.reg = p.reg || nextReg();
    D.patients.push(p); return p;
  }
  function recalc(inv) {
    let sub = 0;
    inv.items.forEach(it => {
      const gross = (Number(it.qty) || 0) * (Number(it.rate) || 0);
      let d = Math.max(0, Math.min(Number(it.disc) || 0, gross));
      it.disc = d; it.amount = money(gross - d); sub += it.amount;
    });
    sub = money(sub);
    let disc = inv.discType === 'pct' ? money(sub * Math.min(100, Math.max(0, Number(inv.discValue) || 0)) / 100)
      : Math.max(0, Number(inv.discValue) || 0);
    if (disc > sub) disc = sub;
    let tax = 0;
    if (inv.gstOn && sub > 0) inv.items.forEach(it => {
      if (!it.taxable) return;
      const net = money(it.amount - disc * (it.amount / sub));
      tax += money(net * (Number(it.gst) || 0) / 100);
    });
    inv.sub = sub; inv.disc = disc; inv.tax = money(tax); inv.total = money(sub - disc + tax);
    inv.paid = money((inv.payments || []).reduce((a, p) => a + p.amount, 0));
    inv.bal = money(inv.total - inv.paid);
    return inv;
  }
  function addInvoice(o) {
    const p = D.patients.find(x => x.id === o.patientId) || {};
    const inv = Object.assign({
      id: seq.i++, no: o.no || nextNo(), type: o.type || 'bill', date: o.date || day(0),
      patientId: o.patientId, doctorId: o.doctorId || 1, discType: o.discType || 'amt', discValue: o.discValue || 0,
      notes: o.notes || '', gstOn: !!o.gstOn, voidedAt: null, createdAt: new Date().toISOString(),
      createdBy: ME.username, items: [], payments: []
    }, {});
    inv.items = (o.items || []).map(it => ({
      id: seq.item++, pid: it.pid || null, name: it.name, desc: it.desc || '', qty: Number(it.qty) || 1,
      rate: Number(it.rate) || 0, disc: Number(it.disc) || 0, taxable: !!it.taxable, gst: Number(it.gst) || 0,
      perTooth: !!it.perTooth, docId: it.docId || o.doctorId || 1
    }));
    inv.payments = (o.payments || []).filter(x => Number(x.amount) > 0).map(x => ({
      id: seq.pay++, date: x.date || inv.date, mode: SET.modes.includes(x.mode) ? x.mode : SET.modes[0],
      amount: money(x.amount), ref: String(x.ref || '').replace(/[<>]/g, '').slice(0, 64)
    }));
    inv.pname = p.name; inv.preg = p.reg; inv.pphone = p.phone;
    inv.pat = { name: p.name, reg: p.reg, phone: p.phone, age: p.age, sex: p.sex, address: p.address };
    D.invoices.push(recalc(inv));
    return inv;
  }
  const stamp = (inv) => {
    const p = D.patients.find(x => x.id === inv.patientId) || {};
    inv.pname = p.name; inv.preg = p.reg; inv.pphone = p.phone;
    inv.pat = { name: p.name, reg: p.reg, phone: p.phone, age: p.age, sex: p.sex, address: p.address };
    return recalc(inv);
  };
  const live = () => D.invoices.filter(i => !i.voidedAt);
  const bills = () => live().filter(i => i.type === 'bill');
  const log = (action, detail) => D.audit.unshift({ id: D.audit.length + 1, at: new Date().toISOString(), username: ME.username, action, entity: '', entity_id: '', detail: detail || {} });

  /* ---------- demo data ---------- */
  (function seed() {
    const pats = [
      ['VIVEK GOVINDAPILLAI', '58', 'Male', '9847012345', 'GOWRIPRIYA, KOTTAYAM'],
      ['ANNA MARIYA JOSEPH', '34', 'Female', '9846011223', 'MANARCAD, KOTTAYAM'],
      ['RAHUL KRISHNAN', '27', 'Male', '9995512340', 'CHANGANASSERY'],
      ['SUSAN THOMAS', '61', 'Female', '9744500912', 'ETTUMANOOR'],
      ['ABHIRAM S NAIR', '12', 'Male', '9061223344', 'KOTTAYAM']
    ].map(([name, age, sex, phone, address]) => addPatient({ name, age, sex, phone, address }));
    const mk = (d, p, doc, items, pay) => addInvoice({
      type: 'bill', date: d, patientId: p.id, doctorId: doc, discType: 'amt', discValue: 0,
      items: items.map(i => ({ name: i[0], desc: i[1], qty: i[2], rate: i[3], docId: i[4] || doc })),
      payments: pay ? [{ amount: pay[0], mode: pay[1], date: d }] : []
    });
    mk(day(9), pats[0], 1, [['Consultation', '', 1, 200], ['RVG', '', 1, 400], ['Crown / Bridge Removal', '35, 36, 37', 3, 500], ['RCT - Molar', '36', 1, 4680]], [5780, 'UPI']);
    mk(day(6), pats[0], 1, [['RCT - Molar', '35, 37', 2, 2100]], [4200, 'Cash']);
    mk(day(4), pats[1], 3, [['Scaling & Polishing (Full Mouth)', '', 1, 1000], ['Composite Filling - 2 Surface', '14, 15', 2, 1300]], [3600, 'UPI']);
    mk(day(2), pats[2], 3, [['Impacted 3rd Molar - Surgical', '48', 1, 6000]], [3000, 'Card']);
    mk(day(0), pats[0], 1, [['Crown Preparation - Zirconia Premium', '35, 36, 37', 3, 12500]], [25000, 'Card']);
    mk(day(0), pats[3], 1, [['Complete Denture Set (Upper + Lower)', '', 1, 22000]], [10000, 'Cash']);
    mk(day(0), pats[4], 2, [['Metal Braces (Full Treatment)', '', 1, 30000, 2], ['Ortho Consultation + Records', '', 1, 1000, 2]], [12000, 'UPI']);
    mk(day(3), pats[1], 2, [['Ortho Monthly Adjustment', '', 1, 500]], [500, 'Cash']);
    log('login', { demo: true });
  })();

  /* ---------- reports ---------- */
  const inRange = (d, f, t) => (!f || d >= f) && (!t || d <= t);
  function reports(from, to) {
    const bs = bills().filter(i => inRange(i.date, from, to));
    const modes = {}, daily = {}, top = {};
    let collected = 0;
    bills().forEach(i => i.payments.forEach(p => {
      if (!inRange(p.date, from, to)) return;
      collected += p.amount;
      modes[p.mode] = (modes[p.mode] || 0) + p.amount;
      daily[p.date] = (daily[p.date] || 0) + p.amount;
    }));
    const docs = {};
    bills().forEach(i => i.payments.forEach(p => {
      if (!inRange(p.date, from, to) || !i.sub) return;
      i.items.forEach(it => {
        const n = (DOCS.find(d => d.id === it.docId) || {}).name || '(not assigned)';
        docs[n] = (docs[n] || 0) + money(it.amount / i.sub * p.amount);
      });
    }));
    bs.forEach(i => i.items.forEach(t => {
      top[t.name] = top[t.name] || { n: 0, total: 0 };
      top[t.name].n += t.qty; top[t.name].total += t.amount;
    }));
    const dues = bills().filter(i => i.bal > 0.005).sort((a, b) => b.bal - a.bal).map(i => ({
      id: i.id, no: i.no, date: i.date, name: i.pname, phone: i.pphone, pid: i.patientId, bal: i.bal
    }));
    return {
      billed: { count: bs.length, total: money(bs.reduce((a, i) => a + i.total, 0)), disc: money(bs.reduce((a, i) => a + i.disc, 0)) },
      collected: money(collected),
      modes: Object.entries(modes).map(([mode, total]) => ({ mode, total: money(total) })).sort((a, b) => b.total - a.total),
      doctors: Object.entries(docs).map(([name, total]) => ({ name, total: money(total) })).sort((a, b) => b.total - a.total),
      daily: Object.entries(daily).map(([date, total]) => ({ date, total: money(total) })).sort((a, b) => b.date.localeCompare(a.date)),
      top: Object.entries(top).map(([name, v]) => ({ name, n: v.n, total: money(v.total) })).sort((a, b) => b.total - a.total).slice(0, 15),
      dues, duesTotal: money(dues.reduce((a, d) => a + d.bal, 0))
    };
  }
  function doctorReport(from, to) {
    const out = new Map();
    bills().forEach(i => {
      const paidIn = i.payments.filter(p => inRange(p.date, from, to)).reduce((a, p) => a + p.amount, 0);
      const billedIn = inRange(i.date, from, to);
      if (!billedIn && !paidIn) return;
      i.items.forEach(it => {
        const doc = DOCS.find(d => d.id === it.docId) || { id: 0, name: '(not assigned)' };
        if (!out.has(doc.id)) out.set(doc.id, { doctorId: doc.id, name: doc.name, billed: 0, collected: 0, prior: 0, unpaid: 0, bills: new Set(), patients: new Set(), procs: {} });
        const o = out.get(doc.id);
        const share = i.sub ? it.amount / i.sub : 1 / i.items.length;
        const net = billedIn ? money(share * i.total) : 0;
        const coll = money(share * paidIn);
        // collection that settles a bill raised OUTSIDE the window, and what is still
        // owed on the bills raised INSIDE it — mirrors src/server.js doctorReport()
        const prior = billedIn ? 0 : coll;
        const unpaid = billedIn ? money(share * (i.total - (i.payments || []).reduce((a, x) => a + x.amount, 0))) : 0;
        o.billed += net; o.collected += coll; o.prior += prior; o.unpaid += unpaid;
        if (billedIn) { o.bills.add(i.id); o.patients.add(i.patientId); }
        o.procs[it.name] = o.procs[it.name] || { name: it.name, qty: 0, billed: 0, collected: 0, prior: 0 };
        if (billedIn) o.procs[it.name].qty += it.qty;
        o.procs[it.name].billed += net; o.procs[it.name].collected += coll; o.procs[it.name].prior += prior;
      });
    });
    return [...out.values()].map(o => ({
      doctorId: o.doctorId, name: o.name, bills: o.bills.size, patients: o.patients.size,
      billed: money(o.billed), collected: money(o.collected),
      collectedPrior: money(o.prior), unpaid: money(o.unpaid),
      procedures: Object.values(o.procs).map(p => ({ name: p.name, qty: p.qty, billed: money(p.billed), collected: money(p.collected), prior: money(p.prior) }))
        .sort((a, b) => b.billed - a.billed)
    })).sort((a, b) => b.billed - a.billed);
  }

  /* ---------- the mock router ---------- */
  const err = (m) => { throw new Error(m); };
  window.__MOCK = async function (path, method = 'GET', body) {
    await new Promise(r => setTimeout(r, 40));                 // a touch of latency, like the real thing
    const [raw, qs] = path.split('?');
    const Q = new URLSearchParams(qs || '');
    const seg = raw.split('/').filter(Boolean);

    if (raw === '/auth/me') return { user: ME };
    if (raw === '/auth/login') { return { user: ME }; }
    if (raw === '/auth/logout') { location.reload(); return { ok: true }; }
    if (raw === '/auth/password') return { ok: true };

    if (raw === '/settings') {
      if (method === 'PUT') {
        Object.assign(SET, body.settings || {});
        (body.doctors || []).forEach((d, i) => {
          if (d.id) Object.assign(DOCS.find(x => x.id === d.id) || {}, d);
          else DOCS.push(Object.assign({ id: DOCS.length + 1, active: true, sort: i }, d));
        });
        (body.deleteDoctors || []).forEach(id => { const x = DOCS.findIndex(d => d.id === id); if (x >= 0) DOCS.splice(x, 1); });
        log('settings_update', {});
        return { clamped: null };
      }
      return { settings: SET, doctors: DOCS, counters: D.counters };
    }
    if (raw === '/procedures' && method === 'GET') return PROCS;
    if (raw === '/procedures' && method === 'POST') {
      const p = Object.assign({ id: PROCS.length + 1, active: true, gst: 18 }, body); PROCS.push(p); log('procedure_create', { name: p.name }); return p;
    }
    if (seg[0] === 'procedures' && seg[1] === 'bulk-price') {
      const list = PROCS.filter(p => body.category === 'all' || p.cat === body.category);
      list.forEach(p => { if (p.price) p.price = Math.round(p.price * (1 + (body.pct || 0) / 100) / body.roundTo) * body.roundTo; });
      log('bulk_price', { count: list.length }); return { count: list.length };
    }
    if (seg[0] === 'procedures' && seg[1] && method === 'PATCH') {
      const p = PROCS.find(x => x.id === Number(seg[1])) || err('Not found');
      if (body.price !== undefined && body.price !== p.price) log('price_change', { name: p.name, from: p.price, to: body.price });
      Object.assign(p, body); return p;
    }
    if (raw === '/patients' && method === 'GET') {
      const s = (Q.get('q') || '').toLowerCase();
      return (s ? D.patients.filter(p => (p.name || '').toLowerCase().includes(s) || (p.phone || '').includes(s) || (p.reg || '').toLowerCase().includes(s))
        : D.patients.slice().reverse()).slice(0, 50);
    }
    if (raw === '/patients' && method === 'POST') { const p = addPatient(body); log('patient_create', { name: p.name }); return p; }
    if (seg[0] === 'patients' && seg[1] && seg[2] === 'invoices') {
      return live().filter(i => i.patientId === Number(seg[1])).map(stamp).sort((a, b) => a.date.localeCompare(b.date));
    }
    if (seg[0] === 'patients' && seg[1] && method === 'GET') return D.patients.find(p => p.id === Number(seg[1])) || err('Not found');
    if (seg[0] === 'patients' && seg[1] && method === 'PATCH') {
      const p = D.patients.find(x => x.id === Number(seg[1])) || err('Not found');
      if (body.name && body.name !== p.name) log('patient_rename', { from: p.name, to: body.name });
      Object.assign(p, body); return p;
    }
    if (raw === '/invoices' && method === 'GET') {
      let l = live().map(stamp);
      const f = Q.get('from'), t = Q.get('to'), s = (Q.get('q') || '').toLowerCase(), st = Q.get('status');
      if (f) l = l.filter(i => i.date >= f);
      if (t) l = l.filter(i => i.date <= t);
      if (s) l = l.filter(i => String(i.no).toLowerCase().includes(s) || (i.pname || '').toLowerCase().includes(s)
        || (i.pphone || '').includes(s) || (i.preg || '').toLowerCase().includes(s));
      if (st === 'pending') l = l.filter(i => i.bal > 0.005);
      if (st === 'paid') l = l.filter(i => i.bal <= 0.005);
      return l.sort((a, b) => (b.date + b.id).localeCompare ? b.date.localeCompare(a.date) || b.id - a.id : 0).slice(0, Number(Q.get('limit')) || 300);
    }
    if (raw === '/invoices' && method === 'POST') {
      if (ME.role !== 'admin' && false) err('no');
      const inv = addInvoice(body); log('invoice_create', { total: inv.total }); return stamp(inv);
    }
    if (seg[0] === 'invoices' && seg[1] && seg[2] === 'payments' && method === 'POST') {
      const inv = D.invoices.find(i => i.id === Number(seg[1])) || err('Not found');
      if (inv.type !== 'bill') err('This is an estimate — convert it to a bill before taking payment');
      if (!(Number(body.amount) > 0)) err('Enter a payment amount greater than zero');
      inv.payments.push({
        id: seq.pay++, date: body.date || inv.date, amount: money(body.amount),
        mode: SET.modes.includes(body.mode) ? body.mode : SET.modes[0],
        ref: String(body.ref || '').replace(/[<>]/g, '').slice(0, 64)
      });
      log('payment_add', { amount: money(body.amount), mode: body.mode }); return stamp(inv);
    }
    if (seg[0] === 'invoices' && seg[1] && seg[2] === 'payments' && method === 'DELETE') {
      const inv = D.invoices.find(i => i.id === Number(seg[1])) || err('Not found');
      const k = inv.payments.findIndex(p => p.id === Number(seg[3]));
      if (k >= 0) { log('payment_delete', { amount: inv.payments[k].amount }); inv.payments.splice(k, 1); }
      return stamp(inv);
    }
    if (seg[0] === 'invoices' && seg[1] && seg[2] === 'void') {
      const inv = D.invoices.find(i => i.id === Number(seg[1])) || err('Not found');
      if (String(body.reason || '').trim().length < 3) err('Give a reason for cancelling');
      inv.voidedAt = new Date().toISOString(); inv.voidReason = body.reason;
      log('invoice_void', { no: inv.no, reason: body.reason }); return { ok: true };
    }
    if (seg[0] === 'invoices' && seg[1] && seg[2] === 'convert') {
      const inv = D.invoices.find(i => i.id === Number(seg[1])) || err('Not found');
      inv.type = 'bill'; inv.no = nextNo(); inv.date = day(0);
      log('estimate_convert', { no: inv.no }); return stamp(inv);
    }
    if (seg[0] === 'invoices' && seg[1] && method === 'GET') return stamp(D.invoices.find(i => i.id === Number(seg[1])) || err('Not found'));
    if (seg[0] === 'invoices' && seg[1] && method === 'PUT') {
      const inv = D.invoices.find(i => i.id === Number(seg[1])) || err('Not found');
      const before = inv.total;
      inv.date = body.date || inv.date; inv.no = body.no || inv.no; inv.doctorId = body.doctorId || inv.doctorId;
      inv.discType = body.discType; inv.discValue = body.discValue; inv.notes = body.notes || '';
      inv.patientId = body.patientId || inv.patientId;
      inv.items = (body.items || []).map(it => ({
        id: seq.item++, name: it.name, desc: it.desc || '', qty: Number(it.qty) || 0, rate: Number(it.rate) || 0,
        disc: Number(it.disc) || 0, taxable: !!it.taxable, gst: Number(it.gst) || 0, perTooth: !!it.perTooth,
        docId: it.docId || inv.doctorId
      }));
      stamp(inv); log('invoice_edit', { from: before, to: inv.total }); return inv;
    }
    if (raw.startsWith('/reports/doctors')) return doctorReport(Q.get('from'), Q.get('to'));
    /* must come BEFORE the /reports catch-all or the dashboard drill-down
       receives a report object where it expects a list of receipts */
    if (raw.startsWith('/reports/payments')) {
      const out = [];
      bills().forEach(i => i.payments.forEach(p => {
        if (!inRange(p.date, Q.get('from'), Q.get('to'))) return;
        out.push({
          id: p.id, date: p.date, mode: p.mode, ref: p.ref, amount: p.amount,
          invId: i.id, no: i.no, billDate: i.date, billTotal: i.total,
          pname: i.pname, preg: i.preg, pphone: i.pphone, enteredBy: 'demo'
        });
      }));
      return out.sort((a, b) => b.date.localeCompare(a.date));
    }
    if (raw.startsWith('/reports')) return reports(Q.get('from'), Q.get('to'));
    if (raw === '/users' && method === 'GET') return D.users;
    if (raw === '/users' && method === 'POST') { D.users.push({ id: D.users.length + 1, username: body.username, full_name: body.fullName || '', role: body.role, active: true, last_login: null }); log('user_create', { username: body.username }); return { id: D.users.length }; }
    if (seg[0] === 'users' && method === 'PATCH') { const u = D.users.find(x => x.id === Number(seg[1])); if (u) Object.assign(u, { role: body.role || u.role, active: typeof body.active === 'boolean' ? body.active : u.active }); log('user_update', {}); return { ok: true }; }
    if (raw === '/audit') return D.audit;
    if (raw === '/import') return { patients: 0, invoices: 0, skipped: 0, collisions: [], skippedBills: [] };
    if (raw === '/backup') return { note: 'not available in the demo' };
    err('Demo: ' + method + ' ' + raw + ' is not wired up');
  };

  /* ---------- demo banner + role switch ---------- */
  window.addEventListener('load', () => setTimeout(() => {
    const bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#12225c;color:#fff;padding:7px 12px;font:13px system-ui;z-index:200;display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap';
    bar.innerHTML = `<b>DEMO</b><span style="opacity:.85">Sample data, stored only in this browser tab — close it and everything resets. Nothing is sent anywhere.</span>
      <button id="dRole" style="padding:4px 10px;border-radius:7px;border:0;background:#0a7d78;color:#fff;font-weight:700;cursor:pointer">View as front-desk staff</button>`;
    document.body.appendChild(bar);
    document.getElementById('dRole').onclick = () => {
      ME = ME.role === 'admin'
        ? { id: 2, username: 'reception', role: 'staff', fullName: 'Front desk', mustChange: false }
        : { id: 1, username: 'admin', role: 'admin', fullName: 'Dr. Sijo P. Mathew', mustChange: false };
      S.user = ME; buildNav(); paintBrand(); location.hash = 'dash'; go('dash');
      document.getElementById('dRole').textContent = ME.role === 'admin' ? 'View as front-desk staff' : 'Back to admin view';
    };
  }, 900));
})();
