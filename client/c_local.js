/* ===========================================================
   OFFLINE BUILD — the same v2 app, storing everything in this
   browser (IndexedDB) instead of a server. Same screens, same
   printing, same reports. Take a backup every day.
   =========================================================== */
(function () {
  const DBN = 'hiklean_v2';
  let db = null;
  const idb = {
    open: () => new Promise((res, rej) => {
      const r = indexedDB.open(DBN, 1);
      r.onupgradeneeded = e => {
        const d = e.target.result;
        ['meta', 'patients', 'invoices', 'procedures'].forEach(s => {
          if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: s === 'meta' ? 'k' : 'id' });
        });
      };
      r.onsuccess = () => { db = r.result; res(db); };
      r.onerror = () => rej(r.error);
    }),
    all: (s) => new Promise((res, rej) => { const t = db.transaction(s, 'readonly').objectStore(s).getAll(); t.onsuccess = () => res(t.result || []); t.onerror = () => rej(t.error); }),
    put: (s, v) => new Promise((res, rej) => { const t = db.transaction(s, 'readwrite').objectStore(s).put(v); t.onsuccess = () => res(1); t.onerror = () => rej(t.error); }),
    putMany: (s, a) => new Promise((res, rej) => { const tx = db.transaction(s, 'readwrite'), st = tx.objectStore(s); a.forEach(v => st.put(v)); tx.oncomplete = () => res(1); tx.onerror = () => rej(tx.error); }),
    del: (s, k) => new Promise((res, rej) => { const t = db.transaction(s, 'readwrite').objectStore(s).delete(k); t.onsuccess = () => res(1); t.onerror = () => rej(t.error); }),
    clear: (s) => new Promise((res, rej) => { const t = db.transaction(s, 'readwrite').objectStore(s).clear(); t.onsuccess = () => res(1); t.onerror = () => rej(t.error); })
  };

  const M = { settings: null, doctors: [], counters: {}, users: [], audit: [], patients: [], invoices: [], procs: [], seq: {} };
  const money = v => Math.round((Number(v) || 0) * 100) / 100;
  const nowts = () => new Date().toISOString();
  const dayNow = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const isDay = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d ?? '')) && !isNaN(Date.parse(d));
  const err = m => { throw new Error(m); };
  const clean = r => String(r ?? '').replace(/[<>]/g, '').slice(0, 64);
  let ME = null;

  const DEF_SET = {
    clinicName: 'HI-KLEAN DENTAL CLINIC', line2: 'MULTI SPECIALITY DENTAL CLINIC & ROOT CANAL CENTRE',
    address: 'Goodshepherd Complex, Goodshepherd Road, Kottayam-1',
    phone: '+91 9400114449, +91 481 2562960, +91 9496357172',
    website: 'www.hikleandental.com', email: 'hikleanpolyclinic@gmail.com', gstin: '',
    logo: window.__LOGO__ || '', regPrefix: '2T ', footer: 'FOR Hi-KLEAN',
    terms: 'Fees once paid are non-refundable. Please bring this bill for follow-up visits.',
    showTerms: false, showWords: false, showSign: true, gstEnabled: false, defaultDoctorId: 1,
    modes: ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Cheque'], lastBackup: '', backupEvery: 3
  };
  const DEF_DOCS = [{
    id: 1, name: 'Dr. Sijo P. Mathew MDS', spec: '(Conservative Dentistry & Endodontics)',
    role_line: 'Chief Dental Surgeon & Endodontist', reg_no: '8982', sign_title: 'Chief Clinic Director', active: true, sort: 0
  }];

  async function sha(t) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('hk2:' + t));
    return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
  }
  const saveMeta = () => idb.put('meta', {
    k: 'app', settings: M.settings, doctors: M.doctors, counters: M.counters,
    users: M.users, audit: M.audit.slice(0, 500), seq: M.seq
  });
  const log = (action, detail) => {
    M.audit.unshift({ id: (M.audit[0]?.id || 0) + 1, at: nowts(), username: (ME || {}).username || '—', action, entity: '', entity_id: '', detail: detail || {} });
    if (M.audit.length > 500) M.audit.length = 500;
  };
  const nextId = (k) => (M.seq[k] = (M.seq[k] || 0) + 1);

  async function boot() {
    await idb.open();
    try { navigator.storage && navigator.storage.persist && await navigator.storage.persist(); } catch { }
    const meta = (await idb.all('meta')).find(x => x.k === 'app');
    M.settings = Object.assign({}, DEF_SET, meta?.settings || {});
    M.doctors = meta?.doctors?.length ? meta.doctors : DEF_DOCS;
    M.counters = Object.assign({ bill_no: 168, reg_no: 12681 }, meta?.counters || {});
    M.users = meta?.users || [];
    M.audit = meta?.audit || [];
    M.seq = meta?.seq || {};
    M.patients = await idb.all('patients');
    M.invoices = await idb.all('invoices');
    M.procs = await idb.all('procedures');
    if (!M.procs.length) { M.procs = (window.__PROCS__ || []).map(p => ({ ...p })); await idb.putMany('procedures', M.procs); }
    if (!M.seq.p) M.seq.p = Math.max(0, ...M.patients.map(p => p.id));
    if (!M.seq.i) M.seq.i = Math.max(0, ...M.invoices.map(i => i.id));
    await saveMeta();
  }

  /* ---------- computed ---------- */
  function stamp(inv) {
    const p = M.patients.find(x => x.id === inv.patientId) || {};
    const c = calc({ items: inv.items, discType: inv.discType, discValue: inv.discValue, gstOn: inv.gstOn, payments: inv.payments });
    return Object.assign({}, inv, {
      sub: c.sub, disc: c.disc, tax: c.tax, total: c.total, paid: c.paid, bal: c.bal,
      pname: p.name, preg: p.reg, pphone: p.phone,
      pat: { name: p.name, reg: p.reg, phone: p.phone, age: p.age, sex: p.sex, address: p.address }
    });
  }
  const liveInv = () => M.invoices.filter(i => !i.voidedAt).map(stamp);
  const billsOnly = () => liveInv().filter(i => i.type === 'bill');
  const maxIssued = () => Math.max(0, ...M.invoices.filter(i => i.type === 'bill')
    .map(i => { const n = String(i.no).replace(/\D/g, ''); return n && n.length <= 8 ? parseInt(n, 10) : 0; }));
  const maxReg = () => Math.max(0, ...M.patients
    .map(p => { const n = String(p.reg || '').replace(/\D/g, ''); return n && n.length <= 8 ? parseInt(n, 10) : 0; }));
  function nextBillNo() {
    for (let k = 0; k < 500; k++) {
      M.counters.bill_no = Math.max(Number(M.counters.bill_no) || 0, maxIssued()) + 1;
      const no = String(M.counters.bill_no);
      if (!M.invoices.some(i => i.type === 'bill' && String(i.no) === no)) return no;
    }
    return String(Date.now());
  }
  function nextReg() {
    for (let k = 0; k < 500; k++) {
      M.counters.reg_no = Math.max(Number(M.counters.reg_no) || 0, maxReg()) + 1;
      const r = (M.settings.regPrefix || '') + M.counters.reg_no;
      if (!M.patients.some(p => p.reg === r)) return r;
    }
    return (M.settings.regPrefix || '') + Date.now();
  }
  const inR = (d, f, t) => (!f || d >= f) && (!t || d <= t);

  function reports(from, to) {
    const bs = billsOnly().filter(i => inR(i.date, from, to));
    const modes = {}, daily = {}, top = {}, docs = {};
    let collected = 0;
    billsOnly().forEach(i => (i.payments || []).forEach(p => {
      if (!inR(p.date, from, to)) return;
      collected += p.amount;
      modes[p.mode] = (modes[p.mode] || 0) + p.amount;
      daily[p.date] = (daily[p.date] || 0) + p.amount;
      i.items.forEach(it => {
        const n = (M.doctors.find(d => d.id === it.docId) || {}).name || '(not assigned)';
        docs[n] = (docs[n] || 0) + (i.sub ? money(it.amount / i.sub * p.amount) : money(p.amount / i.items.length));
      });
    }));
    bs.forEach(i => i.items.forEach(t => {
      top[t.name] = top[t.name] || { n: 0, total: 0 };
      top[t.name].n += Number(t.qty) || 0; top[t.name].total += t.amount;
    }));
    const dues = billsOnly().filter(i => i.bal > 0.005).sort((a, b) => b.bal - a.bal)
      .map(i => ({ id: i.id, no: i.no, date: i.date, name: i.pname, phone: i.pphone, pid: i.patientId, bal: i.bal }));
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
    billsOnly().forEach(i => {
      const paidIn = (i.payments || []).filter(p => inR(p.date, from, to)).reduce((a, p) => a + p.amount, 0);
      const billedIn = inR(i.date, from, to);
      if (!billedIn && !paidIn) return;
      i.items.forEach(it => {
        const doc = M.doctors.find(d => d.id === it.docId) || { id: 0, name: '(not assigned)' };
        if (!out.has(doc.id)) out.set(doc.id, { doctorId: doc.id, name: doc.name, billed: 0, collected: 0, prior: 0, unpaid: 0, bills: new Set(), patients: new Set(), procs: {} });
        const o = out.get(doc.id);
        const share = i.sub ? it.amount / i.sub : 1 / (i.items.length || 1);
        const net = billedIn ? money(share * i.total) : 0;
        const coll = money(share * paidIn);
        // collection that settles a bill raised OUTSIDE the window, and what is still
        // owed on the bills raised INSIDE it — mirrors src/server.js doctorReport()
        const prior = billedIn ? 0 : coll;
        const unpaid = billedIn ? money(share * (i.total - (i.payments || []).reduce((a, x) => a + x.amount, 0))) : 0;
        o.billed += net; o.collected += coll; o.prior += prior; o.unpaid += unpaid;
        if (billedIn) { o.bills.add(i.id); o.patients.add(i.patientId); }
        o.procs[it.name] = o.procs[it.name] || { name: it.name, qty: 0, billed: 0, collected: 0, prior: 0 };
        if (billedIn) o.procs[it.name].qty += Number(it.qty) || 0;
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
  const csvEsc = v => `"${String(v ?? '').replace(/^[=+\-@]/, "'$&").replace(/"/g, '""')}"`;

  /* ---------- the local backend ---------- */
  window.__MOCK = async function (path, method = 'GET', body) {
    if (!db) await boot();
    const [raw, qs] = path.split('?');
    const Q = new URLSearchParams(qs || '');
    const seg = raw.split('/').filter(Boolean);
    const admin = () => { if (!ME || ME.role !== 'admin') err('Admin access only'); };

    /* auth */
    if (raw === '/auth/me') {
      if (!M.users.length) { ME = { id: 0, username: 'clinic', role: 'admin', fullName: '', mustChange: false }; return { user: ME }; }
      if (!ME) { const s = sessionStorage.getItem('hk2_user'); if (s) ME = JSON.parse(s); }
      if (!ME) err('Not signed in');
      return { user: ME };
    }
    if (raw === '/auth/login') {
      const u = String(body.username || '').trim().toLowerCase();
      const h = await sha(String(body.password || ''));
      const hit = M.users.find(x => x.u === u && x.h === h && x.active !== false);
      if (!hit) { log('login_failed', { u }); await saveMeta(); err('Wrong username or password'); }
      ME = { id: hit.id, username: hit.u, role: hit.role, fullName: hit.name || '', mustChange: !!hit.mustChange };
      sessionStorage.setItem('hk2_user', JSON.stringify(ME));
      log('login', {}); await saveMeta();
      return { user: ME };
    }
    if (raw === '/auth/logout') { sessionStorage.removeItem('hk2_user'); ME = null; return { ok: true }; }
    if (raw === '/auth/password') {
      const me = M.users.find(x => x.id === ME.id) || err('Not found');
      if (me.h !== await sha(String(body.current || ''))) err('Current password is wrong');
      if (String(body.next || '').length < 8) err('New password must be at least 8 characters');
      me.h = await sha(String(body.next)); me.mustChange = false;
      ME.mustChange = false; sessionStorage.setItem('hk2_user', JSON.stringify(ME));
      log('password_change', {}); await saveMeta(); return { ok: true };
    }

    /* settings + doctors */
    if (raw === '/settings') {
      if (method === 'PUT') {
        admin();
        let clamped = null;
        if (body.counters) {
          for (const [k, val] of Object.entries(body.counters)) {
            if (!['bill_no', 'reg_no'].includes(k)) continue;
            let n = Math.floor(Number(val));
            if (!Number.isFinite(n) || n < 0) err('Numbering must be a whole number');
            if (n > 99999999) err('That number is too large');
            const floor = k === 'bill_no' ? maxIssued() : maxReg();
            if (n < floor) { clamped = { key: k, asked: n, used: floor }; n = floor; }
            M.counters[k] = n;
          }
        }
        Object.assign(M.settings, body.settings || {});
        (body.doctors || []).forEach((d, i) => {
          if (d.id) { const x = M.doctors.find(y => y.id === d.id); if (x) Object.assign(x, d, { sort: i }); }
          else M.doctors.push(Object.assign({ id: Math.max(0, ...M.doctors.map(y => y.id)) + 1, active: true }, d, { sort: i }));
        });
        (body.deleteDoctors || []).forEach(id => {
          const used = M.invoices.some(i => i.doctorId === id || (i.items || []).some(it => it.docId === id));
          const x = M.doctors.findIndex(d => d.id === id);
          if (x < 0) return;
          if (used) M.doctors[x].active = false; else M.doctors.splice(x, 1);
        });
        log('settings_update', clamped ? { clamped } : {});
        await saveMeta();
        return { clamped };
      }
      return {
        settings: M.settings, doctors: M.doctors,
        counters: { bill_no: Math.max(M.counters.bill_no || 0, maxIssued()), reg_no: Math.max(M.counters.reg_no || 0, maxReg()) }
      };
    }

    /* procedures */
    if (raw === '/procedures' && method === 'GET') return M.procs;
    if (raw === '/procedures' && method === 'POST') {
      admin();
      const p = Object.assign({ id: 'p' + nextId('proc'), active: true, gst: 18, hist: [] }, body);
      M.procs.push(p); await idb.put('procedures', p); log('procedure_create', { name: p.name }); await saveMeta(); return p;
    }
    if (seg[0] === 'procedures' && seg[1] === 'bulk-price') {
      admin();
      const list = M.procs.filter(p => body.category === 'all' || p.cat === body.category);
      const r = Math.max(1, Number(body.roundTo) || 1);
      list.forEach(p => { if (!p.price) return; p.hist = (p.hist || []).concat([{ price: p.price, on: dayNow() }]); p.price = Math.round(p.price * (1 + (Number(body.pct) || 0) / 100) / r) * r; });
      await idb.putMany('procedures', list); log('bulk_price', { count: list.length, pct: body.pct }); await saveMeta();
      return { count: list.length };
    }
    if (seg[0] === 'procedures' && seg[1] && method === 'PATCH') {
      admin();
      const p = M.procs.find(x => String(x.id) === seg[1]) || err('Not found');
      if (body.price !== undefined && Number(body.price) !== p.price) {
        p.hist = (p.hist || []).concat([{ price: p.price, on: dayNow() }]);
        log('price_change', { name: p.name, from: p.price, to: Number(body.price) });
      }
      Object.assign(p, body); await idb.put('procedures', p); await saveMeta(); return p;
    }

    /* patients */
    if (raw === '/patients' && method === 'GET') {
      const s = (Q.get('q') || '').toLowerCase();
      const l = s ? M.patients.filter(p => (p.name || '').toLowerCase().includes(s) || (p.phone || '').includes(s) || (p.reg || '').toLowerCase().includes(s))
        : M.patients.slice().sort((a, b) => b.id - a.id);
      return l.slice(0, 50);
    }
    if (raw === '/patients' && method === 'POST') {
      if (!String(body.name || '').trim()) err('Name required');
      const p = {
        id: nextId('p'), reg: String(body.reg || '').trim() || nextReg(), name: String(body.name).trim(),
        phone: body.phone || '', age: body.age || '', sex: body.sex || '', address: body.address || '',
        note: body.note || '', createdAt: nowts()
      };
      if (M.patients.some(x => x.reg === p.reg)) p.reg = nextReg();
      M.patients.push(p); await idb.put('patients', p); log('patient_create', { name: p.name, reg: p.reg }); await saveMeta();
      return p;
    }
    if (seg[0] === 'patients' && seg[1] && seg[2] === 'invoices')
      return liveInv().filter(i => i.patientId === Number(seg[1])).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
    if (seg[0] === 'patients' && seg[1] && method === 'GET') return M.patients.find(p => p.id === Number(seg[1])) || err('Not found');
    if (seg[0] === 'patients' && seg[1] && method === 'PATCH') {
      const p = M.patients.find(x => x.id === Number(seg[1])) || err('Not found');
      if (body.name && body.name !== p.name) log('patient_rename', { from: p.name, to: body.name });
      Object.assign(p, body);
      if (!String(p.reg || '').trim()) p.reg = nextReg();
      await idb.put('patients', p); await saveMeta(); return p;
    }

    /* invoices */
    if (raw === '/invoices' && method === 'GET') {
      let l = liveInv();
      const f = Q.get('from'), t = Q.get('to'), s = (Q.get('q') || '').toLowerCase(), st = Q.get('status');
      if (f) l = l.filter(i => i.date >= f);
      if (t) l = l.filter(i => i.date <= t);
      if (s) l = l.filter(i => String(i.no).toLowerCase().includes(s) || (i.pname || '').toLowerCase().includes(s)
        || (i.pphone || '').includes(s) || (i.preg || '').toLowerCase().includes(s)
        || i.items.some(x => (x.name || '').toLowerCase().includes(s)));
      if (st === 'pending') l = l.filter(i => i.bal > 0.005);
      if (st === 'paid') l = l.filter(i => i.bal <= 0.005);
      return l.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, Number(Q.get('limit')) || 300);
    }
    if (raw === '/invoices' && method === 'POST') {
      if (!body.patientId) err('Patient required');
      if (!isDay(body.date)) err('Bill date is not a valid date');
      if (!(body.items || []).length) err('Add at least one treatment');
      const modes = M.settings.modes || ['Cash'];
      const inv = {
        id: nextId('i'), type: body.type === 'estimate' ? 'estimate' : 'bill',
        no: body.type === 'estimate' ? 'EST-' + nextId('est') : (String(body.no || '').trim() || nextBillNo()),
        date: body.date, patientId: body.patientId, doctorId: body.doctorId || (M.doctors[0] || {}).id,
        discType: body.discType === 'pct' ? 'pct' : 'amt', discValue: Number(body.discValue) || 0,
        notes: body.notes || '', gstOn: !!body.gstOn, voidedAt: null, createdAt: nowts(),
        createdBy: (ME || {}).username || '',
        items: body.items.map(it => ({
          id: nextId('it'), pid: it.pid || null, name: String(it.name || '').slice(0, 200), desc: String(it.desc || '').slice(0, 200),
          qty: Math.max(0, Number(it.qty) || 0), rate: Math.max(0, Number(it.rate) || 0), disc: Math.max(0, Number(it.disc) || 0),
          taxable: !!it.taxable, gst: Number(it.gst) || 0, perTooth: !!it.perTooth, docId: it.docId || body.doctorId
        })),
        payments: body.type === 'estimate' ? [] : (body.payments || []).filter(p => Number(p.amount) > 0).map(p => ({
          id: nextId('pay'), date: isDay(p.date) ? p.date : body.date,
          mode: modes.includes(p.mode) ? p.mode : modes[0], amount: money(p.amount), ref: clean(p.ref)
        }))
      };
      if (M.invoices.some(x => x.type === 'bill' && String(x.no) === String(inv.no) && inv.type === 'bill')) inv.no = nextBillNo();
      M.invoices.push(inv); await idb.put('invoices', inv);
      log('invoice_create', { no: inv.no, total: stamp(inv).total }); await saveMeta();
      return stamp(inv);
    }
    if (seg[0] === 'invoices' && seg[1] && seg[2] === 'payments' && method === 'POST') {
      const inv = M.invoices.find(i => i.id === Number(seg[1])) || err('Not found');
      if (inv.voidedAt) err('This bill is cancelled');
      if (inv.type !== 'bill') err('This is an estimate — convert it to a bill before taking payment');
      if (!(Number(body.amount) > 0)) err('Enter a payment amount greater than zero');
      const modes = M.settings.modes || ['Cash'];
      inv.payments.push({
        id: nextId('pay'), date: isDay(body.date) ? body.date : inv.date,
        mode: modes.includes(body.mode) ? body.mode : modes[0], amount: money(body.amount), ref: clean(body.ref)
      });
      await idb.put('invoices', inv); log('payment_add', { no: inv.no, amount: money(body.amount), mode: body.mode }); await saveMeta();
      return stamp(inv);
    }
    if (seg[0] === 'invoices' && seg[1] && seg[2] === 'payments' && method === 'DELETE') {
      admin();
      const inv = M.invoices.find(i => i.id === Number(seg[1])) || err('Not found');
      const k = inv.payments.findIndex(p => p.id === Number(seg[3]));
      if (k >= 0) { log('payment_delete', { no: inv.no, amount: inv.payments[k].amount }); inv.payments.splice(k, 1); }
      await idb.put('invoices', inv); await saveMeta(); return stamp(inv);
    }
    if (seg[0] === 'invoices' && seg[1] && seg[2] === 'void') {
      admin();
      const inv = M.invoices.find(i => i.id === Number(seg[1])) || err('Not found');
      if (String(body.reason || '').trim().length < 3) err('Give a reason for cancelling');
      inv.voidedAt = nowts(); inv.voidReason = String(body.reason).slice(0, 200);
      await idb.put('invoices', inv); log('invoice_void', { no: inv.no, reason: inv.voidReason }); await saveMeta();
      return { ok: true };
    }
    if (seg[0] === 'invoices' && seg[1] && seg[2] === 'convert') {
      const inv = M.invoices.find(i => i.id === Number(seg[1])) || err('Not found');
      if (inv.type !== 'estimate') err('Already a bill');
      inv.type = 'bill'; inv.no = nextBillNo(); inv.date = dayNow();
      await idb.put('invoices', inv); log('estimate_convert', { no: inv.no }); await saveMeta(); return stamp(inv);
    }
    if (seg[0] === 'invoices' && seg[1] && method === 'GET') return stamp(M.invoices.find(i => i.id === Number(seg[1])) || err('Not found'));
    if (seg[0] === 'invoices' && seg[1] && method === 'PUT') {
      const inv = M.invoices.find(i => i.id === Number(seg[1])) || err('Not found');
      if (inv.voidedAt) err('This bill is cancelled and cannot be edited');
      if (body.date !== undefined && !isDay(body.date)) err('Bill date is not a valid date');
      const before = stamp(inv).total;
      const newNo = String(body.no || inv.no).trim();
      if (newNo !== String(inv.no) && M.invoices.some(x => x.id !== inv.id && x.type === 'bill' && String(x.no) === newNo)) err('Bill number ' + newNo + ' is already used');
      Object.assign(inv, {
        no: newNo, date: body.date || inv.date, patientId: body.patientId || inv.patientId,
        doctorId: body.doctorId || inv.doctorId, discType: body.discType === 'pct' ? 'pct' : 'amt',
        discValue: Number(body.discValue) || 0, notes: body.notes || '',
        items: (body.items || []).map(it => ({
          id: nextId('it'), pid: it.pid || null, name: String(it.name || '').slice(0, 200), desc: String(it.desc || '').slice(0, 200),
          qty: Math.max(0, Number(it.qty) || 0), rate: Math.max(0, Number(it.rate) || 0), disc: Math.max(0, Number(it.disc) || 0),
          taxable: !!it.taxable, gst: Number(it.gst) || 0, perTooth: !!it.perTooth, docId: it.docId || body.doctorId
        }))
      });
      await idb.put('invoices', inv); log('invoice_edit', { no: inv.no, from: before, to: stamp(inv).total }); await saveMeta();
      return stamp(inv);
    }

    /* reports */
    if (raw.startsWith('/reports/doctors.csv')) {
      admin();
      const data = doctorReport(Q.get('from'), Q.get('to'));
      const rows = [['Doctor', 'Procedure', 'Times', 'Billed', 'Collected'].map(csvEsc).join(',')];
      data.forEach(d => {
        d.procedures.forEach(p => rows.push([d.name, p.name, p.qty, p.billed, p.collected].map(csvEsc).join(',')));
        rows.push([d.name, 'TOTAL', '', d.billed, d.collected].map(csvEsc).join(','));
      });
      return { __file: 'doctor_report_' + Q.get('from') + '_to_' + Q.get('to') + '.csv', text: rows.join('\n') };
    }
    if (raw.startsWith('/reports/daybook.csv')) {
      admin();
      const rows = [['Date', 'Bill No', 'Patient', 'Mode', 'Ref', 'Amount', 'Doctor'].map(csvEsc).join(',')];
      billsOnly().forEach(i => (i.payments || []).forEach(p => {
        if (!inR(p.date, Q.get('from'), Q.get('to'))) return;
        rows.push([p.date, i.no, i.pname, p.mode, p.ref, p.amount, (M.doctors.find(d => d.id === i.doctorId) || {}).name || ''].map(csvEsc).join(','));
      }));
      return { __file: 'daybook_' + Q.get('from') + '_to_' + Q.get('to') + '.csv', text: rows.join('\n') };
    }
    if (raw.startsWith('/reports/doctors')) { admin(); return doctorReport(Q.get('from'), Q.get('to')); }
    /* receipt-level list behind the "Collected" tile — must come BEFORE the
       /reports catch-all or the dashboard drill-down gets a report object */
    if (raw.startsWith('/reports/payments')) {
      admin();
      const out = [];
      billsOnly().forEach(i => (i.payments || []).forEach(p => {
        if (!inR(p.date, Q.get('from'), Q.get('to'))) return;
        out.push({
          id: p.id, date: p.date, mode: p.mode, ref: p.ref, amount: p.amount,
          invId: i.id, no: i.no, billDate: i.date, billTotal: i.total,
          pname: i.pname, preg: i.preg, pphone: i.pphone, enteredBy: ''
        });
      }));
      return out.sort((a, b) => b.date.localeCompare(a.date) || (b.id > a.id ? 1 : -1));
    }
    if (raw.startsWith('/reports')) { admin(); return reports(Q.get('from'), Q.get('to')); }

    /* users */
    if (raw === '/users' && method === 'GET') {
      admin();
      return M.users.map(u => ({ id: u.id, username: u.u, full_name: u.name || '', role: u.role, active: u.active !== false, last_login: u.last || null }));
    }
    if (raw === '/users' && method === 'POST') {
      if (M.users.length) admin();
      const u = String(body.username || '').trim().toLowerCase();
      if (!u) err('Username required');
      if (String(body.password || '').length < 8) err('Password must be at least 8 characters');
      if (M.users.some(x => x.u === u)) err('That username already exists');
      // the very first user typed their own password, so do not immediately ask them to change it
      const first = M.users.length === 0;
      M.users.push({
        id: Math.max(0, ...M.users.map(x => x.id)) + 1, u, h: await sha(String(body.password)),
        name: body.fullName || '', role: first ? 'admin' : (body.role === 'admin' ? 'admin' : 'staff'),
        active: true, mustChange: !first
      });
      log('user_create', { username: u, role: body.role }); await saveMeta(); return { id: M.users.length };
    }
    if (seg[0] === 'users' && seg[1] && method === 'PATCH') {
      admin();
      const u = M.users.find(x => x.id === Number(seg[1])) || err('Not found');
      const admins = M.users.filter(x => x.role === 'admin' && x.active !== false && x.id !== u.id).length;
      if (admins === 0 && (body.role === 'staff' || body.active === false)) err('Keep at least one active admin');
      if (body.password) {
        if (String(body.password).length < 8) err('Password must be at least 8 characters');
        u.h = await sha(String(body.password)); u.mustChange = true;
      }
      if (body.role) u.role = body.role;
      if (typeof body.active === 'boolean') u.active = body.active;
      if (body.fullName !== undefined) u.name = body.fullName;
      log('user_update', { username: u.u }); await saveMeta(); return { ok: true };
    }
    if (raw === '/audit') { admin(); return M.audit; }

    /* backup / restore */
    if (raw === '/backup') {
      admin();
      M.settings.lastBackup = nowts(); await saveMeta();
      return {
        __file: 'hiklean-backup-' + dayNow() + '.json',
        text: JSON.stringify({
          _app: 'hiklean-local-v2', _at: nowts(), settings: M.settings, doctors: M.doctors,
          counters: M.counters, users: M.users, procedures: M.procs, patients: M.patients, invoices: M.invoices
        })
      };
    }
    if (raw === '/import') {
      admin();
      const d = body || {};
      // a v2 backup replaces everything; a v1 (old single-file app) backup is merged in
      if (d._app === 'hiklean-local-v2') {
        for (const s of ['patients', 'invoices', 'procedures']) await idb.clear(s);
        M.patients = d.patients || []; M.invoices = d.invoices || []; M.procs = d.procedures || [];
        M.settings = Object.assign({}, DEF_SET, d.settings || {});
        M.doctors = d.doctors?.length ? d.doctors : DEF_DOCS;
        M.counters = d.counters || M.counters; M.users = d.users || M.users;
        M.seq.p = Math.max(0, ...M.patients.map(p => p.id)); M.seq.i = Math.max(0, ...M.invoices.map(i => i.id));
        await idb.putMany('patients', M.patients); await idb.putMany('invoices', M.invoices); await idb.putMany('procedures', M.procs);
        log('restore', { patients: M.patients.length, invoices: M.invoices.length }); await saveMeta();
        return { patients: M.patients.length, invoices: M.invoices.length, skipped: 0, collisions: [], skippedBills: [], restored: true };
      }
      if (!Array.isArray(d.patients) || !Array.isArray(d.invoices)) err('That file is not a Hi-Klean backup');
      const map = new Map(); const collisions = []; const skippedBills = [];
      let np = 0, ni = 0, skipped = 0;
      for (const p of d.patients) {
        if (!p || typeof p !== 'object' || p.id === undefined || !String(p.name || '').trim()) { skipped++; continue; }
        const exist = p.reg ? M.patients.find(x => x.reg === p.reg) : null;
        if (exist && (exist.name || '').trim().toLowerCase() === String(p.name).trim().toLowerCase()) { map.set(p.id, exist.id); np++; continue; }
        if (exist) collisions.push({ reg: p.reg, existing: exist.name, inFile: p.name });
        const np2 = {
          id: nextId('p'), reg: exist || !p.reg ? nextReg() : p.reg, name: String(p.name).trim(),
          phone: p.phone || '', age: p.age || '', sex: p.sex || '', address: p.address || '', note: p.note || '', createdAt: nowts()
        };
        M.patients.push(np2); await idb.put('patients', np2); map.set(p.id, np2.id); np++;
      }
      const modes = M.settings.modes || ['Cash'];
      for (const inv of d.invoices) {
        const pid = inv && map.get(inv.patientId);
        if (!pid || !Array.isArray(inv.items) || !inv.items.length || !isDay(inv.date)) { skipped++; continue; }
        if (inv.type !== 'estimate' && M.invoices.some(x => x.type === 'bill' && String(x.no) === String(inv.no))) { skippedBills.push(String(inv.no)); skipped++; continue; }
        const n = {
          id: nextId('i'), type: inv.type === 'estimate' ? 'estimate' : 'bill', no: String(inv.no || nextBillNo()),
          date: inv.date, patientId: pid, doctorId: (M.doctors[0] || {}).id,
          discType: inv.discType === 'pct' ? 'pct' : 'amt', discValue: Number(inv.discValue) || 0,
          notes: inv.notes || '', gstOn: !!inv.gstOn,
          voidedAt: inv.voided || inv.voidedAt ? nowts() : null,
          voidReason: inv.voided || inv.voidedAt ? (inv.voidReason || 'cancelled in the old app') : null,
          createdAt: nowts(), createdBy: 'import',
          items: inv.items.map(it => ({
            id: nextId('it'), name: it.name || '', desc: it.desc || '', qty: Number(it.qty) || 0,
            rate: Number(it.rate) || 0, disc: Number(it.disc) || 0, taxable: !!it.taxable,
            gst: Number(it.gst) || 0, perTooth: !!it.perTooth, docId: (M.doctors[0] || {}).id
          })),
          payments: (inv.payments || []).filter(p => Number(p.amount) > 0).map(p => ({
            id: nextId('pay'), date: isDay(p.date) ? p.date : inv.date,
            mode: modes.includes(p.mode) ? p.mode : modes[0], amount: money(p.amount), ref: clean(p.ref)
          }))
        };
        M.invoices.push(n); await idb.put('invoices', n); ni++;
      }
      M.counters.bill_no = Math.max(M.counters.bill_no || 0, maxIssued());
      log('import', { patients: np, invoices: ni, skipped }); await saveMeta();
      return { patients: np, invoices: ni, skipped, collisions, skippedBills: skippedBills.slice(0, 20) };
    }
    err('Not available in the offline version: ' + method + ' ' + raw);
  };

  /* ---------- downloads + backup nag ---------- */
  window.__DL = function (data) {
    const b = new Blob([data.text], { type: data.__file.endsWith('.csv') ? 'text/csv' : 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = data.__file;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  window.addEventListener('load', () => setTimeout(() => {
    const last = (M.settings || {}).lastBackup;
    const days = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : 999;
    if (days < ((M.settings || {}).backupEvery || 3)) return;
    if (!M.invoices.length) return;
    const bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#b45309;color:#fff;padding:9px 14px;font:13.5px system-ui;z-index:200;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap';
    bar.innerHTML = `<b>Backup reminder</b><span>${last ? 'Last backup was ' + days + ' days ago.' : 'You have never taken a backup.'}
      All data is inside this browser — if the computer dies, it dies with it.</span>
      <button id="nagBk" style="padding:5px 12px;border-radius:7px;border:0;background:#fff;color:#b45309;font-weight:700;cursor:pointer">Download backup now</button>
      <button id="nagX" style="background:none;border:0;color:#fff;cursor:pointer;font-size:17px">&times;</button>`;
    document.body.appendChild(bar);
    document.getElementById('nagBk').onclick = async () => { window.__DL(await window.__MOCK('/backup')); bar.remove(); };
    document.getElementById('nagX').onclick = () => bar.remove();
  }, 1500));
})();
