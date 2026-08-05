# Tests

Headless-browser end-to-end tests against a running server on http://localhost:3000.

```bash
npm start                      # in one terminal (with a scratch database)
npm i -D playwright && npx playwright install chromium
node tests/t_e2e.cjs           # login, billing, numbering, reports, doctor report, print
node tests/t_mobile.cjs        # staff role limits, CSRF, PWA, Android viewport
node tests/t_demo.cjs          # loads demo data and takes screenshots
```

`t_e2e.cjs` expects a **fresh** database (it asserts the first bill is 169).
Point `DATABASE_URL` at a scratch database before running it — never at the clinic's live one.
