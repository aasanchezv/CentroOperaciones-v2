-- ============================================================
-- MIGRATION 003 — Policies (Pólizas)
-- ============================================================

CREATE TYPE policy_status AS ENUM (
  'active',           -- vigente
  'pending_renewal',  -- por renovar (próxima a vencer)
  'expired',          -- vencida
  'cancelled',        -- cancelada
  'quote'             -- cotización / sin contratar
);

CREATE TYPE policy_branch AS ENUM (
  'gmm',        -- Gastos Médicos Mayores
  'vida',       -- Vida
  'auto',       -- Autos
  'rc',         -- Responsabilidad Civil
  'danos',      -- Daños (incendio, robo, etc.)
  'transporte', -- Transportes
  'fianzas',    -- Fianzas
  'ap',         -- Accidentes Personales
  'tecnicos',   -- Riesgos Técnicos
  'otro'        -- Otro
);

CREATE TABLE policies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  policy_number TEXT,                              -- número asignado por aseguradora
  branch        policy_branch   NOT NULL,          -- ramo
  insurer       TEXT            NOT NULL,          -- aseguradora (GNP, AXA, Mapfre…)
  status        policy_status   NOT NULL DEFAULT 'active',
  premium       NUMERIC(12,2),                     -- prima anual
  start_date    DATE,                              -- inicio de vigencia
  end_date      DATE,                              -- fin de vigencia
  tomador_id    UUID REFERENCES contacts(id) ON DELETE SET NULL, -- contacto decisor
  notes         TEXT,
  created_by    UUID NOT NULL REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "policies: authenticated read" ON policies
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "policies: agent+ can insert" ON policies
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin','ops','manager','agent')
    )
  );

CREATE POLICY "policies: agent+ can update" ON policies
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin','ops','manager','agent')
    )
  );

CREATE POLICY "policies: admin/ops can delete" ON policies
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin','ops')
    )
  );

-- ============================================================
-- TRIGGER updated_at
-- ============================================================
CREATE TRIGGER policies_updated_at
  BEFORE UPDATE ON policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX policies_account_id_idx ON policies(account_id);
CREATE INDEX policies_status_idx     ON policies(status);
CREATE INDEX policies_branch_idx     ON policies(branch);
CREATE INDEX policies_end_date_idx   ON policies(end_date); -- para alertas de vencimiento
