#!/usr/bin/env node
/**
 * One-time import of the offline single-file app's backup JSON.
 *   node scripts/import-backup.js hiklean-backup-2026-08-04.json
 * Safe to run more than once: bills whose number already exists are skipped.
 */
import 'dotenv/config';
import fs from 'node:fs';
import { q, tx, toPaise, migrate } from '../src/db.js';
import { calcInvoice } from '../src/calc.js';

const file = process.argv[2];
if (!file) { console.error('Usage: node scripts/import-backup.js <backup.json>'); process.exit(1); }
const d = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!Array.isArray(d.patients) || !Array.isArray(d.invoices)) {
  console.error('That file does not look like a Hi-Klean offline backup.'); process.exit(1);
}

await migrate();
const { rows: [u] } = await q(`SELECT id FROM users ORDER BY id LIMIT 1`);
const { rows: [doc] } = await q(`SELECT id FROM doctors ORDER BY id LIMIT 1`);

const report = await tx(async c => {
  const map = new Map(); let np = 0, ni = 0, skipped = 0;
  for (const p of d.patients) {
    if (!p?.name) { skipped++; continue; }
    const { rows } = await c.query(
      `INSERT INTO patients(reg_no, name, phone, age, sex, address, note, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (reg_no) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
      [p.reg || null, p.name, p.phone || '', p.age || '', p.sex || '', p.address || '', p.note || '', u?.id || null]);
    map.set(p.id, rows[0].id); np++;
  }
  for (const inv of d.invoices) {
    const pid = map.get(inv.patientId);
    if (!pid || !inv.items?.length) { skipped++; continue; }
    const items = inv.items.map((it, seq) => ({
      seq, procedure_id: null, name: it.name || '', description: it.desc || '', qty: Number(it.qty) || 0,
      rate_paise: toPaise(it.rate), disc_paise: toPaise(it.disc), taxable: !!it.taxable,
      gst_rate: Number(it.gst) || 0, per_tooth: !!it.perTooth
    }));
    const dv = inv.discType === 'pct' ? Number(inv.discValue) || 0 : toPaise(inv.discValue);
    const cc = calcInvoice(items, inv.discType, dv, !!inv.gstOn);
    const { rows } = await c.query(
      `INSERT INTO invoices(no, type, bill_date, patient_id, doctor_id, sub_paise, disc_type, disc_value,
        disc_paise, tax_paise, total_paise, gst_on, notes, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14) ON CONFLICT DO NOTHING RETURNING id`,
      [String(inv.no || ''), inv.type === 'estimate' ? 'estimate' : 'bill', inv.date, pid, doc?.id || null,
      cc.sub_paise, inv.discType === 'pct' ? 'pct' : 'amt', dv, cc.disc_paise, cc.tax_paise, cc.total_paise,
      !!inv.gstOn, inv.notes || '', u?.id || null]);
    if (!rows[0]) { skipped++; continue; }
    ni++;
    for (const it of cc.items) {
      await c.query(`INSERT INTO invoice_items(invoice_id, seq, name, description, qty, rate_paise, disc_paise,
          amount_paise, taxable, gst_rate, per_tooth, doctor_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [rows[0].id, it.seq, it.name, it.description, it.qty, it.rate_paise, it.disc_paise, it.amount_paise,
        it.taxable, it.gst_rate, it.per_tooth, doc?.id || null]);
    }
    for (const p of (inv.payments || [])) {
      if (!Number(p.amount)) continue;
      await c.query(`INSERT INTO payments(invoice_id, pay_date, mode, amount_paise, ref, created_by)
                     VALUES ($1,$2,$3,$4,$5,$6)`,
        [rows[0].id, p.date || inv.date, p.mode || 'Cash', toPaise(p.amount), p.ref || '', u?.id || null]);
    }
  }
  const { rows: [mx] } = await c.query(
    `SELECT COALESCE(max(NULLIF(regexp_replace(no,'\\D','','g'),''))::bigint,0) m FROM invoices WHERE type='bill'`);
  await c.query(`INSERT INTO counters(key,value) VALUES ('bill_no',$1)
                 ON CONFLICT (key) DO UPDATE SET value=GREATEST(counters.value,$1)`, [Number(mx.m) || 168]);
  return { patients: np, invoices: ni, skipped };
});

console.log(`Imported ${report.invoices} bills and ${report.patients} patients (${report.skipped} skipped).`);
process.exit(0);
