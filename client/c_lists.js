/* ===================== BILLS ===================== */
let invF = { q: '', from: '', to: '', st: 'all' };
async function viewInvoices(M) {
  M.innerHTML = `<div class="head"><div><h1>Bills</h1><div class="sub">Search by bill number, patient, phone or ID</div></div>
    <button class="btn p" data-do="newbill">＋ New Bill</button></div>
   <div class="card pad"><div class="row">
     <div class="f" style="flex:2;min-width:190px"><label>Search</label><input id="iq" value="${esc(invF.q)}"/></div>
     <div class="f"><label>From</label><input type="date" id="ifrom" value="${invF.from}"/></div>
     <div class="f"><label>To</label><input type="date" id="ito" value="${invF.to}"/></div>
     <div class="f"><label>Status</label><select id="ist">${['all', 'pending', 'paid'].map(x => `<option value="${x}" ${invF.st === x ? 'selected' : ''}>${x[0].toUpperCase() + x.slice(1)}</option>`).join('')}</select></div>
     <button class="btn" id="iclr">Reset</button></div></div>
   <div class="card mt"><div class="scroll" id="ilist"><div class="empty">Loading…</div></div></div>`;
  const run = debounce(() => {
    invF = { q: $('#iq').value, from: $('#ifrom').value, to: $('#ito').value, st: $('#ist').value };
    loadInvList();
  }, 300);
  $('#iq').oninput = run; $('#ifrom').onchange = run; $('#ito').onchange = run; $('#ist').onchange = run;
  $('#iclr').onclick = () => { invF = { q: '', from: '', to: '', st: 'all' }; go('invoices'); };
  loadInvList();
}
async function loadInvList() {
  const qs = new URLSearchParams();
  if (invF.q) qs.set('q', invF.q);
  if (invF.from) qs.set('from', invF.from);
  if (invF.to) qs.set('to', invF.to);
  if (invF.st !== 'all') qs.set('status', invF.st);
  const list = await api('/invoices?' + qs.toString());
  const real = list.filter(i => i.type !== 'estimate');
  const tot = real.reduce((a, i) => a + i.total, 0), paid = real.reduce((a, i) => a + i.paid, 0);
  if (!$('#ilist')) return;
  $('#ilist').innerHTML = list.length ? `<table><thead><tr><th>Bill</th><th>Date</th><th>Patient</th><th>Treatments</th>
     <th class="num">Total</th><th class="num">Paid</th><th class="num">Balance</th><th></th></tr></thead><tbody>
    ${list.map(i => `<tr><td class="b">${esc(i.no)}${i.type === 'estimate' ? ' <span class="tag y">EST</span>' : ''}</td>
      <td>${dmy(i.date)}</td>
      <td>${esc(i.pname)}<div class="xs mut">${esc(i.preg || '')}${i.pphone ? ' · ' + esc(i.pphone) : ''}</div></td>
      <td class="sm mut">${esc(i.items.map(t => t.name).join(', ').slice(0, 55))}${i.items.map(t => t.name).join(', ').length > 55 ? '…' : ''}</td>
      <td class="num">${inr(i.total)}</td><td class="num">${inr(i.paid)}</td>
      <td class="num">${balTag(i.bal)}</td>
      <td class="right" style="white-space:nowrap"><button class="btn sm" data-do="open" data-id="${i.id}">Open</button>
        <button class="btn sm" data-do="print" data-id="${i.id}">🖨</button></td></tr>`).join('')}
    <tr style="background:#fafbfc"><td colspan="4" class="b right">${real.length} bills${list.length - real.length ? ' + ' + (list.length - real.length) + ' estimates (not counted)' : ''}</td>
      <td class="num b">${inr(tot)}</td><td class="num b">${inr(paid)}</td><td class="num b">${inr(tot - paid)}</td><td></td></tr>
    </tbody></table>` : '<div class="empty"><div class="big">☰</div>No bills match.</div>';
}

async function openInv(id) {
  const inv = await api('/invoices/' + id);
  const m = modal((inv.type === 'estimate' ? 'Estimate ' : 'Bill ') + inv.no + ' · ' + dmy(inv.date),
    `<div class="row" style="justify-content:space-between">
      <div><b style="font-size:16px">${esc(inv.pname)}</b><div class="sm mut">${esc(inv.preg || '')} ${inv.pphone ? '· ' + esc(inv.pphone) : ''}</div></div>
      <div class="right"><div class="sm mut">${esc(docOf(inv.doctorId).name)}</div>
        ${balTag(inv.bal, 1)}</div></div>
     <div class="scroll"><table class="mt"><thead><tr><th>Treatment</th>${multiDoc() ? '<th>Doctor</th>' : ''}<th>Description</th>
       <th class="num">Nos</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
     <tbody>${inv.items.map(t => `<tr><td>${esc(t.name)}</td>${multiDoc() ? `<td class="sm mut">${esc(shortDoc(docOf(t.docId).name))}</td>` : ''}
       <td class="mut">${esc(t.desc || '')}</td><td class="num">${t.qty}</td><td class="num">${inr(t.rate)}</td>
       <td class="num b">${inr(t.amount)}</td></tr>`).join('')}</tbody></table></div>
     <div class="mt right"><div class="sm">Sub total: <b>${inr(inv.sub)}</b></div>
      ${inv.disc ? `<div class="sm">Discount: <b>− ${inr(inv.disc)}</b></div>` : ''}
      ${inv.tax ? `<div class="sm">GST: <b>${inr(inv.tax)}</b></div>` : ''}
      <div style="font-size:18px;color:var(--acc)"><b>Net ${inr(inv.total)}</b></div></div>
     <div class="hr"></div><b class="sm">Payments</b>
     ${inv.payments.length ? `<table class="mt"><tbody>${inv.payments.map(x => `<tr><td>${dmy(x.date)}</td><td>${esc(x.mode)}</td>
        <td class="mut">${esc(x.ref || '')}</td><td class="num b">${inr(x.amount)}</td>
        ${isAdmin() ? `<td class="right"><button class="btn sm d" data-delpay="${x.id}">✕</button></td>` : ''}</tr>`).join('')}</tbody></table>`
      : '<div class="sm mut">No payment recorded.</div>'}
     ${inv.bal > 0.005 && inv.type !== 'estimate' ? `<div class="row mt">
        <div class="f" style="width:130px"><label>Collect now</label><input id="cAmt" class="num" value="${inv.bal}"/></div>
        <div class="f" style="width:140px"><label>Mode</label><select id="cMode">${(S.set.modes || ['Cash']).map(x => `<option>${esc(x)}</option>`).join('')}</select></div>
        <div class="f" style="width:150px"><label>Date</label><input type="date" id="cDate" value="${today()}"/></div>
        <button class="btn p" id="cAdd">Add payment</button></div>` : ''}
     ${inv.notes ? `<div class="sm mut mt">Note: ${esc(inv.notes)}</div>` : ''}
     <div class="xs mut mt">Created ${new Date(inv.createdAt).toLocaleString('en-IN')}${inv.createdBy ? ' by ' + esc(inv.createdBy) : ''}</div>`,
    `${isAdmin() ? '<button class="btn d" id="iVoid">Cancel bill</button>' : ''}
     ${inv.type === 'estimate' ? '<button class="btn" id="iConv">Convert to Bill</button>' : ''}
     <button class="btn" data-do="edit" data-id="${inv.id}">Edit</button>
     <button class="btn" data-do="printt" data-id="${inv.id}">Thermal</button>
     <button class="btn p" data-do="print" data-id="${inv.id}">🖨 Print A4</button>`, true);

  const add = $('#cAdd', m);
  if (add) add.onclick = async () => {
    const a = Number($('#cAmt', m).value) || 0; if (a <= 0) return;
    try {
      await api(`/invoices/${inv.id}/payments`, 'POST', { amount: a, mode: $('#cMode', m).value, date: $('#cDate', m).value });
      closeModal(); toast('Payment added'); go(S.route);
    } catch (e) { toast(e.message, 1); }
  };
  m.querySelectorAll('[data-delpay]').forEach(b => b.onclick = () => confirmBox('Remove this payment? It stays in the audit log.', async () => {
    await api(`/invoices/${inv.id}/payments/${b.dataset.delpay}`, 'DELETE');
    closeModal(); toast('Payment removed'); go(S.route);
  }, 'Remove'));
  const cv = $('#iConv', m);
  if (cv) cv.onclick = async () => { const r = await api(`/invoices/${inv.id}/convert`, 'POST'); closeModal(); toast('Converted to Bill ' + r.no); go(S.route); };
  const vd = $('#iVoid', m);
  if (vd) vd.onclick = () => {
    const m2 = modal('Cancel bill ' + inv.no,
      `<p style="margin-top:0" class="sm mut">Bills are never deleted — cancelling keeps the record and the reason, so the number sequence stays auditable.</p>
       <div class="f"><label>Reason *</label><input id="vr" placeholder="e.g. billed twice by mistake"/></div>`,
      `<button class="btn" data-do="close">Back</button><button class="btn d" id="vok">Cancel this bill</button>`);
    $('#vok', m2).onclick = async () => {
      try { await api(`/invoices/${inv.id}/void`, 'POST', { reason: $('#vr', m2).value }); closeModal(); toast('Bill cancelled'); go(S.route); }
      catch (e) { toast(e.message, 1); }
    };
  };
}
async function printInv(id, thermal) {
  const inv = await api('/invoices/' + id);
  printBill(inv, thermal);
}

/* ===================== PATIENTS ===================== */
let pq = '';
async function viewPatients(M, args) {
  if (args && args[0]) return patientCard(M, Number(args[0]));
  M.innerHTML = `<div class="head"><div><h1>Patients</h1><div class="sub">Search by name, phone or patient ID</div></div>
    <button class="btn p" id="pnew">＋ Add patient</button></div>
   <div class="card pad"><div class="row"><div class="f" style="flex:1"><label>Search</label>
     <input id="pq" value="${esc(pq)}" placeholder="Type at least 2 letters"/></div></div></div>
   <div class="card mt"><div class="scroll" id="plist"><div class="empty">Loading…</div></div></div>`;
  const run = debounce(async () => { pq = $('#pq').value; await loadPatients(); }, 300);
  $('#pq').oninput = run;
  $('#pnew').onclick = () => editPatient(null);
  await loadPatients();
}
async function loadPatients() {
  const list = await api('/patients' + (pq.trim().length >= 2 ? '?q=' + encodeURIComponent(pq.trim()) : ''));
  if (!$('#plist')) return;
  $('#plist').innerHTML = list.length ? `<table><thead><tr><th>Patient ID</th><th>Name</th><th>Age/Sex</th><th>Phone</th><th></th></tr></thead><tbody>
    ${list.map(p => `<tr><td class="mut">${esc(p.reg || '')}</td><td class="b">${esc(p.name)}</td>
      <td>${esc(p.age || '')}${p.sex ? ' / ' + esc(String(p.sex)[0]) : ''}</td><td>${esc(p.phone || '')}</td>
      <td class="right"><button class="btn sm" data-do="go" data-h="patients/${p.id}">History</button></td></tr>`).join('')}
    </tbody></table>` : '<div class="empty"><div class="big">☺</div>No patients found.</div>';
}
function editPatient(p) {
  const isNew = !p;
  p = p || {};
  const m = modal(isNew ? 'New patient' : 'Edit patient', `
    <div class="row"><div class="f" style="width:130px"><label>Patient ID</label><input id="ep_reg" value="${esc(p.reg || '')}" placeholder="Auto"/></div>
      <div class="f" style="flex:1;min-width:170px"><label>Name *</label><input id="ep_name" value="${esc(p.name || '')}"/></div></div>
    <div class="row mt"><div class="f" style="width:90px"><label>Age</label><input id="ep_age" value="${esc(p.age || '')}"/></div>
      <div class="f" style="width:120px"><label>Sex</label><select id="ep_sex"><option value="">-</option>${['Male', 'Female', 'Other'].map(x => `<option ${p.sex === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      <div class="f" style="width:160px"><label>Phone</label><input id="ep_phone" value="${esc(p.phone || '')}"/></div></div>
    <div class="row mt"><div class="f" style="flex:1"><label>Address</label><input id="ep_addr" value="${esc(p.address || '')}"/></div></div>
    <div class="row mt"><div class="f" style="flex:1"><label>Medical alerts (diabetes, BP, allergy…)</label><textarea id="ep_note">${esc(p.note || '')}</textarea></div></div>`,
    `<button class="btn" data-do="close">Cancel</button><button class="btn p" id="ep_save">Save</button>`);
  $('#ep_save', m).onclick = async () => {
    const body = {
      name: $('#ep_name', m).value.trim(), reg: $('#ep_reg', m).value.trim(), age: $('#ep_age', m).value.trim(),
      sex: $('#ep_sex', m).value, phone: $('#ep_phone', m).value.trim(), address: $('#ep_addr', m).value.trim(), note: $('#ep_note', m).value
    };
    if (!body.name) return toast('Name required', 1);
    try {
      if (isNew) await api('/patients', 'POST', body); else await api('/patients/' + p.id, 'PATCH', body);
      closeModal(); toast('Patient saved'); go(S.route);
    } catch (e) { toast(e.message, 1); }
  };
}
async function patientCard(M, id) {
  const [p, list] = await Promise.all([api('/patients/' + id), api('/patients/' + id + '/invoices')]);
  const real = list.filter(i => i.type !== 'estimate');
  const tot = real.reduce((a, i) => a + i.total, 0), paid = real.reduce((a, i) => a + i.paid, 0);
  M.innerHTML = `<div class="head"><div><h1>${esc(p.name)}</h1>
    <div class="sub">${esc(p.reg || '')} ${p.age ? '· ' + esc(p.age) + 'y' : ''} ${p.sex ? '/ ' + esc(p.sex) : ''} ${p.phone ? '· 📞 ' + esc(p.phone) : ''} ${p.address ? '· ' + esc(p.address) : ''}</div></div>
    <div class="row"><button class="btn" data-do="go" data-h="patients">← All</button>
      <button class="btn" id="pedit">Edit</button>
      <button class="btn" data-do="go" data-h="summary/${p.id}">Treatment Summary</button>
      <button class="btn p" id="nb">＋ New bill</button></div></div>
   ${p.note ? `<div class="warnbar"><span><b>Medical note:</b> ${esc(p.note)}</span></div>` : ''}
   <div class="stats"><div class="stat"><div class="k">Visits billed</div><div class="v">${real.length}</div></div>
     <div class="stat"><div class="k">Total billed</div><div class="v">${inr0(tot)}</div></div>
     <div class="stat"><div class="k">Received</div><div class="v">${inr0(paid)}</div></div>
     <div class="stat"><div class="k">${tot - paid < -0.005 ? 'Advance held' : 'Pending'}</div>
       <div class="v" style="color:${tot - paid > 0.005 ? 'var(--bad)' : tot - paid < -0.005 ? 'var(--warn)' : 'var(--good)'}">${inr0(Math.abs(tot - paid))}</div></div></div>
   <div class="card mt"><div class="scroll">${list.length ? `<table><thead><tr><th>Bill</th><th>Date</th><th>Treatments</th>
     <th class="num">Total</th><th class="num">Balance</th><th></th></tr></thead><tbody>
     ${list.slice().reverse().map(i => `<tr><td class="b">${esc(i.no)}</td><td>${dmy(i.date)}</td>
       <td class="sm">${i.items.map(t => esc(t.name) + (t.desc ? ' <span class="mut">(' + esc(t.desc) + ')</span>' : '')).join('<br>')}</td>
       <td class="num">${inr(i.total)}</td>
       <td class="num">${balTag(i.bal)}</td>
       <td class="right"><button class="btn sm" data-do="open" data-id="${i.id}">Open</button></td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">No bills yet.</div>'}</div></div>`;
  $('#pedit').onclick = () => editPatient(p);
  $('#nb').onclick = async () => { B = blankBill(); location.hash = 'bill'; setTimeout(() => pickPatient(p.id), 350); };
}

/* ===================== TREATMENT SUMMARY ===================== */
async function viewSummary(M, args) {
  const pid = args && args[0] ? Number(args[0]) : null;
  M.innerHTML = `<div class="head"><div><h1>Treatment Summary — Invoice</h1>
    <div class="sub">Consolidated date-wise invoice across all visits — for insurance / reimbursement / records</div></div></div>
   <div class="card pad"><div class="row"><div class="f ac" style="flex:1;max-width:420px"><label>Patient</label>
     <input id="sq" placeholder="Type patient name, phone or ID…" autocomplete="off"/><div id="sac"></div></div></div></div>
   <div id="sOut" class="mt"></div>`;
  const q = $('#sq');
  q.oninput = debounce(async () => {
    const s = q.value.trim(); const box = $('#sac');
    if (s.length < 2) { box.innerHTML = ''; return; }
    const hits = await api('/patients?q=' + encodeURIComponent(s));
    box.innerHTML = `<div class="aclist">${hits.length ? hits.slice(0, 8).map(h => `<div data-id="${h.id}"><b>${esc(h.name)}</b>
      <div class="xs mut">${esc(h.reg || '')} ${esc(h.phone || '')}</div></div>`).join('') : '<div class="mut">No match</div>'}</div>`;
    $$('#sac div[data-id]').forEach(d => d.onmousedown = () => { box.innerHTML = ''; location.hash = 'summary/' + d.dataset.id; });
  }, 250);
  if (pid) {
    const [p, list] = await Promise.all([api('/patients/' + pid), api('/patients/' + pid + '/invoices')]);
    q.value = p.name;
    renderSummary(p, list.filter(i => i.type !== 'estimate'));
  }
}
function renderSummary(p, bills) {
  if (!bills.length) { $('#sOut').innerHTML = '<div class="card empty">No bills for this patient yet.</div>'; return; }
  const tot = bills.reduce((a, i) => a + i.total, 0), paid = bills.reduce((a, i) => a + i.paid, 0);
  $('#sOut').innerHTML = `<div class="card">
    <div class="pad" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
      <div><b>${esc(p.name)}</b> <span class="mut sm">· ${esc(p.reg || '')} · ${esc(p.age || '')} Years / ${esc(p.sex || '')}</span></div>
      <div class="row"><label class="switch"><input type="checkbox" id="sAmts" checked/> show amounts</label>
        <button class="btn p" id="sPrint">🖨 Print Treatment Summary</button></div></div>
    <div class="scroll"><table><thead><tr><th>Date</th><th>Description of service</th>${multiDoc() ? '<th>Doctor</th>' : ''}<th class="num">Amount</th></tr></thead><tbody>
      ${bills.map(i => i.items.map((t, k) => `<tr><td>${k === 0 ? dmy(i.date) : ''}</td>
        <td>${esc(t.name)}${t.desc ? ' ' + esc(t.desc) : ''}${t.qty > 1 ? ' (' + t.qty + ' UNIT)' : ''}</td>
        ${multiDoc() ? `<td class="sm mut">${esc(shortDoc(docOf(t.docId).name))}</td>` : ''}
        <td class="num">${inr(t.amount)}</td></tr>`).join('')
    + (i.disc ? `<tr><td></td><td class="mut">Less: discount</td>${multiDoc() ? '<td></td>' : ''}<td class="num mut">− ${inr(i.disc)}</td></tr>` : '')
    + (i.tax ? `<tr><td></td><td class="mut">GST</td>${multiDoc() ? '<td></td>' : ''}<td class="num mut">${inr(i.tax)}</td></tr>` : '')).join('')}
      <tr style="background:#fafbfc"><td></td><td class="b right" colspan="${multiDoc() ? 2 : 1}">Total</td><td class="num b">${inr(tot)}</td></tr>
      ${tot - paid > 0.005 ? `<tr><td></td><td class="b right" colspan="${multiDoc() ? 2 : 1}">Balance due</td><td class="num b" style="color:var(--bad)">${inr(tot - paid)}</td></tr>` : ''}
    </tbody></table></div></div>`;
  $('#sPrint').onclick = () => doPrint(summaryHTML(p, bills, $('#sAmts').checked));
}
