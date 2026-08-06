/** download a file the backend produced — a URL when hosted, a generated blob offline */
async function grab(path) {
  if (typeof window.__DL === 'function') {
    try { const d = await api(path); window.__DL(d); toast('Downloaded'); } catch (e) { toast(e.message, 1); }
  } else window.open('/api' + path, '_blank');
}

/* ===================== PROCEDURES & RATES ===================== */
let prF = { q: '', cat: 'all', hidden: false };
async function viewProcs(M) {
  S.procs = await api('/procedures');
  const cats = [...new Set(S.procs.map(p => p.cat))];
  M.innerHTML = `<div class="head"><div><h1>Procedures &amp; Rates</h1>
      <div class="sub">${S.procs.length} procedures${isAdmin() ? ' · type a new price and press Tab to save' : ' · view only'}</div></div>
    ${isAdmin() ? `<div class="row"><button class="btn" id="prBulk">Bulk price change</button>
      <button class="btn p" id="prNew">＋ Add procedure</button></div>` : ''}</div>
   <div class="card pad"><div class="row">
     <div class="f" style="flex:1;min-width:180px"><label>Search</label><input id="prq" value="${esc(prF.q)}"/></div>
     <div class="f" style="min-width:180px"><label>Category</label><select id="prc"><option value="all">All categories</option>
       ${cats.map(c => `<option ${prF.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
     <label class="switch" style="padding-bottom:9px"><input type="checkbox" id="prh" ${prF.hidden ? 'checked' : ''}/> show hidden</label>
   </div></div><div class="card mt"><div class="scroll" id="prlist"></div></div>`;
  const run = () => { prF = { q: $('#prq').value, cat: $('#prc').value, hidden: $('#prh').checked }; renderProcAdmin(); };
  $('#prq').oninput = run; $('#prc').onchange = run; $('#prh').onchange = run;
  if (isAdmin()) { $('#prNew').onclick = () => editProc(null); $('#prBulk').onclick = bulkPrice; }
  renderProcAdmin();
}
function renderProcAdmin() {
  const s = prF.q.trim().toLowerCase();
  const list = S.procs.filter(p => (prF.hidden || p.active) && (prF.cat === 'all' || p.cat === prF.cat) && (!s || p.name.toLowerCase().includes(s)));
  $('#prlist').innerHTML = list.length ? `<table><thead><tr><th>Procedure</th><th>Category</th>
     <th style="width:130px" class="num">Price (₹)</th><th style="width:80px">Per tooth</th>
     ${S.set.gstEnabled ? '<th style="width:110px">GST</th><th style="width:140px">Price is</th>' : ''}<th style="width:60px">Show</th>
     ${isAdmin() ? '<th style="width:70px"></th>' : ''}</tr></thead><tbody>
    ${list.map(p => `<tr data-id="${p.id}"><td class="b">${esc(p.name)}</td><td class="sm mut">${esc(p.cat)}</td>
      <td><input class="num" data-f="price" value="${p.price}" ${isAdmin() ? '' : 'readonly'}/></td>
      <td class="center"><input type="checkbox" data-f="perTooth" ${p.perTooth ? 'checked' : ''} ${isAdmin() ? '' : 'disabled'} style="width:16px;accent-color:var(--acc)"/></td>
      ${S.set.gstEnabled ? `<td><label class="switch"><input type="checkbox" data-f="taxable" ${p.taxable ? 'checked' : ''} ${isAdmin() ? '' : 'disabled'}/>
        <input class="num" data-f="gst" value="${p.gst}" style="width:46px" ${isAdmin() ? '' : 'readonly'}/>%</label></td>
      <td><select data-f="gstIncl" ${isAdmin() ? '' : 'disabled'}>
        <option value="1" ${p.gstIncl !== false ? 'selected' : ''}>GST included</option>
        <option value="0" ${p.gstIncl === false ? 'selected' : ''}>GST extra</option></select></td>` : ''}
      <td class="center"><input type="checkbox" data-f="active" ${p.active ? 'checked' : ''} ${isAdmin() ? '' : 'disabled'} style="width:16px;accent-color:var(--acc)"/></td>
      ${isAdmin() ? `<td class="right"><button class="btn sm" data-act="edit">Edit</button></td>` : ''}</tr>`).join('')}
    </tbody></table>` : '<div class="empty">No procedure matches.</div>';
  if (!isAdmin()) return;
  const box = $('#prlist');
  box.onchange = async e => {
    const f = e.target.dataset.f; if (!f) return;
    const id = Number(e.target.closest('tr').dataset.id);
    const p = S.procs.find(x => x.id === id);
    const body = {};
    if (f === 'price') { if (e.target.value.trim() === '') { e.target.value = p.price; return; } body.price = Math.max(0, Number(e.target.value) || 0); }
    else if (f === 'gst') body.gst = Number(e.target.value) || 0;
    else if (f === 'gstIncl') body.gstIncl = e.target.value === '1';
    else body[f] = e.target.checked;
    try { Object.assign(p, await api('/procedures/' + id, 'PATCH', body)); toast(p.name + ' updated'); }
    catch (err) { toast(err.message, 1); }
  };
  box.onclick = e => {
    const b = e.target.closest('button[data-act="edit"]'); if (!b) return;
    editProc(S.procs.find(x => x.id === Number(b.closest('tr').dataset.id)));
  };
}
function editProc(p) {
  const isNew = !p; p = p || { cat: 'Others', price: 0, gst: 18, gstIncl: true };
  const cats = [...new Set(S.procs.map(x => x.cat))];
  const m = modal(isNew ? 'New procedure' : 'Edit procedure', `
    <div class="f"><label>Procedure name *</label><input id="pr_n" value="${esc(p.name || '')}"/></div>
    <div class="row mt"><div class="f" style="flex:1;min-width:180px"><label>Category</label>
      <select id="pr_c">${cats.map(c => `<option ${p.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}<option value="__new">➕ New category…</option></select></div>
      <div class="f" style="width:130px"><label>Price (₹)</label><input id="pr_p" class="num" value="${p.price}"/></div></div>
    <div id="pr_nc"></div>
    <div class="row mt"><label class="switch"><input type="checkbox" id="pr_t" ${p.perTooth ? 'checked' : ''}/> Charged per tooth</label>
      <label class="switch"><input type="checkbox" id="pr_x" ${p.taxable ? 'checked' : ''}/> GST applicable</label>
      <div class="f" style="width:90px"><label>GST %</label><input id="pr_g" class="num" value="${p.gst}"/></div>
      <div class="f" style="min-width:190px"><label>The price above</label>
        <select id="pr_gi"><option value="1" ${p.gstIncl !== false ? 'selected' : ''}>already includes GST</option>
        <option value="0" ${p.gstIncl === false ? 'selected' : ''}>is before GST (add it on top)</option></select></div></div>
      <div class="mut xs" style="margin-top:-4px">"Already includes GST" means the patient pays exactly the price you typed; the tax is shown separately on the bill but not added to it.</div>
    ${isNew ? '' : '<div class="row mt"><label class="switch"><input type="checkbox" id="pr_a" ' + (p.active ? 'checked' : '') + '/> Show in the billing list</label></div>'}`,
    `<button class="btn" data-do="close">Cancel</button><button class="btn p" id="pr_s">Save</button>`);
  $('#pr_c', m).onchange = e => $('#pr_nc', m).innerHTML = e.target.value === '__new'
    ? `<div class="f mt"><label>New category name</label><input id="pr_ncn"/></div>` : '';
  $('#pr_s', m).onclick = async () => {
    let cat = $('#pr_c', m).value;
    if (cat === '__new') cat = ($('#pr_ncn', m) || {}).value || 'Others';
    const body = {
      name: $('#pr_n', m).value.trim(), cat, price: Number($('#pr_p', m).value) || 0,
      perTooth: $('#pr_t', m).checked, taxable: $('#pr_x', m).checked, gst: Number($('#pr_g', m).value) || 0,
      gstIncl: $('#pr_gi', m).value === '1'
    };
    if ($('#pr_a', m)) body.active = $('#pr_a', m).checked;
    if (!body.name) return toast('Name required', 1);
    try { await api(isNew ? '/procedures' : '/procedures/' + p.id, isNew ? 'POST' : 'PATCH', body); closeModal(); toast('Saved'); go('procedures'); }
    catch (e) { toast(e.message, 1); }
  };
}
function bulkPrice() {
  const cats = [...new Set(S.procs.map(p => p.cat))];
  const m = modal('Bulk price change', `
    <div class="row"><div class="f" style="flex:1"><label>Apply to</label><select id="bk_c">
      <option value="all">All procedures</option>${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select></div>
      <div class="f" style="width:110px"><label>Change by %</label><input id="bk_p" class="num" value="10"/></div>
      <div class="f" style="width:130px"><label>Round to</label><select id="bk_r">
        <option value="1">₹1</option><option value="10" selected>₹10</option><option value="50">₹50</option><option value="100">₹100</option></select></div></div>
    <p class="sm mut mt">Negative to reduce. Every old price is kept in the price-history table.</p>`,
    `<button class="btn" data-do="close">Cancel</button><button class="btn p" id="bk_go">Apply</button>`);
  $('#bk_go', m).onclick = async () => {
    const r = await api('/procedures/bulk-price', 'POST',
      { category: $('#bk_c', m).value, pct: Number($('#bk_p', m).value) || 0, roundTo: Number($('#bk_r', m).value) });
    closeModal(); toast(r.count + ' prices updated'); go('procedures');
  };
}

/* ===================== REPORTS ===================== */
let rp = { from: '', to: '' };
function rangeBar(id) {
  return `<div class="card pad"><div class="row">
     <div class="f"><label>From</label><input type="date" id="${id}f" value="${rp.from}"/></div>
     <div class="f"><label>To</label><input type="date" id="${id}t" value="${rp.to}"/></div>
     <button class="btn" data-q="today">Today</button><button class="btn" data-q="week">This week</button>
     <button class="btn" data-q="month">This month</button><button class="btn" data-q="fy">This FY</button>
     <button class="btn" id="${id}csv">Export CSV</button></div></div>`;
}
function bindRange(id, reload) {
  const set = (f, t) => { rp = { from: f, to: t }; $('#' + id + 'f').value = f; $('#' + id + 't').value = t; reload(); };
  $('#' + id + 'f').onchange = $('#' + id + 't').onchange = () => { rp = { from: $('#' + id + 'f').value, to: $('#' + id + 't').value }; reload(); };
  $$('#main .card button[data-q]').forEach(b => b.onclick = () => {
    const d = new Date(); const iso = x => new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    if (b.dataset.q === 'today') set(today(), today());
    if (b.dataset.q === 'week') { const s = new Date(d); s.setDate(d.getDate() - ((d.getDay() + 6) % 7)); set(iso(s), today()); }
    if (b.dataset.q === 'month') set(today().slice(0, 8) + '01', today());
    if (b.dataset.q === 'fy') { const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; set(y + '-04-01', today()); }
  });
}
async function viewReports(M) {
  if (!rp.from) rp = { from: today().slice(0, 8) + '01', to: today() };
  M.innerHTML = `<div class="head"><div><h1>Reports</h1><div class="sub">Collection, dues and treatment mix</div></div></div>
    ${rangeBar('r')}<div id="rout" class="mt"><div class="empty">Loading…</div></div>`;
  bindRange('r', loadReports);
  $('#rcsv').onclick = () => grab(`/reports/daybook.csv?from=${rp.from}&to=${rp.to}`);
  loadReports();
}
async function loadReports() {
  const d = await api(`/reports?from=${rp.from}&to=${rp.to}`);
  const mx = Math.max(1, ...d.modes.map(m => m.total));
  // the user may have navigated away while the request was in flight
  if (!$('#rout')) return;
  $('#rout').innerHTML = `
   <div class="stats">
     <div class="stat acc"><div class="k">Collected</div><div class="v">${inr0(d.collected)}</div><div class="n">in selected period</div></div>
     <div class="stat"><div class="k">Billed</div><div class="v">${inr0(d.billed.total)}</div><div class="n">${d.billed.count} bills</div></div>
     <div class="stat"><div class="k">Discount given</div><div class="v">${inr0(d.billed.disc)}</div></div>
     <div class="stat"><div class="k">Outstanding (all time)</div><div class="v" style="color:${d.duesTotal > 0 ? 'var(--bad)' : 'var(--good)'}">${inr0(d.duesTotal)}</div></div>
   </div>
   <div class="grid mt" style="grid-template-columns:repeat(auto-fit,minmax(310px,1fr))">
     <div class="card"><div class="pad" style="padding-bottom:4px"><b>Payment mode split</b></div><div class="pad" style="padding-top:6px">
      ${d.modes.length ? d.modes.map(m => `<div style="margin-bottom:9px">
        <div style="display:flex;justify-content:space-between;font-size:13.5px"><b>${esc(m.mode)}</b>
          <span>${inr0(m.total)} <span class="mut xs">${d.collected ? Math.round(m.total / d.collected * 100) : 0}%</span></span></div>
        <div style="height:7px;background:#eef2f5;border-radius:5px;margin-top:3px"><div style="height:100%;width:${(m.total / mx * 100).toFixed(1)}%;background:var(--acc);border-radius:5px"></div></div></div>`).join('')
      : '<div class="mut sm">No collection in this period.</div>'}</div></div>
     <div class="card"><div class="pad" style="padding-bottom:4px"><b>Doctor-wise collection</b></div>
       <div class="scroll">${d.doctors.length ? `<table><tbody>${d.doctors.map(x => `<tr><td>${esc(x.name)}</td><td class="num b">${inr0(x.total)}</td></tr>`).join('')}</tbody></table>`
      : '<div class="pad mut sm">—</div>'}<div class="pad"><button class="btn sm" data-do="go" data-h="doctors">Full doctor report →</button></div></div></div>
   </div>
   <div class="grid mt" style="grid-template-columns:repeat(auto-fit,minmax(330px,1fr))">
     <div class="card"><div class="pad" style="padding-bottom:4px"><b>Top treatments</b></div><div class="scroll">
      ${d.top.length ? `<table><thead><tr><th>Treatment</th><th class="num">Count</th><th class="num">Revenue</th></tr></thead><tbody>
       ${d.top.map(t => `<tr><td>${esc(t.name)}</td><td class="num">${t.n}</td><td class="num b">${inr0(t.total)}</td></tr>`).join('')}</tbody></table>` : '<div class="pad mut sm">—</div>'}</div></div>
     <div class="card"><div class="pad" style="padding-bottom:4px"><b>Day-wise collection</b></div><div class="scroll" style="max-height:400px">
      ${d.daily.length ? `<table><thead><tr><th>Date</th><th class="num">Collected</th></tr></thead><tbody>
       ${d.daily.map(x => `<tr><td>${dmy(x.date)}</td><td class="num b">${inr0(x.total)}</td></tr>`).join('')}</tbody></table>` : '<div class="pad mut sm">—</div>'}</div></div>
   </div>
   <div class="card mt"><div class="pad" style="padding-bottom:4px"><b>Pending dues</b> <span class="mut sm">all time</span></div>
     <div class="scroll" style="max-height:420px">${d.dues.length ? `<table><thead><tr><th>Bill</th><th>Date</th><th>Patient</th><th>Phone</th><th class="num">Balance</th><th></th></tr></thead><tbody>
      ${d.dues.map(x => `<tr><td class="b">${esc(x.no)}</td><td>${dmy(x.date)}</td><td>${esc(x.name)}</td><td>${esc(x.phone || '')}</td>
        <td class="num"><span class="tag r">${inr(x.bal)}</span></td>
        <td class="right"><button class="btn sm" data-do="open" data-id="${x.id}">Collect</button></td></tr>`).join('')}</tbody></table>`
      : '<div class="empty sm">No pending dues 🎉</div>'}</div></div>`;
}

/* ===================== DOCTOR REPORT ===================== */
/* which doctor's card is open. null = show them all. */
let docPick = null;
function pickDoctor(id) {
  const n = Number(id);
  docPick = (docPick === n) ? null : n;      // tapping the open one closes it
  loadDoctorReport();
}
async function viewDoctorReport(M) {
  if (!rp.from) rp = { from: today().slice(0, 8) + '01', to: today() };
  M.innerHTML = `<div class="head"><div><h1>Doctor Report</h1>
    <div class="sub">What each doctor did, and what it billed and collected. Collection is split across the treatments on each bill in proportion to their value.</div></div></div>
    ${rangeBar('d')}<div id="dout" class="mt"><div class="empty">Loading…</div></div>`;
  bindRange('d', loadDoctorReport);
  $('#dcsv').onclick = () => grab(`/reports/doctors.csv?from=${rp.from}&to=${rp.to}`);
  loadDoctorReport();
}
async function loadDoctorReport() {
  const list = await api(`/reports/doctors?from=${rp.from}&to=${rp.to}`);
  if (!$('#dout')) return;
  if (!list.length) { $('#dout').innerHTML = '<div class="card empty">No treatments billed in this period.</div>'; return; }
  const grand = list.reduce((a, d) => a + d.billed, 0);
  const anyPrior = list.some(d => (d.collectedPrior || 0) > 0.004);
  if (!$('#dout')) return;
  // a doctor picked in an earlier date range may have nothing in this one
  if (docPick !== null && !list.some(d => d.doctorId === docPick)) docPick = null;
  const shown = docPick === null ? list : list.filter(d => d.doctorId === docPick);
  $('#dout').innerHTML = `<div class="stats">
      ${list.map(d => `<button class="stat tap ${docPick === d.doctorId ? 'acc' : ''}" data-do="docpick" data-id="${d.doctorId}">
        <span class="go">${docPick === d.doctorId ? '×' : '›'}</span>
        <div class="k">${esc(d.name)}</div><div class="v">${inr0(d.billed)}</div>
        <div class="n">${d.bills} bill${d.bills === 1 ? '' : 's'} · ${d.patients} patient${d.patients === 1 ? '' : 's'} · collected ${inr0(d.collected)}</div>
        <div class="n"><u>${docPick === d.doctorId ? 'showing only this doctor' : 'see this doctor\'s procedures'}</u></div></button>`).join('')}
    </div>
    ${docPick !== null ? `<div class="row mt"><button class="btn" data-do="docall">← All doctors</button>
      <span class="sm mut" style="align-self:center">Showing <b>${esc(shown[0].name)}</b> only.</span></div>` : ''}
    ${anyPrior ? `<div class="card pad mt sm" style="border-left:3px solid var(--acc)">
      <b>Why collected can exceed billed.</b> Billing is counted on the <b>bill date</b>; collection is counted on the
      <b>payment date</b>. A balance settled in this period against a bill raised earlier shows up as collection here with
      no matching billing — that is older work being paid for, not unbilled treatment. The amount is stated per doctor below.</div>` : ''}
    ${shown.map(d => `<div class="card mt doccard" data-doc="${d.doctorId}">
      <div class="pad" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <b>${esc(d.name)}</b>
        <span class="sm mut">Billed <b>${inr(d.billed)}</b> · Collected <b>${inr(d.collected)}</b>${(d.collectedPrior || 0) > 0.004
        ? ` <span class="tag y">incl. ${inr(d.collectedPrior)} against earlier bills</span>` : ''}
          · Unpaid on this period's bills <b style="color:${d.unpaid > 0.004 ? 'var(--bad)' : 'var(--good)'}">${inr(d.unpaid || 0)}</b></span></div>
      <div class="scroll"><table><thead><tr><th>Procedure</th><th class="num">Times</th><th class="num">Billed</th><th class="num">Collected</th></tr></thead><tbody>
        ${d.procedures.map(p => `<tr><td>${esc(p.name)}${(p.prior || 0) > 0.004 && (p.billed || 0) <= 0.004
        ? ' <span class="tag y">earlier bill</span>' : ''}</td><td class="num">${p.qty}</td>
          <td class="num b">${inr(p.billed)}</td><td class="num">${inr(p.collected)}</td></tr>`).join('')}
        <tr style="background:#fafbfc"><td class="b right">Total</td><td></td><td class="num b">${inr(d.billed)}</td><td class="num b">${inr(d.collected)}</td></tr>
      </tbody></table></div></div>`).join('')}`;
}

/* ===================== SETTINGS ===================== */
async function viewSettings(M) {
  const [s, users] = await Promise.all([api('/settings'), api('/users')]);
  S.set = s.settings; S.doctors = s.doctors; S.counters = s.counters;
  const set = S.set;
  let delDocs = [];
  M.innerHTML = `<div class="head"><div><h1>Settings</h1><div class="sub">Clinic details, doctors, users, numbering and data</div></div>
    <button class="btn p" id="stSave">Save settings</button></div>

  <div class="card pad"><b>Clinic details (printed on every bill)</b><div class="hr"></div>
    <div class="row">
      <div class="f" style="flex:1;min-width:230px"><label>Clinic name</label><input id="st_name" value="${esc(set.clinicName || '')}"/></div>
      <div class="f" style="flex:1;min-width:230px"><label>Sub-title (red strip)</label><input id="st_l2" value="${esc(set.line2 || '')}"/></div></div>
    <div class="row mt">
      <div class="f" style="flex:2;min-width:240px"><label>Address</label><input id="st_addr" value="${esc(set.address || '')}"/></div>
      <div class="f" style="flex:1;min-width:190px"><label>Phone numbers</label><input id="st_ph" value="${esc(set.phone || '')}"/></div></div>
    <div class="row mt">
      <div class="f" style="flex:1;min-width:180px"><label>Website</label><input id="st_web" value="${esc(set.website || '')}"/></div>
      <div class="f" style="flex:1;min-width:180px"><label>Email</label><input id="st_mail" value="${esc(set.email || '')}"/></div>
      <div class="f" style="width:190px"><label>GSTIN (blank if not registered)</label><input id="st_gst" value="${esc(set.gstin || '')}"/></div></div>
    <div class="row mt" style="align-items:center">
      <div class="f" style="width:220px"><label>Logo</label><input type="file" id="st_logo" accept="image/*"/></div>
      <div>${safeLogo(set.logo) ? `<img src="${safeLogo(set.logo)}" style="height:54px;border:1px solid var(--line);border-radius:8px;padding:4px;background:#fff"/>` : '<span class="mut sm">No logo</span>'}</div>
      <button class="btn sm" id="st_logox">Remove</button></div>
  </div>

  <div class="card pad mt"><b>Doctors</b><div class="hr"></div><div id="docBox"></div>
    <button class="btn sm mt" id="docAdd">＋ Add doctor</button>
    <div class="row mt"><div class="f" style="min-width:300px"><label>Doctor printed on every bill (letterhead &amp; signature)</label>
      <select id="st_dd">${s.doctors.map(d => `<option value="${d.id}" ${set.defaultDoctorId === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>
      <div class="mut xs" style="margin-top:4px">This name appears on every bill, estimate and treatment summary, whichever doctor treated the patient. The treating doctor is still recorded for the Doctor Report.</div></div></div>
  </div>

  <div class="card pad mt"><b>Users &amp; access</b><div class="hr"></div>
    <div class="scroll"><table><thead><tr><th>Username</th><th>Name</th><th>Access</th><th>Last login</th><th></th></tr></thead><tbody id="usrBody">
      ${users.map(u => `<tr data-uid="${u.id}"><td class="b">${esc(u.username)}${u.id === S.user.id ? ' <span class="chip">you</span>' : ''}</td>
        <td class="mut">${esc(u.full_name || '')}</td>
        <td><select data-uf="role"><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin — everything</option>
          <option value="staff" ${u.role === 'staff' ? 'selected' : ''}>Staff — billing only</option></select></td>
        <td class="sm mut">${u.last_login ? new Date(u.last_login).toLocaleString('en-IN') : 'never'}</td>
        <td class="right" style="white-space:nowrap"><button class="btn sm" data-upw="${u.id}">Reset password</button>
          <button class="btn sm ${u.active ? 'd' : ''}" data-uac="${u.id}">${u.active ? 'Disable' : 'Enable'}</button></td></tr>`).join('')}
    </tbody></table></div>
    <button class="btn mt" id="usrAdd">＋ Add user</button>
    <p class="sm mut mt" style="margin-bottom:0">Staff logins cannot open Reports, the Doctor Report or Settings, and cannot change prices, cancel bills or delete payments. Every login, price change, edit and cancellation is written to the audit log.</p>
  </div>

  <div class="card pad mt"><b>Numbering &amp; printing</b><div class="hr"></div>
    <div class="row">
      <div class="f" style="width:150px"><label>Next bill number</label><input id="st_no" class="num" value="${(S.counters.bill_no || 168) + 1}"/></div>
      <div class="f" style="width:140px"><label>Patient ID prefix</label><input id="st_rp" value="${esc(set.regPrefix || '')}"/></div>
      <div class="f" style="width:150px"><label>Next patient ID</label><input id="st_rn" class="num" value="${(S.counters.reg_no || 12681) + 1}"/></div>
      <div class="f" style="flex:1;min-width:180px"><label>Signature line</label><input id="st_ft" value="${esc(set.footer || '')}"/></div></div>
    <div class="row mt">
      <label class="switch"><input type="checkbox" id="st_w" ${set.showWords ? 'checked' : ''}/> Amount in words</label>
      <label class="switch"><input type="checkbox" id="st_sg" ${set.showSign ? 'checked' : ''}/> Signature block</label>
      <label class="switch"><input type="checkbox" id="st_tm" ${set.showTerms ? 'checked' : ''}/> Terms note</label>
      <label class="switch"><input type="checkbox" id="st_gs" ${set.gstEnabled ? 'checked' : ''}/> Enable GST on new bills</label>
      <div class="mut xs" style="margin-top:5px;max-width:520px">Leave this off unless the clinic is GST-registered. Charging GST without a registration is an offence, and the app will not let you switch it on until a valid GSTIN is saved above.</div></div>
    <div class="row mt"><div class="f" style="flex:1"><label>Terms text</label><input id="st_tt" value="${esc(set.terms || '')}"/></div></div>
    <div class="row mt"><div class="f" style="flex:1"><label>Payment modes (comma separated)</label><input id="st_md" value="${esc((set.modes || []).join(', '))}"/></div></div>
    <p class="sm mut mt" style="margin-bottom:0">GST: treatment by a clinical establishment is exempt (Notification 12/2017-CT(Rate)). Turning GST on affects <b>new</b> bills only — past bills keep the tax state they were saved with. Confirm with your CA first.</p>
  </div>

  <div class="card pad mt"><b>Data</b><div class="hr"></div>
    <div class="row">
      <button class="btn" id="dl">⬇ Download database export (JSON)</button>
      <div class="f" style="width:250px"><label>Import from the offline app's backup</label><input type="file" id="imp" accept=".json"/></div>
      <button class="btn" data-do="audit">View audit log</button></div>
    <p class="sm mut mt" style="margin-bottom:0">${typeof window.__DL === 'function'
      ? 'Everything is stored inside this browser on this computer. <b>Download a backup every evening</b> and keep it on a pen drive or Google Drive — restoring it here brings back every bill, patient and setting. Importing a backup from the old single-file app merges it in.'
      : 'This export is a convenience copy. The real backup is the nightly <code>pg_dump</code> on the server — see the README.'}</p>
  </div><div style="height:24px"></div>`;

  const renderDocs = () => {
    $('#docBox').innerHTML = S.doctors.map((d, i) => `<div class="row" data-di="${i}" style="margin-bottom:8px">
      <div class="f" style="flex:1;min-width:170px"><label>Name &amp; qualification</label><input data-df="name" value="${esc(d.name || '')}"/></div>
      <div class="f" style="flex:1;min-width:170px"><label>Speciality line</label><input data-df="spec" value="${esc(d.spec || '')}"/></div>
      <div class="f" style="flex:1;min-width:150px"><label>Designation</label><input data-df="role_line" value="${esc(d.role_line || '')}"/></div>
      <div class="f" style="width:100px"><label>Reg. No.</label><input data-df="reg_no" value="${esc(d.reg_no || '')}"/></div>
      <div class="f" style="width:140px"><label>Signature title</label><input data-df="sign_title" value="${esc(d.sign_title || '')}"/></div>
      <button class="btn sm d" data-dx="${i}" style="margin-bottom:2px">✕</button></div>`).join('');
    $('#docBox').oninput = e => { const f = e.target.dataset.df; if (f) S.doctors[+e.target.closest('[data-di]').dataset.di][f] = e.target.value; };
    $('#docBox').onclick = e => {
      const b = e.target.closest('[data-dx]'); if (!b) return;
      if (S.doctors.length < 2) return toast('Keep at least one doctor', 1);
      const d = S.doctors.splice(+b.dataset.dx, 1)[0];
      if (d.id) delDocs.push(d.id);
      renderDocs();
    };
  };
  renderDocs();
  $('#docAdd').onclick = () => { S.doctors.push({ name: 'New Doctor', spec: '', role_line: '', reg_no: '', sign_title: '', active: true }); renderDocs(); };

  const harvest = () => Object.assign(S.set, {
    clinicName: $('#st_name').value, line2: $('#st_l2').value, address: $('#st_addr').value, phone: $('#st_ph').value,
    website: $('#st_web').value, email: $('#st_mail').value, gstin: $('#st_gst').value,
    regPrefix: $('#st_rp').value, footer: $('#st_ft').value, terms: $('#st_tt').value,
    showWords: $('#st_w').checked, showSign: $('#st_sg').checked, showTerms: $('#st_tm').checked,
    gstEnabled: $('#st_gs').checked, defaultDoctorId: Number($('#st_dd').value) || null,
    modes: $('#st_md').value.split(',').map(x => x.trim()).filter(Boolean)
  });
  $('#st_logo').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 900000) return toast('Logo must be under 900 KB', 1);
    const r = new FileReader(); r.onload = () => { harvest(); S.set.logo = r.result; toast('Logo loaded — press Save settings'); }; r.readAsDataURL(f);
  };
  $('#st_logox').onclick = () => { harvest(); S.set.logo = ''; toast('Logo cleared — press Save settings'); };
  $('#stSave').onclick = async () => {
    harvest();
    try {
      await api('/settings', 'PUT', {
        settings: S.set, doctors: S.doctors, deleteDoctors: delDocs,
        counters: { bill_no: Math.max(0, (Number($('#st_no').value) || 1) - 1), reg_no: Math.max(0, (Number($('#st_rn').value) || 1) - 1) }
      });
      toast('Settings saved'); const s2 = await api('/settings'); S.set = s2.settings; S.doctors = s2.doctors; S.counters = s2.counters;
      paintBrand(); go('settings');
    } catch (e) { toast(e.message, 1); }
  };
  $('#usrBody').onchange = async e => {
    if (e.target.dataset.uf !== 'role') return;
    const id = e.target.closest('[data-uid]').dataset.uid;
    try { await api('/users/' + id, 'PATCH', { role: e.target.value }); toast('Access updated'); }
    catch (err) { toast(err.message, 1); go('settings'); }
  };
  $('#usrBody').onclick = async e => {
    const pw = e.target.closest('[data-upw]'), ac = e.target.closest('[data-uac]');
    if (pw) return resetPw(pw.dataset.upw);
    if (ac) {
      const on = ac.textContent.trim() === 'Enable';
      try { await api('/users/' + ac.dataset.uac, 'PATCH', { active: on }); toast(on ? 'Enabled' : 'Disabled'); go('settings'); }
      catch (err) { toast(err.message, 1); }
    }
  };
  $('#usrAdd').onclick = addUser;
  $('#dl').onclick = () => grab('/backup');
  $('#imp').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = async () => {
      let d; try { d = JSON.parse(r.result); } catch { return toast('Not a valid JSON file', 1); }
      confirmBox(`Import <b>${(d.patients || []).length} patients</b> and <b>${(d.invoices || []).length} bills</b> from the offline app?<br><br>
        Existing records are kept — this only adds. Bills whose number already exists are skipped.`, async () => {
        try {
          const rep = await api('/import', 'POST', d);
          modal('Import finished', `<p style="margin-top:0">Imported <b>${rep.invoices}</b> bills and <b>${rep.patients}</b> patients.
            ${rep.skipped ? `<br><b>${rep.skipped}</b> record(s) were skipped.` : ''}</p>
            ${(rep.skippedBills || []).length ? `<p class="sm mut">Bill numbers already present, so not imported again: ${esc(rep.skippedBills.join(', '))}</p>` : ''}
            ${(rep.collisions || []).length ? `<div class="warnbar" style="margin:10px 0 0"><span><b>Patient ID clashes.</b>
              These IDs already belonged to a different name, so the imported person was given a fresh ID instead of overwriting anyone:<br>
              ${rep.collisions.map(x => esc(x.reg) + ': had "' + esc(x.existing) + '", file said "' + esc(x.inFile) + '"').join('<br>')}</span></div>` : ''}`,
            `<button class="btn p" data-do="close">Done</button>`, true);
        }
        catch (err) { toast(err.message, 1); }
      }, 'Import');
    };
    r.readAsText(f);
  };
}
function addUser() {
  const m = modal('Add user', `
    <div class="row"><div class="f" style="flex:1"><label>Username *</label><input id="uu" autocapitalize="none" placeholder="e.g. reception"/></div>
      <div class="f" style="flex:1"><label>Full name</label><input id="uf"/></div></div>
    <div class="row mt"><div class="f" style="width:190px"><label>Access</label><select id="ur">
      <option value="staff">Staff — billing only</option><option value="admin">Admin — everything</option></select></div>
      <div class="f" style="flex:1"><label>Password (min 8) *</label><input id="up" type="text" value="${Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 6)}"/></div></div>
    <p class="sm mut mt">Give this password to the person — the app will ask them to set their own at first login.</p>`,
    `<button class="btn" data-do="close">Cancel</button><button class="btn p" id="uok">Create</button>`);
  $('#uok', m).onclick = async () => {
    try {
      await api('/users', 'POST', { username: $('#uu', m).value, password: $('#up', m).value, role: $('#ur', m).value, fullName: $('#uf', m).value });
      closeModal(); toast('User created'); go('settings');
    } catch (e) { toast(e.message, 1); }
  };
}
function resetPw(id) {
  const m = modal('Reset password', `<div class="f"><label>New password (min 8)</label>
     <input id="rp1" type="text" value="${Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 6)}"/></div>
     <p class="sm mut mt">They will be asked to set their own password at next login.</p>`,
    `<button class="btn" data-do="close">Cancel</button><button class="btn p" id="rpok">Set</button>`);
  $('#rpok', m).onclick = async () => {
    try { await api('/users/' + id, 'PATCH', { password: $('#rp1', m).value }); closeModal(); toast('Password reset'); }
    catch (e) { toast(e.message, 1); }
  };
}
async function showAudit() {
  const rows = await api('/audit');
  modal('Audit log — last 300 actions', `<div class="scroll" style="max-height:60vh"><table>
    <thead><tr><th>When</th><th>User</th><th>Action</th><th>Detail</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td class="sm">${new Date(r.at).toLocaleString('en-IN')}</td><td class="b">${esc(r.username)}</td>
      <td>${esc(r.action)}</td><td class="sm mut">${esc(JSON.stringify(r.detail).slice(1, -1).slice(0, 90))}</td></tr>`).join('')}
    </tbody></table></div>`, '', true);
}
