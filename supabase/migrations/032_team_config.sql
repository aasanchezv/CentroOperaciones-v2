-- ─────────────────────────────────────────────────────────────────
-- Migration 032: Team-configurable stages
-- Adds team_id to renewal_stages, cobranza_stages, collection_templates
-- NULL team_id = global (used by all teams as default)
-- Non-null team_id = team-specific configuration
-- ─────────────────────────────────────────────────────────────────

-- ── renewal_stages ────────────────────────────────────────────
ALTER TABLE renewal_stages
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_renewal_stages_team ON renewal_stages(team_id);

-- ── cobranza_stages ───────────────────────────────────────────
ALTER TABLE cobranza_stages
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_cobranza_stages_team ON cobranza_stages(team_id);

-- ── collection_templates ──────────────────────────────────────
ALTER TABLE collection_templates
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_collection_templates_team ON collection_templates(team_id);
