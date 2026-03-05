-- Migration 035: Triggers para auto-crear renovaciones y recibos al insertar/actualizar pólizas
-- Cubre cualquier origen de inserción: app manual, sync externo, API.

-- ── Función 1: auto_create_renewal_on_policy ─────────────────────────────────
-- Crea una renovación automáticamente cuando se inserta o actualiza una póliza,
-- siempre que la póliza tenga ejecutivo asignado y status válido.

CREATE OR REPLACE FUNCTION auto_create_renewal_on_policy()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  first_stage_id      UUID;
  account_assigned_to UUID;
BEGIN
  -- Solo para pólizas en estado válido
  IF NEW.status IN ('quote', 'cancelled') THEN RETURN NEW; END IF;

  -- Idempotente: no crear si ya existe una renovación para esta póliza
  IF EXISTS (SELECT 1 FROM renewals WHERE policy_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- El ejecutivo se toma de la cuenta (policies no tiene assigned_to)
  SELECT assigned_to INTO account_assigned_to
  FROM accounts WHERE id = NEW.account_id;

  IF account_assigned_to IS NULL THEN RETURN NEW; END IF;

  -- Stage inicial = primer stage activo global (team_id IS NULL), por sort_order
  SELECT id INTO first_stage_id
  FROM renewal_stages
  WHERE is_active = true AND team_id IS NULL
  ORDER BY sort_order ASC
  LIMIT 1;

  INSERT INTO renewals (
    policy_id,
    account_id,
    assigned_to,
    created_by,
    current_stage_id,
    status
  ) VALUES (
    NEW.id,
    NEW.account_id,
    account_assigned_to,
    NEW.created_by,
    first_stage_id,
    'in_progress'
  );

  RETURN NEW;
END;
$$;

-- Trigger: se activa en INSERT o cuando cambia el status
CREATE TRIGGER trg_auto_renewal
AFTER INSERT OR UPDATE OF status ON policies
FOR EACH ROW EXECUTE FUNCTION auto_create_renewal_on_policy();

-- ── Función 2: auto_create_receipts_on_policy ────────────────────────────────
-- Genera automáticamente los recibos de cobranza de una póliza basándose en
-- payment_frequency, start_date, end_date y total_premium/premium.
-- En UPDATE: regenera solo si cambian campos relevantes (borra pending/overdue y recrea).

CREATE OR REPLACE FUNCTION auto_create_receipts_on_policy()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  interval_months INT;
  total_amount    NUMERIC(12,2);
  amount_each     NUMERIC(12,2);
  first_stage_id  UUID;
  due             DATE;
BEGIN
  -- Requisitos mínimos
  IF NEW.start_date IS NULL OR NEW.end_date IS NULL THEN RETURN NEW; END IF;
  IF NEW.payment_frequency IS NULL THEN RETURN NEW; END IF;

  total_amount := NEW.premium;
  IF total_amount IS NULL THEN RETURN NEW; END IF;

  -- Intervalo en meses según frecuencia de pago
  interval_months := CASE NEW.payment_frequency
    WHEN 'mensual'    THEN 1
    WHEN 'bimestral'  THEN 2
    WHEN 'trimestral' THEN 3
    WHEN 'semestral'  THEN 6
    WHEN 'anual'      THEN 12
    WHEN 'contado'    THEN 12
    ELSE 12
  END;

  -- Monto por recibo = prima total / número de pagos en el año
  amount_each := ROUND(total_amount / (12.0 / interval_months), 2);

  -- Stage inicial de cobranza (primer stage activo global)
  SELECT id INTO first_stage_id
  FROM cobranza_stages
  WHERE is_active = true AND team_id IS NULL
  ORDER BY sort_order ASC
  LIMIT 1;

  IF TG_OP = 'UPDATE' THEN
    -- En UPDATE: solo actuar si cambió algún campo relevante
    IF (OLD.start_date        IS NOT DISTINCT FROM NEW.start_date        AND
        OLD.end_date          IS NOT DISTINCT FROM NEW.end_date          AND
        OLD.premium           IS NOT DISTINCT FROM NEW.premium           AND
        OLD.payment_frequency IS NOT DISTINCT FROM NEW.payment_frequency)
    THEN
      RETURN NEW; -- Nada cambió, no tocar recibos
    END IF;
    -- Borrar solo recibos que aún no están pagados o cancelados
    DELETE FROM policy_receipts
    WHERE policy_id = NEW.id AND status IN ('pending', 'overdue');

  ELSIF TG_OP = 'INSERT' THEN
    -- En INSERT: idempotente — skip si ya existen recibos
    IF EXISTS (SELECT 1 FROM policy_receipts WHERE policy_id = NEW.id) THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Generar recibos iterativamente desde start_date hasta end_date
  due := NEW.start_date;
  WHILE due <= NEW.end_date LOOP
    INSERT INTO policy_receipts (
      policy_id,
      account_id,
      due_date,
      amount,
      status,
      current_stage_id,
      created_by
    ) VALUES (
      NEW.id,
      NEW.account_id,
      due,
      amount_each,
      CASE WHEN due < CURRENT_DATE THEN 'overdue' ELSE 'pending' END,
      first_stage_id,
      NEW.created_by
    );
    due := due + (interval_months || ' months')::INTERVAL;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Trigger: se activa en INSERT o cuando cambia cualquier campo de cálculo de recibos
CREATE TRIGGER trg_auto_receipts
AFTER INSERT OR UPDATE OF start_date, end_date, premium, payment_frequency
ON policies
FOR EACH ROW EXECUTE FUNCTION auto_create_receipts_on_policy();
