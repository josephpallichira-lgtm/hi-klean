import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, q, tx, migrate, nextCounter, audit, toPaise, toRupees } from './db.js';
import { calcInvoice } from './calc.js';
import { seedIfEmpty } from './seed.js';
import { hash, verify, issue, clear, auth, admin, csrf, jwtDecode } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'", "'unsafe-inline'"], styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use('/api/import', express.json({ limit: '25mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h', index: 'index.html' }));

app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const ok = (res, data) => res.json(data ?? { ok: true });
const wrap = (fn) => (req, res) => fn(req, res).catch(err => {
  console.error(req.method, req.path, err);
  if (err.code === '23505') return res.status(409).json({ error: 'That value is already used (duplicate).' });
  res.status(err.status || 500).json({ error: err.expose ? err.message : 'Server error' });
});
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status, expose: true });

/* ============ AUTH ============ */
// keyed on IP *and* username, so 20 tries per IP cannot become unlimited tries per account
const normUser = (u) => String(u || '').trim().toLowerCase().slice(0, 64);
const ipKey = (req) => ipKeyGenerator(req.ip || '');
// flood guard only — failures alone count, so a receptionist typing one wrong
// password is never locked out, and an attacker cannot lock her out either
const loginLimit = rateLimit({
  windowMs: 10 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => ipKey(req)
});
/* Per-account throttle applied AFTER the password is checked, so wrong guesses are
   stopped without ever locking a real user out of their own account with the right
   password — an IP-only limit can be spread across many IPs, and a naive per-username
   limit hands anyone a denial-of-service against the clinic's admin. */
const FAILS = new Map();
const FAIL_WINDOW = 10 * 60 * 1000, FAIL_MAX = 30;
function failCount(u) {
  const f = FAILS.get(u);
  if (!f || Date.now() - f.first > FAIL_WINDOW) return 0;
  return f.n;
}
function noteFail(u) {
  const f = FAILS.get(u);
  if (!f || Date.now() - f.first > FAIL_WINDOW) FAILS.set(u, { n: 1, first: Date.now() });
  else f.n++;
  if (FAILS.size > 5000) FAILS.clear();
}
// bcrypt hash of a value nobody can guess — burned on unknown users so the
// response time does not reveal which usernames exist
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeO3Jv9Ot0Q5oQwZ6ZQ0mMv9M0rJ8m1J1O';

app.post('/api/auth/login', csrf, loginLimit, wrap(async (req, res) => {
  const username = normUser(req.body.username);
  const password = String(req.body.password || '').slice(0, 200);
  const { rows } = await q('SELECT * FROM users WHERE username=$1', [username]);
  const u = rows[0];
  const good = (await verify(password, u && u.active ? u.pass_hash : DUMMY_HASH)) && !!u && u.active;
  await audit(null, good ? u : { id: null, username }, good ? 'login' : 'login_failed', 'user', u?.id || '', { ip: req.ip });
  if (!good) {
    noteFail(username);
    if (failCount(username) > FAIL_MAX) throw bad('Too many failed attempts. Try again in 10 minutes.', 429);
    throw bad('Wrong username or password', 401);
  }
  FAILS.delete(username);
  await q('UPDATE users SET last_login=now() WHERE id=$1', [u.id]);
  issue(res, u);
  ok(res, { user: { id: u.id, username: u.username, role: u.role, fullName: u.full_name, mustChange: u.must_change } });
}));

app.post('/api/auth/logout', csrf, wrap(async (req, res) => {
  // bump the epoch so a copied cookie is dead the moment the user signs out
  try {
    const t = req.cookies?.hk_session;
    if (t) { const p = jwtDecode(t); if (p?.id) await q('UPDATE users SET token_epoch=token_epoch+1 WHERE id=$1', [p.id]); }
  } catch { }
  clear(res); ok(res);
}));

app.get('/api/auth/me', auth, wrap(async (req, res) => {
  const { rows } = await q('SELECT must_change FROM users WHERE id=$1', [req.user.id]);
  ok(res, { user: { ...req.user, mustChange: rows[0]?.must_change } });
}));

app.post('/api/auth/password', auth, csrf, wrap(async (req, res) => {
  const { current, next } = req.body;
  if (!next || String(next).length < 8) throw bad('New password must be at least 8 characters');
  const { rows } = await q('SELECT pass_hash FROM users WHERE id=$1', [req.user.id]);
  if (!await verify(String(current || ''), rows[0].pass_hash)) throw bad('Current password is wrong');
  await q('UPDATE users SET pass_hash=$1, must_change=false, token_epoch=token_epoch+1 WHERE id=$2',
    [await hash(String(next)), req.user.id]);
  issue(res, { ...req.user, token_epoch: (req.user.token_epoch || 0) + 1 });   // keep THIS session alive
  await audit(null, req.user, 'password_change', 'user', req.user.id);
  ok(res);
}));

app.get('/api/health', (req, res) => ok(res, { up: true, time: new Date().toISOString() }));
app.use('/api', auth, csrf);      // everything below needs a session

/* ============ USERS (admin) ============ */
app.get('/api/users', admin, wrap(async (req, res) =>
  ok(res, (await q('SELECT id, username, full_name, role, active, last_login, created_at FROM users ORDER BY id')).rows)));

app.post('/api/users', admin, wrap(async (req, res) => {
  const { username, password, role, fullName } = req.body;
  if (!username || !password) throw bad('Username and password required');
  if (String(password).length < 8) throw bad('Password must be at least 8 characters');
  const { rows } = await q(`INSERT INTO users(username, pass_hash, full_name, role, must_change) VALUES ($1,$2,$3,$4,true) RETURNING id`,
    [String(username).trim().toLowerCase(), await hash(String(password)), fullName || '', role === 'admin' ? 'admin' : 'staff']);
  await audit(null, req.user, 'user_create', 'user', rows[0].id, { username, role });
  ok(res, { id: rows[0].id });
}));

app.patch('/api/users/:id', admin, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { role, active, password, fullName } = req.body;
  if (role || active === false) {
    const { rows: [a] } = await q(`SELECT count(*)::int c FROM users WHERE role='admin' AND active AND id<>$1`, [id]);
    if (a.c === 0 && (role === 'staff' || active === false)) throw bad('Keep at least one active admin');
  }
  if (password) {
    if (String(password).length < 8) throw bad('Password must be at least 8 characters');
    await q('UPDATE users SET pass_hash=$1, must_change=true, token_epoch=token_epoch+1 WHERE id=$2',
      [await hash(String(password)), id]);   // kills any session that user already had
  }
  await q(`UPDATE users SET role=COALESCE($1,role), active=COALESCE($2,active), full_name=COALESCE($3,full_name),
      token_epoch = token_epoch + CASE WHEN $1 IS NOT NULL OR $2 IS NOT NULL THEN 1 ELSE 0 END
      WHERE id=$4`,
    [role || null, typeof active === 'boolean' ? active : null, fullName ?? null, id]);
  await audit(null, req.user, 'user_update', 'user', id, { role, active, pw: !!password });
  ok(res);
}));

/* ============ SETTINGS / DOCTORS ============ */
app.get('/api/settings', wrap(async (req, res) => {
  const { rows } = await q(`SELECT value FROM app_meta WHERE key='settings'`);
  const docs = (await q('SELECT * FROM doctors ORDER BY sort, id')).rows;
  const counters = (await q('SELECT key, value FROM counters')).rows.reduce((a, r) => (a[r.key] = r.value, a), {});
  counters.bill_no = Math.max(Number(counters.bill_no) || 0, await maxIssued('bill'));
  counters.reg_no = Math.max(Number(counters.reg_no) || 0, await maxIssued('reg'));
  ok(res, { settings: rows[0]?.value || {}, doctors: docs, counters });
}));

app.put('/api/settings', admin, wrap(async (req, res) => {
  const s = req.body.settings || {};

  // You cannot lawfully charge GST without being registered, and a tax invoice
  // must carry the GSTIN anyway. So GST cannot be switched on until a
  // well-formed GSTIN is on file. Enforced here, not just in the browser.
  if (s.gstEnabled) {
    const g = String(s.gstin || '').trim().toUpperCase();
    if (!g) throw bad('Enter the clinic GSTIN before switching GST on. Without a GST registration you must not charge GST.');
    if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(g))
      throw bad('That GSTIN does not look valid. It should be 15 characters, e.g. 32ABCDE1234F1Z5.');
    s.gstin = g;
  }

  // validate the numbering FIRST — a half-saved settings page was worse than a rejected one
  const counterWrites = [];
  if (req.body.counters) {
    for (const [k, val] of Object.entries(req.body.counters)) {
      if (!['bill_no', 'reg_no'].includes(k)) continue;
      let n = Math.floor(Number(val));
      if (!Number.isFinite(n) || n < 0) throw bad('Numbering must be a whole number');
      if (n > 99999999) throw bad('That number is too large');
      const floor = k === 'bill_no' ? await maxIssued('bill') : await maxIssued('reg');
      // clamp rather than reject: the admin is usually just saving the clinic address
      counterWrites.push([k, Math.max(n, floor)]);
    }
  }
  await q(`INSERT INTO app_meta(key, value, updated_at) VALUES ('settings',$1,now())
           ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=now()`, [JSON.stringify(s)]);
  if (Array.isArray(req.body.doctors)) {
    await tx(async c => {
      for (const [i, d] of req.body.doctors.entries()) {
        if (d.id) {
          await c.query(`UPDATE doctors SET name=$1, spec=$2, role_line=$3, reg_no=$4, sign_title=$5, active=$6, sort=$7 WHERE id=$8`,
            [d.name || '', d.spec || '', d.role_line || '', d.reg_no || '', d.sign_title || '', d.active !== false, i, d.id]);
        } else {
          await c.query(`INSERT INTO doctors(name, spec, role_line, reg_no, sign_title, active, sort) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [d.name || '', d.spec || '', d.role_line || '', d.reg_no || '', d.sign_title || '', d.active !== false, i]);
        }
      }
      if (Array.isArray(req.body.deleteDoctors)) {
        for (const id of req.body.deleteDoctors) {
          const { rows } = await c.query('SELECT count(*)::int c FROM invoices WHERE doctor_id=$1', [id]);
          if (rows[0].c === 0) await c.query('DELETE FROM doctors WHERE id=$1', [id]);
          else await c.query('UPDATE doctors SET active=false WHERE id=$1', [id]);
        }
      }
    });
  }
  let clamped = null;
  for (const [k, n] of counterWrites) {
    if (Number(req.body.counters[k]) !== n) clamped = { key: k, asked: Number(req.body.counters[k]), used: n };
    await q(`INSERT INTO counters(key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2`, [k, n]);
  }
  await audit(null, req.user, 'settings_update', 'settings', 1, clamped ? { clamped } : {});
  ok(res, { clamped });
}));

/** highest number already used, so numbering can never be pushed back onto an issued one */
async function maxIssued(kind) {
  const sql = kind === 'bill'
    ? `SELECT COALESCE(max(NULLIF(regexp_replace(no,'\\D','','g'),''))::bigint,0) m
       FROM invoices WHERE type='bill' AND length(regexp_replace(no,'\\D','','g')) BETWEEN 1 AND 8`
    : `SELECT COALESCE(max(NULLIF(regexp_replace(reg_no,'\\D','','g'),''))::bigint,0) m
       FROM patients WHERE length(regexp_replace(COALESCE(reg_no,''),'\\D','','g')) BETWEEN 1 AND 8`;
  return Number((await q(sql)).rows[0].m) || 0;
}

/* ============ PROCEDURES ============ */
const procOut = (p) => ({
  id: p.id, name: p.name, cat: p.category, price: toRupees(p.price_paise), perTooth: p.per_tooth,
  taxable: p.taxable, gst: Number(p.gst_rate), gstIncl: p.gst_incl, active: p.active, sort: p.sort
});
app.get('/api/procedures', wrap(async (req, res) =>
  ok(res, (await q('SELECT * FROM procedures ORDER BY sort, id')).rows.map(procOut))));

app.post('/api/procedures', admin, wrap(async (req, res) => {
  const b = req.body;
  if (!b.name) throw bad('Name required');
  const { rows } = await q(`INSERT INTO procedures(name, category, price_paise, per_tooth, taxable, gst_rate, gst_incl, sort)
      VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE((SELECT max(sort)+1 FROM procedures),0)) RETURNING *`,
    [b.name, b.cat || 'Others', toPaise(b.price), !!b.perTooth, !!b.taxable, Number(b.gst) || 0,
     b.gstIncl === undefined ? true : !!b.gstIncl]);
  await audit(null, req.user, 'procedure_create', 'procedure', rows[0].id, { name: b.name, price: b.price });
  ok(res, procOut(rows[0]));
}));

app.patch('/api/procedures/:id', admin, wrap(async (req, res) => {
  const id = Number(req.params.id), b = req.body;
  const { rows: [cur] } = await q('SELECT * FROM procedures WHERE id=$1', [id]);
  if (!cur) throw bad('Not found', 404);
  const newPaise = b.price === undefined ? cur.price_paise : toPaise(b.price);
  if (newPaise !== cur.price_paise) {
    await q('INSERT INTO procedure_price_history(procedure_id, old_paise, new_paise, changed_by) VALUES ($1,$2,$3,$4)',
      [id, cur.price_paise, newPaise, req.user.id]);
  }
  const { rows } = await q(`UPDATE procedures SET name=COALESCE($1,name), category=COALESCE($2,category),
      price_paise=$3, per_tooth=COALESCE($4,per_tooth), taxable=COALESCE($5,taxable),
      gst_rate=COALESCE($6,gst_rate), gst_incl=COALESCE($7,gst_incl), active=COALESCE($8,active),
      updated_at=now() WHERE id=$9 RETURNING *`,
    [b.name ?? null, b.cat ?? null, newPaise, typeof b.perTooth === 'boolean' ? b.perTooth : null,
    typeof b.taxable === 'boolean' ? b.taxable : null, b.gst ?? null,
    typeof b.gstIncl === 'boolean' ? b.gstIncl : null,
    typeof b.active === 'boolean' ? b.active : null, id]);
  if (newPaise !== cur.price_paise) await audit(null, req.user, 'price_change', 'procedure', id,
    { name: cur.name, from: toRupees(cur.price_paise), to: toRupees(newPaise) });
  ok(res, procOut(rows[0]));
}));

app.delete('/api/procedures/:id', admin, wrap(async (req, res) => {
  const id = Number(req.params.id);
  await q('UPDATE procedures SET active=false WHERE id=$1', [id]);   // history keeps its own copy; never hard-delete
  await audit(null, req.user, 'procedure_hide', 'procedure', id);
  ok(res);
}));

app.post('/api/procedures/bulk-price', admin, wrap(async (req, res) => {
  const { category, pct, roundTo } = req.body;
  const r = Math.max(1, Number(roundTo) || 1), p = Number(pct) || 0;
  const rows = (await q(category && category !== 'all'
    ? 'SELECT * FROM procedures WHERE category=$1' : 'SELECT * FROM procedures',
    category && category !== 'all' ? [category] : [])).rows;
  await tx(async c => {
    for (const x of rows) {
      if (!x.price_paise) continue;
      const np = Math.round(x.price_paise * (1 + p / 100) / (r * 100)) * r * 100;
      await c.query('INSERT INTO procedure_price_history(procedure_id, old_paise, new_paise, changed_by) VALUES ($1,$2,$3,$4)',
        [x.id, x.price_paise, np, req.user.id]);
      await c.query('UPDATE procedures SET price_paise=$1, updated_at=now() WHERE id=$2', [np, x.id]);
    }
  });
  await audit(null, req.user, 'bulk_price', 'procedure', category || 'all', { pct: p, count: rows.length });
  ok(res, { count: rows.length });
}));

/* ============ PATIENTS ============ */
const patOut = (p) => ({
  id: p.id, reg: p.reg_no || '', name: p.name, phone: p.phone, age: p.age, sex: p.sex,
  address: p.address, note: p.note, createdAt: p.created_at
});
app.get('/api/patients', wrap(async (req, res) => {
  const s = String(req.query.q || '').trim().toLowerCase();
  const rows = s
    ? (await q(`SELECT * FROM patients WHERE lower(name) LIKE $1 OR phone LIKE $1 OR lower(reg_no) LIKE $1
                ORDER BY name LIMIT 50`, ['%' + s + '%'])).rows
    : (await q('SELECT * FROM patients ORDER BY id DESC LIMIT 500')).rows;
  ok(res, rows.map(patOut));
}));

app.get('/api/patients/:id', wrap(async (req, res) => {
  const { rows } = await q('SELECT * FROM patients WHERE id=$1', [req.params.id]);
  if (!rows[0]) throw bad('Not found', 404);
  ok(res, patOut(rows[0]));
}));

async function nextReg(client) {
  const { rows: [s] } = await client.query(`SELECT value FROM app_meta WHERE key='settings'`);
  const pre = s?.value?.regPrefix ?? '';
  let reg = '';
  for (let i = 0; i < 200; i++) {
    reg = pre + await nextCounter(client, 'reg_no', 12682);
    const t = await client.query('SELECT 1 FROM patients WHERE reg_no=$1', [reg]);
    if (!t.rowCount) break;              // skip IDs a human already typed in
  }
  return reg;
}

app.post('/api/patients', wrap(async (req, res) => {
  const b = req.body;
  if (!b.name) throw bad('Name required');
  const row = await tx(async c => {
    const reg = b.reg?.trim() || await nextReg(c);
    const { rows } = await c.query(`INSERT INTO patients(reg_no, name, phone, age, sex, address, note, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [reg, b.name.trim(), b.phone || '', b.age || '', b.sex || '', b.address || '', b.note || '', req.user.id]);
    return rows[0];
  });
  await audit(null, req.user, 'patient_create', 'patient', row.id, { name: row.name, reg: row.reg_no });
  ok(res, patOut(row));
}));

app.patch('/api/patients/:id', wrap(async (req, res) => {
  const id = Number(req.params.id), b = req.body;
  const { rows: [cur] } = await q('SELECT * FROM patients WHERE id=$1', [id]);
  if (!cur) throw bad('Not found', 404);
  const { rows } = await q(`UPDATE patients SET reg_no=COALESCE($1,reg_no), name=COALESCE($2,name), phone=COALESCE($3,phone),
      age=COALESCE($4,age), sex=COALESCE($5,sex), address=COALESCE($6,address), note=COALESCE($7,note), updated_at=now()
      WHERE id=$8 RETURNING *`,
    [b.reg ?? null, b.name ?? null, b.phone ?? null, b.age ?? null, b.sex ?? null, b.address ?? null, b.note ?? null, id]);
  if (b.name && b.name !== cur.name)
    await audit(null, req.user, 'patient_rename', 'patient', id, { from: cur.name, to: b.name });
  ok(res, patOut(rows[0]));
}));

/* ============ INVOICES ============ */
const invOut = (inv, items, pays) => ({
  id: inv.id, no: inv.no, type: inv.type, date: inv.bill_date, patientId: inv.patient_id, doctorId: inv.doctor_id,
  discType: inv.disc_type, discValue: inv.disc_type === 'amt' ? toRupees(inv.disc_value) : Number(inv.disc_value),
  notes: inv.notes, gstOn: inv.gst_on, voidedAt: inv.voided_at, voidReason: inv.void_reason,
  sub: toRupees(inv.sub_paise), disc: toRupees(inv.disc_paise), tax: toRupees(inv.tax_paise),
  taxIncl: toRupees(inv.tax_inc_paise || 0), taxAdd: toRupees((inv.tax_paise || 0) - (inv.tax_inc_paise || 0)),
  total: toRupees(inv.total_paise),
  createdAt: inv.created_at, createdBy: inv.created_by_name || '', updatedAt: inv.updated_at,
  pname: inv.pname, preg: inv.preg, pphone: inv.pphone,
  pat: { name: inv.pname, reg: inv.preg, phone: inv.pphone, age: inv.page, sex: inv.psex, address: inv.paddress },
  items: (items || []).map(i => ({
    id: i.id, pid: i.procedure_id, name: i.name, desc: i.description, qty: Number(i.qty),
    rate: toRupees(i.rate_paise), disc: toRupees(i.disc_paise), amount: toRupees(i.amount_paise),
    taxable: i.taxable, gst: Number(i.gst_rate), gstIncl: i.gst_incl, perTooth: i.per_tooth, docId: i.doctor_id
  })),
  payments: (pays || []).map(p => ({ id: p.id, date: p.pay_date, mode: p.mode, amount: toRupees(p.amount_paise), ref: p.ref })),
  paid: toRupees((pays || []).reduce((a, p) => a + p.amount_paise, 0)),
  bal: toRupees(inv.total_paise - (pays || []).reduce((a, p) => a + p.amount_paise, 0))
});

const INV_SELECT = `SELECT i.*, p.name AS pname, p.reg_no AS preg, p.phone AS pphone,
                           p.age AS page, p.sex AS psex, p.address AS paddress, u.username AS created_by_name
                    FROM invoices i JOIN patients p ON p.id=i.patient_id LEFT JOIN users u ON u.id=i.created_by`;

async function loadInvoices(where, params) {
  const inv = (await q(`${INV_SELECT} ${where}`, params)).rows;
  if (!inv.length) return [];
  const ids = inv.map(i => i.id);
  const items = (await q('SELECT * FROM invoice_items WHERE invoice_id = ANY($1) ORDER BY seq, id', [ids])).rows;
  const pays = (await q('SELECT * FROM payments WHERE invoice_id = ANY($1) ORDER BY pay_date, id', [ids])).rows;
  return inv.map(i => invOut(i, items.filter(x => x.invoice_id === i.id), pays.filter(x => x.invoice_id === i.id)));
}

app.get('/api/invoices', wrap(async (req, res) => {
  const { from, to, q: search, status, limit } = req.query;
  const w = ['i.voided_at IS NULL'], p = [];
  if (from) { p.push(from); w.push(`i.bill_date >= $${p.length}`); }
  if (to) { p.push(to); w.push(`i.bill_date <= $${p.length}`); }
  if (search) { p.push('%' + String(search).toLowerCase() + '%'); w.push(`(lower(i.no) LIKE $${p.length} OR lower(p.name) LIKE $${p.length} OR p.phone LIKE $${p.length} OR lower(p.reg_no) LIKE $${p.length})`); }
  p.push(Math.min(Number(limit) || 300, 2000));
  const list = await loadInvoices(`WHERE ${w.join(' AND ')} ORDER BY i.bill_date DESC, i.id DESC LIMIT $${p.length}`, p);
  ok(res, status === 'pending' ? list.filter(i => i.bal > 0.005)
    : status === 'paid' ? list.filter(i => i.bal <= 0.005) : list);
}));

app.get('/api/invoices/:id', wrap(async (req, res) => {
  const l = await loadInvoices('WHERE i.id=$1', [req.params.id]);
  if (!l[0]) throw bad('Not found', 404);
  ok(res, l[0]);
}));

app.get('/api/patients/:id/invoices', wrap(async (req, res) =>
  ok(res, await loadInvoices('WHERE i.patient_id=$1 AND i.voided_at IS NULL ORDER BY i.bill_date, i.id', [req.params.id]))));

function normItems(items) {
  if (!Array.isArray(items) || !items.length) throw bad('Add at least one treatment');
  return items.map((it, seq) => ({
    seq, procedure_id: it.pid || null, name: String(it.name || '').slice(0, 200), description: String(it.desc || '').slice(0, 200),
    qty: Math.max(0, Number(it.qty) || 0), rate_paise: toPaise(it.rate), disc_paise: toPaise(it.disc),
    taxable: !!it.taxable, gst_rate: Number(it.gst) || 0, gst_incl: it.gstIncl === undefined ? true : !!it.gstIncl,
    per_tooth: !!it.perTooth, doctor_id: it.docId || null
  }));
}

app.post('/api/invoices', wrap(async (req, res) => {
  const b = req.body;
  if (!b.patientId) throw bad('Patient required');
  if (!isDay(b.date)) throw bad('Bill date is not a valid date');
  const gstOn = !!b.gstOn;
  const items = normItems(b.items);
  const discValue = b.discType === 'pct' ? Number(b.discValue) || 0 : toPaise(b.discValue);
  const calc = calcInvoice(items, b.discType, discValue, gstOn);

  const modes = await allowedModes();
  const pick = (m) => modes.includes(String(m)) ? String(m) : modes[0];
  const id = await tx(async c => {
    let no = String(b.no || '').trim();
    if (b.type === 'estimate') {
      if (!no) no = 'EST-' + await nextCounter(c, 'bill_no_est', 1);
    } else if (!no || b.autoNumber) {
      for (let i = 0; i < 200; i++) {
        no = String(await nextCounter(c, 'bill_no', 169));
        const t = await c.query(`SELECT 1 FROM invoices WHERE type='bill' AND no=$1`, [no]);
        if (!t.rowCount) break;          // that number was typed in manually — take the next one
      }
    }
    const { rows } = await c.query(`INSERT INTO invoices(no, type, bill_date, patient_id, doctor_id, sub_paise, disc_type,
        disc_value, disc_paise, tax_paise, tax_inc_paise, total_paise, gst_on, notes, created_by, updated_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15) RETURNING id`,
      [no, b.type === 'estimate' ? 'estimate' : 'bill', b.date, b.patientId, b.doctorId || null,
      calc.sub_paise, b.discType === 'pct' ? 'pct' : 'amt', discValue, calc.disc_paise, calc.tax_paise,
      calc.tax_inc_paise, calc.total_paise, gstOn, b.notes || '', req.user.id]);
    const invId = rows[0].id;
    for (const it of calc.items) {
      await c.query(`INSERT INTO invoice_items(invoice_id, seq, procedure_id, name, description, qty, rate_paise,
          disc_paise, amount_paise, taxable, gst_rate, gst_incl, per_tooth, doctor_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [invId, it.seq, it.procedure_id, it.name, it.description, it.qty, it.rate_paise, it.disc_paise,
        it.amount_paise, it.taxable, it.gst_rate, it.gst_incl, it.per_tooth, it.doctor_id || b.doctorId || null]);
    }
    if (b.type !== 'estimate') for (const p of (b.payments || [])) {
      const amt = toPaise(p.amount);
      if (!Number.isFinite(amt) || amt <= 0) continue;
      await c.query(`INSERT INTO payments(invoice_id, pay_date, mode, amount_paise, ref, created_by)
          VALUES ($1,$2,$3,$4,$5,$6)`, [invId, dayOr(p.date, b.date), pick(p.mode), amt, cleanRef(p.ref), req.user.id]);
    }
    return invId;
  });
  await audit(null, req.user, 'invoice_create', 'invoice', id, { total: toRupees(calc.total_paise) });
  ok(res, (await loadInvoices('WHERE i.id=$1', [id]))[0]);
}));

app.put('/api/invoices/:id', wrap(async (req, res) => {
  const id = Number(req.params.id), b = req.body;
  const { rows: [cur] } = await q('SELECT * FROM invoices WHERE id=$1', [id]);
  if (!cur) throw bad('Not found', 404);
  if (cur.voided_at) throw bad('This bill is cancelled and cannot be edited');
  if (b.date !== undefined && !isDay(b.date)) throw bad('Bill date is not a valid date');
  const gstOn = cur.gst_on;                       // frozen at creation, never re-derived
  const items = normItems(b.items);
  const discValue = b.discType === 'pct' ? Number(b.discValue) || 0 : toPaise(b.discValue);
  const calc = calcInvoice(items, b.discType, discValue, gstOn);
  await tx(async c => {
    await c.query(`UPDATE invoices SET no=$1, bill_date=$2, patient_id=$3, doctor_id=$4, sub_paise=$5, disc_type=$6,
        disc_value=$7, disc_paise=$8, tax_paise=$9, tax_inc_paise=$10, total_paise=$11, notes=$12,
        updated_by=$13, updated_at=now() WHERE id=$14`,
      [String(b.no || cur.no), b.date || cur.bill_date, b.patientId || cur.patient_id, b.doctorId || cur.doctor_id,
      calc.sub_paise, b.discType === 'pct' ? 'pct' : 'amt', discValue, calc.disc_paise, calc.tax_paise,
      calc.tax_inc_paise, calc.total_paise, b.notes || '', req.user.id, id]);
    await c.query('DELETE FROM invoice_items WHERE invoice_id=$1', [id]);
    for (const it of calc.items) {
      await c.query(`INSERT INTO invoice_items(invoice_id, seq, procedure_id, name, description, qty, rate_paise,
          disc_paise, amount_paise, taxable, gst_rate, gst_incl, per_tooth, doctor_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [id, it.seq, it.procedure_id, it.name, it.description, it.qty, it.rate_paise, it.disc_paise,
        it.amount_paise, it.taxable, it.gst_rate, it.gst_incl, it.per_tooth, it.doctor_id || b.doctorId || null]);
    }
    // payments are NEVER touched by an edit — they are their own records
  });
  await audit(null, req.user, 'invoice_edit', 'invoice', id,
    { from: toRupees(cur.total_paise), to: toRupees(calc.total_paise) });
  ok(res, (await loadInvoices('WHERE i.id=$1', [id]))[0]);
}));

async function allowedModes() {
  const { rows } = await q(`SELECT value FROM app_meta WHERE key='settings'`);
  const m = (rows[0]?.value?.modes || []).map(String).filter(Boolean);
  return m.length ? m : ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Cheque'];
}
async function cleanMode(m) {
  const allowed = await allowedModes();
  const want = String(m ?? '');
  return allowed.includes(want) ? want : allowed[0];
}
const cleanRef = (r) => String(r ?? '').replace(/[<>]/g, '').slice(0, 64);
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d ?? '')) && !isNaN(Date.parse(d));
const dayOr = (d, fallback) => isDay(d) ? d : fallback;

app.post('/api/invoices/:id/payments', wrap(async (req, res) => {
  const id = Number(req.params.id), b = req.body;
  const amt = toPaise(b.amount);
  if (!Number.isFinite(amt) || amt <= 0) throw bad('Enter a payment amount greater than zero');
  const { rows: [inv] } = await q('SELECT * FROM invoices WHERE id=$1', [id]);
  if (!inv) throw bad('Not found', 404);
  if (inv.voided_at) throw bad('This bill is cancelled');
  if (inv.type !== 'bill') throw bad('This is an estimate — convert it to a bill before taking payment');
  await q(`INSERT INTO payments(invoice_id, pay_date, mode, amount_paise, ref, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, dayOr(b.date, inv.bill_date), await cleanMode(b.mode), amt, cleanRef(b.ref), req.user.id]);
  await audit(null, req.user, 'payment_add', 'invoice', id, { amount: toRupees(amt), mode: b.mode });
  ok(res, (await loadInvoices('WHERE i.id=$1', [id]))[0]);
}));

app.delete('/api/invoices/:id/payments/:pid', admin, wrap(async (req, res) => {
  const { rows: [p] } = await q('SELECT * FROM payments WHERE id=$1 AND invoice_id=$2', [req.params.pid, req.params.id]);
  if (!p) throw bad('Not found', 404);
  await q('DELETE FROM payments WHERE id=$1', [p.id]);
  await audit(null, req.user, 'payment_delete', 'invoice', req.params.id, { amount: toRupees(p.amount_paise), mode: p.mode });
  ok(res, (await loadInvoices('WHERE i.id=$1', [req.params.id]))[0]);
}));

/** Bills are never deleted — they are cancelled, with a reason, and stay in the audit trail. */
app.post('/api/invoices/:id/void', admin, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const reason = String(req.body.reason || '').trim();
  if (reason.length < 3) throw bad('Give a reason for cancelling');
  await q('UPDATE invoices SET voided_at=now(), void_reason=$1, updated_by=$2 WHERE id=$3', [reason, req.user.id, id]);
  await audit(null, req.user, 'invoice_void', 'invoice', id, { reason });
  ok(res);
}));

app.post('/api/invoices/:id/convert', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { rows: [inv] } = await q('SELECT * FROM invoices WHERE id=$1', [id]);
  if (!inv) throw bad('Not found', 404);
  if (inv.type !== 'estimate') throw bad('Already a bill');
  const no = await tx(async c => {
    const n = String(await nextCounter(c, 'bill_no', 169));
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body.date || '')) ? req.body.date : inv.bill_date;
    await c.query(`UPDATE invoices SET type='bill', no=$1, bill_date=$2, updated_by=$3, updated_at=now() WHERE id=$4`,
      [n, day, req.user.id, id]);
    return n;
  });
  await audit(null, req.user, 'estimate_convert', 'invoice', id, { no });
  ok(res, (await loadInvoices('WHERE i.id=$1', [id]))[0]);
}));

/* ============ REPORTS ============ */
app.get('/api/reports', admin, wrap(async (req, res) => {
  const from = req.query.from, to = req.query.to;
  const P = [from, to];
  const money = (r) => toRupees(r || 0);
  const billed = (await q(`SELECT count(*)::int c, COALESCE(sum(total_paise),0) t, COALESCE(sum(disc_paise),0) d
      FROM invoices WHERE type='bill' AND voided_at IS NULL AND bill_date BETWEEN $1 AND $2`, P)).rows[0];
  const collected = (await q(`SELECT COALESCE(sum(p.amount_paise),0) t FROM payments p JOIN invoices i ON i.id=p.invoice_id
      WHERE i.type='bill' AND i.voided_at IS NULL AND p.pay_date BETWEEN $1 AND $2`, P)).rows[0];
  const modes = (await q(`SELECT p.mode, sum(p.amount_paise) t FROM payments p JOIN invoices i ON i.id=p.invoice_id
      WHERE i.type='bill' AND i.voided_at IS NULL AND p.pay_date BETWEEN $1 AND $2 GROUP BY p.mode ORDER BY t DESC`, P)).rows;
  // line-level, so a bill shared by two doctors splits the same way the Doctor Report splits it
  const docs = (await q(`
    WITH pay AS (SELECT invoice_id, sum(amount_paise) paid FROM payments WHERE pay_date BETWEEN $1 AND $2 GROUP BY invoice_id)
    SELECT COALESCE(d.name,'(not assigned)') name,
           sum(CASE WHEN i.sub_paise > 0
                    THEN round(it.amount_paise::numeric / i.sub_paise * p.paid)
                    ELSE round(p.paid::numeric / GREATEST(1,(SELECT count(*) FROM invoice_items x WHERE x.invoice_id=i.id))) END)::bigint t
    FROM pay p JOIN invoices i ON i.id=p.invoice_id
    JOIN invoice_items it ON it.invoice_id=i.id
    LEFT JOIN doctors d ON d.id=it.doctor_id
    WHERE i.type='bill' AND i.voided_at IS NULL
    GROUP BY d.name ORDER BY t DESC`, P)).rows;
  const daily = (await q(`SELECT p.pay_date d, sum(p.amount_paise) t FROM payments p JOIN invoices i ON i.id=p.invoice_id
      WHERE i.type='bill' AND i.voided_at IS NULL AND p.pay_date BETWEEN $1 AND $2 GROUP BY p.pay_date ORDER BY d DESC`, P)).rows;
  const top = (await q(`SELECT it.name, sum(it.qty)::float n, sum(it.amount_paise) t FROM invoice_items it
      JOIN invoices i ON i.id=it.invoice_id WHERE i.type='bill' AND i.voided_at IS NULL
      AND i.bill_date BETWEEN $1 AND $2 GROUP BY it.name ORDER BY t DESC LIMIT 15`, P)).rows;
  const dues = (await q(`SELECT i.id, i.no, i.bill_date, p.name, p.phone, p.id pid,
      i.total_paise - COALESCE((SELECT sum(amount_paise) FROM payments WHERE invoice_id=i.id),0) bal
      FROM invoices i JOIN patients p ON p.id=i.patient_id
      WHERE i.type='bill' AND i.voided_at IS NULL
      AND i.total_paise > COALESCE((SELECT sum(amount_paise) FROM payments WHERE invoice_id=i.id),0)
      ORDER BY bal DESC LIMIT 200`)).rows;
  ok(res, {
    billed: { count: billed.c, total: money(billed.t), disc: money(billed.d) },
    collected: money(collected.t),
    modes: modes.map(m => ({ mode: m.mode, total: money(m.t) })),
    doctors: docs.map(m => ({ name: m.name, total: money(m.t) })),
    daily: daily.map(m => ({ date: m.d, total: money(m.t) })),
    top: top.map(m => ({ name: m.name, n: m.n, total: money(m.t) })),
    dues: dues.map(d => ({ id: d.id, no: d.no, date: d.bill_date, name: d.name, phone: d.phone, pid: d.pid, bal: money(d.bal) })),
    duesTotal: money(dues.reduce((a, d) => a + Number(d.bal), 0))
  });
}));

/** Doctor-wise: what each doctor actually did, and what it earned.
 *  Collection is apportioned to each treatment line by its share of the bill. */
async function doctorReport(from, to) {
  const P = [from, to];
  const { rows } = await q(`
    WITH pay AS (
      SELECT invoice_id, sum(amount_paise) paid FROM payments
      WHERE pay_date BETWEEN $1 AND $2 GROUP BY invoice_id
    ), allpay AS (          -- every payment ever made on the bill, not just this window
      SELECT invoice_id, sum(amount_paise) paid FROM payments GROUP BY invoice_id
    ), line AS (
      SELECT it.doctor_id, COALESCE(d.name,'(not assigned)') doc_name, it.name, it.qty,
             it.amount_paise,
             -- billed counts only bills raised inside the window
             CASE WHEN i.bill_date BETWEEN $1 AND $2 AND i.sub_paise > 0
                  THEN round(it.amount_paise::numeric / i.sub_paise * i.total_paise) ELSE 0 END AS net_paise,
             -- collection follows the money: any payment received inside the window,
             -- split across the treatments on that bill in proportion to their value
             CASE WHEN i.sub_paise > 0
                  THEN round(it.amount_paise::numeric / i.sub_paise * COALESCE(p.paid,0))
                  ELSE round(COALESCE(p.paid,0)::numeric / GREATEST(1,(SELECT count(*) FROM invoice_items x WHERE x.invoice_id=i.id)))
             END AS coll_paise,
             -- OF that collection, the part that settles a bill raised OUTSIDE the window.
             -- Without this, billed - collected reads as a negative "outstanding" and looks
             -- like the doctor was paid for work never billed. It is simply older work.
             CASE WHEN NOT (i.bill_date BETWEEN $1 AND $2) AND i.sub_paise > 0
                  THEN round(it.amount_paise::numeric / i.sub_paise * COALESCE(p.paid,0))
                  WHEN NOT (i.bill_date BETWEEN $1 AND $2)
                  THEN round(COALESCE(p.paid,0)::numeric / GREATEST(1,(SELECT count(*) FROM invoice_items x WHERE x.invoice_id=i.id)))
                  ELSE 0 END AS prior_paise,
             -- what is STILL unpaid on the bills raised inside the window, counting every
             -- payment ever received against them. This is the real "outstanding".
             CASE WHEN i.bill_date BETWEEN $1 AND $2 AND i.sub_paise > 0
                  THEN round(it.amount_paise::numeric / i.sub_paise * (i.total_paise - COALESCE(ap.paid,0)))
                  ELSE 0 END AS unpaid_paise,
             (i.bill_date BETWEEN $1 AND $2) AS in_window,
             i.id inv_id, i.patient_id
      FROM invoice_items it
      JOIN invoices i ON i.id = it.invoice_id
      LEFT JOIN doctors d ON d.id = it.doctor_id
      LEFT JOIN pay p ON p.invoice_id = i.id
      LEFT JOIN allpay ap ON ap.invoice_id = i.id
      WHERE i.type='bill' AND i.voided_at IS NULL
        AND ((i.bill_date BETWEEN $1 AND $2) OR p.paid IS NOT NULL)
    )
    SELECT doctor_id, doc_name, name,
           sum(CASE WHEN in_window THEN qty ELSE 0 END)::float AS qty,
           count(*)::int AS lines,
           sum(net_paise)::bigint AS net,
           sum(coll_paise)::bigint AS coll,
           sum(prior_paise)::bigint AS prior,
           sum(unpaid_paise)::bigint AS unpaid
    FROM line GROUP BY doctor_id, doc_name, name ORDER BY doc_name, net DESC`, P);

  const byDoc = new Map();
  for (const r of rows) {
    if (!Number(r.net) && !Number(r.coll)) continue;
    const k = r.doctor_id || 0;
    if (!byDoc.has(k)) byDoc.set(k, { doctorId: r.doctor_id, name: r.doc_name, billed: 0, collected: 0, prior: 0, unpaid: 0, procedures: [], bills: 0, patients: 0 });
    const dd = byDoc.get(k);
    dd.billed += Number(r.net); dd.collected += Number(r.coll);
    dd.prior += Number(r.prior); dd.unpaid += Number(r.unpaid);
    dd.procedures.push({
      name: r.name, qty: r.qty, lines: r.lines,
      billed: toRupees(r.net), collected: toRupees(r.coll), prior: toRupees(r.prior)
    });
  }
  const totals = (await q(`
    SELECT it.doctor_id, count(DISTINCT i.id)::int bills, count(DISTINCT i.patient_id)::int patients
    FROM invoice_items it JOIN invoices i ON i.id=it.invoice_id
    WHERE i.type='bill' AND i.voided_at IS NULL AND i.bill_date BETWEEN $1 AND $2
    GROUP BY it.doctor_id`, P)).rows;
  for (const t of totals) {
    const dd = byDoc.get(t.doctor_id || 0);
    if (dd) { dd.bills = t.bills; dd.patients = t.patients; }
  }
  return [...byDoc.values()].map(d => ({
    doctorId: d.doctorId, name: d.name, bills: d.bills, patients: d.patients,
    billed: toRupees(d.billed), collected: toRupees(d.collected),
    // collectedPrior: part of `collected` that settles bills raised before this period
    // unpaid: what is still owed on the bills raised INSIDE this period
    collectedPrior: toRupees(d.prior), unpaid: toRupees(d.unpaid),
    procedures: d.procedures.sort((a, b) => b.billed - a.billed)
  })).sort((a, b) => b.billed - a.billed);
}
app.get('/api/reports/doctors', admin, wrap(async (req, res) =>
  ok(res, await doctorReport(req.query.from, req.query.to))));

/** Receipt-level list behind the "Collected" tile. Collection follows the PAYMENT
 *  date, not the bill date — money taken today against an old bill belongs here
 *  and must not be shown as "billed today". */
app.get('/api/reports/payments', admin, wrap(async (req, res) => {
  const { rows } = await q(`
    SELECT p.id, p.pay_date, p.mode, p.ref, p.amount_paise, p.created_at,
           i.id inv_id, i.no, i.bill_date, i.total_paise,
           pt.name pname, pt.reg_no, pt.phone, COALESCE(u.username,'') entered_by
    FROM payments p
    JOIN invoices i ON i.id = p.invoice_id
    JOIN patients pt ON pt.id = i.patient_id
    LEFT JOIN users u ON u.id = p.created_by
    WHERE i.type='bill' AND i.voided_at IS NULL AND p.pay_date BETWEEN $1 AND $2
    ORDER BY p.pay_date DESC, p.id DESC LIMIT 500`, [req.query.from, req.query.to]);
  ok(res, rows.map(r => ({
    id: r.id, date: r.pay_date, mode: r.mode, ref: r.ref, amount: toRupees(r.amount_paise),
    at: r.created_at, invId: r.inv_id, no: r.no, billDate: r.bill_date,
    billTotal: toRupees(r.total_paise), pname: r.pname, preg: r.reg_no, pphone: r.phone,
    enteredBy: r.entered_by
  })));
}));

app.get('/api/reports/doctors.csv', admin, wrap(async (req, res) => {
  const data = await doctorReport(req.query.from, req.query.to);
  const esc = v => `"${String(v ?? '').replace(/^[=+\-@]/, "'$&").replace(/"/g, '""')}"`;
  const out = [['Doctor', 'Procedure', 'Qty', 'Billed', 'Collected'].map(esc).join(',')];
  for (const d of data) {
    for (const p of d.procedures) out.push([d.name, p.name, p.qty, p.billed, p.collected].map(esc).join(','));
    out.push([d.name, 'TOTAL', '', d.billed, d.collected].map(esc).join(','));
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="doctor_report_${req.query.from}_to_${req.query.to}.csv"`);
  res.send(out.join('\n'));
}));

app.get('/api/reports/daybook.csv', admin, wrap(async (req, res) => {
  const { rows } = await q(`SELECT p.pay_date, i.no, pt.name, p.mode, p.ref, p.amount_paise, COALESCE(d.name,'') doc, u.username
      FROM payments p JOIN invoices i ON i.id=p.invoice_id JOIN patients pt ON pt.id=i.patient_id
      LEFT JOIN doctors d ON d.id=i.doctor_id LEFT JOIN users u ON u.id=p.created_by
      WHERE i.type='bill' AND i.voided_at IS NULL AND p.pay_date BETWEEN $1 AND $2 ORDER BY p.pay_date, p.id`,
    [req.query.from, req.query.to]);
  const esc = v => `"${String(v ?? '').replace(/^[=+\-@]/, "'$&").replace(/"/g, '""')}"`;
  const csv = [['Date', 'Bill No', 'Patient', 'Mode', 'Ref', 'Amount', 'Doctor', 'Entered by'].map(esc).join(',')]
    .concat(rows.map(r => [r.pay_date, r.no, r.name, r.mode, r.ref, toRupees(r.amount_paise), r.doc, r.username].map(esc).join(',')))
    .join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="daybook_${req.query.from}_to_${req.query.to}.csv"`);
  res.send(csv);
}));

app.get('/api/audit', admin, wrap(async (req, res) =>
  ok(res, (await q('SELECT * FROM audit_log ORDER BY id DESC LIMIT 300')).rows)));

/* ============ BACKUP / IMPORT ============ */
app.get('/api/backup', admin, wrap(async (req, res) => {
  const dump = {};
  for (const t of ['app_meta', 'users', 'doctors', 'procedures', 'patients', 'invoices', 'invoice_items', 'payments', 'counters'])
    dump[t] = (await q(`SELECT * FROM ${t}`)).rows;
  dump._app = 'hiklean-server'; dump._at = new Date().toISOString();
  dump.users = dump.users.map(u => ({ ...u, pass_hash: '***' }));
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="hiklean-db-${new Date().toISOString().slice(0, 10)}.json"`);
  res.send(JSON.stringify(dump));
}));

/** One-time import of the offline single-file app's backup JSON. */
app.post('/api/import', admin, wrap(async (req, res) => {
  const d = req.body || {};
  if (!Array.isArray(d.patients) || !Array.isArray(d.invoices)) throw bad('Not a Hi-Klean offline backup file');
  if (d._app && d._app !== 'hiklean-dental-billing') throw bad('That file was not produced by the Hi-Klean offline app');
  const modeList = await allowedModes();
  const impMode = (m) => modeList.includes(String(m)) ? String(m) : modeList[0];
  const report = await tx(async c => {
    const map = new Map(); let np = 0, ni = 0, skipped = 0;
    const collisions = [], skippedBills = [];
    for (const p of d.patients) {
      if (!p || typeof p !== 'object' || p.id === undefined || p.id === null) { skipped++; continue; }
      p.name = typeof p.name === 'string' ? p.name.trim() : '';
      if (!p.name) { skipped++; continue; }
      // a patient ID that already exists belongs to a REAL patient — never rename them
      let row = null;
      if (p.reg) {
        const ex = await c.query('SELECT id, name FROM patients WHERE reg_no=$1', [p.reg]);
        if (ex.rows[0]) {
          row = ex.rows[0];
          if ((ex.rows[0].name || '').trim().toLowerCase() !== String(p.name).trim().toLowerCase()) {
            collisions.push({ reg: p.reg, existing: ex.rows[0].name, inFile: p.name });
            row = null;                       // different person on the same ID → import them separately
          }
        }
      }
      if (!row) {
        const reg = row ? p.reg : (p.reg && !collisions.some(x => x.reg === p.reg) ? p.reg : null);
        const ins = await c.query(
          `INSERT INTO patients(reg_no, name, phone, age, sex, address, note, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [reg || (await nextReg(c)), p.name, p.phone || '', p.age || '', p.sex || '',
           p.address || '', p.note || '', req.user.id]);
        row = ins.rows[0];
      }
      map.set(p.id, row.id); np++;
    }
    const { rows: [doc] } = await c.query('SELECT id FROM doctors ORDER BY id LIMIT 1');
    for (const inv of d.invoices) {
      if (!inv || typeof inv !== 'object' || inv.patientId === undefined || inv.patientId === null) { skipped++; continue; }
      const pid = map.get(inv.patientId);
      if (!pid || !Array.isArray(inv.items) || !inv.items.length || !isDay(inv.date)) { skipped++; continue; }
      const items = inv.items.map((it, seq) => ({
        seq, procedure_id: null, name: it.name || '', description: it.desc || '', qty: Number(it.qty) || 0,
        rate_paise: toPaise(it.rate), disc_paise: toPaise(it.disc), taxable: !!it.taxable,
        gst_rate: Number(it.gst) || 0, gst_incl: it.gstIncl === undefined ? true : !!it.gstIncl,
        per_tooth: !!it.perTooth
      }));
      const dv = inv.discType === 'pct' ? Number(inv.discValue) || 0 : toPaise(inv.discValue);
      const cc = calcInvoice(items, inv.discType, dv, !!inv.gstOn);
      const { rows } = await c.query(`INSERT INTO invoices(no, type, bill_date, patient_id, doctor_id, sub_paise, disc_type,
          disc_value, disc_paise, tax_paise, tax_inc_paise, total_paise, gst_on, notes, voided_at, void_reason, created_by, updated_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17)
          ON CONFLICT DO NOTHING RETURNING id`,
        [String(inv.no || ''), inv.type === 'estimate' ? 'estimate' : 'bill', inv.date, pid, doc?.id || null,
        cc.sub_paise, inv.discType === 'pct' ? 'pct' : 'amt', dv, cc.disc_paise, cc.tax_paise,
        cc.tax_inc_paise, cc.total_paise,
        !!inv.gstOn, inv.notes || '',
        inv.voided || inv.voidedAt ? new Date() : null,          // a cancelled bill stays cancelled
        inv.voided || inv.voidedAt ? (inv.voidReason || 'cancelled in the offline app') : null,
        req.user.id]);
      if (!rows[0]) { skippedBills.push(String(inv.no || '?')); skipped++; continue; }
      const invId = rows[0].id; ni++;
      for (const it of cc.items) {
        await c.query(`INSERT INTO invoice_items(invoice_id, seq, procedure_id, name, description, qty, rate_paise,
            disc_paise, amount_paise, taxable, gst_rate, gst_incl, per_tooth, doctor_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [invId, it.seq, null, it.name, it.description, it.qty, it.rate_paise, it.disc_paise, it.amount_paise,
          it.taxable, it.gst_rate, it.gst_incl, it.per_tooth, doc?.id || null]);
      }
      if (inv.type !== 'estimate') for (const p of (inv.payments || [])) {
        const amt = toPaise(p.amount);
        if (!Number.isFinite(amt) || amt <= 0) continue;
        await c.query(`INSERT INTO payments(invoice_id, pay_date, mode, amount_paise, ref, created_by)
            VALUES ($1,$2,$3,$4,$5,$6)`,
          [invId, dayOr(p.date, inv.date), impMode(p.mode), amt, cleanRef(p.ref), req.user.id]);
      }
    }
    // only advance the counter, and only to a plausible bill number
    const { rows: [mx] } = await c.query(
      `SELECT COALESCE(max(NULLIF(regexp_replace(no,'\\D','','g'),''))::bigint,0) m
       FROM invoices WHERE type='bill' AND length(regexp_replace(no,'\\D','','g')) <= 8`);
    await c.query(`INSERT INTO counters(key,value) VALUES ('bill_no',$1)
                   ON CONFLICT (key) DO UPDATE SET value=GREATEST(counters.value,$1)`, [Number(mx.m) || 168]);
    return { patients: np, invoices: ni, skipped, collisions, skippedBills: skippedBills.slice(0, 20) };
  });
  await audit(null, req.user, 'import', 'database', '', report);
  ok(res, report);
}));

/* ============ boot ============ */
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Unknown endpoint' });
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = Number(process.env.PORT || 3000);
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 24) {
  console.error('FATAL: set JWT_SECRET in .env to a long random string (see README).');
  process.exit(1);
}
migrate()
  .then(seedIfEmpty)
  .then(created => {
    if (created.admin) console.log(`\n  First run: admin user "${created.admin}" created.` +
      (process.env.ADMIN_PASSWORD ? '' : '  Password: ChangeMe@123  — change it at first login.\n'));
    app.listen(PORT, () => console.log(`  Hi-Klean billing running on http://localhost:${PORT}\n`));
  })
  .catch(e => { console.error('Startup failed:', e); process.exit(1); });

export default app;
