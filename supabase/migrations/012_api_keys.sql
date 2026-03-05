-- ============================================================
-- MIGRATION 012 — api_keys: gestión de API keys por proveedor
-- ============================================================
-- Guarda la API key de Anthropic (y futuros proveedores) en DB
-- para que el admin pueda actualizarla desde la UI sin tocar Vercel.
-- RLS: solo admins pueden ver/modificar; las rutas API usan service_role.
-- ============================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider   TEXT UNIQUE NOT NULL,
  -- 'anthropic' | 'openai' (futuro) | etc.
  key_value  TEXT NOT NULL,
  key_label  TEXT NOT NULL DEFAULT '',
  -- etiqueta libre, ej: "sk-ant consultas"
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Solo admins pueden operar sobre api_keys vía cliente normal.
-- Las rutas API del servidor usan createAdminClient() (service_role) que bypasa RLS.
CREATE POLICY "api_keys: admin only"
  ON api_keys
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Índice para la búsqueda más común (por proveedor)
CREATE INDEX IF NOT EXISTS api_keys_provider_idx ON api_keys (provider);
