-- Migration 029: Motor de reglas de negocio para pólizas
-- Permite configurar reglas automáticas (ej. crear renovación 30 días antes del vencimiento)

CREATE TABLE IF NOT EXISTS policy_business_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT,
  entity_type   TEXT NOT NULL CHECK (entity_type IN ('policy', 'receipt')),
  trigger_days  INTEGER NOT NULL CHECK (trigger_days > 0),
  action_type   TEXT NOT NULL CHECK (action_type IN ('create_renewal', 'set_cobranza_stage', 'create_task')),
  action_config JSONB NOT NULL DEFAULT '{}',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger para updated_at (usa la función ya definida en migration 001)
CREATE TRIGGER trg_policy_business_rules_updated_at
  BEFORE UPDATE ON policy_business_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE policy_business_rules ENABLE ROW LEVEL SECURITY;

-- Todos los usuarios autenticados pueden leer las reglas
CREATE POLICY "rules_read" ON policy_business_rules
  FOR SELECT USING (auth.role() = 'authenticated');

-- Solo admin/ops pueden crear, editar y eliminar
CREATE POLICY "rules_write" ON policy_business_rules
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );

-- ── Seeds: reglas de ejemplo ─────────────────────────────────────────────
INSERT INTO policy_business_rules (name, description, entity_type, trigger_days, action_type, action_config, sort_order)
VALUES
  (
    'Iniciar renovación',
    'Crea una renovación "Por iniciar" cuando faltan N días para el vencimiento de la póliza',
    'policy',
    30,
    'create_renewal',
    '{}',
    1
  ),
  (
    'Primera gestión de cobranza',
    'Mueve el recibo a la etapa indicada cuando faltan N días para su vencimiento',
    'receipt',
    10,
    'set_cobranza_stage',
    '{"stage_name": "Primer aviso"}',
    2
  );
