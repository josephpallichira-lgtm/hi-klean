/** Single source of truth for money. Everything in paise, integers only.
 *  The server recomputes this on every save — client totals are never trusted.
 *
 *  GST comes in two flavours, chosen per procedure:
 *
 *    gst_incl = false  "GST extra"     the rate is pre-tax; GST is ADDED on top,
 *                                      so the patient pays more than the rate.
 *    gst_incl = true   "GST included"  the rate ALREADY contains GST; nothing is
 *                                      added. The tax is extracted from the price
 *                                      for the tax invoice and the patient pays
 *                                      exactly the rate that was quoted.
 *
 *  Extraction for an inclusive line at rate r%:  tax = net * r / (100 + r)
 *
 *  Returned:
 *    tax_paise      total GST on the bill (added + extracted) — what a tax
 *                   invoice must declare
 *    tax_add_paise  the part that increases what the patient pays
 *    tax_inc_paise  the part already sitting inside the quoted prices
 *    total_paise    sub - disc + tax_add_paise
 */
export function calcInvoice(items, discType, discValue, gstOn) {
  let sub = 0;
  const out = items.map(it => {
    const qty = Math.max(0, Number(it.qty) || 0);
    const rate = Math.max(0, Math.round(Number(it.rate_paise) || 0));
    const gross = Math.round(qty * rate);
    let d = Math.round(Number(it.disc_paise) || 0);
    if (d < 0) d = 0;
    if (d > gross) d = gross;
    const amount = gross - d;
    sub += amount;
    return { ...it, qty, rate_paise: rate, disc_paise: d, amount_paise: amount };
  });

  let disc = 0;
  if (discType === 'pct') {
    let pv = Number(discValue) || 0;
    pv = Math.min(100, Math.max(0, pv));
    disc = Math.round(sub * pv / 100);
  } else {
    disc = Math.round(Number(discValue) || 0);          // discValue is paise when type = amt
    if (disc < 0) disc = 0;
  }
  if (disc > sub) disc = sub;

  // GST on the post-discount value, bill discount apportioned pro-rata
  let taxAdd = 0, taxInc = 0;
  if (gstOn && sub > 0) {
    for (const it of out) {
      if (!it.taxable) continue;
      const r = Number(it.gst_rate) || 0;
      if (r <= 0) continue;
      const net = it.amount_paise - Math.round(disc * it.amount_paise / sub);
      if (net <= 0) continue;
      // Default to INCLUSIVE when the flag is absent (legacy rows). That is the
      // safe direction: the patient is never charged more than the quoted price.
      const incl = it.gst_incl === undefined || it.gst_incl === null ? true : !!it.gst_incl;
      if (incl) taxInc += Math.round(net * r / (100 + r));   // carved out of the price
      else taxAdd += Math.round(net * r / 100);              // added on top
    }
  }
  return {
    items: out,
    sub_paise: sub,
    disc_paise: disc,
    tax_paise: taxAdd + taxInc,
    tax_add_paise: taxAdd,
    tax_inc_paise: taxInc,
    total_paise: sub - disc + taxAdd
  };
}
