/**
 * Daily database snapshot.
 * Runs as a Railway cron service. Dumps every table to JSON, gzips it, and stores
 * it inside the database in `db_backups`, keeping the last KEEP_DAYS snapshots.
 *
 * This protects against the failure that actually happens in clinics — a wrong
 * edit, a deleted payment, a bad import. It is NOT off-site: it lives in the same
 * database. For off-site, either Railway Pro (native backups + point-in-time
 * recovery) or set BACKUP_WEBHOOK to somewhere that accepts the file.
 */
import pg from 'pg';
import { gzipSync } from 'node:zlib';

const KEEP = Number(process.env.KEEP_DAYS || 30);
const TABLES = ['app_meta', 'users', 'doctors', 'procedures', 'procedure_price_history',
  'patients', 'invoices', 'invoice_items', 'payments', 'counters', 'audit_log'];

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: true } : undefined
});

const q = (t, p) => pool.query(t, p);

try {
  await q(`CREATE TABLE IF NOT EXISTS db_backups (
    id         BIGSERIAL PRIMARY KEY,
    taken_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    bills      INTEGER NOT NULL DEFAULT 0,
    patients   INTEGER NOT NULL DEFAULT 0,
    bytes      INTEGER NOT NULL DEFAULT 0,
    payload    BYTEA NOT NULL
  )`);

  const dump = { _app: 'hiklean-server', _at: new Date().toISOString() };
  for (const t of TABLES) {
    try { dump[t] = (await q(`SELECT * FROM ${t}`)).rows; }
    catch (e) { dump[t] = []; console.warn(`skipped ${t}: ${e.message}`); }
  }
  // never store password hashes in a snapshot that gets passed around
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

  // optional off-site: set BACKUP_WEBHOOK to a URL that accepts a POST body
  if (process.env.BACKUP_WEBHOOK) {
    const r = await fetch(process.env.BACKUP_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/gzip', 'X-Backup-Date': new Date().toISOString().slice(0, 10) },
      body: gz
    });
    console.log('Off-site copy:', r.status, r.ok ? 'sent' : 'FAILED');
    if (!r.ok) process.exitCode = 1;
  } else {
    console.log('No BACKUP_WEBHOOK set — this snapshot is stored in the database only, not off-site.');
  }
  await pool.end();
} catch (e) {
  console.error('BACKUP FAILED:', e.message);
  await pool.end().catch(() => { });
  process.exit(1);
}
