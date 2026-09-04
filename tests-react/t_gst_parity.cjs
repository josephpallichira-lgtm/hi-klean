/**
 * GST arithmetic, and the parity that matters most.
 *
 * The server (src/calc.js) decides every total. The client (web money.ts) only
 * previews it. If the two ever disagree the patient sees one figure on screen
 * and a different one on the printed bill — the single worst failure this app
 * can have.
 *
 * So this suite does two things:
 *   1. asserts the GST rules themselves (inclusive vs extra), and
 *   2. runs a matrix of bills through BOTH implementations and demands they
 *      agree to the paisa.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const t = (n, o, x) => { o ? pass++ : fail++; console.log(`${o ? 'PASS' : '*** FAIL'}  ${n}${x ? ' — ' + x : ''}`); };
const P = (r) => Math.round(r * 100);
const R = (p) => p / 100;
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;

(async () => {
  const { calcInvoice: serverCalc } = await import(path.join(ROOT, 'src/calc.js'));

  // Transpile the client's money.ts so both can be exercised in one process.
  const out = '/tmp/hk-money.mjs';
  execFileSync(path.join(ROOT, 'web/node_modules/.bin/esbuild'),
    [path.join(ROOT, 'web/src/shared/lib/money.ts'), '--format=esm', '--platform=neutral', '--outfile=' + out],
    { stdio: 'pipe' });
  const { calcInvoice: clientCalc } = await import(out);

  const sItem = (rate, o = {}) => ({ qty: 1, rate_paise: P(rate), disc_paise: 0, taxable: true, gst_rate: 18, gst_incl: true, ...o });

  /* ---------- 1. INCLUSIVE: the patient pays exactly the listed price ---------- */
  let c = serverCalc([sItem(1000)], 'amt', 0, true);
  t('incl: total equals the listed price', R(c.total_paise) === 1000, '₹' + R(c.total_paise));
  t('incl: GST is carved out, not added', near(c.tax_paise, P(152.54)), '₹' + R(c.tax_paise));
  t('incl: nothing added on top', c.tax_add_paise === 0);

  /* ---------- 2. EXTRA: GST rides on top ---------- */
  c = serverCalc([sItem(1000, { gst_incl: false })], 'amt', 0, true);
  t('extra: GST added on top', R(c.total_paise) === 1180, '₹' + R(c.total_paise));
  t('extra: tax is 18% of the rate', R(c.tax_paise) === 180, '₹' + R(c.tax_paise));
  t('extra: nothing carved out', c.tax_inc_paise === 0);

  /* ---------- 3. GST off, and non-taxable lines ---------- */
  c = serverCalc([sItem(1000)], 'amt', 0, false);
  t('gst off: no tax at all', c.tax_paise === 0 && c.total_paise === P(1000));
  c = serverCalc([sItem(1000, { taxable: false })], 'amt', 0, true);
  t('non-taxable line pays no GST', c.tax_paise === 0 && R(c.total_paise) === 1000);

  /* ---------- 4. a missing flag must default to INCLUSIVE ----------
     That is the only safe direction: it can never overcharge a patient. */
  c = serverCalc([sItem(1000, { gst_incl: undefined })], 'amt', 0, true);
  t('server: missing gst_incl defaults to inclusive (cannot overcharge)', R(c.total_paise) === 1000, '₹' + R(c.total_paise));
  const cc = clientCalc({ items: [{ qty: 1, rate: 1000, disc: 0, taxable: true, gst: 18 }], discType: 'amt', discValue: 0, gstOn: true });
  t('client: missing gstIncl defaults to inclusive too', cc.total === 1000, '₹' + cc.total);

  /* ---------- 5. PARITY: server and client must agree on everything ---------- */
  const rates = [0, 5, 12, 18, 28];
  const cases = [];
  for (const gstOn of [true, false]) {
    for (const incl of [true, false]) {
      for (const rate of rates) {
        for (const [dType, dVal] of [['amt', 0], ['amt', 100], ['pct', 10], ['pct', 100], ['amt', 99999]]) {
          for (const lines of [
            [[1000, 1]],
            [[1000, 3], [250, 2]],
            [[1234.56, 1], [99.99, 7], [4500, 1]],
            [[0, 1], [500, 1]],
          ]) {
            cases.push({ gstOn, incl, rate, dType, dVal, lines });
          }
        }
      }
    }
  }

  let mismatches = 0;
  let worst = null;
  for (const k of cases) {
    const sItems = k.lines.map(([rate, qty]) => ({
      qty, rate_paise: P(rate), disc_paise: 0, taxable: true, gst_rate: k.rate, gst_incl: k.incl,
    }));
    const cItems = k.lines.map(([rate, qty]) => ({
      qty, rate, disc: 0, taxable: true, gst: k.rate, gstIncl: k.incl,
    }));
    const s = serverCalc(sItems, k.dType, k.dType === 'pct' ? k.dVal : P(k.dVal), k.gstOn);
    const cl = clientCalc({ items: cItems, discType: k.dType, discValue: k.dVal, gstOn: k.gstOn });

    const diffs = [];
    if (Math.abs(R(s.total_paise) - cl.total) > 0.005) diffs.push(`total ${R(s.total_paise)} vs ${cl.total}`);
    if (Math.abs(R(s.sub_paise) - cl.sub) > 0.005) diffs.push(`sub ${R(s.sub_paise)} vs ${cl.sub}`);
    if (Math.abs(R(s.disc_paise) - cl.disc) > 0.005) diffs.push(`disc ${R(s.disc_paise)} vs ${cl.disc}`);
    if (Math.abs(R(s.tax_add_paise) - cl.taxAdd) > 0.02) diffs.push(`taxAdd ${R(s.tax_add_paise)} vs ${cl.taxAdd}`);
    if (Math.abs(R(s.tax_inc_paise) - cl.taxIncl) > 0.02) diffs.push(`taxIncl ${R(s.tax_inc_paise)} vs ${cl.taxIncl}`);
    if (diffs.length) { mismatches++; if (!worst) worst = { k, diffs }; }
  }
  t(`server and client agree on all ${cases.length} bill shapes`, mismatches === 0,
    worst ? JSON.stringify(worst.k) + ' :: ' + worst.diffs.join('; ') : `${cases.length} cases`);

  /* ---------- 6. the total must never exceed the quoted price when inclusive ---------- */
  let overcharged = 0;
  for (const rate of rates) {
    const s = serverCalc([sItem(1000, { gst_rate: rate, gst_incl: true })], 'amt', 0, true);
    if (s.total_paise > P(1000)) overcharged++;
  }
  t('inclusive GST never raises the total above the quoted price', overcharged === 0);

  /* ---------- 7. discount larger than the bill cannot go negative ---------- */
  const s2 = serverCalc([sItem(500)], 'amt', P(9999), true);
  t('over-discount clamps at zero, never negative', s2.total_paise >= 0, '₹' + R(s2.total_paise));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
