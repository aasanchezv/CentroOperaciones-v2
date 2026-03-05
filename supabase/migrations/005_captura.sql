-- ============================================================
-- Centro de Operaciones Murguía — Migration 005
-- Módulo Captura IA: plantillas + corridas + documentos
-- (idempotente — seguro de correr aunque las tablas ya existan)
-- ============================================================

-- ─── capture_templates ───────────────────────────────────────
-- Plantillas de campos que cada ejecutivo define para extraer

CREATE TABLE IF NOT EXISTS capture_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  fields      JSONB NOT NULL DEFAULT '[]',  -- [{id, key, label, type}]
  is_shared   BOOLEAN NOT NULL DEFAULT false,
  created_by  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── capture_runs ─────────────────────────────────────────────
-- Corrida de extracción: un lote de documentos procesados juntos

CREATE TABLE IF NOT EXISTS capture_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  template_id       UUID REFERENCES capture_templates(id) ON DELETE SET NULL,
  template_snapshot JSONB NOT NULL,   -- copia de fields en el momento del run
  document_count    INT NOT NULL DEFAULT 0,
  created_by        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── capture_documents ───────────────────────────────────────
-- Resultado por documento individual dentro de un run

CREATE TABLE IF NOT EXISTS capture_documents (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id     UUID NOT NULL REFERENCES capture_runs(id) ON DELETE CASCADE,
  file_name  TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'done',   -- done | error
  extracted  JSONB,       -- {field_key: value, ...}
  error      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Trigger updated_at ──────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'capture_templates_updated_at'
  ) THEN
    CREATE TRIGGER capture_templates_updated_at
      BEFORE UPDATE ON capture_templates
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ─── RLS ─────────────────────────────────────────────────────

ALTER TABLE capture_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE capture_runs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE capture_documents ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas existentes antes de recrear (idempotente)
DROP POLICY IF EXISTS "capture_templates: read own and shared" ON capture_templates;
DROP POLICY IF EXISTS "capture_templates: insert"              ON capture_templates;
DROP POLICY IF EXISTS "capture_templates: owner update"        ON capture_templates;
DROP POLICY IF EXISTS "capture_templates: owner delete"        ON capture_templates;
DROP POLICY IF EXISTS "capture_runs: read"                     ON capture_runs;
DROP POLICY IF EXISTS "capture_runs: insert"                   ON capture_runs;
DROP POLICY IF EXISTS "capture_documents: read via run"        ON capture_documents;
DROP POLICY IF EXISTS "capture_documents: insert"              ON capture_documents;

-- capture_templates: SELECT → propias + compartidas
CREATE POLICY "capture_templates: read own and shared" ON capture_templates
  FOR SELECT USING (created_by = auth.uid() OR is_shared = true);

-- capture_templates: INSERT → cualquier usuario activo (no readonly)
CREATE POLICY "capture_templates: insert" ON capture_templates
  FOR INSERT WITH CHECK (
    created_by = auth.uid() AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'readonly' AND is_active = true)
  );

-- capture_templates: UPDATE/DELETE → solo el dueño
CREATE POLICY "capture_templates: owner update" ON capture_templates
  FOR UPDATE USING (created_by = auth.uid());

CREATE POLICY "capture_templates: owner delete" ON capture_templates
  FOR DELETE USING (created_by = auth.uid());

-- capture_runs: SELECT → propios; admin/ops/manager ven todos
CREATE POLICY "capture_runs: read" ON capture_runs
  FOR SELECT USING (
    created_by = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','ops','manager'))
  );

CREATE POLICY "capture_runs: insert" ON capture_runs
  FOR INSERT WITH CHECK (
    created_by = auth.uid() AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'readonly' AND is_active = true)
  );

-- capture_documents: hereda acceso del run (service_role para todo)
-- Se accede solo vía admin client desde el servidor, sin RLS directo
CREATE POLICY "capture_documents: read via run" ON capture_documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM capture_runs r
      WHERE r.id = capture_documents.run_id
      AND (r.created_by = auth.uid() OR EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','ops','manager')
      ))
    )
  );

CREATE POLICY "capture_documents: insert" ON capture_documents
  FOR INSERT WITH CHECK (true);  -- solo desde service_role (admin client)

-- ─── Índices ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_capture_templates_created_by ON capture_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_capture_runs_created_by      ON capture_runs(created_by);
CREATE INDEX IF NOT EXISTS idx_capture_runs_template_id     ON capture_runs(template_id);
CREATE INDEX IF NOT EXISTS idx_capture_documents_run_id     ON capture_documents(run_id);
