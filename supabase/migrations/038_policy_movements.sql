-- Migration 038: Módulo de Movimientos de Póliza
-- movement_types (admin configurable) + policy_movements + movement_events

-- ── 1. Tipos de movimiento ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS movement_types (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,
  code            TEXT        NOT NULL,  -- alta | baja | modificacion | cambio_cobertura | otro
  description     TEXT,
  custom_fields   JSONB       NOT NULL DEFAULT '[]',
  -- Estructura de cada campo:
  -- { key TEXT, label TEXT, type TEXT (text|number|date|textarea|select), required BOOL, options TEXT[] }
  affects_premium BOOLEAN     NOT NULL DEFAULT false,
  company_only    BOOLEAN     NOT NULL DEFAULT false,
  team_id         UUID        REFERENCES teams(id) ON DELETE CASCADE,  -- NULL = global
  sort_order      INT         NOT NULL DEFAULT 0,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_by      UUID        NOT NULL REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at_movement_types
  BEFORE UPDATE ON movement_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 2. Movimientos individuales ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS policy_movements (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id          UUID        NOT NULL REFERENCES policies(id)  ON DELETE CASCADE,
  account_id         UUID        NOT NULL REFERENCES accounts(id)  ON DELETE CASCADE,
  movement_type_id   UUID        NOT NULL REFERENCES movement_types(id),
  movement_type_name TEXT        NOT NULL,       -- snapshot del nombre al crear
  insurer            TEXT        NOT NULL,       -- denormalizado desde policy
  policy_number      TEXT,                       -- denormalizado
  status             TEXT        NOT NULL DEFAULT 'draft',  -- draft | sent | confirmed | rejected
  field_values       JSONB       NOT NULL DEFAULT '{}',
  notes              TEXT,
  task_id            UUID        REFERENCES tasks(id) ON DELETE SET NULL,
  assigned_to        UUID        NOT NULL REFERENCES profiles(id),
  created_by         UUID        NOT NULL REFERENCES profiles(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_policy_movements_policy_id  ON policy_movements(policy_id);
CREATE INDEX IF NOT EXISTS idx_policy_movements_account_id ON policy_movements(account_id);
CREATE INDEX IF NOT EXISTS idx_policy_movements_assigned_to ON policy_movements(assigned_to);
CREATE INDEX IF NOT EXISTS idx_policy_movements_insurer    ON policy_movements(insurer);
CREATE INDEX IF NOT EXISTS idx_policy_movements_status     ON policy_movements(status);

CREATE TRIGGER set_updated_at_policy_movements
  BEFORE UPDATE ON policy_movements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 3. Historial de estado ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS movement_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_id UUID        NOT NULL REFERENCES policy_movements(id) ON DELETE CASCADE,
  actor_id    UUID        NOT NULL REFERENCES profiles(id),
  status_from TEXT,
  status_to   TEXT        NOT NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_movement_events_movement_id ON movement_events(movement_id);

-- ── 4. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE movement_types    ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_movements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE movement_events   ENABLE ROW LEVEL SECURITY;

-- movement_types: todos los autenticados pueden leer; solo admin escribe
CREATE POLICY "movement_types_read" ON movement_types
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "movement_types_write" ON movement_types
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin'))
  );

-- policy_movements: admin/ops ven todo; manager ve su equipo; agent ve solo los suyos
CREATE POLICY "policy_movements_select" ON policy_movements
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'ops')
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'manager'
        AND EXISTS (
          SELECT 1 FROM profiles agent
          WHERE agent.id = policy_movements.assigned_to AND agent.team_id = p.team_id
        )
    )
    OR assigned_to = auth.uid()
  );

CREATE POLICY "policy_movements_insert" ON policy_movements
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role NOT IN ('readonly'))
  );

CREATE POLICY "policy_movements_update" ON policy_movements
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
    OR assigned_to = auth.uid()
  );

-- movement_events: heredan visibilidad de policy_movements
CREATE POLICY "movement_events_select" ON movement_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM policy_movements pm
      WHERE pm.id = movement_events.movement_id
        AND (
          pm.assigned_to = auth.uid()
          OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
          OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'manager'
              AND EXISTS (
                SELECT 1 FROM profiles agent
                WHERE agent.id = pm.assigned_to AND agent.team_id = p.team_id
              )
          )
        )
    )
  );

CREATE POLICY "movement_events_insert" ON movement_events
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role NOT IN ('readonly'))
  );

-- ── 5. Seed — 4 tipos globales ───────────────────────────────────────────────

INSERT INTO movement_types (name, code, description, affects_premium, company_only, custom_fields, sort_order, created_by)
SELECT
  'Alta de empleado',
  'alta',
  'Agregar un beneficiario o empleado a la póliza de grupo',
  false,
  true,
  '[
    {"key":"nombre","label":"Nombre completo","type":"text","required":true},
    {"key":"fecha_nacimiento","label":"Fecha de nacimiento","type":"date","required":true},
    {"key":"fecha_inicio","label":"Fecha de inicio de cobertura","type":"date","required":true}
  ]'::jsonb,
  1,
  id
FROM profiles WHERE role = 'admin' LIMIT 1;

INSERT INTO movement_types (name, code, description, affects_premium, company_only, custom_fields, sort_order, created_by)
SELECT
  'Baja de empleado',
  'baja',
  'Remover un beneficiario o empleado de la póliza de grupo',
  false,
  true,
  '[
    {"key":"nombre","label":"Nombre completo","type":"text","required":true},
    {"key":"fecha_baja","label":"Fecha de baja","type":"date","required":true},
    {"key":"motivo","label":"Motivo de baja","type":"text","required":false}
  ]'::jsonb,
  2,
  id
FROM profiles WHERE role = 'admin' LIMIT 1;

INSERT INTO movement_types (name, code, description, affects_premium, company_only, custom_fields, sort_order, created_by)
SELECT
  'Modificación',
  'modificacion',
  'Cambio en datos de la póliza o beneficiario que no afecta prima',
  false,
  false,
  '[
    {"key":"descripcion","label":"Descripción del cambio","type":"textarea","required":true},
    {"key":"fecha_efectiva","label":"Fecha efectiva","type":"date","required":true}
  ]'::jsonb,
  3,
  id
FROM profiles WHERE role = 'admin' LIMIT 1;

INSERT INTO movement_types (name, code, description, affects_premium, company_only, custom_fields, sort_order, created_by)
SELECT
  'Cambio de cobertura',
  'cambio_cobertura',
  'Modificación que afecta las coberturas o la prima de la póliza',
  true,
  false,
  '[
    {"key":"descripcion","label":"Descripción del cambio","type":"textarea","required":true},
    {"key":"nueva_prima","label":"Nueva prima estimada (MXN)","type":"number","required":false},
    {"key":"fecha_efectiva","label":"Fecha efectiva","type":"date","required":true}
  ]'::jsonb,
  4,
  id
FROM profiles WHERE role = 'admin' LIMIT 1;
