-- ============================================================
-- Centro de Operaciones Murguía — Migration 006
-- Admin IA: configuración de modelos + logs de uso de tokens
-- (idempotente — seguro de correr aunque las tablas ya existan)
-- ============================================================

-- ─── ai_tool_configs ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_tool_configs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id     TEXT UNIQUE NOT NULL,
  tool_name   TEXT NOT NULL,
  model       TEXT NOT NULL,
  max_tokens  INT NOT NULL DEFAULT 1024,
  is_enabled  BOOLEAN NOT NULL DEFAULT true,
  updated_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed: herramienta Captura IA (solo si no existe aún)
INSERT INTO ai_tool_configs (tool_id, tool_name, model, max_tokens)
VALUES ('captura', 'Captura IA — OCR de pólizas', 'claude-haiku-4-5-20251001', 1024)
ON CONFLICT (tool_id) DO NOTHING;

-- ─── ai_usage_logs ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id       TEXT NOT NULL,
  user_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  model         TEXT NOT NULL,
  input_tokens  INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  file_name     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── RLS ─────────────────────────────────────────────────────

ALTER TABLE ai_tool_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_logs   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_tool_configs: admin read"   ON ai_tool_configs;
DROP POLICY IF EXISTS "ai_tool_configs: admin update" ON ai_tool_configs;
DROP POLICY IF EXISTS "ai_usage_logs: admin read"     ON ai_usage_logs;
DROP POLICY IF EXISTS "ai_usage_logs: own read"       ON ai_usage_logs;
DROP POLICY IF EXISTS "ai_usage_logs: deny client insert" ON ai_usage_logs;

CREATE POLICY "ai_tool_configs: admin read" ON ai_tool_configs
  FOR SELECT USING (is_admin());

CREATE POLICY "ai_tool_configs: admin update" ON ai_tool_configs
  FOR UPDATE USING (is_admin());

CREATE POLICY "ai_usage_logs: admin read" ON ai_usage_logs
  FOR SELECT USING (is_admin());

CREATE POLICY "ai_usage_logs: own read" ON ai_usage_logs
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "ai_usage_logs: deny client insert" ON ai_usage_logs
  FOR INSERT WITH CHECK (false);

-- ─── Índices ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_ai_usage_tool_id    ON ai_usage_logs(tool_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_id    ON ai_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_model      ON ai_usage_logs(model);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage_logs(created_at DESC);
