-- Migration 028: Infraestructura de sincronización con BD externa
-- Agrega: columnas external_id/sync_source/last_synced_at, 4 nuevos campos en policies,
--         tablas sync_runs, sync_errors, sync_field_mappings, sync_reference_maps,
--         función get_renewal_candidates(), RLS y seeds en app_settings.

-- ── 1. Enum sync_source ──────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE sync_source AS ENUM ('manual', 'import', 'ocr', 'external');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Columnas de sync en accounts ─────────────────────────────────────────
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS external_id    TEXT,
  ADD COLUMN IF NOT EXISTS sync_source    sync_source NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS accounts_external_id_uidx
  ON accounts(external_id) WHERE external_id IS NOT NULL;

COMMENT ON COLUMN accounts.external_id    IS 'ID en la BD externa (para sync)';
COMMENT ON COLUMN accounts.sync_source    IS 'Origen del registro: manual, import, ocr, external';
COMMENT ON COLUMN accounts.last_synced_at IS 'Última vez que fue actualizado por el sync';

-- ── 3. Columnas de sync en contacts ─────────────────────────────────────────
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS external_id    TEXT,
  ADD COLUMN IF NOT EXISTS sync_source    sync_source NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS contacts_external_id_uidx
  ON contacts(external_id) WHERE external_id IS NOT NULL;

COMMENT ON COLUMN contacts.external_id    IS 'ID en la BD externa (para sync)';
COMMENT ON COLUMN contacts.sync_source    IS 'Origen del registro: manual, import, ocr, external';
COMMENT ON COLUMN contacts.last_synced_at IS 'Última vez que fue actualizado por el sync';

-- ── 4. Columnas de sync en policies + 4 campos nuevos ───────────────────────
ALTER TABLE policies
  -- campos de sync
  ADD COLUMN IF NOT EXISTS external_id    TEXT,
  ADD COLUMN IF NOT EXISTS sync_source    sync_source NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  -- nuevos campos de BD central
  ADD COLUMN IF NOT EXISTS concepto       TEXT,
  ADD COLUMN IF NOT EXISTS subramo        TEXT,
  ADD COLUMN IF NOT EXISTS conducto_cobro TEXT,
  ADD COLUMN IF NOT EXISTS comision_total NUMERIC(12,2);

CREATE UNIQUE INDEX IF NOT EXISTS policies_external_id_uidx
  ON policies(external_id) WHERE external_id IS NOT NULL;

COMMENT ON COLUMN policies.external_id    IS 'ID en la BD externa (para sync)';
COMMENT ON COLUMN policies.sync_source    IS 'Origen del registro: manual, import, ocr, external';
COMMENT ON COLUMN policies.last_synced_at IS 'Última vez que fue actualizado por el sync';
COMMENT ON COLUMN policies.concepto       IS 'Qué está asegurado (bien o persona), ej. "Toyota Corolla 2023 ABC-123"';
COMMENT ON COLUMN policies.subramo        IS 'Subtipo dentro del ramo: GMM Individual, Auto Flotilla, Vida Temporal, etc.';
COMMENT ON COLUMN policies.conducto_cobro IS 'domiciliacion = aseguradora cobra sola | directo = nosotros cobramos';
COMMENT ON COLUMN policies.comision_total IS 'Comisión real pagada por la aseguradora (MXN)';

-- ── 5. Columnas de sync en policy_receipts ───────────────────────────────────
-- receipt_number ya existe como placeholder para el ID externo (migration 026)
ALTER TABLE policy_receipts
  ADD COLUMN IF NOT EXISTS sync_source    sync_source NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS policy_receipts_receipt_number_uidx
  ON policy_receipts(receipt_number) WHERE receipt_number IS NOT NULL;

COMMENT ON COLUMN policy_receipts.sync_source    IS 'Origen del registro: manual, import, ocr, external';
COMMENT ON COLUMN policy_receipts.last_synced_at IS 'Última vez que fue actualizado por el sync';

-- ── 6. Tabla sync_runs — log de cada ejecución ───────────────────────────────
CREATE TABLE IF NOT EXISTS sync_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at         TIMESTAMPTZ,
  triggered_by        TEXT NOT NULL DEFAULT 'cron',    -- 'cron' | 'manual' | 'api'
  status              TEXT NOT NULL DEFAULT 'running', -- 'running' | 'success' | 'partial' | 'failed'
  accounts_upserted   INT  NOT NULL DEFAULT 0,
  contacts_upserted   INT  NOT NULL DEFAULT 0,
  policies_upserted   INT  NOT NULL DEFAULT 0,
  policies_cancelled  INT  NOT NULL DEFAULT 0,
  receipts_upserted   INT  NOT NULL DEFAULT 0,
  renewals_created    INT  NOT NULL DEFAULT 0,
  error_count         INT  NOT NULL DEFAULT 0,
  notes               TEXT,
  metadata            JSONB
);

ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_runs: admin/ops read" ON sync_runs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );

-- Solo service_role (Edge Function) puede escribir
CREATE POLICY "sync_runs: deny client write" ON sync_runs
  FOR ALL WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_sync_runs_started_at ON sync_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_runs_status      ON sync_runs(status);

-- ── 7. Tabla sync_errors — errores por registro ───────────────────────────────
CREATE TABLE IF NOT EXISTS sync_errors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_run_id   UUID NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
  entity_type   TEXT NOT NULL,  -- 'account' | 'contact' | 'policy' | 'receipt'
  external_id   TEXT,
  error_type    TEXT,           -- 'upsert_failed' | 'unresolved_reference' | 'validation'
  error_message TEXT NOT NULL,
  raw_data      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sync_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_errors: admin/ops read" ON sync_errors
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );

CREATE POLICY "sync_errors: deny client write" ON sync_errors
  FOR ALL WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_sync_errors_run_id     ON sync_errors(sync_run_id);
CREATE INDEX IF NOT EXISTS idx_sync_errors_entity_type ON sync_errors(entity_type);

-- ── 8. Tabla sync_field_mappings — mapeo de columnas externas → locales ───────
CREATE TABLE IF NOT EXISTS sync_field_mappings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type     TEXT NOT NULL,          -- 'account' | 'contact' | 'policy' | 'receipt'
  external_field  TEXT NOT NULL,          -- columna en BD externa, ej. 'POLIZA_ID'
  local_field     TEXT NOT NULL,          -- columna local en Supabase, ej. 'external_id'
  allow_override  BOOLEAN NOT NULL DEFAULT false,
  -- false = COALESCE (externo solo si local está NULL)
  -- true  = externo siempre sobreescribe (+ audit event)
  transform       JSONB,                  -- {"GMM":"gmm","AUTOS":"auto"} para mapeo de enums
  is_active       BOOLEAN NOT NULL DEFAULT true,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, external_field)
);

ALTER TABLE sync_field_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_field_mappings: admin/ops read" ON sync_field_mappings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );

CREATE POLICY "sync_field_mappings: admin write" ON sync_field_mappings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── 9. Tabla sync_reference_maps — traducciones de valores externos ───────────
-- Traduce valores externos (nombres, códigos) a IDs/enums locales.
-- Ej: map_type='agent', external_value='ANABEL MENDEZ GUTIEREZ' → local_value='uuid-de-su-profile'
-- Ej: map_type='branch', external_value='G.M.M.' → local_value='gmm'
CREATE TABLE IF NOT EXISTS sync_reference_maps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_type        TEXT NOT NULL,   -- 'agent'|'branch'|'status'|'insurer'|'conducto'|'payment_freq'
  external_value  TEXT NOT NULL,   -- valor exacto que llega del externo
  local_value     TEXT NOT NULL,   -- UUID (para agents) o string de enum (para branch/status/etc.)
  auto_detected   BOOLEAN NOT NULL DEFAULT false,  -- true = el sistema lo detectó, pendiente de validar
  is_active       BOOLEAN NOT NULL DEFAULT true,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (map_type, external_value)
);

ALTER TABLE sync_reference_maps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_reference_maps: admin/ops read" ON sync_reference_maps
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );

CREATE POLICY "sync_reference_maps: admin write" ON sync_reference_maps
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_sync_ref_maps_lookup
  ON sync_reference_maps(map_type, external_value) WHERE is_active = true;

-- ── 10. Seeds: sync_reference_maps para ramos y estatus comunes ───────────────
INSERT INTO sync_reference_maps (map_type, external_value, local_value, notes) VALUES
  -- Ramos (branch)
  ('branch', 'GMM',                  'gmm',       'Gastos Médicos Mayores — código corto'),
  ('branch', 'G.M.M.',               'gmm',       'Gastos Médicos Mayores — con puntos'),
  ('branch', 'GASTOS MEDICOS',       'gmm',       'Gastos Médicos Mayores — nombre largo'),
  ('branch', 'GASTOS MÉDICOS',       'gmm',       'Gastos Médicos Mayores — con acento'),
  ('branch', 'VIDA',                 'vida',      'Seguro de Vida'),
  ('branch', 'AUTO',                 'auto',      'Automóvil — código corto'),
  ('branch', 'AUTOS',                'auto',      'Automóvil — plural'),
  ('branch', 'AUTOMOVIL',            'auto',      'Automóvil — sin acento'),
  ('branch', 'AUTOMÓVIL',            'auto',      'Automóvil — con acento'),
  ('branch', 'RC',                   'rc',        'Responsabilidad Civil'),
  ('branch', 'RESP. CIVIL',          'rc',        'Responsabilidad Civil — abreviado'),
  ('branch', 'DAÑOS',                'danos',     'Daños'),
  ('branch', 'DANOS',                'danos',     'Daños — sin acento'),
  ('branch', 'INCENDIO',             'danos',     'Incendio mapeado a Daños'),
  ('branch', 'TRANSPORTE',           'transporte','Transporte de mercancías'),
  ('branch', 'FIANZAS',              'fianzas',   'Fianzas'),
  ('branch', 'A.P.',                 'ap',        'Accidentes Personales — con puntos'),
  ('branch', 'AP',                   'ap',        'Accidentes Personales — código corto'),
  ('branch', 'ACCIDENTES PERSONALES','ap',        'Accidentes Personales — nombre largo'),
  ('branch', 'TECNICOS',             'tecnicos',  'Técnicos / Ingeniería'),
  ('branch', 'TÉCNICOS',             'tecnicos',  'Técnicos — con acento'),
  -- Estatus (status)
  ('status', 'VIGENTE',              'active',         'Póliza vigente/activa'),
  ('status', 'ACTIVA',               'active',         'Póliza activa'),
  ('status', 'CANCELADA',            'cancelled',      'Póliza cancelada'),
  ('status', 'CANCELADO',            'cancelled',      'Póliza cancelada — masculino'),
  ('status', 'VENCIDA',              'expired',        'Póliza vencida/expirada'),
  ('status', 'VENCIDO',              'expired',        'Póliza vencida — masculino'),
  ('status', 'EXPIRADA',             'expired',        'Póliza expirada'),
  ('status', 'EN RENOVACION',        'pending_renewal','Por renovar'),
  ('status', 'EN RENOVACIÓN',        'pending_renewal','Por renovar — con acento'),
  ('status', 'POR RENOVAR',          'pending_renewal','Por renovar'),
  ('status', 'COTIZACION',           'quote',          'En cotización'),
  ('status', 'COTIZACIÓN',           'quote',          'En cotización — con acento'),
  -- Conducto de cobro
  ('conducto', 'DOMICILIACION',      'domiciliacion', 'Cargo automático en cuenta'),
  ('conducto', 'DOMICILIACIÓN',      'domiciliacion', 'Cargo automático — con acento'),
  ('conducto', 'CARGO EN CUENTA',    'domiciliacion', 'Cargo en cuenta bancaria'),
  ('conducto', 'CARGO AUTOMATICO',   'domiciliacion', 'Cargo automático'),
  ('conducto', 'CARGO AUTOMÁTICO',   'domiciliacion', 'Cargo automático — con acento'),
  ('conducto', 'DIRECTO',            'directo',       'Cobro directo por el agente'),
  ('conducto', 'COBRO DIRECTO',      'directo',       'Cobro directo'),
  ('conducto', 'EFECTIVO',           'directo',       'Pago en efectivo — cobro directo'),
  ('conducto', 'TRANSFERENCIA',      'directo',       'Transferencia — cobro directo'),
  -- Frecuencia de pago
  ('payment_freq', 'MENSUAL',        'mensual',     'Mensual'),
  ('payment_freq', 'BIMESTRAL',      'bimestral',   'Bimestral'),
  ('payment_freq', 'TRIMESTRAL',     'trimestral',  'Trimestral'),
  ('payment_freq', 'CUATRIMESTRAL',  'trimestral',  'Cuatrimestral → trimestral'),
  ('payment_freq', 'SEMESTRAL',      'semestral',   'Semestral'),
  ('payment_freq', 'ANUAL',          'anual',       'Anual'),
  ('payment_freq', 'CONTADO',        'anual',       'Contado → anual de pago único')
ON CONFLICT (map_type, external_value) DO NOTHING;

-- ── 11. Seeds: app_settings para config de sync ──────────────────────────────
INSERT INTO app_settings (key, value) VALUES
  ('sync_enabled',              'true'),
  ('sync_renewal_window_days',  '60'),
  ('sync_external_db_type',     'postgres'),
  ('sync_external_db_host',     ''),
  ('sync_external_db_port',     '5432'),
  ('sync_external_db_name',     ''),
  ('sync_external_db_user',     ''),
  ('sync_last_run_id',          ''),
  ('sync_default_assignee_id',  '')
ON CONFLICT (key) DO NOTHING;

-- ── 12. Función get_renewal_candidates ────────────────────────────────────────
-- Retorna pólizas activas que vencen antes de p_window_date
-- y que NO tienen una renovación activa (in_progress o changes_requested).
CREATE OR REPLACE FUNCTION get_renewal_candidates(p_window_date DATE)
RETURNS TABLE(
  id          UUID,
  account_id  UUID,
  assigned_to UUID,
  policy_number TEXT,
  end_date    DATE
) AS $$
  SELECT
    p.id,
    p.account_id,
    a.assigned_to,
    p.policy_number,
    p.end_date
  FROM policies p
  JOIN accounts a ON a.id = p.account_id
  WHERE
    p.status = 'active'
    AND p.end_date IS NOT NULL
    AND p.end_date <= p_window_date
    AND p.end_date >= CURRENT_DATE
    AND NOT EXISTS (
      SELECT 1 FROM renewals r
      WHERE r.policy_id = p.id
        AND r.status IN ('in_progress', 'changes_requested')
    )
$$ LANGUAGE sql STABLE SECURITY DEFINER;
