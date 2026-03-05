-- Migration 043: Bitácora del Cliente + Portal AI Agent
-- 1. account_activities (registro manual de actividades)
-- 2. ai_agent_id en accounts (asignar agente IA por cliente)
-- 3. agent_type en ai_tool_configs (distinguir copiloto interno vs agente portal)

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. account_activities
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS account_activities (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type             TEXT        NOT NULL CHECK (type IN ('call', 'meeting', 'note', 'whatsapp', 'email')),
  direction        TEXT        NOT NULL DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound')),
  body             TEXT        NOT NULL,
  subject          TEXT,
  actor_id         UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  duration_seconds INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE account_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_activities_select" ON account_activities
  FOR SELECT USING (true);

CREATE POLICY "account_activities_insert" ON account_activities
  FOR INSERT WITH CHECK (actor_id = auth.uid());

CREATE POLICY "account_activities_update" ON account_activities
  FOR UPDATE USING (actor_id = auth.uid());

-- Índice para queries por cuenta + fecha
CREATE INDEX IF NOT EXISTS idx_account_activities_account_date
  ON account_activities(account_id, created_at DESC);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. ai_agent_id en accounts
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS ai_agent_id UUID
    REFERENCES ai_tool_configs(id) ON DELETE SET NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. agent_type en ai_tool_configs
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE ai_tool_configs
  ADD COLUMN IF NOT EXISTS agent_type TEXT NOT NULL DEFAULT 'internal'
    CHECK (agent_type IN ('internal', 'portal'));

-- Filas existentes ya quedan como 'internal' (DEFAULT)

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. Seed: agente portal por defecto
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO ai_tool_configs (
  tool_id, tool_name, model, max_tokens, is_enabled, agent_type,
  persona_name, system_prompt
)
VALUES (
  'portal_agent_default',
  'Asistente Portal (Estándar)',
  'claude-haiku-4-5-20251001',
  1024,
  true,
  'portal',
  'Asistente Murguía',
  E'Eres un asistente amable y profesional de Seguros Murguía. Ayudas a los clientes con información sobre sus pólizas, recibos y siniestros. Siempre responde en español mexicano, de forma clara y concisa.\n\nREGLAS:\n- Solo responde usando la información del cliente proporcionada al inicio.\n- No inventes datos sobre pólizas, montos ni fechas.\n- Para trámites complejos, pagos o emergencias, indica al cliente que contacte directamente a su asesor.\n- Sé conciso: máximo 3-4 oraciones por respuesta.'
)
ON CONFLICT (tool_id) DO NOTHING;
