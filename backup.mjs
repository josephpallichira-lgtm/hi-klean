/**
 * Hi-Klean — daily database snapshot.
 *
 * Runs as a Railway cron service. Dumps every table to JSON, gzips it, stores it
 * inside the database in `db_backups` (keeping the last KEEP_DAYS snapshots), and
 * — if BACKUP_WEBHOOK is set — pushes an off-site copy.
 *
 * The in-database copy protects against the failure that actually happens in a
 * clinic: a wrong edit, a deleted payment, a bad import.
 * The off-site copy protects against losing the whole Railway account or volume.
 * You want both.
 *
 * Off-site protocol (deliberately dumb, so any endpoint can accept it):
 *   POST <BACKUP_WEBHOOK>
 *   Content-Type: application/json
 *   X-Backup-Token: <BACKUP_TOKEN>          (also sent as ?token= for Apps Script)
 *   { app, date, filename, bytes, sha256, bills, patients, gzip_b64 }
 *
 * gzip_b64 is base64 so it survives any text-only receiver (Google Apps Script,
 * Make, Zapier, n8n). Decode it and you have a .json.gz identical to the one in
 * the database.
 */
import pg from 'pg';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const KEEP = Math.max(1, Math.min(3650, Number(process.env.KEEP_DAYS || 30) || 30));
const WEBHOOK = (process.env.BACKUP_WEBHOOK || '').trim();
const TOKEN = (process.env.BACKUP_TOKEN || '').trim();
const TABLES = ['app_meta', 'users', 'doctors', 'procedures', 'procedure_price_history',
  'patients', 'invoices', 'invoice_items', 'payments', 'counters', 'audit_log'];

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: true } : undefined
});
const q = (t, p) => pool.query(t, p);

// IST date stamp — the clinic thinks in local days, not UTC days
const stamp = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

async function offsite(gz, meta) {
  if (!WEBHOOK) {
    console.log('No BACKUP_WEBHOOK set — this snapshot is stored in the database only, NOT off-site.');
    return true;
  }
  let url;
  try { url = new URL(WEBHOOK); }
  catch { console.error('BACKUP_WEBHOOK is not a valid URL — off-site copy skipped.'); return false; }
  if (url.protocol !== 'https:') {
    console.error('BACKUP_WEBHOOK must be https — refusing to send patient data over plain http.');
    return false;
  }
  // Apps Script cannot read custom headers, so the token also rides in the query string
  if (TOKEN) url.searchParams.set('token', TOKEN);

  const body = JSON.stringify({
    app: 'hiklean',
    date: stamp,
    filename: `hiklean-${stamp}.json.gz`,
    bytes: gz.length,
    sha256: createHash('sha256').update(gz).digest('hex'),
    bills: meta.bills,
    patients: meta.patients,
    gzip_b64: gz.toString('base64')
  });

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const ctl = AbortSignal.timeout(120000);
      const r = await fetch(url, {
        method: 'POST',
        redirect: 'follow', // Apps Script always 302s to script.googleusercontent.com
        headers: {
          'Content-Type': 'application/json',
          'X-Backup-Token': TOKEN,
          'X-Backup-Date': stamp
        },
        body,
        signal: ctl
      });
      const text = (await r.text().catch(() => '')).slice(0, 300);
      if (r.ok) { console.log(`Off-site copy: sent (${r.status}) ${text}`); return true; }
      console.error(`Off-site copy attempt ${attempt} failed: HTTP ${r.status} ${text}`);
    } catch (e) {
      console.error(`Off-site copy attempt ${attempt} failed: ${e.message}`);
    }
    if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 5000));
  }
  console.error('OFF-SITE COPY FAILED after 3 attempts. The in-database snapshot was still written.');
  return false;
}

try {
  await q(`CREATE TABLE IF NOT EXISTS db_backups (
    id         BIGSERIAL PRIMARY KEY,
    taken_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    bills      INTEGER NOT NULL DEFAULT 0,
    patients   INTEGER NOT NULL DEFAULT 0,
    bytes      INTEGER NOT NULL DEFAULT 0,
    payload    BYTEA NOT NULL
  )`);

  const dump = { _app: 'hiklean-server', _at: new Date().toISOString(), _day: stamp };
  for (const t of TABLES) {
    try { dump[t] = (await q(`SELECT * FROM ${t}`)).rows; }
    catch (e) { dump[t] = []; console.warn(`skipped ${t}: ${e.message}`); }
  }
  // never let password hashes leave the server
  dump.users = (dump.users || []).map(u => ({ ...u, pass_hash: '***REDACTED***' }));

  const gz = gzipSync(Buffer.from(JSON.stringify(dump)), { level: 9 });
  const bills = (dump.invoices || []).length;
  const patients = (dump.patients || []).length;

  await q('INSERT INTO db_backups(bills, patients, bytes, payload) VALUES ($1,$2,$3,$4)',
    [bills, patients, gz.length, gz]);

  const del = await q(
    `DELETE FROM db_backups WHERE id NOT IN (SELECT id FROM db_backups ORDER BY taken_at DESC LIMIT $1)`,
    [KEEP]);

  console.log(`Backup OK — ${bills} bills, ${patients} patients, ${(gz.length / 1024).toFixed(1)} KB stored. ` +
    `${del.rowCount} old snapshot(s) removed. Keeping the last ${KEEP}.`);

  const sent = await offsite(gz, { bills, patients });
  await pool.end();
  // fail the cron run loudly if the off-site leg broke, so Railway shows it red
  if (!sent) process.exit(1);
} catch (e) {
  console.error('BACKUP FAILED:', e.message);
  await pool.end().catch(() => { });
  process.exit(1);
}
