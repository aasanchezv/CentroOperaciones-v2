-- ─── 017_quotation_stages.sql ─────────────────────────────────────────────
-- Stages de cotización configurables por equipo (o globales si team_id IS NULL)

-- ── Tabla principal ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quotation_stages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    UUID REFERENCES teams(id) ON DELETE CASCADE,  -- NULL = global default
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT 'gray',
  -- opciones: 'amber' | 'blue' | 'emerald' | 'red' | 'violet' | 'orange' | 'gray'
  is_won     BOOLEAN NOT NULL DEFAULT false,  -- cuenta como ganada en estadísticas
  is_lost    BOOLEAN NOT NULL DEFAULT false,  -- cuenta como perdida en estadísticas
  sort_order INT NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE quotation_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quotation_stages: auth read"  ON quotation_stages;
DROP POLICY IF EXISTS "quotation_stages: admin write" ON quotation_stages;

CREATE POLICY "quotation_stages: auth read" ON quotation_stages
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "quotation_stages: admin write" ON quotation_stages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── Índices ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS quotation_stages_team_id_idx ON quotation_stages (team_id);

-- ── Seed: stages globales por defecto (team_id = NULL) ──────────────────────
-- Solo insertar si no existen stages globales (idempotente)
INSERT INTO quotation_stages (team_id, name, color, is_won, is_lost, sort_order)
SELECT t.team_id, t.name, t.color, t.is_won, t.is_lost, t.sort_order
FROM (VALUES
  (NULL::UUID, 'Pendiente', 'amber',   false, false, 1),
  (NULL::UUID, 'Enviada',   'blue',    false, false, 2),
  (NULL::UUID, 'Ganada',    'emerald', true,  false, 3),
  (NULL::UUID, 'Perdida',   'red',     false, true,  4)
) AS t(team_id, name, color, is_won, is_lost, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM quotation_stages WHERE team_id IS NULL
);

-- ── Añadir stage_id a quotations ─────────────────────────────────────────────
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS stage_id UUID REFERENCES quotation_stages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS quotations_stage_id_idx ON quotations (stage_id);

-- ── Migrar data existente (matchear status TEXT → stage por nombre) ───────────
UPDATE quotations q
SET stage_id = (
  SELECT s.id
  FROM   quotation_stages s
  WHERE  s.team_id IS NULL
    AND  lower(s.name) = lower(q.status)
  LIMIT  1
);
