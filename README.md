# Hi-Klean Dental Billing

Billing, patient records and day-end reporting for Hi-Klean Dental Clinic, Kottayam.

Live: **https://hi-klean-production.up.railway.app**

**Server:** Node 22 · Express 5 · PostgreSQL 16
**Browser:** React 18 · TypeScript · Vite

---

## Layout

```
src/                 the server — the source of truth for money
  schema.sql         tables + in-place upgrade path (safe to re-run)
  calc.js            ALL money maths, integer paise only
  db.js              pool, transactions, counters, audit log
  auth.js            bcrypt + JWT in an httpOnly cookie, role checks, CSRF
  seed.js            first-run settings, doctors, 126-procedure rate card
  server.js          every HTTP route

web/                 the browser app
  src/app/           shell, session, hash router, providers
  src/shared/
    api/             client.ts (the ONE fetch wrapper) + endpoints.ts (typed routes)
    lib/             money, dates, text, refresh signal
    ui/              Modal, Toast, primitives
    hooks/           useAsync, usePrintDocument
    types.ts         domain types, mirroring what the server actually returns
  src/features/      one folder per screen
    auth/ dashboard/ billing/ invoices/ patients/ summary/
    procedures/ reports/ doctors/ settings/ printing/
  src/styles/app.css the stylesheet, including the print rules

client/c_local.js    offline edition: the same API surface backed by IndexedDB
tests-react/         the suites that guard all of the above
scripts/             backup.sh, import-backup.js, reset-password.js
backup.mjs           nightly snapshot -> database + off-site webhook
```

## Build & run

```bash
npm install
npm run build            # web/ -> public/index.html + assets + PWA files
npm start                # http://localhost:3000

npm run dev              # server with --watch
npm run dev:web          # Vite dev server on :5173, proxying /api to :3000

npm run build:offline    # dist/Hi-Klean-Billing.html — one file, runs from file://
npm run typecheck
npm test                 # every suite, each against a fresh database
```

`npm run build` must run before `npm start`: Express serves `public/`, and Vite
writes it. The Dockerfile does this in a separate stage so no front-end
toolchain reaches the running image.

## Deploy

Railway builds the root `Dockerfile`. Required environment:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `JWT_SECRET` | long random string; changing it signs everyone out |
| `ADMIN_USER` / `ADMIN_PASSWORD` | first-run admin only; forced to change at first login |
| `START_BILL_NO` / `START_REG_NO` | continue the paper register (168 / 12681) |

A second Railway service runs `node backup.mjs` on cron `0 16 * * *` (21:30 IST)
with `DATABASE_URL`, `KEEP_DAYS`, `BACKUP_WEBHOOK`, `BACKUP_TOKEN`.

## Rules this codebase holds to

- **Money is integer paise, computed on the server.** `src/calc.js` is the only
  place totals are decided. Client totals are recomputed and discarded on every
  save. `web/src/shared/lib/money.ts` is a preview that must mirror `calc.js`
  exactly — `t_gst_parity` runs 400 bill shapes through both and demands they
  agree to the paisa.
- **GST has two modes per procedure.** `gstIncl = true` extracts tax from the
  quoted price (`net * r / (100 + r)`) so the patient pays exactly what was
  quoted; `false` adds it on top. A missing flag defaults to *included* — the
  direction that cannot overcharge.
- **GST cannot be switched on without a valid GSTIN.** Enforced server-side.
- **Bills are cancelled with a reason, never deleted.** The number sequence must
  never develop a hole.
- **Every printed document carries the billing doctor**, not the treating
  doctor. The treating doctor is still recorded per line for the doctor report.
- **Nothing navigates away from the app on its own.** In an installed app the
  browser is *offered*, never taken — see `features/printing/printDocument.ts`.
- **Never subtract a period's collection from a period's billing.** They count
  different sets of bills, so the difference is meaningless and goes negative the
  moment an old balance is settled. The doctor report reports `collectedPrior`
  and `unpaid` instead; `unpaid` can never be negative.

### Two deliberate departures from idiomatic React

1. **Print documents are HTML strings written into a plain DOM node** outside the
   React tree (`#printarea`). Android's print engine renders asynchronously
   *after* `window.print()` returns; a React re-render or unmount during that
   window produced blank PDFs twice in production. Correctness beats purity —
   see the comments in `features/printing/`.
2. **Hash routes stay bare** (`#dash`, `#bill/12`). React Router's `HashRouter`
   would produce `#/dash`, silently breaking every bookmark the front desk has
   and every URL the service worker has cached. The router in `app/router.ts` is
   twenty lines and keeps the old URLs exactly.

## Tests

```bash
npm test                              # everything, ~4 minutes

node tests-react/t_gst_parity.cjs     # 13 · GST rules + server/client parity, no server needed
bash tests-react/run.sh tests-react/t_smoke.cjs --virgin      # 18 · sign in, bill, save, read back
bash tests-react/run.sh tests-react/t_e2e.cjs                 # 15 · full flow through the UI
bash tests-react/run.sh tests-react/t_flows.cjs               # 34 · estimates, edits, cancellation, patient-record guards
bash tests-react/run.sh tests-react/t_drill.cjs               # 32 · dashboard tiles drill down and reconcile
bash tests-react/run.sh tests-react/t_docperiod.cjs           # 32 · doctor report period maths + picker
bash tests-react/run.sh tests-react/t_letterhead.cjs          # 13 · fixed letterhead + doctor attribution
bash tests-react/run.sh tests-react/t_noexit.cjs              # 18 · printing never leaves the app
bash tests-react/run.sh tests-react/t_print_mobile.cjs        # 24 · Android print -> real, non-blank A4 PDF
bash tests-react/run.sh tests/t_gstguard.cjs                  # 11 · GST blocked without a GSTIN
bash tests-react/run.sh tests-react/t_security.cjs --virgin   # 46 · every finding from the adversarial audits
node build_local.cjs && node tests-react/t_local.cjs          # 12 · offline edition, network blocked
```

`tests-react/run.sh` drops and recreates the database before each suite, because
several of them assume a fresh one and will report false failures otherwise.
Pass `--virgin` for the suites that test the first-login password change.
