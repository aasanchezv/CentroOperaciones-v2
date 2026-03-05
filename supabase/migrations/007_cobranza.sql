-- ============================================================
-- Centro de Operaciones Murguía — Migration 007
-- Módulo Cobranza: plantillas de mensaje + historial de envíos
-- (idempotente — seguro de correr aunque las tablas ya existan)
-- ============================================================

-- ─── collection_templates ────────────────────────────────────
-- Plantillas de mensaje con variables que el admin configura

CREATE TABLE IF NOT EXISTS collection_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  channel       TEXT NOT NULL DEFAULT 'both',  -- 'email' | 'whatsapp' | 'both'
  subject_email TEXT,                           -- asunto del correo
  body_email    TEXT,                           -- cuerpo del correo con {variables}
  body_whatsapp TEXT,                           -- texto WA con {variables}
  is_shared     BOOLEAN NOT NULL DEFAULT false,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── collection_sends ────────────────────────────────────────
-- Registro de cada envío de cobranza realizado

CREATE TABLE IF NOT EXISTS collection_sends (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id         UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  template_id       UUID REFERENCES collection_templates(id) ON DELETE SET NULL,
  template_name     TEXT NOT NULL,         -- snapshot del nombre al momento del envío
  channel           TEXT NOT NULL,         -- canal efectivamente usado
  rendered_whatsapp TEXT,                  -- mensaje WA ya con variables resueltas
  rendered_email    TEXT,                  -- cuerpo email ya con variables resueltas
  sent_to_email     TEXT,                  -- email al que se envió
  sent_to_phone     TEXT,                  -- teléfono al que se envió
  sent_by           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Trigger updated_at ──────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'collection_templates_updated_at'
  ) THEN
    CREATE TRIGGER collection_templates_updated_at
      BEFORE UPDATE ON collection_templates
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ─── RLS ─────────────────────────────────────────────────────

ALTER TABLE collection_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_sends     ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas existentes antes de recrear (idempotente)
DROP POLICY IF EXISTS "collection_templates: read own and shared" ON collection_templates;
DROP POLICY IF EXISTS "collection_templates: insert"              ON collection_templates;
DROP POLICY IF EXISTS "collection_templates: owner update"        ON collection_templates;
DROP POLICY IF EXISTS "collection_templates: owner delete"        ON collection_templates;
DROP POLICY IF EXISTS "collection_sends: read"                    ON collection_sends;
DROP POLICY IF EXISTS "collection_sends: insert"                  ON collection_sends;

-- collection_templates: SELECT → propias + compartidas
CREATE POLICY "collection_templates: read own and shared" ON collection_templates
  FOR SELECT USING (created_by = auth.uid() OR is_shared = true);

-- collection_templates: INSERT → cualquier usuario activo (no readonly)
CREATE POLICY "collection_templates: insert" ON collection_templates
  FOR INSERT WITH CHECK (
    created_by = auth.uid() AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'readonly' AND is_active = true)
  );

-- collection_templates: UPDATE → dueño o admin
CREATE POLICY "collection_templates: owner update" ON collection_templates
  FOR UPDATE USING (
    created_by = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- collection_templates: DELETE → dueño o admin
CREATE POLICY "collection_templates: owner delete" ON collection_templates
  FOR DELETE USING (
    created_by = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- collection_sends: SELECT → propio o admin/ops/manager
CREATE POLICY "collection_sends: read" ON collection_sends
  FOR SELECT USING (
    sent_by = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','ops','manager'))
  );

-- collection_sends: INSERT → no-readonly operators
CREATE POLICY "collection_sends: insert" ON collection_sends
  FOR INSERT WITH CHECK (
    sent_by = auth.uid() AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'readonly' AND is_active = true)
  );

-- ─── Índices ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_collection_templates_created_by ON collection_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_collection_sends_policy_id      ON collection_sends(policy_id);
CREATE INDEX IF NOT EXISTS idx_collection_sends_account_id     ON collection_sends(account_id);
CREATE INDEX IF NOT EXISTS idx_collection_sends_sent_by        ON collection_sends(sent_by);
CREATE INDEX IF NOT EXISTS idx_collection_sends_created_at     ON collection_sends(created_at DESC);
