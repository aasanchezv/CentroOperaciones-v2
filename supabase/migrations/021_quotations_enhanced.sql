-- Migration 021: Cotizaciones mejoradas
--
-- 1. Tabla internal_requesters — lista configurable de solicitantes internos
-- 2. Nuevos campos en quotations:
--    - requested_by_id         → FK a internal_requesters
--    - requester_is_contractor → toggle: el solicitante = el contratante
--    - probable_contractor     → nombre del contratante probable (si ≠ solicitante)
--    - delivery_due_at         → fecha límite de entrega (SLA auto-calculado)

-- ── 1. Tabla internal_requesters ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS internal_requesters (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  email      TEXT,
  notes      TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE internal_requesters ENABLE ROW LEVEL SECURITY;

-- Todos los autenticados pueden leer (para el dropdown del form)
CREATE POLICY "internal_requesters: auth read" ON internal_requesters
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Solo admin/ops puede crear/editar/borrar
CREATE POLICY "internal_requesters: admin write" ON internal_requesters
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'ops')
    )
  );

-- ── 2. Nuevos campos en quotations ───────────────────────────────────────

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS requested_by_id         UUID REFERENCES internal_requesters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requester_is_contractor BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS probable_contractor     TEXT,
  ADD COLUMN IF NOT EXISTS delivery_due_at         TIMESTAMPTZ;

-- Índice para búsquedas por solicitante
CREATE INDEX IF NOT EXISTS quotations_requested_by_idx ON quotations(requested_by_id);
