/**
 * The OFFLINE edition.
 *
 * One self-contained .html that runs from a pen drive with no server, storing
 * everything in IndexedDB. This is not a nicety — it is the clinic's fallback
 * when the internet is down, so it is a first-class build.
 *
 * Vite inlines the React app; client/c_local.js is injected ahead of it as a
 * classic script so window.__MOCK exists before the module boots (classic
 * scripts always run before deferred module scripts).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const OUT = process.env.HK_OUT || path.join(ROOT, 'dist/Hi-Klean-Billing.html');

// 1. Build the single-file React bundle.
execFileSync('npx', ['vite', 'build'], {
  cwd: path.join(ROOT, 'web'),
  env: { ...process.env, HK_SINGLEFILE: '1' },
  stdio: 'inherit',
});
let html = fs.readFileSync(path.join(ROOT, 'web/dist-single/index.html'), 'utf8');

// 2. Seed data the offline backend needs, pulled from the SAME source the
//    server seeds from, so the two editions can never drift apart.
const seed = fs.readFileSync(path.join(ROOT, 'src/seed.js'), 'utf8');
const logo = (seed.match(/const LOGO_DATA_URL = '([^']+)'/) || [])[1] || '';

// The procedure list comes from the SAME arrays the server seeds from, so the
// hosted and offline editions can never drift apart on prices or categories.
const cats = eval(seed.match(/const CATS = (\[[\s\S]*?\]);/)[1]);
const seedRows = eval(seed.match(/const SEED = (\[[\s\S]*?\n\]);/)[1]);
const rows = seedRows.map((r, i) => ({
  id: i + 1, name: r[0], cat: cats[r[1]], price: r[2],
  perTooth: !!r[3], taxable: false, gst: 18, gstIncl: true, active: true, sort: i,
}));

// c_local.js (the IndexedDB backend) needs the money maths. Give it the SAME
// implementation the React app uses — an offline bill must total exactly what an
// online one does, so there is only ever one source of truth for the arithmetic.
const moneyIife = '/tmp/hk-money-iife.js';
execFileSync(path.join(ROOT, 'web/node_modules/.bin/esbuild'), [
  path.join(ROOT, 'web/src/shared/lib/money.ts'),
  '--bundle', '--format=iife', '--global-name=HKMoney', '--platform=browser',
  '--outfile=' + moneyIife,
], { stdio: 'pipe' });
const money = fs.readFileSync(moneyIife, 'utf8') + '\nvar calc = HKMoney.calcInvoice;\n';

const boot = money + `window.__LOCAL_ONLY__=true;`
  + `window.__LOGO__=${JSON.stringify(logo)};`
  + `window.__PROCS__=${JSON.stringify(rows)};\n`
  + fs.readFileSync(path.join(ROOT, 'client/c_local.js'), 'utf8');

// 3. Inject before the app module.
// Function form is mandatory: c_local.js contains `$&` and `$1` sequences that
// String.replace would otherwise expand as replacement patterns, producing a
// syntactically broken bundle that fails silently at runtime.
html = html.replace('<div id="root"></div>', () => '<div id="root"></div>\n<script>' + boot + '</script>');
html = html.replace(/<link rel="manifest"[^>]*>/, '');   // no manifest from file://

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log('offline edition:', OUT, (html.length / 1024).toFixed(1) + 'KB,', rows.length, 'procedures seeded');
