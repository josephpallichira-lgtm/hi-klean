/* ===================== NEW / EDIT BILL ===================== */
let B = null;
const activeDocs = () => S.doctors.filter(d => d.active !== false);
const multiDoc = () => activeDocs().length > 1;

function blankBill() {
  return {
    id: null, type: 'bill', no: '', date: today(),
    patientId: null, pat: { reg: '', name: '', age: '', sex: '', phone: '', address: '' },
    doctorId: S.set.defaultDoctorId || (activeDocs()[0] || {}).id || null,
    items: [], discType: 'amt', discValue: 0, notes: '', payments: [], gstOn: !!S.set.gstEnabled
  };
}

async function viewBill(M, args) {
  const editId = args && args[0] ? Number(args[0]) : null;
  if (editId) {
    if (!B || B.id !== editId) {
      const inv = await api('/invoices/' + editId);
      B = { ...inv, patientId: inv.patientId, pat: { reg: inv.preg, name: inv.pname, phone: inv.pphone || '' }, _edit: true };
      const p = await api('/patients/' + inv.patientId);
      B.pat = { reg: p.reg, name: p.name, age: p.age, sex: p.sex, phone: p.phone, address: p.address };
      B._snapPay = JSON.stringify(inv.payments);
    }
  } else if (!B || B._done || B._edit) B = blankBill();

  const p = B.pat || {};
  M.innerHTML = `
  <div class="head"><div><h1>${editId ? 'Edit Bill ' + esc(B.no) : 'New Bill'}</h1>
    <div class="sub">${editId ? 'Payments already recorded are not touched by an edit' : 'Pick the patient, add treatments, take payment'}</div></div>
    <div class="row">
      <button class="btn" id="bClear">Clear</button>
      ${editId ? '' : '<button class="btn" id="bEst">Save as Estimate</button>'}
      <button class="btn" id="bSave">Save only</button>
      <button class="btn p lg" id="bSaveP">Save &amp; Print</button>
    </div></div>

  <div class="card pad">
    <div class="row" style="gap:12px">
      <div class="f ac" style="flex:2;min-width:220px"><label>Patient — type name, phone or ID to search</label>
        <input id="pSearch" placeholder="Start typing…" autocomplete="off"/><div id="pAc"></div></div>
      <div class="f" style="width:130px"><label>Bill No.</label>
        <input id="bNo" value="${esc(B.no)}" placeholder="Auto" ${editId ? '' : 'readonly'}/></div>
      <div class="f" style="width:155px"><label>Date</label><input type="date" id="bDate" value="${B.date}"/></div>
      <div class="f" style="min-width:180px;flex:1"><label>Treating doctor <span class="mut xs">(reports only — bill prints ${esc((billingDoctor() || {}).name || '')})</span></label>
        <select id="bDoc">${activeDocs().map(d => `<option value="${d.id}" ${d.id === B.doctorId ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
    </div>
    <div class="row mt" style="gap:12px">
      <div class="f" style="width:120px"><label>Patient ID</label><input id="pReg" value="${esc(p.reg || '')}" placeholder="Auto"/></div>
      <div class="f" style="flex:2;min-width:190px"><label>Name *</label><input id="pName" value="${esc(p.name || '')}"/></div>
      <div class="f" style="width:80px"><label>Age</label><input id="pAge" value="${esc(p.age || '')}"/></div>
      <div class="f" style="width:110px"><label>Sex</label><select id="pSex"><option value="">-</option>${['Male', 'Female', 'Other'].map(x => `<option ${p.sex === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      <div class="f" style="width:150px"><label>Phone</label><input id="pPhone" value="${esc(p.phone || '')}"/></div>
      <div class="f" style="flex:2;min-width:180px"><label>Address</label><input id="pAddr" value="${esc(p.address || '')}"/></div>
    </div>
    <div id="pWarn"></div><div id="pDues" class="mt"></div>
  </div>

  <div class="card mt">
    <div class="pad" style="padding-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
      <b>Add treatment</b><input id="procSearch" placeholder="🔍  Search any procedure…" style="max-width:320px"/></div>
    <div class="pad" style="padding-top:0"><div class="pick">
      <div class="catlist" id="catList"></div><div class="proclist" id="procList"></div></div></div>
  </div>

  <div class="card mt"><div class="scroll"><table>
    <thead><tr><th style="width:32px">#</th><th>Treatment</th>${multiDoc() ? '<th style="width:135px">Doctor</th>' : ''}
      <th style="width:180px">Description / Tooth</th><th style="width:62px" class="num">Nos</th>
      <th style="width:100px" class="num">Rate</th><th style="width:90px" class="num">Disc</th>
      ${B.gstOn ? '<th style="width:70px">GST</th>' : ''}<th style="width:110px" class="num">Amount</th><th style="width:38px"></th></tr></thead>
    <tbody id="itemsBody"></tbody></table></div>
    <div class="pad" id="totBox"></div></div>

  <div class="card mt pad" id="payBox"></div><div style="height:24px"></div>`;

  const PF = { pReg: 'reg', pName: 'name', pAge: 'age', pSex: 'sex', pPhone: 'phone', pAddr: 'address' };
  const syncPat = () => {
    Object.keys(PF).forEach(id => B.pat[PF[id]] = $('#' + id).value);
    const w = $('#pWarn');
    if (B.patientId && B._linkedName && B.pat.name.trim() && B.pat.name.trim().toLowerCase() !== B._linkedName.toLowerCase()) {
      w.innerHTML = `<div class="warnbar" style="margin:10px 0 0"><span>This bill is linked to <b>${esc(B._linkedName)}</b> but the name now reads <b>${esc(B.pat.name)}</b>.
        On save you will be asked whether to rename that patient or create a new one.</span>
        <button class="btn sm" id="pUn">Make it a new patient</button></div>`;
      $('#pUn').onclick = () => { B.patientId = null; B._linkedName = null; $('#pReg').value = ''; syncPat(); $('#pDues').innerHTML = ''; };
    } else w.innerHTML = '';
  };
  Object.keys(PF).forEach(id => { $('#' + id).oninput = syncPat; $('#' + id).onchange = syncPat; });

  const ps = $('#pSearch');
  ps.value = p.name || '';
  ps.oninput = debounce(async () => {
    const s = ps.value.trim(); const box = $('#pAc');
    if (s.length < 2) { box.innerHTML = ''; return; }
    const hits = await api('/patients?q=' + encodeURIComponent(s));
    box.innerHTML = `<div class="aclist">${hits.length ? hits.slice(0, 8).map(h => `<div data-id="${h.id}"><b>${esc(h.name)}</b>
      <div class="xs mut">${esc(h.reg || '')} ${h.phone ? '· ' + esc(h.phone) : ''} ${h.age ? '· ' + esc(h.age) + 'y' : ''}</div></div>`).join('')
      : '<div class="mut">No match — fill the fields below to register a new patient</div>'}</div>`;
    $$('#pAc div[data-id]').forEach(d => d.onmousedown = () => pickPatient(Number(d.dataset.id)));
  }, 250);
  ps.onblur = () => setTimeout(() => $('#pAc').innerHTML = '', 200);

  $('#bDate').onchange = e => { B.date = e.target.value; renderPay(); };
  $('#bDoc').onchange = e => {
    const old = B.doctorId; B.doctorId = Number(e.target.value);
    B.items.forEach(it => { if (!it.docId || it.docId === old) it.docId = B.doctorId; });
    renderItems();
  };
  if (editId) $('#bNo').oninput = e => B.no = e.target.value;
  $('#bClear').onclick = () => confirmBox('Clear this bill and start fresh?', () => { B = null; go('bill'); }, 'Yes, clear');
  $('#bSave').onclick = () => saveBill(false);
  $('#bSaveP').onclick = () => saveBill(true);
  if ($('#bEst')) $('#bEst').onclick = () => { B.type = 'estimate'; B.payments = []; saveBill(true); };
  $('#procSearch').oninput = () => renderProcList();
  renderCats(); renderProcList(); renderItems(); renderPay();
  if (B.patientId) { B._linkedName = B.pat.name; showDues(); }
}

async function pickPatient(id) {
  const p = await api('/patients/' + id);
  B.patientId = p.id; B._linkedName = p.name;
  B.pat = { reg: p.reg, name: p.name, age: p.age, sex: p.sex, phone: p.phone, address: p.address };
  $('#pSearch').value = p.name; $('#pAc').innerHTML = ''; $('#pWarn').innerHTML = '';
  $('#pReg').value = p.reg || ''; $('#pName').value = p.name || ''; $('#pAge').value = p.age || '';
  $('#pSex').value = p.sex || ''; $('#pPhone').value = p.phone || ''; $('#pAddr').value = p.address || '';
  showDues();
}
async function showDues() {
  if (!B.patientId) return;
  const list = await api('/patients/' + B.patientId + '/invoices');
  const bills = list.filter(i => i.type !== 'estimate' && i.id !== B.id);
  const due = bills.reduce((a, i) => a + Math.max(0, i.bal), 0);
  const box = $('#pDues'); if (!box) return;
  box.innerHTML = `<div class="sm mut">Existing patient · ${bills.length} previous bill${bills.length === 1 ? '' : 's'}
    ${due > 0.005 ? `· <span class="tag r">Pending ${inr(due)}</span>` : '· <span class="tag g">No dues</span>'}
    · <a href="#patients/${B.patientId}">view history</a></div>`;
}

/* ---- procedure picker ---- */
let curCat = null;
function renderCats() {
  const cats = [...new Set(S.procs.filter(p => p.active).map(p => p.cat))];
  curCat = cats.includes(curCat) ? curCat : cats[0];
  $('#catList').innerHTML = cats.map(c => `<button data-c="${esc(c)}" class="${c === curCat ? 'on' : ''}">${esc(c)}</button>`).join('');
  $('#catList').onclick = e => { const b = e.target.closest('button'); if (!b) return; curCat = b.dataset.c; $('#procSearch').value = ''; renderCats(); renderProcList(); };
}
function renderProcList() {
  const s = ($('#procSearch').value || '').trim().toLowerCase();
  let list = S.procs.filter(p => p.active);
  list = s ? list.filter(p => p.name.toLowerCase().includes(s)) : list.filter(p => p.cat === curCat);
  $('#procList').innerHTML = list.length ? list.map(p => `<button class="pbtn" data-id="${p.id}">
    <span class="nm">${esc(p.name)}</span><span class="pr">${inr0(p.price)}</span>
    <span class="fl">${p.perTooth ? 'per tooth' : 'per visit'}${s ? ' · ' + esc(p.cat) : ''}</span></button>`).join('')
    : `<div class="empty sm">No match. ${isAdmin() ? '<a href="#procedures">Add it →</a>' : 'Ask the admin to add it.'}</div>`;
  $('#procList').onclick = e => { const b = e.target.closest('.pbtn'); if (b) addItem(Number(b.dataset.id)); };
}
function addItem(pid) {
  const p = S.procs.find(x => x.id === pid); if (!p) return;
  B.items.push({
    pid: p.id, name: p.name, desc: '', qty: 1, rate: p.price, disc: 0,
    taxable: !!p.taxable, gst: p.gst, gstIncl: p.gstIncl !== false, perTooth: p.perTooth, docId: B.doctorId
  });
  renderItems(); renderPay(true);
}

/* ---- items ---- */
function renderItems() {
  const tb = $('#itemsBody'); if (!tb) return;
  // Cost the lines BEFORE drawing them. A freshly added treatment has no
  // .amount yet, so drawing first printed ₹0.00 against a line that the
  // sub total was already counting — the row looked free until you touched it.
  const c0 = calc(B);
  const cols = 8 + (B.gstOn ? 1 : 0) + (multiDoc() ? 1 : 0);
  tb.innerHTML = B.items.length ? B.items.map((it, i) => `<tr data-i="${i}">
    <td class="mut">${i + 1}</td>
    <td><input data-f="name" value="${esc(it.name)}" style="border-color:transparent;padding-left:4px;font-weight:600"/></td>
    ${multiDoc() ? `<td><select data-f="docId">${activeDocs().map(d => `<option value="${d.id}" ${Number(it.docId) === d.id ? 'selected' : ''}>${esc(shortDoc(d.name))}</option>`).join('')}</select></td>` : ''}
    <td><div style="display:flex;gap:4px"><input data-f="desc" value="${esc(it.desc)}" placeholder="${it.perTooth ? 'tooth no.' : '—'}"/>
      <button class="btn sm" data-act="teeth">Tooth</button></div></td>
    <td><input data-f="qty" class="num" value="${it.qty}"/></td>
    <td><input data-f="rate" class="num" value="${it.rate}"/></td>
    <td><input data-f="disc" class="num" value="${it.disc || ''}" placeholder="0"/></td>
    ${B.gstOn ? `<td><label class="switch"><input type="checkbox" data-f="taxable" ${it.taxable ? 'checked' : ''}/>${it.gst}%</label>
      ${it.taxable ? `<select data-f="gstIncl" class="xs" style="padding:2px 4px;margin-top:3px">
        <option value="1" ${it.gstIncl !== false ? 'selected' : ''}>incl.</option>
        <option value="0" ${it.gstIncl === false ? 'selected' : ''}>extra</option></select>` : ''}</td>` : ''}
    <td class="num b" data-amt>${inr(it.amount || 0)}</td>
    <td class="right"><button class="btn sm d" data-act="del">✕</button></td></tr>`).join('')
    : `<tr><td colspan="${cols}"><div class="empty sm">No treatment added yet — pick from the list above.</div></td></tr>`;
  tb.oninput = tb.onchange = e => {
    const tr = e.target.closest('tr'); if (!tr) return;
    const f = e.target.dataset.f; if (!f) return;
    const it = B.items[+tr.dataset.i];
    if (f === 'taxable') it.taxable = e.target.checked;
    else if (f === 'gstIncl') it.gstIncl = e.target.value === '1';
    else if (f === 'docId') it.docId = Number(e.target.value);
    else if (f === 'name' || f === 'desc') it[f] = e.target.value;
    else it[f] = e.target.value === '' ? 0 : Number(e.target.value);
    const c = calc(B);
    tr.querySelector('[data-amt]').textContent = inr(it.amount);
    renderTotals(c); renderPay(true);
  };
  tb.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    const i = +b.closest('tr').dataset.i;
    if (b.dataset.act === 'del') { B.items.splice(i, 1); renderItems(); renderPay(true); }
    if (b.dataset.act === 'teeth') toothPicker(i);
  };
  renderTotals(c0);
}
const shortDoc = (n) => (n || '').replace(/^Dr\.?\s*/i, '').split(' ').slice(0, 2).join(' ');

function renderTotals(c) {
  const box = $('#totBox'); if (!box) return;
  box.innerHTML = `<div style="max-width:340px;margin-left:auto;font-size:14px">
    <div style="display:flex;justify-content:space-between;padding:3px 0"><span class="mut">Sub total</span><b>${inr(c.sub)}</b></div>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;gap:8px"><span class="mut">Discount</span>
      <span style="display:flex;gap:5px;align-items:center">
        <span class="seg"><button id="dAmt" class="${B.discType !== 'pct' ? 'on' : ''}">₹</button><button id="dPct" class="${B.discType === 'pct' ? 'on' : ''}">%</button></span>
        <input id="dVal" class="num" style="width:86px" value="${B.discValue || ''}" placeholder="0"/></span></div>
    ${c.disc ? `<div style="display:flex;justify-content:space-between;padding:3px 0;color:var(--bad)"><span>Less discount</span><b>− ${inr(c.disc)}</b></div>` : ''}
    ${c.taxAdd ? `<div style="display:flex;justify-content:space-between;padding:3px 0"><span class="mut">CGST + SGST (added)</span><b>${inr(c.taxAdd)}</b></div>` : ''}
    <div style="display:flex;justify-content:space-between;padding:9px 0 0;margin-top:6px;border-top:2px solid var(--acc);font-size:19px;color:var(--acc)"><b>Net Amount</b><b>${inr(c.total)}</b></div>
    ${c.taxIncl ? `<div style="text-align:right;font-size:12px;color:var(--mut);margin-top:3px">includes CGST + SGST ${inr(c.taxIncl)}</div>` : ''}</div>`;
  $('#dAmt').onclick = () => { B.discType = 'amt'; renderTotals(calc(B)); renderPay(true); };
  $('#dPct').onclick = () => { B.discType = 'pct'; renderTotals(calc(B)); renderPay(true); };
  $('#dVal').oninput = e => {
    B.discValue = Number(e.target.value) || 0;
    const v = e.target.value, c2 = calc(B);
    renderTotals(c2);
    const n = $('#dVal'); n.value = v; n.focus(); n.setSelectionRange(v.length, v.length);
    renderPay(true);
  };
}

/* ---- tooth picker ---- */
const UP_R = [18, 17, 16, 15, 14, 13, 12, 11], UP_L = [21, 22, 23, 24, 25, 26, 27, 28];
const LO_R = [48, 47, 46, 45, 44, 43, 42, 41], LO_L = [31, 32, 33, 34, 35, 36, 37, 38];
const DUP_R = [55, 54, 53, 52, 51], DUP_L = [61, 62, 63, 64, 65];
const DLO_R = [85, 84, 83, 82, 81], DLO_L = [71, 72, 73, 74, 75];
function toothPicker(i) {
  const it = B.items[i];
  let sel = (it.desc || '').split(/[,\s]+/).filter(s => /^\d{2}$/.test(s)).map(Number);
  const row = (arr, cls) => `<div class="qrow ${cls}">${arr.map(t => `<button class="tooth" data-t="${t}">${t}</button>`).join('')}</div>`;
  const grid = perm => perm
    ? `<div class="quad">${row(UP_R, '')}${row(UP_L, 'l')}</div><div class="midline"></div><div class="quad">${row(LO_R, '')}${row(LO_L, 'l')}</div>`
    : `<div class="quad">${row(DUP_R, '')}${row(DUP_L, 'l')}</div><div class="midline"></div><div class="quad">${row(DLO_R, '')}${row(DLO_L, 'l')}</div>`;
  const m = modal('Tooth numbers — ' + it.name,
    `<div class="row" style="margin-bottom:10px"><span class="seg"><button id="tPerm" class="on">Permanent</button><button id="tDec">Milk teeth</button></span>
      <span class="mut sm">FDI numbering</span></div>
     <div class="teeth" id="tGrid">${grid(true)}</div>
     <div class="mt"><b id="tSel" class="sm"></b></div>
     <div class="mt"><label class="switch"><input type="checkbox" id="tQty" ${it.perTooth ? 'checked' : ''}/> Set “Nos” = number of teeth
       ${it.perTooth ? '' : '<span class="mut xs">(priced per visit, not per tooth)</span>'}</label></div>`,
    `<button class="btn" data-do="close">Cancel</button><button class="btn p" id="tOk">Apply</button>`, true);
  const paint = () => {
    $$('#tGrid .tooth', m).forEach(b => b.classList.toggle('on', sel.includes(+b.dataset.t)));
    $('#tSel', m).textContent = sel.length ? 'Selected: ' + sel.slice().sort((a, b) => a - b).join(', ') : 'Nothing selected';
  };
  const bind = () => $('#tGrid', m).onclick = e => {
    const b = e.target.closest('.tooth'); if (!b) return;
    const t = +b.dataset.t; sel.includes(t) ? sel.splice(sel.indexOf(t), 1) : sel.push(t); paint();
  };
  bind(); paint();
  $('#tPerm', m).onclick = () => { $('#tPerm', m).classList.add('on'); $('#tDec', m).classList.remove('on'); $('#tGrid', m).innerHTML = grid(true); bind(); paint(); };
  $('#tDec', m).onclick = () => { $('#tDec', m).classList.add('on'); $('#tPerm', m).classList.remove('on'); $('#tGrid', m).innerHTML = grid(false); bind(); paint(); };
  $('#tOk', m).onclick = () => {
    sel.sort((a, b) => a - b);
    const keep = (it.desc || '').replace(/\d{2}/g, '').replace(/[,\s]+/g, ' ').trim();
    it.desc = (keep ? keep + ' ' : '') + sel.join(', ');
    if ($('#tQty', m).checked && sel.length) it.qty = sel.length;
    closeModal(); renderItems(); renderPay(true);
  };
}

/* ---- payments ---- */
function renderPay(light) {
  const box = $('#payBox'); if (!box) return;
  const c = calc(B);
  if (light && box._built) {
    const bal = box.querySelector('[data-bal]'); if (bal) bal.innerHTML = balHTML(c);
    const amt = $('#payAmt');
    if (amt && document.activeElement !== amt && !amt._touched) amt.value = c.bal > 0 ? c.bal : '';
    return;
  }
  box._built = 1;
  box.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
      <b>Payment</b><div data-bal>${balHTML(c)}</div></div><div class="hr"></div>
    ${B._edit ? `<div class="sm mut" style="margin-bottom:10px">Payments on a saved bill are added from the bill's <b>Open</b> screen so the record stays clean.
       ${(B.payments || []).length ? 'Recorded: ' + B.payments.map(p => dmy(p.date) + ' ' + esc(p.mode) + ' ' + inr(p.amount)).join(' · ') : 'None recorded yet.'}</div>` : `
    ${(B.payments || []).length ? `<table style="margin-bottom:10px"><tbody>${B.payments.map((p, i) => `<tr><td>${dmy(p.date)}</td><td>${esc(p.mode)}</td>
      <td class="mut">${esc(p.ref || '')}</td><td class="num b">${inr(p.amount)}</td>
      <td class="right"><button class="btn sm d" data-pd="${i}">✕</button></td></tr>`).join('')}</tbody></table>` : ''}
    <div class="row">
      <div class="f" style="width:150px"><label>Amount received</label><input id="payAmt" class="num" value="${c.bal > 0 ? c.bal : ''}" placeholder="0"/></div>
      <div class="f" style="width:145px"><label>Mode</label><select id="payMode">${(S.set.modes || ['Cash']).map(m => `<option>${esc(m)}</option>`).join('')}</select></div>
      <div class="f" style="width:150px"><label>Date</label><input type="date" id="payDate" value="${B.date}"/></div>
      <div class="f" style="flex:1;min-width:140px"><label>Ref / note</label><input id="payRef" placeholder="UPI ref, cheque no…"/></div>
      <button class="btn" id="payAdd">Add payment</button>
      <button class="btn" id="payFull">Mark fully paid</button></div>`}
    <div class="row mt"><div class="f" style="flex:1"><label>Note on bill (printed)</label>
      <input id="bNotes" value="${esc(B.notes || '')}" placeholder="e.g. Next visit 20/08 for crown cementation"/></div></div>`;
  $('#bNotes').oninput = e => B.notes = e.target.value;
  if (!B._edit) {
    $('#payAmt').oninput = e => e.target._touched = true;
    $('#payAdd').onclick = () => {
      const a = Number($('#payAmt').value) || 0; if (a <= 0) return toast('Enter an amount', 1);
      B.payments.push({ date: $('#payDate').value || B.date, mode: $('#payMode').value, amount: n2(a), ref: $('#payRef').value });
      box._built = 0; renderPay();
    };
    $('#payFull').onclick = () => {
      const c2 = calc(B); if (c2.bal <= 0) return toast('Nothing pending');
      B.payments.push({ date: $('#payDate').value || B.date, mode: $('#payMode').value, amount: c2.bal, ref: '' });
      box._built = 0; renderPay();
    };
    box.querySelectorAll('[data-pd]').forEach(b => b.onclick = () => { B.payments.splice(+b.dataset.pd, 1); box._built = 0; renderPay(); });
  }
}
const balHTML = (c) => `<span class="sm mut">Net ${inr(c.total)} · Paid ${inr(c.paid)} · </span>${balTag(c.bal, 1)}`;

/* ---- save ---- */
async function saveBill(print) {
  const name = $('#pName').value.trim();
  if (!name) { toast('Patient name is required', 1); $('#pName').focus(); return; }
  if (!B.items.length) { toast('Add at least one treatment', 1); return; }
  const fields = {
    name, reg: $('#pReg').value.trim(), age: $('#pAge').value.trim(),
    sex: $('#pSex').value, phone: $('#pPhone').value.trim(), address: $('#pAddr').value.trim()
  };
  if (B.patientId && B._linkedName && name.toLowerCase() !== B._linkedName.toLowerCase()) {
    const m = modal('Which patient is this bill for?',
      `<p style="margin-top:0">The bill is linked to <b>${esc(B._linkedName)}</b>, but the name now reads <b>${esc(name)}</b>.</p>
       <p class="sm mut">Renaming changes that name on every past bill of theirs. Creating a new patient keeps the histories separate.</p>`,
      `<button class="btn" data-do="close">Cancel</button>
       <button class="btn" id="qRen">Rename ${esc(B._linkedName)}</button>
       <button class="btn p" id="qNew">Create new patient</button>`);
    $('#qRen', m).onclick = () => { closeModal(); finishSave(print, fields, true); };
    $('#qNew', m).onclick = () => { closeModal(); B.patientId = null; fields.reg = ''; finishSave(print, fields, false); };
    return;
  }
  if (!B.patientId) {
    const hits = await api('/patients?q=' + encodeURIComponent(name));
    const dup = hits.find(h => h.name.toLowerCase() === name.toLowerCase());
    if (dup && !B._dupOk) {
      const m = modal('Patient already exists',
        `<p style="margin-top:0"><b>${esc(dup.name)}</b> (${esc(dup.reg || '')}${dup.phone ? ' · ' + esc(dup.phone) : ''}) is already registered.</p>
         <p class="sm mut">Billing to the existing record keeps their history and dues in one place.</p>`,
        `<button class="btn" data-do="close">Cancel</button>
         <button class="btn" id="qFresh">Create a second record</button>
         <button class="btn p" id="qUse">Use existing patient</button>`);
      $('#qUse', m).onclick = async () => { closeModal(); await pickPatient(dup.id); finishSave(print, { ...fields, reg: dup.reg }, true); };
      $('#qFresh', m).onclick = () => { closeModal(); B._dupOk = 1; finishSave(print, fields, false); };
      return;
    }
  }
  finishSave(print, fields, !!B.patientId);
}

async function finishSave(print, fields, linked) {
  try {
    let pid = B.patientId;
    if (linked && pid) await api('/patients/' + pid, 'PATCH', fields);
    else { const p = await api('/patients', 'POST', fields); pid = p.id; B.patientId = pid; B.pat.reg = p.reg; }

    const payload = {
      type: B.type, date: B.date, patientId: pid, doctorId: Number($('#bDoc').value) || null,
      items: B.items.map(it => ({ ...it, docId: it.docId || Number($('#bDoc').value) || null })),
      discType: B.discType, discValue: B.discValue, notes: B.notes || '', gstOn: B.gstOn
    };
    let saved;
    if (B._edit && B.id) {
      payload.no = $('#bNo').value.trim() || B.no;
      saved = await api('/invoices/' + B.id, 'PUT', payload);
    } else {
      payload.payments = B.payments;
      payload.autoNumber = true;
      saved = await api('/invoices', 'POST', payload);
    }
    toast((saved.type === 'estimate' ? 'Estimate ' : 'Bill ') + saved.no + ' saved');
    B._done = 1; B = null;
    if (print) printBill(saved);
    location.hash = 'invoices';
  } catch (e) { toast(e.message, 1); }
}
