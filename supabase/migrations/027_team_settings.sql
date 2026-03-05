-- Migration 027: Configuración por equipo — email CC, VIP CC, meta de ingresos

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS email_cc              TEXT,
  ADD COLUMN IF NOT EXISTS vip_email_cc          TEXT,
  ADD COLUMN IF NOT EXISTS monthly_income_goal   NUMERIC(12,2);

-- Comentarios para documentar el propósito
COMMENT ON COLUMN teams.email_cc            IS 'CC global en todos los correos salientes del equipo';
COMMENT ON COLUMN teams.vip_email_cc        IS 'CC adicional para correos a clientes VIP del equipo';
COMMENT ON COLUMN teams.monthly_income_goal IS 'Meta mensual de prima cobrada por agente (MXN)';
