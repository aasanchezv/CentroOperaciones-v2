-- ============================================================
-- Centro de Operaciones Murguía — Migration 001
-- Schema inicial: roles, equipos, perfiles, auditoría
-- ============================================================

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE user_role AS ENUM ('admin', 'ops', 'manager', 'agent', 'readonly');

-- ============================================================
-- TEAMS — grupos de trabajo
-- ============================================================
CREATE TABLE teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- PROFILES — extiende auth.users de Supabase
-- Se crea automáticamente al aceptar invitación (trigger abajo)
-- ============================================================
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT,
  role        user_role NOT NULL DEFAULT 'readonly',
  team_id     UUID REFERENCES teams(id) ON DELETE SET NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- AUDIT EVENTS — registro inmutable de acciones del sistema
-- ============================================================
CREATE TABLE audit_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,        -- formato: 'entidad.verbo' ej. 'user.invited'
  entity_type  TEXT,                 -- ej. 'profile', 'team', 'account'
  entity_id    UUID,
  payload      JSONB,                -- datos adicionales del evento
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- RLS: habilitar en todas las tablas
-- ============================================================
ALTER TABLE teams        ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- FUNCIÓN HELPER: verifica si el usuario actual es admin
-- ============================================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- RLS POLICIES — teams
-- ============================================================
-- Usuarios autenticados pueden ver equipos
CREATE POLICY "teams: authenticated read" ON teams
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Solo admin puede crear/editar/eliminar equipos
CREATE POLICY "teams: admin write" ON teams
  FOR ALL USING (is_admin());

-- ============================================================
-- RLS POLICIES — profiles
-- ============================================================
-- Cada usuario ve su propio perfil
CREATE POLICY "profiles: own row" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Admin ve todos los perfiles
CREATE POLICY "profiles: admin sees all" ON profiles
  FOR SELECT USING (is_admin());

-- Solo admin puede actualizar cualquier perfil
CREATE POLICY "profiles: admin can update" ON profiles
  FOR UPDATE USING (is_admin());

-- El propio usuario puede actualizar su full_name
CREATE POLICY "profiles: own name update" ON profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- RLS POLICIES — audit_events
-- ============================================================
-- Solo admin puede leer el audit log
CREATE POLICY "audit: admin read" ON audit_events
  FOR SELECT USING (is_admin());

-- Solo el backend (service_role) puede insertar eventos
-- Nota: service_role bypassa RLS, por lo que esto es una
-- política de documentación. Nunca insertar audit_events
-- desde el cliente.
CREATE POLICY "audit: deny client insert" ON audit_events
  FOR INSERT WITH CHECK (false);

-- ============================================================
-- TRIGGER: crear profile automáticamente al registrar usuario
-- (Se dispara cuando Supabase Auth crea un nuevo usuario)
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'readonly');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- TRIGGER: actualizar updated_at en profiles automáticamente
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ÍNDICES para performance
-- ============================================================
CREATE INDEX idx_profiles_role     ON profiles(role);
CREATE INDEX idx_profiles_team_id  ON profiles(team_id);
CREATE INDEX idx_audit_actor_id    ON audit_events(actor_id);
CREATE INDEX idx_audit_action      ON audit_events(action);
CREATE INDEX idx_audit_created_at  ON audit_events(created_at DESC);
