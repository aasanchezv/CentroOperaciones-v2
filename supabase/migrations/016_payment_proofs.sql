-- Migration 016: Comprobantes de pago + App Settings
-- Bucket privado para comprobantes, tabla payment_proofs y tabla app_settings

-- 1. Bucket comprobantes (privado, máx 10 MB, solo PDF e imágenes)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comprobantes', 'comprobantes', false, 10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- 2. Tabla payment_proofs
CREATE TABLE IF NOT EXISTS payment_proofs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_send_id  UUID REFERENCES collection_sends(id) ON DELETE CASCADE,
  policy_id           UUID REFERENCES policies(id) ON DELETE SET NULL,
  file_name           TEXT NOT NULL,
  file_path           TEXT NOT NULL,
  size_bytes          INT,
  mime_type           TEXT NOT NULL DEFAULT 'application/pdf',
  sent_to_control_at  TIMESTAMPTZ,
  sent_by             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE payment_proofs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_proofs: auth read" ON payment_proofs
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "payment_proofs: agent+ insert" ON payment_proofs
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
            AND role IN ('admin', 'ops', 'manager', 'agent'))
  );

CREATE INDEX IF NOT EXISTS payment_proofs_send_idx ON payment_proofs (collection_send_id);
CREATE INDEX IF NOT EXISTS payment_proofs_policy_idx ON payment_proofs (policy_id);

-- 3. Tabla app_settings (configuración general de la app)
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_settings: auth read" ON app_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "app_settings: admin write" ON app_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Seed: clave mesa_control_email
INSERT INTO app_settings (key, value)
VALUES ('mesa_control_email', '')
ON CONFLICT (key) DO NOTHING;
