-- ============================================================
-- MIGRATION 013 — Agent Experience
-- team_skills: módulos activos por equipo
-- quotations: cotizaciones / propuestas comerciales
-- ============================================================

-- ── team_skills ───────────────────────────────────────────────
-- El admin asigna qué módulos de operaciones puede usar cada equipo.
-- Si un equipo no tiene skills configurados (vacío), los agentes ven
-- todos los módulos — comportamiento por defecto permisivo.
-- module_id válidos: 'renovaciones' | 'cotizaciones' | 'cobranza' |
--                    'tareas' | 'captura' | 'contact_center'
CREATE TABLE IF NOT EXISTS team_skills (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id   UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  UNIQUE (team_id, module_id)
);

ALTER TABLE team_skills ENABLE ROW LEVEL SECURITY;

-- Todos los usuarios autenticados pueden leer skills (sidebar los necesita)
DROP POLICY IF EXISTS "team_skills: auth read" ON team_skills;
CREATE POLICY "team_skills: auth read"
  ON team_skills FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Solo admins pueden escribir
DROP POLICY IF EXISTS "team_skills: admin write" ON team_skills;
CREATE POLICY "team_skills: admin write"
  ON team_skills FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE INDEX IF NOT EXISTS team_skills_team_id_idx ON team_skills (team_id);

-- ── quotations ────────────────────────────────────────────────
-- Cotizaciones / propuestas comerciales de los ejecutivos.
-- Flujo de estado: pendiente → enviada → ganada | perdida
CREATE TABLE IF NOT EXISTS quotations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID REFERENCES accounts(id) ON DELETE SET NULL,
  contact_id        UUID REFERENCES contacts(id) ON DELETE SET NULL,
  assigned_to       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  insurer           TEXT,
  branch            TEXT,    -- 'gmm' | 'autos' | 'vida' | 'daños' | 'rc' | 'otro'
  estimated_premium NUMERIC(12,2),
  status            TEXT NOT NULL DEFAULT 'pendiente',
  -- 'pendiente' | 'enviada' | 'ganada' | 'perdida'
  notes             TEXT,
  expires_at        DATE,
  created_by        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;

-- Agente ve las suyas; manager/ops/admin ven todas
DROP POLICY IF EXISTS "quotations: select" ON quotations;
CREATE POLICY "quotations: select"
  ON quotations FOR SELECT
  USING (
    assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'ops', 'manager')
    )
  );

DROP POLICY IF EXISTS "quotations: agent+ insert" ON quotations;
CREATE POLICY "quotations: agent+ insert"
  ON quotations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'ops', 'manager', 'agent')
    )
  );

DROP POLICY IF EXISTS "quotations: agent own update" ON quotations;
CREATE POLICY "quotations: agent own update"
  ON quotations FOR UPDATE
  USING (
    assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'ops', 'manager')
    )
  );

DROP POLICY IF EXISTS "quotations: agent own delete" ON quotations;
CREATE POLICY "quotations: agent own delete"
  ON quotations FOR DELETE
  USING (
    assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'ops', 'manager')
    )
  );

CREATE INDEX IF NOT EXISTS quotations_assigned_to_idx ON quotations (assigned_to);
CREATE INDEX IF NOT EXISTS quotations_status_idx ON quotations (status);
CREATE INDEX IF NOT EXISTS quotations_account_id_idx ON quotations (account_id);

-- updated_at trigger (mismo patrón que otras tablas del proyecto)
CREATE OR REPLACE FUNCTION update_quotations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS quotations_updated_at ON quotations;
CREATE TRIGGER quotations_updated_at
  BEFORE UPDATE ON quotations
  FOR EACH ROW EXECUTE FUNCTION update_quotations_updated_at();
