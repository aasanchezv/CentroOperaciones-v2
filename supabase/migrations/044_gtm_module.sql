-- ============================================================
-- Migration 044: Go-to-Market module
-- Tables: gtm_processes, gtm_process_insurers, gtm_insurer_contacts
-- ============================================================

-- Proceso GTM principal
CREATE TABLE gtm_processes (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT        NOT NULL,
  account_id        UUID        REFERENCES accounts(id) ON DELETE SET NULL,
  branch            TEXT,
  slip_url          TEXT,
  slip_filename     TEXT,
  slip_extracted    JSONB,
  status            TEXT        NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sending','waiting','analyzing','proposal_ready','completed','cancelled')),
  proposal_pdf_url  TEXT,
  ai_recommendation TEXT,
  notes             TEXT,
  deadline_at       TIMESTAMPTZ,
  created_by        UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_to       UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tracking por aseguradora dentro del proceso
CREATE TABLE gtm_process_insurers (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id        UUID        NOT NULL REFERENCES gtm_processes(id) ON DELETE CASCADE,
  insurer_id        UUID        NOT NULL REFERENCES insurers(id),
  contact_name      TEXT,
  contact_email     TEXT        NOT NULL,
  upload_token      UUID        NOT NULL DEFAULT gen_random_uuid(),
  status            TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','received','analyzed','declined')),
  sent_at           TIMESTAMPTZ,
  proposal_url      TEXT,
  proposal_filename TEXT,
  received_at       TIMESTAMPTZ,
  analyzed_at       TIMESTAMPTZ,
  ai_prima          NUMERIC,
  ai_suma_asegurada TEXT,
  ai_coberturas     TEXT,
  ai_exclusiones    TEXT,
  ai_deducible      TEXT,
  ai_vigencia       TEXT,
  ai_condiciones    TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (process_id, insurer_id)
);

-- Contactos GTM por aseguradora (admin-managed)
CREATE TABLE gtm_insurer_contacts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  insurer_id  UUID        NOT NULL REFERENCES insurers(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  email       TEXT        NOT NULL,
  phone       TEXT,
  role        TEXT        DEFAULT 'Cotizaciones',
  is_default  BOOLEAN     DEFAULT false,
  is_active   BOOLEAN     DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── RLS ──────────────────────────────────────────────────────

ALTER TABLE gtm_processes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE gtm_process_insurers ENABLE ROW LEVEL SECURITY;
ALTER TABLE gtm_insurer_contacts ENABLE ROW LEVEL SECURITY;

-- gtm_processes: anyone authenticated can SELECT, only creator/assigned/admin+ops can mutate
CREATE POLICY "gtm_processes_select"
  ON gtm_processes FOR SELECT USING (true);

CREATE POLICY "gtm_processes_modify"
  ON gtm_processes FOR ALL USING (
    auth.uid() = created_by
    OR auth.uid() = assigned_to
    OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','ops')
  );

-- gtm_process_insurers: service-role used server-side, open to authenticated reads
CREATE POLICY "gtm_pi_select"
  ON gtm_process_insurers FOR SELECT USING (true);

CREATE POLICY "gtm_pi_modify"
  ON gtm_process_insurers FOR ALL USING (true);

-- gtm_insurer_contacts: all authenticated users can SELECT, admin manages
CREATE POLICY "gtm_ic_select"
  ON gtm_insurer_contacts FOR SELECT USING (true);

CREATE POLICY "gtm_ic_modify"
  ON gtm_insurer_contacts FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- ── Índices ──────────────────────────────────────────────────

CREATE INDEX ON gtm_processes(status, created_by);
CREATE INDEX ON gtm_processes(account_id);
CREATE INDEX ON gtm_process_insurers(process_id);
CREATE INDEX ON gtm_process_insurers(upload_token);
CREATE INDEX ON gtm_insurer_contacts(insurer_id, is_active);

-- ── Trigger: updated_at ───────────────────────────────────────

CREATE TRIGGER set_gtm_processes_updated
  BEFORE UPDATE ON gtm_processes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
