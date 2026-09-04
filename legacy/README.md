# Legacy builders (pre-React)

These built the old single-concatenated-file client from `client/c_*.js`. They
are kept only so the v2 output can still be reproduced if a v3 regression ever
needs bisecting against it.

- `build.cjs` — client/* -> public/index.html, plus the PWA assets
  (the PWA half now lives in `../build_pwa.cjs` and is still in use)
- `build_bundle.cjs` — server + client -> a single deploy/server.mjs
- `build_demo.cjs` — the demo edition with in-memory sample data

Nothing in the running app calls these. `client/c_local.js` is NOT legacy — it
is the offline edition's IndexedDB backend and is still built into
`dist/Hi-Klean-Billing.html` by `../build_local.cjs`.

## bundles/

`server.mjs` (root) and `deploy/server.mjs` were generated single-file bundles of
the v2 server **with the v2 client embedded**. Nothing builds or runs them any
more — the Dockerfile runs `src/server.js` and serves the Vite output — and a
stale bundle sitting next to live source is exactly how someone deploys last
month's app by accident. Moved here so the history is kept without the trap.

`deploy/backup.mjs` and `deploy/AppsScript-Backup-Receiver.gs` were NOT moved:
the backup script is still what the nightly Railway cron runs, and the Apps
Script is the live off-site receiver.
