-- ============================================================
-- InsureTrack — Supabase / PostgreSQL Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Users (all roles: admin, general_contractor, insurance_agent)
CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  email           TEXT UNIQUE NOT NULL,
  password        TEXT NOT NULL,
  name            TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('admin','general_contractor','insurance_agent')),
  phone           TEXT,
  company         TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- General Contractors
CREATE TABLE IF NOT EXISTS general_contractors (
  id                          SERIAL PRIMARY KEY,
  user_id                     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  company_name                TEXT NOT NULL,
  contact_name                TEXT,
  email                       TEXT,
  phone                       TEXT,
  address                     TEXT,
  city                        TEXT,
  state                       TEXT DEFAULT 'ID',
  zip                         TEXT,
  license_number              TEXT,
  notes                       TEXT,
  require_additional_insured  BOOLEAN DEFAULT FALSE,
  created_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- Subcontractors
CREATE TABLE IF NOT EXISTS subcontractors (
  id                    SERIAL PRIMARY KEY,
  company_name          TEXT NOT NULL,
  contact_name          TEXT NOT NULL,
  email                 TEXT NOT NULL,
  phone                 TEXT,
  address               TEXT,
  city                  TEXT,
  state                 TEXT DEFAULT 'ID',
  zip                   TEXT,
  trade                 TEXT,
  is_sole_proprietor    BOOLEAN DEFAULT FALSE,
  w9_tax_id             TEXT,
  w9_entity_type        TEXT,
  w9_signature_date     DATE,
  w9_on_file            BOOLEAN DEFAULT FALSE,
  w9_year               INTEGER,
  status                TEXT DEFAULT 'pending',
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- GC ↔ Subcontractor many-to-many join table
CREATE TABLE IF NOT EXISTS gc_subcontractor (
  id          SERIAL PRIMARY KEY,
  gc_id       INTEGER NOT NULL REFERENCES general_contractors(id) ON DELETE CASCADE,
  sub_id      INTEGER NOT NULL REFERENCES subcontractors(id) ON DELETE CASCADE,
  added_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  added_date  TIMESTAMPTZ DEFAULT NOW(),
  is_active   BOOLEAN DEFAULT TRUE,
  UNIQUE(gc_id, sub_id)
);

-- Insurance Agents
CREATE TABLE IF NOT EXISTS insurance_agents (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT,
  agency_name TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Insurance Policies
CREATE TABLE IF NOT EXISTS insurance_policies (
  id                          SERIAL PRIMARY KEY,
  sub_id                      INTEGER NOT NULL REFERENCES subcontractors(id) ON DELETE CASCADE,
  agent_id                    INTEGER REFERENCES insurance_agents(id) ON DELETE SET NULL,
  policy_type                 TEXT NOT NULL CHECK (policy_type IN ('general_liability','workers_comp')),
  policy_number               TEXT,
  carrier                     TEXT,
  coverage_amount             NUMERIC,
  effective_date              DATE,
  expiration_date             DATE,
  status                      TEXT DEFAULT 'active',
  requires_additional_insured BOOLEAN DEFAULT FALSE,
  additional_insured_confirmed BOOLEAN DEFAULT FALSE,
  is_ghost_policy             BOOLEAN DEFAULT FALSE,
  certificate_on_file         BOOLEAN DEFAULT FALSE,
  last_verified_date          DATE,
  notes                       TEXT,
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- Email Templates
CREATE TABLE IF NOT EXISTS email_templates (
  id             SERIAL PRIMARY KEY,
  gc_id          INTEGER REFERENCES general_contractors(id) ON DELETE SET NULL,
  template_type  TEXT NOT NULL,
  name           TEXT NOT NULL,
  subject        TEXT NOT NULL,
  body           TEXT NOT NULL,
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Email Log (mock outbox)
CREATE TABLE IF NOT EXISTS email_log (
  id              SERIAL PRIMARY KEY,
  to_email        TEXT NOT NULL,
  to_name         TEXT,
  from_email      TEXT DEFAULT 'compliance@insuretrack.com',
  recipient_type  TEXT,
  template_type   TEXT,
  subject         TEXT,
  body            TEXT,
  status          TEXT DEFAULT 'sent',
  sent_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sub_id          INTEGER REFERENCES subcontractors(id) ON DELETE SET NULL,
  policy_id       INTEGER REFERENCES insurance_policies(id) ON DELETE SET NULL,
  sent_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
  type         TEXT,
  title        TEXT,
  message      TEXT,
  related_type TEXT,
  related_id   INTEGER,
  is_read      BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ---- Indexes for common query patterns ----
CREATE INDEX IF NOT EXISTS idx_subs_status     ON subcontractors(status);
CREATE INDEX IF NOT EXISTS idx_policies_sub    ON insurance_policies(sub_id);
CREATE INDEX IF NOT EXISTS idx_policies_exp    ON insurance_policies(expiration_date);
CREATE INDEX IF NOT EXISTS idx_gc_sub_gc       ON gc_subcontractor(gc_id);
CREATE INDEX IF NOT EXISTS idx_gc_sub_sub      ON gc_subcontractor(sub_id);
CREATE INDEX IF NOT EXISTS idx_notif_user      ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_email_log_date  ON email_log(sent_at DESC);
