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
/* ---------- password show/hide ----------
   pwField() wraps a password input with an eye button. The button is
   type="button" so it never submits the form it sits in, and it is toggled by
   the delegated click handler (case 'pw') — the CSP forbids inline handlers. */
const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 12S5 5.5 12 5.5 22.5 12 22.5 12 19 18.5 12 18.5 1.5 12 1.5 12Z"/><circle cx="12" cy="12" r="3.2"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 5.8A9.7 9.7 0 0 1 12 5.5c7 0 10.5 6.5 10.5 6.5a17.6 17.6 0 0 1-3.6 4.4M6.2 7.6A17.4 17.4 0 0 0 1.5 12S5 18.5 12 18.5c1.9 0 3.5-.5 4.9-1.2"/><path d="M9.8 9.9a3.2 3.2 0 0 0 4.4 4.4"/><path d="M3 3l18 18"/></svg>';
function pwField(attrs) {
  return `<div class="pwrap"><input type="password" ${attrs}/>` +
    `<button type="button" class="pweye" data-do="pw" aria-label="Show password" title="Show password">${EYE}</button></div>`;
}
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
      <div style="margin:4px 0 16px">${pwField('id="lp" autocomplete="current-password" style="padding:11px;border:1px solid #d7dee6;border-radius:9px;font-size:16px"')}</div>
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
     <div class="f"><label>Current password</label>${pwField('id="cp0" autocomplete="current-password"')}</div>
     <div class="f mt"><label>New password (min 8 characters)</label>${pwField('id="cp1" autocomplete="new-password"')}</div>
     <div class="f mt"><label>Repeat new password</label>${pwField('id="cp2" autocomplete="new-password"')}</div>`,
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
    <div class="stat acc"><div class="k">Collected today</div><div class="v">${inr0(todayRep.collected)}</div><div class="n">${todayRep.billed.count} bill${todayRep.billed.count === 1 ? '' : 's'} today</div></div>
    <div class="stat"><div class="k">Billed today</div><div class="v">${inr0(todayRep.billed.total)}</div><div class="n">incl. unpaid balance</div></div>
    <div class="stat"><div class="k">This month</div><div class="v">${inr0(rep.collected)}</div><div class="n">collection</div></div>
    <div class="stat"><div class="k">Outstanding dues</div><div class="v" style="color:${rep.duesTotal > 0 ? 'var(--bad)' : 'var(--good)'}">${inr0(rep.duesTotal)}</div><div class="n">${rep.dues.length} bills pending</div></div>
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
    case 'pw': {
      const inp = b.parentNode.querySelector('input'); if (!inp) break;
      const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      b.innerHTML = show ? EYE_OFF : EYE;
      b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      b.title = show ? 'Hide password' : 'Show password';
      // keep the caret where the user was typing
      inp.focus();
      const n = inp.value.length; try { inp.setSelectionRange(n, n); } catch { }
      break;
    }
  }
});
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('/sw.js').catch(() => { });
boot();
