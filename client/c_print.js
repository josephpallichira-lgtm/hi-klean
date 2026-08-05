/* docId is accepted for call-site compatibility but intentionally IGNORED:
   every printed document carries the clinic's billing doctor, never the doctor
   who happened to see the patient. */
function letterhead(docId) {
  const s = S.set, d = billingDoctor() || {};
  return `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;border-bottom:2.5px solid #12225c;padding-bottom:6px">
    <div style="flex:1 1 auto">
      <div style="font-size:${(s.clinicName || '').length > 26 ? 15 : 20}px;font-weight:800;color:#12225c;letter-spacing:-.4px;line-height:1.05">${esc(s.clinicName)}</div>
      <div style="background:#d32f2f;color:#fff;font-size:${(s.line2 || '').length > 52 ? 7.6 : 8.8}px;font-weight:700;letter-spacing:.4px;padding:1.5px 5px;margin:2.5px 0 4px;display:inline-block">${esc(s.line2)}</div>
      <div style="font-size:9.3px;line-height:1.6;color:#111">
        ${s.address ? '📍 ' + esc(s.address) + '<br>' : ''}
        ${s.website ? '🌐 ' + esc(s.website) : ''}${s.email ? ' &nbsp; ✉ ' + esc(s.email) : ''}<br>
        ${s.phone ? '☎ ' + esc(s.phone) : ''}${s.gstin ? '<br>GSTIN: ' + esc(s.gstin) : ''}
      </div>
    </div>
    ${safeLogo(s.logo) ? `<div style="flex:0 0 84px;text-align:center"><img src="${safeLogo(s.logo)}" style="max-height:64px;max-width:84px"/></div>` : ''}
    <div style="flex:0 0 200px;text-align:left;border-left:1px solid #999;padding-left:10px">
      <div style="font-size:12px;font-weight:800;color:#d32f2f">${esc(d.name || '')}</div>
      ${d.spec ? `<div style="font-size:9px;color:#333">${esc(d.spec)}</div>` : ''}
      ${d.role_line ? `<div style="font-size:10px;font-weight:700;color:#12225c">${esc(d.role_line)}</div>` : ''}
      ${d.reg_no ? `<div style="font-size:9.5px;color:#333">Reg. No.: ${esc(d.reg_no)}</div>` : ''}
    </div></div>`;
}
function billHTML(inv) {
  const s = S.set, c = { sub: inv.sub, disc: inv.disc, tax: inv.tax, total: inv.total, paid: inv.paid, bal: inv.bal }, p = inv.pat || { name: inv.pname, reg: inv.preg, age: inv.page, sex: inv.psex, address: inv.paddress };
  // GST already sitting inside the quoted prices is declared, never added again.
  const taxIncl = Number(inv.taxIncl || 0);
  const taxAdd = Math.max(0, Number(inv.tax || 0) - taxIncl);
  const title = inv.type === 'estimate' ? 'TREATMENT ESTIMATE' : (c.tax > 0 ? 'TAX INVOICE' : 'BILL');
  const rows = inv.items.map((t, i) => `<tr>
      <td style="text-align:center">${i + 1}</td>
      <td>${esc(t.name)}</td>
      <td>${esc(t.desc || '')}</td>
      <td style="text-align:center">${t.qty}</td>
      <td style="text-align:right">${Number(t.rate).toFixed(2)}</td>
      <td style="text-align:right">${Number(t.amount).toFixed(2)}</td></tr>`).join('');
  const filler = inv.items.length < 6 ? Array(6 - inv.items.length).fill('<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>').join('') : '';
  const money = (lbl, val, bold) => `<tr><td colspan="3" style="border:0"></td>
     <td colspan="2" style="text-align:right;white-space:nowrap;${bold ? 'font-weight:800;' : ''}">${lbl}</td><td style="text-align:right;${bold ? 'font-weight:800;font-size:13.5px;' : ''}">${Number(val).toFixed(2)}</td></tr>`;
  return `<div class="inv">
    ${letterhead(inv.doctorId)}
    <div class="ttl">${title}</div>
    <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:8px;gap:16px;line-height:1.7">
      <div style="flex:1.25">
        <div><b style="display:inline-block;width:64px">Bill No</b>: <b>${esc(inv.no)}</b></div>
        <div><b style="display:inline-block;width:64px">Name</b>: <b>${esc(p.name || '')}</b></div>
        <div style="display:flex"><b style="flex:0 0 64px">Address</b><span>: ${esc(p.address || '')}</span></div>
      </div>
      <div style="flex:0 0 232px">
        <div><b style="display:inline-block;width:74px">Date</b>: ${dmy(inv.date)}</div>
        <div><b style="display:inline-block;width:74px">Patient ID</b>: ${esc(p.reg || '')}</div>
        <div><b style="display:inline-block;width:74px">Age</b>: ${esc(p.age || '')} &nbsp; <b>Sex</b>: ${esc(p.sex || '')}</div>
      </div>
    </div>
    <table>
      <thead><tr><th style="width:26px">#</th><th style="width:38%">Treatment</th><th>Description</th>
        <th style="width:38px">Nos</th><th style="width:70px">Rate</th><th style="width:82px">Amount</th></tr></thead>
      <tbody>${rows}${filler}
        ${c.disc ? money('Sub Total', c.sub) : ''}
        ${c.disc ? money('Discount', -c.disc) : ''}
        ${taxAdd > 0.004 ? money('CGST + SGST', taxAdd) : ''}
        ${money('Net Amount Rs:', c.total, 1)}
        ${c.paid && Math.abs(c.bal) > 0.5 ? money('Paid', c.paid) : ''}
        ${c.bal > 0.5 ? money('Balance Due Rs:', c.bal, 1) : ''}
        ${c.bal < -0.5 ? money('Advance / Refundable Rs:', -c.bal, 1) : ''}
      </tbody></table>
    ${taxIncl > 0.004 ? `<div style="font-size:10.5px;margin-top:5px"><b>Net amount is inclusive of CGST + SGST ${Number(taxIncl).toFixed(2)}</b></div>` : ''}
    ${s.showWords ? `<div style="font-size:10.5px;margin-top:5px"><b>In words:</b> ${numWords(c.total)}</div>` : ''}
    ${(inv.payments || []).length ? `<div style="font-size:10.5px;margin-top:4px"><b>Payment:</b> ${inv.payments.map(x => dmy(x.date) + ' ' + esc(x.mode) + ' ' + Number(x.amount).toFixed(2) + (x.ref ? ' (' + esc(x.ref) + ')' : '')).join(' · ')}</div>` : ''}
    ${inv.notes ? `<div style="font-size:10.5px;margin-top:4px"><b>Note:</b> ${esc(inv.notes)}</div>` : ''}
    ${!(c.tax > 0.004) ? `<div style="font-size:9px;color:#555;margin-top:5px">Healthcare services by a clinical establishment — exempt from GST (Notification 12/2017-CT(Rate)). This is not a tax invoice.</div>` : ''}
    ${s.showTerms && s.terms ? `<div class="note">${esc(s.terms)}</div>` : ''}
    ${s.showSign ? `<div class="signblock" style="margin-top:34px;display:flex;justify-content:flex-end">
      <div style="text-align:center;min-width:190px"><div style="font-weight:700;font-size:12px">${esc(s.footer || '')}</div>
      <div style="border-top:1px solid #333;margin-top:26px;padding-top:3px;font-size:10.5px">Authorised Signatory</div></div></div>` : ''}
  </div>`;
}
function thermalHTML(inv) {
  const s = S.set, c = { sub: inv.sub, disc: inv.disc, tax: inv.tax, total: inv.total, paid: inv.paid, bal: inv.bal }, p = inv.pat || { name: inv.pname, reg: inv.preg, age: inv.page, sex: inv.psex, address: inv.paddress };
  return `<div class="tm">
    <div class="c b" style="font-size:13px">${esc(s.clinicName)}</div>
    <div class="c" style="font-size:9.5px">${esc(s.address)}<br>${esc(s.phone)}</div>
    <hr>
    <div>Bill: <b>${esc(inv.no)}</b> &nbsp; ${dmy(inv.date)}</div>
    <div>${esc(p.name || '')} ${p.age ? '· ' + esc(p.age) + 'y' : ''} ${p.sex ? '/' + esc(String(p.sex)[0]) : ''}</div>
    <div>${esc(p.reg || '')}</div><hr>
    <table>${inv.items.map(t => `<tr><td colspan="2">${esc(t.name)}${t.desc ? ' [' + esc(t.desc) + ']' : ''}</td></tr>
      <tr><td>&nbsp;&nbsp;${t.qty} x ${Number(t.rate).toFixed(0)}</td><td class="r">${Number(t.amount).toFixed(2)}</td></tr>`).join('')}</table><hr>
    <table>
      ${c.disc ? `<tr><td>Sub total</td><td class="r">${c.sub.toFixed(2)}</td></tr><tr><td>Discount</td><td class="r">-${c.disc.toFixed(2)}</td></tr>` : ''}
      ${Math.max(0, Number(inv.tax || 0) - Number(inv.taxIncl || 0)) > 0.004
        ? `<tr><td>GST</td><td class="r">${(Number(inv.tax) - Number(inv.taxIncl || 0)).toFixed(2)}</td></tr>` : ''}
      <tr class="b"><td>NET AMOUNT</td><td class="r">${c.total.toFixed(2)}</td></tr>
      ${Number(inv.taxIncl || 0) > 0.004 ? `<tr><td colspan="2" style="font-size:9.5px">(incl. GST ${Number(inv.taxIncl).toFixed(2)})</td></tr>` : ''}
      ${c.paid ? `<tr><td>Paid (${esc((inv.payments[0] || {}).mode || '')})</td><td class="r">${c.paid.toFixed(2)}</td></tr>` : ''}
      ${c.bal > 0.5 ? `<tr class="b"><td>BALANCE</td><td class="r">${c.bal.toFixed(2)}</td></tr>` : ''}
    </table><hr>
    <div class="c" style="font-size:9.5px">${esc(s.footer || '')}<br>Thank you. Get well soon!</div>
  </div>`;
}
// Android runs a home-screen ("installed") app in a stripped window where
// window.print() silently does nothing and there is no browser menu to print
// from. We detect that only to OFFER a way out — we never navigate on our own.
function inStandalone() {
  try {
    if (navigator.standalone === true) return true;
    return ['standalone', 'fullscreen', 'minimal-ui']
      .some(m => window.matchMedia('(display-mode: ' + m + ')').matches);
  } catch (e) { return false; }
}
// A self-contained page: every app style, the bill, and a Print button the user
// can tap. No inline script — the CSP forbids it — so the handler is attached
// from here after the document is written.
function standaloneDoc(html, thermal) {
  const css = Array.from(document.querySelectorAll('style')).map(s => s.textContent).join('\n');
  const page = thermal ? '@page{size:80mm auto;margin:3mm}' : '@page{size:A4 portrait;margin:10mm 10mm 8mm 10mm}';
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Hi-Klean bill</title><style>' + css + '</style><style>'
    + 'body{margin:0;background:#fff}#app,#side,#main{display:none!important}'
    + '#printarea{display:block!important}' + page
    + '@media screen{body{padding:10px 10px 92px}'
    + '#printarea .inv{width:auto!important;max-width:100%!important}'
    + '.hkbar{position:fixed;left:0;right:0;bottom:0;background:#0a7d78;color:#fff;'
    + 'padding:11px 12px;text-align:center;font:600 14px/1.4 system-ui,sans-serif;z-index:9}'
    + '.hkbar button{font:inherit;background:#fff;color:#0a7d78;border:0;border-radius:9px;'
    + 'padding:10px 18px;margin-top:7px}}'
    + '@media print{.hkbar{display:none!important}'
    + '#printarea .inv{width:190mm!important;max-width:190mm!important}}'
    + '</style></head><body><div id="printarea">' + html + '</div>'
    + '<div class="hkbar">Tap below, or use your browser menu → Share → Print<br>'
    + '<button type="button">Print / Save as PDF</button></div></body></html>';
}
// Opens the bill in a browser tab. Only ever called from a deliberate tap —
// never automatically, because silently leaving the app looks like a crash.
function openBillTab(html, thermal) {
  let w = null;
  try { w = window.open('', '_blank'); } catch (e) { w = null; }
  if (!w || !w.document) return toast('Your browser blocked the new tab — allow pop-ups and try again', 1);
  w.document.open();
  w.document.write(standaloneDoc(html, thermal));
  w.document.close();
  const btn = w.document.querySelector('.hkbar button');
  if (btn) btn.addEventListener('click', () => { try { w.print(); } catch (e) { } });
  setTimeout(() => { try { w.focus(); w.print(); } catch (e) { } }, 500);
}
function doPrint(html, thermal) {
  // ALWAYS render and print in place first. Nothing here navigates away.
  printInPlace(html, thermal);
  // In an installed app the print request above goes nowhere, so offer the way
  // out as a choice the user makes — never as something that just happens.
  if (inStandalone()) {
    const m = modal('Printing',
      '<p style="margin:0 0 10px">Android does not allow printing inside the installed app.</p>'
      + '<p style="margin:0;color:#68798a;font-size:13.5px">Open the bill in your browser to print it or save it as a PDF. '
      + 'To avoid this every time, remove the Hi-Klean icon from your home screen and add it again from Chrome.</p>',
      '<button class="btn" id="pkStay">Try printing here</button>'
      + '<button class="btn p" id="pkOpen">Open bill in browser</button>');
    $('#pkStay', m).onclick = () => { closeModal(); printInPlace(html, thermal); };
    $('#pkOpen', m).onclick = () => { closeModal(); openBillTab(html, thermal); };
  }
}
function printInPlace(html, thermal) {
  const pa = $('#printarea');
  // Wipe here, not on a timer after printing. On Android, window.print() returns
  // immediately and the system preview renders asynchronously — a delayed wipe
  // emptied the page while the user was still in the preview, so the PDF saved
  // blank. Replacing the content at the START of each print keeps a stale copy
  // from trailing into the next one without ever racing the preview.
  pa.innerHTML = html;
  let st = $('#pgstyle'); if (!st) { st = el('<style id="pgstyle"></style>'); document.head.appendChild(st); }
  st.textContent = thermal
    ? '@media print{@page{size:80mm auto;margin:3mm}}'
    : '@media print{@page{size:A4 portrait;margin:10mm 10mm 8mm 10mm}}';
  window.onafterprint = null;
  // let images (the logo) decode before the snapshot the print engine takes
  const go = () => { try { window.print(); } catch (e) { toast('Could not open the print dialog', 1); } };
  const imgs = Array.from(pa.querySelectorAll('img'));
  const pending = imgs.filter(i => !i.complete);
  if (!pending.length) return setTimeout(go, 80);
  let left = pending.length, fired = false;
  const tick = () => { if (--left <= 0 && !fired) { fired = true; setTimeout(go, 40); } };
  pending.forEach(i => { i.addEventListener('load', tick, { once: true }); i.addEventListener('error', tick, { once: true }); });
  setTimeout(() => { if (!fired) { fired = true; go(); } }, 1200);   // never hang on a broken image
}
function printBill(inv, thermal) { doPrint(thermal ? thermalHTML(inv) : billHTML(inv), thermal); }


function summaryHTML(p, bills, showAmt) {
  const s = S.set;
  const d = billingDoctor() || {};   // sign-off matches the letterhead, always
  const tot = bills.reduce((a, i) => a + i.total, 0);
  const paid = bills.reduce((a, i) => a + i.paid, 0);
  const rows = bills.map(i => i.items.map((t, k) => `<tr>
      <td style="border:0;padding:3px 6px;${k === 0 ? 'font-weight:600' : ''}">${k === 0 ? dmy(i.date) : ''}</td>
      <td style="border:0;padding:3px 6px">${esc(String(t.name).toUpperCase())}${t.desc ? ' ' + esc(t.desc) : ''}${t.qty > 1 ? ' (' + t.qty + ' UNIT)' : ''}</td>
      <td style="border:0;padding:3px 6px;text-align:right">${showAmt ? Number(t.amount).toFixed(0) : ''}</td></tr>`).join('')
    + (showAmt && i.disc ? `<tr><td style="border:0"></td><td style="border:0;padding:3px 6px">LESS: DISCOUNT</td>
        <td style="border:0;padding:3px 6px;text-align:right">&minus; ${Number(i.disc).toFixed(0)}</td></tr>` : '')
    + (showAmt && i.tax ? `<tr><td style="border:0"></td><td style="border:0;padding:3px 6px">GST</td>
        <td style="border:0;padding:3px 6px;text-align:right">${Number(i.tax).toFixed(0)}</td></tr>` : '')
    + '<tr><td colspan="3" style="border:0;height:7px"></td></tr>').join('');
  return `<div class="inv">
    ${letterhead(bills[0] && bills[0].doctorId)}
    <div style="text-align:center;font-size:15px;font-weight:800;text-decoration:underline;margin:14px 0 16px">TREATMENT SUMMARY - INVOICE</div>
    <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:14px">
      <div>Patient Name: ${esc(p.name)}<br>Patient ID: ${esc(p.reg || '')}<br>Age: ${esc(p.age || '')} Years/ ${esc(p.sex || '')}</div>
      <div style="text-align:right">DATE: ${dmy(today())}</div></div>
    <table style="width:100%;font-size:12.5px;border-collapse:collapse">
      <thead><tr>
        <th style="border:0;border-bottom:1.5px solid #000;text-align:left;padding:4px 6px;background:none;color:#000">DATE OF TREATMENT</th>
        <th style="border:0;border-bottom:1.5px solid #000;text-align:left;padding:4px 6px;background:none;color:#000">DESCRIPTION OF SERVICE</th>
        <th style="border:0;border-bottom:1.5px solid #000;text-align:right;padding:4px 6px;background:none;color:#000">AMOUNT</th></tr></thead>
      <tbody><tr><td colspan="3" style="border:0;height:8px"></td></tr>${rows}
      ${showAmt ? `<tr><td style="border:0"></td><td style="border:0;text-align:right;font-weight:800;padding:6px">TOTAL</td>
        <td style="border:0;border-top:1.5px solid #000;text-align:right;font-weight:800;padding:6px">${tot.toFixed(0)}</td></tr>` : ''}
      ${showAmt && tot - paid > 0.005 ? `<tr><td style="border:0"></td><td style="border:0;text-align:right;padding:2px 6px">Balance due</td>
        <td style="border:0;text-align:right;padding:2px 6px">${(tot - paid).toFixed(0)}</td></tr>` : ''}
      </tbody></table>
    <div style="margin-top:44px;font-size:12.5px">
      Yours faithfully<br><br>
      <b>${esc(d.name || '')}</b><br>${esc(d.sign_title || d.role_line || '')}<br>${esc(s.clinicName || '')}<br>Kottayam.
    </div></div>`;
}
