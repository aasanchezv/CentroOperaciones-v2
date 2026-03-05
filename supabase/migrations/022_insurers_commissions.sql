-- Migration 022: Directorio de aseguradoras + Códigos de comisión
--
-- 1. Tabla insurers — directorio de aseguradoras con las que trabaja Murguía
-- 2. Tabla commission_codes — códigos/claves de comisión por aseguradora
--    (una aseguradora puede tener múltiples códigos según ramo/condiciones)
-- 3. FK commission_code_id en policies para vincular la comisión de cada póliza

-- ── 1. Directorio de aseguradoras ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS insurers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  short_name TEXT,
  email      TEXT,
  phone      TEXT,
  website    TEXT,
  notes      TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE insurers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insurers: auth read" ON insurers
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "insurers: admin/ops write" ON insurers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'ops')
    )
  );

-- updated_at auto-trigger
CREATE OR REPLACE FUNCTION update_insurers_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER insurers_updated_at
  BEFORE UPDATE ON insurers
  FOR EACH ROW EXECUTE FUNCTION update_insurers_updated_at();

-- ── 2. Códigos de comisión ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS commission_codes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insurer_id      UUID NOT NULL REFERENCES insurers(id) ON DELETE CASCADE,
  code            TEXT NOT NULL,          -- "clave de agente" / código de intermediario
  branch          TEXT,                   -- ramo específico (NULL = aplica a todos)
  description     TEXT,                   -- descripción de condiciones / notas
  rate_pct        NUMERIC(6,3),           -- porcentaje de comisión (ej: 12.500)
  rate_flat       NUMERIC(12,2),          -- monto fijo alternativo (si no hay porcentaje)
  effective_from  DATE,                   -- inicio de vigencia del código
  effective_to    DATE,                   -- fin de vigencia (NULL = sin vencimiento)
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE commission_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commission_codes: auth read" ON commission_codes
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "commission_codes: admin/ops write" ON commission_codes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'ops')
    )
  );

-- updated_at auto-trigger
CREATE OR REPLACE FUNCTION update_commission_codes_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER commission_codes_updated_at
  BEFORE UPDATE ON commission_codes
  FOR EACH ROW EXECUTE FUNCTION update_commission_codes_updated_at();

-- ── 3. FK en policies ─────────────────────────────────────────────────────

ALTER TABLE policies
  ADD COLUMN IF NOT EXISTS commission_code_id UUID REFERENCES commission_codes(id) ON DELETE SET NULL;

-- Índice para búsquedas
CREATE INDEX IF NOT EXISTS commission_codes_insurer_idx ON commission_codes(insurer_id);
CREATE INDEX IF NOT EXISTS policies_commission_code_idx ON policies(commission_code_id);
