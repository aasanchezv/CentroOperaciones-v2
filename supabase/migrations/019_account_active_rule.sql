-- Migration 019: Regla de negocio permanente
-- Una cuenta solo puede estar "activa" si tiene al menos una póliza con status = 'active'.
--
-- Implementado en dos triggers:
--   1. trg_policy_syncs_account_status (AFTER en policies)
--      → auto-sube a 'active' cuando aparece una póliza activa
--      → auto-baja a 'inactive' cuando ya no queda ninguna póliza activa
--
--   2. trg_enforce_account_active_rule (BEFORE en accounts)
--      → bloquea cualquier intento de poner status = 'active' manualmente
--        si no existen pólizas activas, revirtiendo al estado anterior (o 'inactive')

-- ── 1. Trigger sobre policies ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sync_account_status_from_policies()
RETURNS TRIGGER AS $$
DECLARE
  v_account_id UUID;
BEGIN
  v_account_id := COALESCE(NEW.account_id, OLD.account_id);

  IF EXISTS (
    SELECT 1 FROM policies
    WHERE account_id = v_account_id
      AND status = 'active'
  ) THEN
    -- Al menos una póliza activa → cuenta activa
    UPDATE accounts
    SET status = 'active', updated_at = now()
    WHERE id = v_account_id
      AND status != 'active';
  ELSE
    -- Sin pólizas activas → si estaba activa, pasa a inactiva
    UPDATE accounts
    SET status = 'inactive', updated_at = now()
    WHERE id = v_account_id
      AND status = 'active';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_policy_syncs_account_status ON policies;
CREATE TRIGGER trg_policy_syncs_account_status
  AFTER INSERT OR UPDATE OF status OR DELETE ON policies
  FOR EACH ROW
  EXECUTE FUNCTION sync_account_status_from_policies();

-- ── 2. Trigger sobre accounts ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION enforce_account_active_rule()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo aplica cuando se intenta poner status = 'active'
  IF NEW.status = 'active' THEN
    IF NOT EXISTS (
      SELECT 1 FROM policies
      WHERE account_id = NEW.id
        AND status = 'active'
    ) THEN
      -- Revertir: si es UPDATE conserva el estado previo; si es INSERT → 'prospect'
      IF TG_OP = 'UPDATE' THEN
        NEW.status := CASE WHEN OLD.status = 'active' THEN 'inactive' ELSE OLD.status END;
      ELSE
        NEW.status := 'prospect';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_account_active_rule ON accounts;
CREATE TRIGGER trg_enforce_account_active_rule
  BEFORE INSERT OR UPDATE OF status ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION enforce_account_active_rule();

-- ── 3. Sincronizar cuentas existentes ────────────────────────────────────────
-- Corrige el estado de cualquier cuenta que ya tenga pólizas activas
-- pero no tenga status = 'active', y viceversa.

UPDATE accounts a
SET status = 'active', updated_at = now()
WHERE EXISTS (
  SELECT 1 FROM policies p
  WHERE p.account_id = a.id AND p.status = 'active'
)
AND a.status != 'active';

UPDATE accounts a
SET status = 'inactive', updated_at = now()
WHERE NOT EXISTS (
  SELECT 1 FROM policies p
  WHERE p.account_id = a.id AND p.status = 'active'
)
AND a.status = 'active';
