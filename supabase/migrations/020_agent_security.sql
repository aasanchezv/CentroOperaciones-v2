-- Migration 020: Seguridad por rol en cuentas, contactos y pólizas
--
-- Reemplaza las políticas SELECT permisivas (todos ven todo) por políticas
-- que filtran por rol:
--   admin/ops  → ven TODO
--   manager    → ven las cuentas de su equipo (y sin asignar)
--   agent      → solo sus cuentas asignadas (assigned_to = auth.uid())
--   readonly   → ven todo (no pueden editar, sin riesgo)
--
-- contacts y policies heredan la restricción via account_id.

-- ── Índice auxiliar para performance ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_team_id ON profiles(team_id);
-- idx_accounts_assigned_to ya existe (creado en migration 002)

-- ── 1. ACCOUNTS ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "accounts: authenticated read" ON accounts;

CREATE POLICY "accounts: role based read" ON accounts
  FOR SELECT USING (
    -- admin/ops: acceso completo
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'ops')
    )
    -- manager: cuentas sin asignar + las de su equipo + las propias
    OR (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'manager'
      )
      AND (
        assigned_to IS NULL
        OR assigned_to = auth.uid()
        OR assigned_to IN (
          SELECT p.id FROM profiles p
          WHERE p.team_id = (
            SELECT team_id FROM profiles WHERE id = auth.uid()
          )
        )
      )
    )
    -- agent: solo sus cuentas asignadas
    OR (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'agent'
      )
      AND assigned_to = auth.uid()
    )
    -- readonly: todo (solo lectura, sin riesgo de edición)
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'readonly'
    )
  );

-- ── 2. CONTACTS (hereda seguridad via account_id) ─────────────────────────

DROP POLICY IF EXISTS "contacts: authenticated read" ON contacts;

CREATE POLICY "contacts: role based read" ON contacts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'ops')
    )
    OR (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'manager'
      )
      AND account_id IN (
        SELECT a.id FROM accounts a
        WHERE
          a.assigned_to IS NULL
          OR a.assigned_to = auth.uid()
          OR a.assigned_to IN (
            SELECT p.id FROM profiles p
            WHERE p.team_id = (
              SELECT team_id FROM profiles WHERE id = auth.uid()
            )
          )
      )
    )
    OR (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'agent'
      )
      AND account_id IN (
        SELECT a.id FROM accounts a
        WHERE a.assigned_to = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'readonly'
    )
  );

-- ── 3. POLICIES (hereda seguridad via account_id) ─────────────────────────

DROP POLICY IF EXISTS "policies: authenticated read" ON policies;

CREATE POLICY "policies: role based read" ON policies
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'ops')
    )
    OR (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'manager'
      )
      AND account_id IN (
        SELECT a.id FROM accounts a
        WHERE
          a.assigned_to IS NULL
          OR a.assigned_to = auth.uid()
          OR a.assigned_to IN (
            SELECT p.id FROM profiles p
            WHERE p.team_id = (
              SELECT team_id FROM profiles WHERE id = auth.uid()
            )
          )
      )
    )
    OR (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'agent'
      )
      AND account_id IN (
        SELECT a.id FROM accounts a
        WHERE a.assigned_to = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'readonly'
    )
  );
