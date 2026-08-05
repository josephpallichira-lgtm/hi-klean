/* GST inclusive vs extra. Pure arithmetic against the single source of truth. */
const P = (r) => Math.round(r * 100);            // rupees -> paise
const R = (p) => p / 100;
let pass = 0, fail = 0;
const t = (n, o, x) => { o ? pass++ : fail++; console.log(`${o ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`) };
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;

(async () => {
  const { calcInvoice } = await import('/home/claude/srv/src/calc.js');
  const item = (rate, o = {}) => ({ qty: 1, rate_paise: P(rate), disc_paise: 0, taxable: true, gst_rate: 18, gst_incl: true, ...o });

  // ---------- 1. INCLUSIVE: the patient pays exactly the listed price ----------
  let c = calcInvoice([item(1000)], 'amt', 0, true);
  t('incl: total equals the listed price', R(c.total_paise) === 1000, '₹' + R(c.total_paise));
  t('incl: GST is carved out, not added', near(c.tax_paise, P(152.54)), '₹' + R(c.tax_paise));
  t('incl: nothing added on top', c.tax_add_paise === 0);
  t('incl: taxable value + GST = price', c.total_paise === (c.sub_paise - c.tax_inc_paise) + c.tax_inc_paise);

  // ---------- 2. EXTRA: GST rides on top ----------
  c = calcInvoice([item(1000, { gst_incl: false })], 'amt', 0, true);
  t('extra: GST added on top', R(c.total_paise) === 1180, '₹' + R(c.total_paise));
  t('extra: tax is 18% of the rate', R(c.tax_paise) === 180, '₹' + R(c.tax_paise));
  t('extra: nothing carved out', c.tax_inc_paise === 0);

  // ---------- 3. the two must differ by exactly the added tax ----------
  const a = calcInvoice([item(5000)], 'amt', 0, true);
  const b = calcInvoice([item(5000, { gst_incl: false })], 'amt', 0, true);
  t('incl total < extra total', a.total_paise < b.total_paise, `${R(a.total_paise)} vs ${R(b.total_paise)}`);
  t('extra total = incl price + 18%', R(b.total_paise) === 5900);

  // ---------- 4. GST switched off entirely ----------
  c = calcInvoice([item(1000)], 'amt', 0, false);
  t('gst off: no tax at all', c.tax_paise === 0 && c.total_paise === P(1000));

  // ---------- 5. non-taxable line is untouched either way ----------
  c = calcInvoice([item(1000, { taxable: false })], 'amt', 0, true);
  t('non-taxable line pays no GST', c.tax_paise === 0 && R(c.total_paise) === 1000);

  // ---------- 6. discount, inclusive ----------
  c = calcInvoice([item(1000)], 'amt', P(100), true);
  t('incl + ₹100 off: patient pays 900', R(c.total_paise) === 900, '₹' + R(c.total_paise));
  t('incl + discount: GST recomputed on 900', near(c.tax_paise, P(137.29)), '₹' + R(c.tax_paise));

  // ---------- 7. discount, extra ----------
  c = calcInvoice([item(1000, { gst_incl: false })], 'amt', P(100), true);
  t('extra + ₹100 off: 900 + 18%', R(c.total_paise) === 1062, '₹' + R(c.total_paise));

  // ---------- 8. percentage discount ----------
  c = calcInvoice([item(2000)], 'pct', 10, true);
  t('incl + 10% off: patient pays 1800', R(c.total_paise) === 1800, '₹' + R(c.total_paise));

  // ---------- 9. MIXED bill: one of each ----------
  c = calcInvoice([item(1000), item(1000, { gst_incl: false })], 'amt', 0, true);
  t('mixed: total = 1000 + 1180', R(c.total_paise) === 2180, '₹' + R(c.total_paise));
  t('mixed: added part is 180', R(c.tax_add_paise) === 180);
  t('mixed: included part is 152.54', near(c.tax_inc_paise, P(152.54)));
  t('mixed: declared GST is the sum', c.tax_paise === c.tax_add_paise + c.tax_inc_paise);
  t('mixed: total = sub - disc + added only', c.total_paise === c.sub_paise - c.disc_paise + c.tax_add_paise);

  // ---------- 10. the invariant that protects the patient ----------
  for (const rate of [1, 99, 100, 333, 999, 1234.56, 45000]) {
    const x = calcInvoice([item(rate)], 'amt', 0, true);
    if (x.total_paise !== P(rate)) { t(`incl @₹${rate} charges exactly the listed price`, false, R(x.total_paise)); break; }
  }
  t('incl never changes the price the patient was quoted', true);

  // ---------- 11. different GST rates ----------
  c = calcInvoice([item(1120, { gst_rate: 12 })], 'amt', 0, true);
  t('incl @12%: total unchanged', R(c.total_paise) === 1120);
  t('incl @12%: tax = 120', near(c.tax_paise, P(120)), '₹' + R(c.tax_paise));
  c = calcInvoice([item(1000, { gst_rate: 5, gst_incl: false })], 'amt', 0, true);
  t('extra @5%: total = 1050', R(c.total_paise) === 1050);

  // ---------- 12. zero-rate and edge cases ----------
  c = calcInvoice([item(1000, { gst_rate: 0 })], 'amt', 0, true);
  t('0% rate produces no tax', c.tax_paise === 0 && R(c.total_paise) === 1000);
  c = calcInvoice([item(0)], 'amt', 0, true);
  t('zero-price line is safe', c.total_paise === 0 && c.tax_paise === 0);
  c = calcInvoice([item(1000)], 'amt', P(5000), true);
  t('over-discount clamps to the bill', c.total_paise === 0 && c.tax_paise === 0);

  // ---------- 13. quantity ----------
  c = calcInvoice([item(500, { qty: 3 })], 'amt', 0, true);
  t('incl x3: total is 1500', R(c.total_paise) === 1500);
  t('incl x3: tax scales', near(c.tax_paise, P(228.81)), '₹' + R(c.tax_paise));

  // ---------- 14. legacy rows (no flag) default to inclusive ----------
  const legacy = { qty: 1, rate_paise: P(1000), disc_paise: 0, taxable: true, gst_rate: 18 };
  c = calcInvoice([legacy], 'amt', 0, true);
  t('a line with no flag is treated as GST-included', R(c.total_paise) === 1000, '₹' + R(c.total_paise));

  // ---------- 15. paise never leak ----------
  for (const k of ['sub_paise', 'disc_paise', 'tax_paise', 'tax_add_paise', 'tax_inc_paise', 'total_paise']) {
    const v = calcInvoice([item(1234.56), item(777.77, { gst_incl: false })], 'pct', 7.5, true)[k];
    if (!Number.isInteger(v)) { t('all money is whole paise', false, k + '=' + v); break; }
  }
  t('all money stays whole paise', true);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
