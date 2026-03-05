-- ============================================================
-- Centro de Operaciones Murguía — Migration 031
-- Copiloto IA: persona configurable + system prompt custom
-- Agrega identidad configurable al agente comercial IA.
-- ============================================================

ALTER TABLE ai_tool_configs
  ADD COLUMN IF NOT EXISTS persona_name  TEXT NOT NULL DEFAULT 'Copiloto IA',
  ADD COLUMN IF NOT EXISTS system_prompt TEXT;

COMMENT ON COLUMN ai_tool_configs.persona_name  IS 'Nombre visible del copiloto en la UI (ej: "Copiloto IA", "Max")';
COMMENT ON COLUMN ai_tool_configs.system_prompt IS 'Instrucciones adicionales del admin que se anteponen al system prompt base. NULL = solo usar el base.';

-- Actualizar seed del agente (idempotente: no sobreescribe si ya fue customizado)
UPDATE ai_tool_configs
SET
  persona_name  = 'Copiloto IA',
  system_prompt = NULL
WHERE tool_id = 'agente'
  AND persona_name = 'Copiloto IA';
