-- Migration 030: filtro por equipo en reglas de negocio
-- NULL = regla global (aplica a todos los equipos)

ALTER TABLE policy_business_rules
  ADD COLUMN filter_team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
