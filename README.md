# Hi-Klean Dental Billing

Billing, patient records and day-end reporting for Hi-Klean Dental Clinic, Kottayam.

Live: **https://hi-klean-production.up.railway.app**

Node 22 · Express 5 · PostgreSQL 16 · no front-end framework, no build step for the
browser beyond concatenation.

---

## What is in here

```
src/                 the server — this is the source of truth for money
  schema.sql         tables + in-place upgrade path (safe to re-run)
  calc.js            ALL money maths, integer paise only
  db.js              pool, transactions, counters, audit log
  auth.js            bcrypt + JWT in an httpOnly cookie, role checks, CSRF
  seed.js            first-run settings, doctors, 126-procedure rate card
  server.js          every HTTP route

client/              the browser app, concatenated into one HTML file
  c_css.html         all styles + the print stylesheet
  c_shell.html       page skeleton
  c_core.js          helpers, api(), live totals preview, modals, router
  c_bill.js          new/edit bill, tooth picker, payments
  c_lists.js         bills, patients, treatment summary
  c_print.js         the A4 bill, thermal receipt and treatment summary
  c_admin.js         rate card, reports, doctor report, settings
  c_local.js         offline edition: same API surface backed by IndexedDB
  c_demo.js          demo edition: in-memory mock backend

tests/               Playwright + plain-node suites (see tests/README.md)
scripts/             backup.sh, import-backup.js, reset-password.js
deploy/              what actually runs in production
  server.mjs         single-file bundle (server + client + icons embedded)
  package.json       production dependencies
  backup.mjs         nightly snapshot -> database + off-site webhook
  AppsScript-*.gs    Google Apps Script that receives the off-site copy
```

`deploy/server.mjs` is **generated** by `build_bundle.cjs`. Never edit it by hand —
edit the source and rebuild, or the next build will silently discard your change.

## Build

```bash
npm install
node build.cjs          # client/*  ->  public/index.html   (hosted edition)
node build_local.cjs    #            ->  Hi-Klean-Billing.html      (offline, IndexedDB)
node build_demo.cjs     #            ->  Hi-Klean-Billing-DEMO.html (demo data)
node build_bundle.cjs   # server + client -> deploy/server.mjs
```

## Run locally

```bash
cp .env.example .env     # set DATABASE_URL, JWT_SECRET, ADMIN_PASSWORD
createdb hiklean
node src/server.js       # http://localhost:3000
```

Or `docker compose up`.

## Deploy

Railway builds `deploy/` and runs `node server.mjs`. Required environment:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `JWT_SECRET` | long random string; changing it signs everyone out |
| `ADMIN_USER` / `ADMIN_PASSWORD` | first-run admin only; forced to change at first login |
| `START_BILL_NO` / `START_REG_NO` | continue the paper register (168 / 12681) |

A second Railway service runs `node backup.mjs` on cron `0 16 * * *` (21:30 IST)
with `DATABASE_URL`, `KEEP_DAYS`, `BACKUP_WEBHOOK`, `BACKUP_TOKEN`.

## Rules this codebase holds to

- **Money is integer paise, computed on the server.** `calc.js` is the only place
  totals are decided. Client totals are recomputed and discarded on every save.
  `c_core.js calc()` is a preview that must mirror `calc.js` exactly.
- **GST has two modes per procedure.** `gst_incl = true` extracts tax from the
  quoted price (`net * r / (100 + r)`) so the patient pays exactly what was
  quoted; `false` adds it on top. A missing flag defaults to *included* — the
  direction that cannot overcharge.
- **GST cannot be switched on without a valid GSTIN.** Enforced server-side.
- **Bills are cancelled with a reason, never deleted.** The number sequence must
  never develop a hole.
- **Every printed document carries the billing doctor**, not the treating doctor.
  The treating doctor is still recorded per line for the doctor report.
- **Nothing navigates away from the app on its own** — see `doPrint()`.
- **No inline event handlers.** The CSP forbids them; use delegated `data-do`.

## Tests

```bash
node tests/t_gst.cjs            # 31 · GST arithmetic, no server needed
node tests/t_linezero.cjs       #  6 · line amounts, offline build
node tests/t_print_mobile.cjs   # 21 · Android print -> real A4 PDF
node tests/t_noexit.cjs         # 16 · print never leaves the app
node tests/t_letterhead.cjs     # 16 · fixed letterhead + doctor attribution
node tests/t_gst_e2e.cjs        # 23 · GST through server and printed bill
node tests/t_gstguard.cjs       # 11 · GST blocked without a GSTIN
node tests/t_security.cjs       # 46 · every finding from the adversarial audits
node tests/t_e2e.cjs            # 12 · full billing flow
node tests/t_local.cjs          # 22 · offline edition
node tests/t_demo_file.cjs      # 15 · demo edition
```

Several server suites assume a **freshly created database** and will report false
failures against one that already holds test data. Drop and recreate `hiklean`
between runs.
