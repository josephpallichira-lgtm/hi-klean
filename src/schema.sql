-- Hi-Klean Dental Billing — PostgreSQL schema
-- All money is stored as INTEGER paise. Never floats.

CREATE TABLE IF NOT EXISTS app_meta (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id          BIGSERIAL PRIMARY KEY,
  username    TEXT NOT NULL UNIQUE,
  pass_hash   TEXT NOT NULL,
  full_name   TEXT NOT NULL DEFAULT '',
  role        TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','staff')),
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  must_change BOOLEAN NOT NULL DEFAULT FALSE,
  last_login  TIMESTAMPTZ,
  token_epoch BIGINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_epoch BIGINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS doctors (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  spec        TEXT NOT NULL DEFAULT '',
  role_line   TEXT NOT NULL DEFAULT '',
  reg_no      TEXT NOT NULL DEFAULT '',
  sign_title  TEXT NOT NULL DEFAULT '',
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS procedures (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'Others',
  price_paise BIGINT NOT NULL DEFAULT 0 CHECK (price_paise >= 0),
  per_tooth   BOOLEAN NOT NULL DEFAULT FALSE,
  taxable     BOOLEAN NOT NULL DEFAULT FALSE,
  gst_rate    NUMERIC(5,2) NOT NULL DEFAULT 18,
  gst_incl    BOOLEAN NOT NULL DEFAULT TRUE,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  sort        INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- existing rate cards were entered as GST-inclusive prices, so default TRUE
ALTER TABLE procedures ADD COLUMN IF NOT EXISTS gst_incl BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS idx_proc_cat ON procedures(category) WHERE active;

CREATE TABLE IF NOT EXISTS procedure_price_history (
  id            BIGSERIAL PRIMARY KEY,
  procedure_id  BIGINT NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
  old_paise     BIGINT NOT NULL,
  new_paise     BIGINT NOT NULL,
  changed_by    BIGINT REFERENCES users(id),
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS patients (
  id          BIGSERIAL PRIMARY KEY,
  reg_no      TEXT UNIQUE,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL DEFAULT '',
  age         TEXT NOT NULL DEFAULT '',
  sex         TEXT NOT NULL DEFAULT '',
  address     TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  created_by  BIGINT REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pat_name  ON patients(lower(name));
CREATE INDEX IF NOT EXISTS idx_pat_phone ON patients(phone);

CREATE TABLE IF NOT EXISTS invoices (
  id           BIGSERIAL PRIMARY KEY,
  no           TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'bill' CHECK (type IN ('bill','estimate')),
  bill_date    DATE NOT NULL,
  patient_id   BIGINT NOT NULL REFERENCES patients(id),
  doctor_id    BIGINT REFERENCES doctors(id),
  sub_paise    BIGINT NOT NULL DEFAULT 0,
  disc_type    TEXT NOT NULL DEFAULT 'amt' CHECK (disc_type IN ('amt','pct')),
  disc_value   NUMERIC(12,2) NOT NULL DEFAULT 0,
  disc_paise   BIGINT NOT NULL DEFAULT 0,
  tax_paise    BIGINT NOT NULL DEFAULT 0,
  tax_inc_paise BIGINT NOT NULL DEFAULT 0,
  total_paise  BIGINT NOT NULL DEFAULT 0,
  gst_on       BOOLEAN NOT NULL DEFAULT FALSE,
  notes        TEXT NOT NULL DEFAULT '',
  voided_at    TIMESTAMPTZ,
  void_reason  TEXT,
  created_by   BIGINT REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   BIGINT REFERENCES users(id),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_inc_paise BIGINT NOT NULL DEFAULT 0;
-- a bill number can never be issued twice
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_no ON invoices(no) WHERE type = 'bill';
CREATE INDEX IF NOT EXISTS idx_inv_date ON invoices(bill_date);
CREATE INDEX IF NOT EXISTS idx_inv_pat  ON invoices(patient_id);

CREATE TABLE IF NOT EXISTS invoice_items (
  id           BIGSERIAL PRIMARY KEY,
  invoice_id   BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  seq          INTEGER NOT NULL DEFAULT 0,
  procedure_id BIGINT REFERENCES procedures(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  qty          NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (qty >= 0),
  rate_paise   BIGINT NOT NULL DEFAULT 0,
  disc_paise   BIGINT NOT NULL DEFAULT 0 CHECK (disc_paise >= 0),
  amount_paise BIGINT NOT NULL DEFAULT 0,
  taxable      BOOLEAN NOT NULL DEFAULT FALSE,
  gst_rate     NUMERIC(5,2) NOT NULL DEFAULT 0,
  gst_incl     BOOLEAN NOT NULL DEFAULT TRUE,
  per_tooth    BOOLEAN NOT NULL DEFAULT FALSE,
  doctor_id    BIGINT REFERENCES doctors(id)
);
-- upgrade path for databases created before doctor-wise reporting existed
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS doctor_id BIGINT REFERENCES doctors(id);
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS gst_incl BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS idx_item_inv ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_item_doc ON invoice_items(doctor_id);

CREATE TABLE IF NOT EXISTS payments (
  id           BIGSERIAL PRIMARY KEY,
  invoice_id   BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  pay_date     DATE NOT NULL,
  mode         TEXT NOT NULL DEFAULT 'Cash',
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  ref          TEXT NOT NULL DEFAULT '',
  created_by   BIGINT REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pay_inv  ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_pay_date ON payments(pay_date);

-- append-only trail: who did what, when
CREATE TABLE IF NOT EXISTS audit_log (
  id        BIGSERIAL PRIMARY KEY,
  at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id   BIGINT REFERENCES users(id),
  username  TEXT NOT NULL DEFAULT '',
  action    TEXT NOT NULL,
  entity    TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  detail    JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at DESC);

-- transactional number issue: no duplicates even with 10 counters open
CREATE TABLE IF NOT EXISTS counters (
  key   TEXT PRIMARY KEY,
  value BIGINT NOT NULL
);
