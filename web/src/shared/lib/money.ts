import type { BillDraft, Invoice, InvoiceItem, Payment } from '../types';

/** Round to 2dp the same way the whole app does. */
export const n2 = (v: unknown): number => Math.round((Number(v) || 0) * 100) / 100;

export const inr = (v: unknown): string =>
  '₹' + (Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const inr0 = (v: unknown): string =>
  '₹' + Math.round(Number(v) || 0).toLocaleString('en-IN');

export interface Totals {
  sub: number;
  disc: number;
  tax: number;
  /** GST added ON TOP of the quoted price — this raises the total */
  taxAdd: number;
  /** GST already sitting INSIDE the quoted price — declared, never added */
  taxIncl: number;
  total: number;
  paid: number;
  bal: number;
}

interface Costable {
  items?: Partial<InvoiceItem>[];
  discType?: string;
  discValue?: number;
  gstOn?: boolean;
  payments?: Partial<Payment>[];
}

/**
 * Live preview of the money on a bill.
 *
 * THIS MUST MIRROR src/calc.js EXACTLY. The server recomputes every total on
 * save and throws the client's numbers away, but if the two ever disagree the
 * patient sees one figure on screen and another on the printed bill. When you
 * change one, change the other in the same commit.
 *
 * Mutates `amount` and clamps `disc` on each item, exactly as the original did —
 * the items table reads `it.amount` straight after calling this.
 */
export function calcInvoice(inv: Costable): Totals {
  let sub = 0;
  (inv.items || []).forEach((it) => {
    const gross = (Number(it.qty) || 0) * (Number(it.rate) || 0);
    let d = Number(it.disc) || 0;
    if (d < 0) d = 0;
    if (d > gross) d = gross;
    it.disc = d;
    it.amount = n2(gross - d);
    sub += it.amount;
  });
  sub = n2(sub);

  let disc = 0;
  if (inv.discType === 'pct') {
    const p = Math.min(100, Math.max(0, Number(inv.discValue) || 0));
    disc = n2((sub * p) / 100);
  } else {
    disc = Math.max(0, Number(inv.discValue) || 0);
  }
  if (disc > sub) disc = sub;

  let taxAdd = 0;
  let taxInc = 0;
  if (inv.gstOn && sub > 0) {
    (inv.items || []).forEach((it) => {
      if (!it.taxable) return;
      const r = Number(it.gst) || 0;
      if (r <= 0) return;
      const net = n2((it.amount || 0) - disc * ((it.amount || 0) / sub));
      if (net <= 0) return;
      // A missing flag means INCLUSIVE — the direction that cannot overcharge.
      const incl = it.gstIncl === undefined || it.gstIncl === null ? true : !!it.gstIncl;
      if (incl) taxInc += n2((net * r) / (100 + r)); // carved out of the quoted price
      else taxAdd += n2((net * r) / 100); // added on top
    });
  }

  const tax = n2(taxAdd + taxInc);
  const total = n2(sub - disc + taxAdd);
  const paid = n2((inv.payments || []).reduce((a, p) => a + (Number(p.amount) || 0), 0));
  return { sub, disc, tax, taxAdd: n2(taxAdd), taxIncl: n2(taxInc), total, paid, bal: n2(total - paid) };
}

export const calcDraft = (b: BillDraft): Totals => calcInvoice(b as Costable);

export const invoiceTotals = (inv: Invoice): Totals => ({
  sub: inv.sub,
  disc: inv.disc,
  tax: inv.tax,
  taxAdd: Math.max(0, Number(inv.tax || 0) - Number(inv.taxIncl || 0)),
  taxIncl: Number(inv.taxIncl || 0),
  total: inv.total,
  paid: inv.paid,
  bal: inv.bal,
});

/** Indian numbering, for the optional "amount in words" line on a bill. */
export function numWords(num: number): string {
  num = Math.round(Number(num) || 0);
  if (num < 0) return 'Minus ' + numWords(-num);
  if (!num) return 'Zero Rupees Only';
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n: number): string => (n < 20 ? a[n] : b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : ''));
  const three = (n: number): string =>
    (n > 99 ? a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' : '') : '') + (n % 100 ? two(n % 100) : '');
  let s = '';
  const cr = Math.floor(num / 10000000);
  num %= 10000000;
  const lk = Math.floor(num / 100000);
  num %= 100000;
  const th = Math.floor(num / 1000);
  num %= 1000;
  if (cr) s += three(cr) + ' Crore ';
  if (lk) s += three(lk) + ' Lakh ';
  if (th) s += three(th) + ' Thousand ';
  if (num) s += three(num);
  return s.trim().replace(/\s+/g, ' ') + ' Rupees Only';
}
