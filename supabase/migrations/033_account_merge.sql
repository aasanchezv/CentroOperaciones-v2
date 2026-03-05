-- Migration 033: Merge de cuentas + campos adicionales en pólizas
-- Permite al admin fusionar cuentas del mismo grupo empresarial

-- ─── Merge support en accounts ───────────────────────────────

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS is_merged      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS merged_into_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

COMMENT ON COLUMN accounts.is_merged      IS 'true si esta cuenta fue fusionada en otra';
COMMENT ON COLUMN accounts.merged_into_id IS 'cuenta destino si is_merged=true';

CREATE INDEX IF NOT EXISTS idx_accounts_merged ON accounts(merged_into_id)
  WHERE merged_into_id IS NOT NULL;

-- ─── Campos adicionales en pólizas (sync desde BD externa) ───

ALTER TABLE policies
  ADD COLUMN IF NOT EXISTS previous_policy_number TEXT,
  ADD COLUMN IF NOT EXISTS currency               TEXT;

COMMENT ON COLUMN policies.previous_policy_number IS 'Número de póliza anterior (campo Anterior en BD externa)';
COMMENT ON COLUMN policies.currency               IS 'Moneda de la prima (MXN, USD, etc.)';
