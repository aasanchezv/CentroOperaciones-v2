-- Migration 040: Módulo Siniestros
-- Tablas: claim_import_runs, claim_column_mappings, account_claims

-- ── 1. claim_import_runs ─────────────────────────────────────────────────────
-- Registro de cada importación de reporte de aseguradora

CREATE TABLE claim_import_runs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  insurer_id      UUID        NOT NULL REFERENCES insurers(id) ON DELETE RESTRICT,
  file_name       TEXT        NOT NULL,
  period_label    TEXT,                        -- "Enero 2026" (texto libre)
  total_rows      INT         NOT NULL DEFAULT 0,
  matched_rows    INT         NOT NULL DEFAULT 0,
  unmatched_rows  INT         NOT NULL DEFAULT 0,
  imported_by     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. claim_column_mappings ──────────────────────────────────────────────────
-- Mapeo de columnas Excel por aseguradora (configurar una vez, reutilizar)

CREATE TABLE claim_column_mappings (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  insurer_id      UUID        NOT NULL REFERENCES insurers(id) ON DELETE CASCADE,
  source_column   TEXT        NOT NULL,        -- encabezado en el Excel: "NO_SINIESTRO"
  target_field    TEXT        NOT NULL,        -- nuestro campo: "claim_number"
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (insurer_id, source_column)
);

-- ── 3. account_claims ─────────────────────────────────────────────────────────
-- Siniestros individuales (matched y unmatched)

CREATE TABLE account_claims (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  import_run_id     UUID        REFERENCES claim_import_runs(id) ON DELETE SET NULL,
  insurer_id        UUID        NOT NULL REFERENCES insurers(id) ON DELETE RESTRICT,
  -- Resultado del match por número de póliza
  account_id        UUID        REFERENCES accounts(id)  ON DELETE SET NULL,
  policy_id         UUID        REFERENCES policies(id)  ON DELETE SET NULL,
  is_matched        BOOLEAN     NOT NULL DEFAULT false,
  -- Datos del siniestro
  claim_number      TEXT,
  policy_number_raw TEXT,                      -- tal como vino en el reporte
  loss_date         DATE,
  report_date       DATE,
  claim_type        TEXT,
  description       TEXT,
  amount_claimed    NUMERIC(12,2),
  amount_approved   NUMERIC(12,2),
  amount_paid       NUMERIC(12,2),
  status_insurer    TEXT,                      -- estatus según el reporte
  extra_fields      JSONB,                     -- columnas no mapeadas
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 4. Índices ────────────────────────────────────────────────────────────────

CREATE INDEX idx_account_claims_account   ON account_claims(account_id)    WHERE account_id   IS NOT NULL;
CREATE INDEX idx_account_claims_policy    ON account_claims(policy_id)     WHERE policy_id    IS NOT NULL;
CREATE INDEX idx_account_claims_insurer   ON account_claims(insurer_id);
CREATE INDEX idx_account_claims_run       ON account_claims(import_run_id) WHERE import_run_id IS NOT NULL;
CREATE INDEX idx_account_claims_unmatched ON account_claims(insurer_id, created_at DESC) WHERE is_matched = false;
CREATE INDEX idx_account_claims_loss_date ON account_claims(account_id, loss_date DESC) WHERE account_id IS NOT NULL;

-- ── 5. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE claim_import_runs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_column_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_claims        ENABLE ROW LEVEL SECURITY;

-- claim_import_runs: todos ven; admin/ops crean
CREATE POLICY "claim_runs_select" ON claim_import_runs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "claim_runs_insert" ON claim_import_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','ops'))
  );

CREATE POLICY "claim_runs_delete" ON claim_import_runs
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','ops'))
  );

-- claim_column_mappings: todos ven; admin/ops modifican
CREATE POLICY "claim_mappings_select" ON claim_column_mappings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "claim_mappings_write" ON claim_column_mappings
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','ops'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','ops'))
  );

-- account_claims: todos los autenticados ven; inserción solo via admin client (service_role)
CREATE POLICY "account_claims_select" ON account_claims
  FOR SELECT TO authenticated USING (true);
