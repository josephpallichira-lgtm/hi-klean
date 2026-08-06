/* ===========================================================
   Hi-Klean Dental Billing — hosted client
   Talks to the API. No patient data is stored in the browser.
   =========================================================== */
'use strict';
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const el = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const inr = (v) => '₹' + (Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0 = (v) => '₹' + Math.round(Number(v) || 0).toLocaleString('en-IN');
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const dmy = (iso) => { if (!iso) return ''; const p = String(iso).slice(0, 10).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; };
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
function toast(msg, bad) { const t = $('#toast'); t.textContent = msg; t.className = 'on' + (bad ? ' bad' : ''); clearTimeout(t._t); t._t = setTimeout(() => t.className = '', 3000); }
function numWords(num) {
  num = Math.round(Number(num) || 0);
  if (num < 0) return 'Minus ' + numWords(-num);
  if (!num) return 'Zero Rupees Only';
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = n => n < 20 ? a[n] : b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '');
  const three = n => (n > 99 ? a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' : '') : '') + (n % 100 ? two(n % 100) : '');
  let s = '', cr = Math.floor(num / 10000000); num %= 10000000;
  const lk = Math.floor(num / 100000); num %= 100000;
  const th = Math.floor(num / 1000); num %= 1000;
  if (cr) s += three(cr) + ' Crore ';
  if (lk) s += three(lk) + ' Lakh ';
  if (th) s += three(th) + ' Thousand ';
  if (num) s += three(num);
  return s.trim().replace(/\s+/g, ' ') + ' Rupees Only';
}

/* ---------- API ---------- */
let busy = 0;
function bar(on) {
  busy += on ? 1 : -1;
  const b = $('#bar');
  if (busy > 0 && !b) document.body.appendChild(el('<div id="bar" class="saving"></div>'));
  if (busy <= 0 && b) b.remove();
}
async function api(path, method = 'GET', body) {
  // offline build: a local backend replaces the server (works from a file:// AND from a static web host)
  if (typeof window.__MOCK === 'function' && (window.__LOCAL_ONLY__ || location.protocol === 'file:'))
    return window.__MOCK(path, method, body);
  bar(1);
  try {
    const r = await fetch('/api' + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'hk' },
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (r.status === 401 && !path.startsWith('/auth/')) {
      S.user = null; showLogin('Your session ended. Please sign in again.'); throw new Error('Not signed in');
    }
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('json') ? await r.json() : await r.text();
    if (!r.ok) throw new Error(data?.error || ('Request failed (' + r.status + ')'));
    return data;
  } catch (e) {
    if (e.message === 'Failed to fetch') throw new Error('Cannot reach the server — check the internet connection');
    throw e;
  } finally { bar(0); }
}
const safeLogo = (l) => (typeof l === 'string' && /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(l)) ? l : '';
/** one place decides how a balance is shown — an overpayment must never read as "Paid" */
const balTag = (bal, wide) => bal > 0.005 ? `<span class="tag r">${wide ? 'Balance ' : ''}${inr(bal)}</span>`
  : bal < -0.005 ? `<span class="tag y">Advance ${inr(-bal)}</span>`
  : `<span class="tag g">${wide ? 'Fully paid' : 'Paid'}</span>`;
const S = { user: null, set: {}, doctors: [], procs: [], counters: {}, route: 'dash' };
const isAdmin = () => S.user?.role === 'admin';
const docOf = (id) => S.doctors.find(d => d.id === id) || S.doctors.find(d => d.id === S.set.defaultDoctorId) || S.doctors[0] || { name: '' };
/* The doctor whose name is printed on EVERY bill, estimate and treatment
   summary. It is deliberately independent of who actually treated the patient —
   the treating doctor is still recorded on each line for the doctor report.
   Falls back to the first doctor on record so a deleted or deactivated entry can
   never leave a bill with a blank letterhead. */
const billingDoctor = () => S.doctors.find(d => d.id === S.set.defaultDoctorId) || S.doctors[0] || { name: '' };

/* ---------- modal ---------- */
function modal(title, bodyHTML, footHTML, wide) {
  const m = el(`<div class="mask"><div class="modal ${wide ? 'wide' : ''}">
    <div class="mh"><h3>${esc(title)}</h3><button class="x">&times;</button></div>
    <div class="mb">${bodyHTML}</div>${footHTML ? `<div class="mf">${footHTML}</div>` : ''}</div></div>`);
  $('#modal').innerHTML = ''; $('#modal').appendChild(m);
  m.querySelector('.x').onclick = closeModal;
  m.onclick = e => { if (e.target === m) closeModal(); };
  document.onkeydown = e => { if (e.key === 'Escape') closeModal(); };
  return m;
}
const closeModal = () => { $('#modal').innerHTML = ''; document.onkeydown = null; };
function confirmBox(msg, onYes, yesLabel) {
  const m = modal('Please confirm', `<p style="margin:0">${msg}</p>`,
    `<button class="btn" id="cno">Cancel</button><button class="btn d" id="cyes">${esc(yesLabel || 'Yes')}</button>`);
  $('#cno', m).onclick = closeModal;
  $('#cyes', m).onclick = () => { closeModal(); onYes(); };
}

/* ---------- money maths (display only — the server is authoritative) ---------- */
function calc(inv) {
  let sub = 0;
  (inv.items || []).forEach(it => {
    const gross = (Number(it.qty) || 0) * (Number(it.rate) || 0);
    let d = Number(it.disc) || 0; if (d < 0) d = 0; if (d > gross) d = gross; it.disc = d;
    it.amount = n2(gross - d); sub += it.amount;
  });
  sub = n2(sub);
  let disc = 0;
  if (inv.discType === 'pct') { let p = Math.min(100, Math.max(0, Number(inv.discValue) || 0)); disc = n2(sub * p / 100); }
  else { disc = Math.max(0, Number(inv.discValue) || 0); }
  if (disc > sub) disc = sub;
  // Mirrors src/calc.js exactly — this is only a live preview, the server
  // recomputes on save, but the two must never disagree on screen.
  let taxAdd = 0, taxInc = 0;
  if (inv.gstOn && sub > 0) (inv.items || []).forEach(it => {
    if (!it.taxable) return;
    const r = Number(it.gst) || 0; if (r <= 0) return;
    const net = n2(it.amount - disc * (it.amount / sub));
    if (net <= 0) return;
    const incl = it.gstIncl === undefined || it.gstIncl === null ? true : !!it.gstIncl;
    if (incl) taxInc += n2(net * r / (100 + r));   // carved out of the quoted price
    else taxAdd += n2(net * r / 100);              // added on top
  });
  const tax = n2(taxAdd + taxInc);
  const total = n2(sub - disc + taxAdd);
  const paid = n2((inv.payments || []).reduce((a, p) => a + (Number(p.amount) || 0), 0));
  return { sub, disc, tax, taxAdd: n2(taxAdd), taxIncl: n2(taxInc), total, paid, bal: n2(total - paid) };
}

/* ---------- login ---------- */
function showLogin(msg) {
  $('#app').style.display = 'none';
  $('#login').innerHTML = `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0d2b33;padding:18px">
    <form id="lf" style="background:#fff;padding:26px;border-radius:16px;width:340px;max-width:100%;box-shadow:0 20px 50px rgba(0,0,0,.3)">
      ${safeLogo(S.set.logo) ? `<img src="${safeLogo(S.set.logo)}" style="width:120px;display:block;margin:0 auto 12px"/>` : ''}
      <div style="text-align:center;font-weight:800;font-size:17px">${esc(S.set.clinicName || 'Hi-Klean Dental Clinic')}</div>
      <div style="text-align:center;color:#68798a;font-size:12.5px;margin-bottom:16px">Billing system</div>
      ${msg ? `<div style="background:#fdf3e3;color:#7a5310;padding:8px 10px;border-radius:8px;font-size:13px;margin-bottom:12px">${esc(msg)}</div>` : ''}
      <label style="font-size:12px;color:#68798a;font-weight:700">Username</label>
      <input id="lu" autocomplete="username" autocapitalize="none" style="width:100%;padding:11px;margin:4px 0 12px;border:1px solid #d7dee6;border-radius:9px;font-size:16px"/>
      <label style="font-size:12px;color:#68798a;font-weight:700">Password</label>
      <input id="lp" type="password" autocomplete="current-password" style="width:100%;padding:11px;margin:4px 0 16px;border:1px solid #d7dee6;border-radius:9px;font-size:16px"/>
      <button id="lb" style="width:100%;padding:12px;border:0;border-radius:9px;background:#0a7d78;color:#fff;font-weight:700;font-size:15px;cursor:pointer">Sign in</button>
      <div id="lerr" style="color:#c0392b;font-size:13px;margin-top:10px;text-align:center"></div>
    </form></div>`;
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    $('#lb').disabled = true; $('#lerr').textContent = '';
    try {
      const r = await api('/auth/login', 'POST', { username: $('#lu').value, password: $('#lp').value });
      S.user = r.user;
      $('#login').innerHTML = '';
      await start();
      if (r.user.mustChange) changePassword(true);
    } catch (err) { $('#lerr').textContent = err.message; $('#lb').disabled = false; }
  };
  setTimeout(() => $('#lu')?.focus(), 80);
}

function changePassword(forced) {
  const m = modal(forced ? 'Set your password' : 'Change password',
    `${forced ? '<p style="margin-top:0" class="mut sm">You are signed in with the password an admin gave you. Set your own before you start billing.</p>' : ''}
     <div class="f"><label>Current password</label><input id="cp0" type="password"/></div>
     <div class="f mt"><label>New password (min 8 characters)</label><input id="cp1" type="password"/></div>
     <div class="f mt"><label>Repeat new password</label><input id="cp2" type="password"/></div>`,
    `${forced ? '' : '<button class="btn" data-do="close">Cancel</button>'}<button class="btn p" id="cpok">Save</button>`);
  $('#cpok', m).onclick = async () => {
    if ($('#cp1', m).value !== $('#cp2', m).value) return toast('Passwords do not match', 1);
    try {
      await api('/auth/password', 'POST', { current: $('#cp0', m).value, next: $('#cp1', m).value });
      closeModal(); toast('Password changed');
    } catch (e) { toast(e.message, 1); }
  };
}

/* ---------- boot ---------- */
async function boot() {
  try {
    const me = await api('/auth/me');
    S.user = me.user;
    await start();
    if (me.user.mustChange) changePassword(true);
  } catch {
    if (location.protocol.startsWith('http')) { try { await (await fetch('/api/health')).json(); } catch { } }
    showLogin();
  }
}
async function start() {
  const s = await api('/settings');
  S.set = s.settings; S.doctors = s.doctors; S.counters = s.counters;
  S.procs = await api('/procedures');
  $('#app').style.display = '';
  buildNav(); paintBrand();
  go(location.hash.slice(1) || 'dash');
  window.addEventListener('hashchange', () => go(location.hash.slice(1) || 'dash'), { once: false });
}
function paintBrand() {
  $('#brandName').innerHTML = (safeLogo(S.set.logo)
    ? `<img src="${safeLogo(S.set.logo)}" style="width:100%;max-width:132px;display:block;margin:0 auto 8px;background:#fff;border-radius:10px;padding:6px"/>` : '')
    + `<div style="text-align:center">${esc((S.set.clinicName || '').replace(/ DENTAL CLINIC/i, ''))}<small>Dental Billing</small></div>`;
  $('#foot').innerHTML = `Signed in: <b>${esc(S.user.username)}</b><br>${S.user.role === 'admin' ? 'Admin' : 'Staff'} · v2.0`;
}
const NAVS = [
  ['dash', '⌂', 'Dashboard', 1], ['bill', '＋', 'New Bill', 0], ['invoices', '☰', 'Bills', 0],
  ['patients', '☺', 'Patients', 0], ['summary', '❐', 'Treatment Summary', 0],
  ['procedures', '⚙', 'Procedures & Rates', 0], ['reports', '📈', 'Reports', 1],
  ['doctors', '🩺', 'Doctor Report', 1], ['settings', '⚒', 'Settings', 1]
];
function buildNav() {
  $('#nav').innerHTML = NAVS.filter(n => !n[3] || isAdmin())
    .map(n => `<button data-r="${n[0]}"><span class="ic">${n[1]}</span>${n[2]}</button>`).join('')
    + `<button data-r="__pw" style="margin-top:6px;opacity:.75"><span class="ic">🔑</span>Change password</button>
       <button data-r="__out" style="opacity:.75"><span class="ic">⏻</span>Sign out</button>`;
  $('#nav').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.r === '__out') return signOut();
    if (b.dataset.r === '__pw') return changePassword(false);
    if (b.dataset.r === 'bill') { B = null; if (location.hash === '#bill') return go('bill'); }
    location.hash = b.dataset.r;
  };
}
async function signOut() {
  if (B && B.items?.length && !B._done) {
    return confirmBox('You have an unsaved bill open. Sign out and lose it?', async () => { await api('/auth/logout', 'POST'); location.reload(); }, 'Sign out');
  }
  await api('/auth/logout', 'POST'); location.reload();
}
function go(r) {
  const base = r.split('/')[0];
  S.route = r;
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.r === base));
  const M = $('#main'); window.scrollTo(0, 0);
  const map = {
    dash: viewDash, bill: viewBill, invoices: viewInvoices, patients: viewPatients,
    summary: viewSummary, procedures: viewProcs, reports: viewReports, doctors: viewDoctorReport, settings: viewSettings
  };
  if (['reports', 'settings', 'doctors'].includes(base) && !isAdmin()) {
    M.innerHTML = '<div class="card empty"><div class="big">🔒</div>This section is for admin logins only.</div>'; return;
  }
  M.innerHTML = '<div class="empty">Loading…</div>';
  Promise.resolve((map[base] || viewDash)(M, r.split('/').slice(1)))
    .catch(e => { M.innerHTML = `<div class="card empty"><div class="big">⚠</div>${esc(e.message)}</div>`; });
}

/* ---------- dashboard ---------- */
async function viewDash(M) {
  const t = today();
  const mStart = t.slice(0, 8) + '01';
  const [dayList, rep] = await Promise.all([
    api('/invoices?limit=8'),
    isAdmin() ? api(`/reports?from=${mStart}&to=${t}`) : Promise.resolve(null)
  ]);
  const todayRep = isAdmin() ? await api(`/reports?from=${t}&to=${t}`) : null;
  M.innerHTML = `
  <div class="head"><div><h1>Dashboard</h1><div class="sub">${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div></div>
    <button class="btn p lg" data-do="newbill">＋ New Bill</button></div>
  ${isAdmin() ? `<div class="stats">
    <button class="stat acc tap" data-do="drill" data-k="collected" data-from="${t}" data-to="${t}"><span class="go">›</span>
      <div class="k">Collected today</div><div class="v">${inr0(todayRep.collected)}</div>
      <div class="n"><u>see every receipt</u></div></button>
    <button class="stat tap" data-do="drill" data-k="billed" data-from="${t}" data-to="${t}"><span class="go">›</span>
      <div class="k">Billed today</div><div class="v">${inr0(todayRep.billed.total)}</div>
      <div class="n"><u>${todayRep.billed.count} bill${todayRep.billed.count === 1 ? '' : 's'} today</u></div></button>
    <button class="stat tap" data-do="drill" data-k="month" data-from="${mStart}" data-to="${t}"><span class="go">›</span>
      <div class="k">This month</div><div class="v">${inr0(rep.collected)}</div>
      <div class="n"><u>collection — full report</u></div></button>
    <button class="stat tap" data-do="drill" data-k="dues"><span class="go">›</span>
      <div class="k">Outstanding dues</div><div class="v" style="color:${rep.duesTotal > 0 ? 'var(--bad)' : 'var(--good)'}">${inr0(rep.duesTotal)}</div>
      <div class="n"><u>${rep.dues.length} bill${rep.dues.length === 1 ? '' : 's'} pending</u></div></button>
  </div>` : ''}
  <div class="card mt">
    <div class="pad" style="display:flex;justify-content:space-between;align-items:center;padding-bottom:6px"><b>Recent bills</b>
      <button class="btn sm" data-do="go" data-h="invoices">View all</button></div>
    <div class="scroll">${dayList.length ? `<table><thead><tr><th>Bill</th><th>Date</th><th>Patient</th><th class="num">Total</th><th class="num">Balance</th><th></th></tr></thead><tbody>
      ${dayList.map(i => `<tr><td class="b">${esc(i.no)}</td><td>${dmy(i.date)}</td>
        <td>${esc(i.pname)}<div class="xs mut">${esc(i.preg || '')}</div></td>
        <td class="num">${inr(i.total)}</td>
        <td class="num">${balTag(i.bal)}</td>
        <td class="right"><button class="btn sm" data-do="open" data-id="${i.id}">Open</button></td></tr>`).join('')}
      </tbody></table>` : '<div class="empty"><div class="big">🦷</div>No bills yet. Click <b>New Bill</b>.</div>'}</div>
  </div>`;
}

/* ---------- dashboard drill-downs ----------
   Every number on the dashboard opens the rows behind it. A total you cannot
   audit is a total you cannot trust. Collection follows the PAYMENT date and
   billing follows the BILL date — they are deliberately different lists. */
const daysAgo = (iso) => Math.max(0, Math.round((new Date(today()) - new Date(String(iso).slice(0, 10))) / 86400000));

async function drill(kind, from, to) {
  if (kind === 'month') {                       // the full report already is the drill-down
    rp = { from, to }; location.hash = 'reports'; return;
  }
  const m = modal(kind === 'collected' ? 'Collected — receipts' : kind === 'billed' ? 'Bills raised' : 'Outstanding dues',
    '<div class="empty">Loading…</div>', '<button class="btn" data-do="close">Close</button>', true);
  const body = $('.mb', m);
  try {
    if (kind === 'collected') body.innerHTML = await drillCollected(from, to);
    else if (kind === 'billed') body.innerHTML = await drillBilled(from, to);
    else body.innerHTML = await drillDues();
  } catch (e) { body.innerHTML = `<div class="empty">⚠ ${esc(e.message)}</div>`; return; }
  // any row carrying data-inv opens that bill
  body.querySelectorAll('tr[data-inv]').forEach(r => r.onclick = ev => {
    if (ev.target.closest('a')) return;         // let phone / WhatsApp links through
    closeModal(); openInv(Number(r.dataset.inv));
  });
  const csv = $('#dlCsv', m);
  if (csv) csv.onclick = () => grab(`/reports/daybook.csv?from=${from}&to=${to}`);
}

async function drillCollected(from, to) {
  const [pays, rep] = await Promise.all([
    api(`/reports/payments?from=${from}&to=${to}`),
    api(`/reports?from=${from}&to=${to}`)
  ]);
  if (!pays.length) return '<div class="empty"><div class="big">₹</div>No money collected in this period.</div>';
  const tot = pays.reduce((a, p) => a + p.amount, 0);
  return `<div class="mtot"><div><div class="sm mut">${dmy(from)}${from === to ? '' : ' – ' + dmy(to)} · ${pays.length} receipt${pays.length === 1 ? '' : 's'}</div>
      <div class="big">${inr(tot)}</div></div>
    <div class="chips">${rep.modes.map(x => `<span class="chip"><b>${esc(x.mode)}</b> ${inr0(x.total)}</span>`).join('')}</div></div>
   <div class="drill"><table><thead><tr><th>Bill</th><th>Patient</th><th>Mode</th><th class="hide-sm">Ref</th><th class="hide-sm">Entered by</th><th class="num">Amount</th></tr></thead><tbody>
    ${pays.map(p => `<tr data-inv="${p.invId}"><td class="b">${esc(p.no)}<div class="xs mut">${dmy(p.billDate)}</div></td>
      <td>${esc(p.pname)}<div class="xs mut">${esc(p.preg || '')}</div></td>
      <td>${esc(p.mode)}</td><td class="mut sm hide-sm">${esc(p.ref || '')}</td>
      <td class="mut sm hide-sm">${esc(p.enteredBy || '')}</td>
      <td class="num b">${inr(p.amount)}</td></tr>`).join('')}
    <tr style="background:#fafbfc"><td colspan="3" class="b right">Total collected</td>
      <td class="hide-sm"></td><td class="hide-sm"></td><td class="num b">${inr(tot)}</td></tr>
   </tbody></table></div>
   <div class="row mt"><button class="btn sm" id="dlCsv">⬇ Day book CSV</button>
     <span class="xs mut" style="align-self:center">Tap any row to open the bill. Payment date, not bill date — money taken today against an older bill is counted here.</span></div>`;
}

async function drillBilled(from, to) {
  const list = (await api(`/invoices?from=${from}&to=${to}`)).filter(i => i.type !== 'estimate');
  if (!list.length) return '<div class="empty"><div class="big">☰</div>No bills raised in this period.</div>';
  const tot = list.reduce((a, i) => a + i.total, 0), paid = list.reduce((a, i) => a + i.paid, 0);
  return `<div class="mtot"><div><div class="sm mut">${dmy(from)}${from === to ? '' : ' – ' + dmy(to)} · ${list.length} bill${list.length === 1 ? '' : 's'}</div>
      <div class="big">${inr(tot)}</div></div>
    <div class="chips"><span class="chip">Collected <b>${inr0(paid)}</b></span>
      <span class="chip" style="color:${tot - paid > 0.005 ? 'var(--bad)' : 'var(--good)'}">Balance <b>${inr0(tot - paid)}</b></span></div></div>
   <div class="drill"><table><thead><tr><th>Bill</th><th>Patient</th><th class="hide-sm">Treatments</th><th class="num">Total</th><th class="num hide-sm">Paid</th><th class="num">Balance</th></tr></thead><tbody>
    ${list.map(i => `<tr data-inv="${i.id}"><td class="b">${esc(i.no)}</td>
      <td>${esc(i.pname)}<div class="xs mut">${esc(i.preg || '')}</div></td>
      <td class="sm mut hide-sm">${esc(i.items.map(t => t.name).join(', ').slice(0, 48))}${i.items.map(t => t.name).join(', ').length > 48 ? '…' : ''}</td>
      <td class="num">${inr(i.total)}</td><td class="num hide-sm">${inr(i.paid)}</td><td class="num">${balTag(i.bal)}</td></tr>`).join('')}
    <tr style="background:#fafbfc"><td colspan="2" class="b right">Total billed</td><td class="hide-sm"></td>
      <td class="num b">${inr(tot)}</td><td class="num b hide-sm">${inr(paid)}</td><td class="num b">${inr(tot - paid)}</td></tr>
   </tbody></table></div>
   <div class="xs mut mt">Tap any row to open the bill. Estimates are excluded — they are not revenue.</div>`;
}

async function drillDues() {
  const rep = await api(`/reports?from=${today()}&to=${today()}`);
  const dues = rep.dues;
  if (!dues.length) return '<div class="empty"><div class="big">🎉</div>Nothing pending. Every bill is fully paid.</div>';
  const wa = (d) => {
    const ph = String(d.phone || '').replace(/\D/g, '');
    if (ph.length < 10) return '';
    const num = ph.length === 10 ? '91' + ph : ph;
    const msg = encodeURIComponent(`Dear ${d.name}, a balance of ₹${Math.round(d.bal)} is pending on bill ${d.no} at Hi-Klean Dental Clinic. Kindly settle it at your convenience. Thank you.`);
    return `<a class="btn sm" href="https://wa.me/${num}?text=${msg}" target="_blank" rel="noopener">Remind</a>`;
  };
  const over = dues.filter(d => daysAgo(d.date) > 30).reduce((a, d) => a + d.bal, 0);
  return `<div class="mtot"><div><div class="sm mut">${dues.length} bill${dues.length === 1 ? '' : 's'} pending · all time</div>
      <div class="big" style="color:var(--bad)">${inr(rep.duesTotal)}</div></div>
    <div class="chips"><span class="chip">Over 30 days <b>${inr0(over)}</b></span>
      <span class="chip">Largest <b>${inr0(Math.max(...dues.map(d => d.bal)))}</b></span></div></div>
   <div class="drill"><table><thead><tr><th>Bill</th><th>Patient</th><th class="hide-sm">Phone</th><th class="num">Age</th><th class="num">Balance</th><th></th></tr></thead><tbody>
    ${dues.map(d => `<tr data-inv="${d.id}"><td class="b">${esc(d.no)}<div class="xs mut">${dmy(d.date)}</div></td>
      <td>${esc(d.name)}</td>
      <td class="sm hide-sm">${d.phone ? `<a href="tel:${esc(String(d.phone).replace(/[^0-9+]/g, ''))}">${esc(d.phone)}</a>` : '<span class="mut">—</span>'}</td>
      <td class="num sm ${daysAgo(d.date) > 30 ? 'b' : 'mut'}" style="${daysAgo(d.date) > 30 ? 'color:var(--bad)' : ''}">${daysAgo(d.date)}d</td>
      <td class="num"><span class="tag r">${inr(d.bal)}</span></td>
      <td class="right" style="white-space:nowrap">${wa(d)}</td></tr>`).join('')}
   </tbody></table></div>
   <div class="xs mut mt">Sorted by amount. Tap a row to open the bill and collect. Highest 200 shown.</div>`;
}

window.addEventListener('offline', () => { if (!$('.offline')) document.body.appendChild(el('<div class="offline">No internet — the app cannot save until the connection is back.</div>')); });
window.addEventListener('online', () => $('.offline')?.remove());
document.addEventListener('keydown', e => {
  const t = e.target.tagName;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t) && !(e.ctrlKey && e.key === 'Enter')) return;
  if (e.altKey && !e.ctrlKey) {
    const k = e.key.toLowerCase();
    if (k === 'n') { e.preventDefault(); B = null; location.hash = 'bill'; }
    if (k === 'b') { e.preventDefault(); location.hash = 'invoices'; }
    if (k === 'p') { e.preventDefault(); location.hash = 'patients'; }
    if (k === 'd') { e.preventDefault(); location.hash = 'dash'; }
  }
  if (e.ctrlKey && e.key === 'Enter' && S.route.startsWith('bill')) { e.preventDefault(); saveBill(true); }
});
window.addEventListener('beforeunload', e => {
  if (S.route?.startsWith('bill') && B && !B._done && B.items?.length) { e.preventDefault(); e.returnValue = ''; }
});
/* one delegated click handler — CSP forbids inline onclick=, and inline handlers
   were the single thing that made a stored-XSS payload able to run as the admin */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-do]'); if (!b) return;
  const id = b.dataset.id;
  switch (b.dataset.do) {
    case 'close': closeModal(); break;
    case 'go': location.hash = b.dataset.h; break;
    case 'newbill': B = null; location.hash = 'bill'; if (S.route === 'bill') go('bill'); break;
    case 'open': openInv(Number(id)); break;
    case 'print': printInv(Number(id)); break;
    case 'printt': printInv(Number(id), 1); break;
    case 'edit': closeModal(); B = null; location.hash = 'bill/' + id; break;
    case 'audit': showAudit(); break;
    case 'drill': drill(b.dataset.k, b.dataset.from, b.dataset.to); break;
    case 'docpick': pickDoctor(id); break;
    case 'docall': docPick = null; loadDoctorReport(); break;
  }
});
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('/sw.js').catch(() => { });
boot();
