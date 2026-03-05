-- Migration 023: SLA fields en aseguradoras para contexto del agente IA
-- Añade tiempos de respuesta esperados por tipo de gestión

ALTER TABLE insurers
  ADD COLUMN IF NOT EXISTS sla_quote_hours       INT,          -- horas para cotización
  ADD COLUMN IF NOT EXISTS sla_endorsement_hours INT,          -- horas para endosos/cambios
  ADD COLUMN IF NOT EXISTS sla_issuance_hours    INT,          -- horas para emisión de póliza
  ADD COLUMN IF NOT EXISTS sla_notes             TEXT;         -- notas adicionales de SLA
