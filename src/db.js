import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// numeric/bigint come back as strings by default — we want numbers for money maths
pg.types.setTypeParser(20, v => parseInt(v, 10));      // int8
pg.types.setTypeParser(1700, v => parseFloat(v));      // numeric
pg.types.setTypeParser(1082, v => v);                  // date → keep as 'YYYY-MM-DD'

function sslConfig() {
  if (process.env.PGSSL !== 'true') return undefined;
  if (process.env.PGSSL_INSECURE === 'true') {
    console.warn('WARNING: PGSSL_INSECURE=true — the database certificate is NOT being verified.');
    return { rejectUnauthorized: false };
  }
  const ca = process.env.PGSSLROOTCERT;
  return ca ? { rejectUnauthorized: true, ca: fs.readFileSync(ca, 'utf8') } : { rejectUnauthorized: true };
}
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig(),
  max: Number(process.env.PG_POOL || 10),
  idleTimeoutMillis: 30000
});

export const q = (text, params) => pool.query(text, params);
export async function tx(fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => { });
    throw e;
  } finally { c.release(); }
}

export async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await q(sql);
}

/** Issue the next number atomically. Nothing else can hand out the same one. */
export async function nextCounter(client, key, fallbackStart) {
  const r = await client.query(
    `INSERT INTO counters(key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = counters.value + 1
     RETURNING value`, [key, fallbackStart]);
  return r.rows[0].value;
}

export async function audit(client, user, action, entity, entityId, detail = {}) {
  const c = client || pool;
  await c.query(
    `INSERT INTO audit_log(user_id, username, action, entity, entity_id, detail)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [user?.id || null, user?.username || 'system', action, entity, String(entityId ?? ''), JSON.stringify(detail)]);
}

/* ---------- money helpers: rupees at the edge, paise inside ---------- */
export const toPaise = (rupees) => Math.round((Number(rupees) || 0) * 100);
export const toRupees = (paise) => Math.round(Number(paise) || 0) / 100;
