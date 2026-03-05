-- ============================================================
-- MIGRATION 002 — Accounts + Contacts
-- ============================================================

-- Enums
CREATE TYPE account_status AS ENUM ('prospect', 'active', 'inactive');
CREATE TYPE account_type   AS ENUM ('empresa', 'persona_fisica');

-- Sequence para códigos legibles: CTA-0001, CTA-0002 …
CREATE SEQUENCE account_code_seq START 1;

-- ============================================================
-- ACCOUNTS
-- ============================================================
CREATE TABLE accounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code TEXT UNIQUE NOT NULL
                 DEFAULT 'CTA-' || LPAD(nextval('account_code_seq')::TEXT, 4, '0'),
  name         TEXT NOT NULL,
  type         account_type    NOT NULL DEFAULT 'empresa',
  rfc          TEXT,
  email        TEXT,
  phone        TEXT,
  status       account_status  NOT NULL DEFAULT 'prospect',
  team_id      UUID REFERENCES teams(id) ON DELETE SET NULL,
  assigned_to  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes        TEXT,
  created_by   UUID NOT NULL REFERENCES profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- CONTACTS
-- ============================================================
CREATE TABLE contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  email       TEXT,
  phone       TEXT,
  position    TEXT,        -- cargo / puesto
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  notes       TEXT,
  created_by  UUID NOT NULL REFERENCES profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- ACCOUNTS: todos los usuarios autenticados pueden leer
CREATE POLICY "accounts: authenticated read" ON accounts
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ACCOUNTS: admin, ops, manager, agent pueden crear
CREATE POLICY "accounts: agent+ can insert" ON accounts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin','ops','manager','agent')
    )
  );

-- ACCOUNTS: manager+ puede actualizar cualquiera; agent solo las suyas
CREATE POLICY "accounts: manager+ or owner can update" ON accounts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin','ops','manager')
    )
    OR assigned_to = auth.uid()
  );

-- ACCOUNTS: solo admin/ops pueden eliminar
CREATE POLICY "accounts: admin/ops can delete" ON accounts
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin','ops')
    )
  );

-- CONTACTS: todos los usuarios autenticados pueden leer
CREATE POLICY "contacts: authenticated read" ON contacts
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- CONTACTS: admin, ops, manager, agent pueden crear
CREATE POLICY "contacts: agent+ can insert" ON contacts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin','ops','manager','agent')
    )
  );

-- CONTACTS: admin, ops, manager, agent pueden actualizar
CREATE POLICY "contacts: agent+ can update" ON contacts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin','ops','manager','agent')
    )
  );

-- CONTACTS: solo admin/ops pueden eliminar
CREATE POLICY "contacts: admin/ops can delete" ON contacts
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin','ops')
    )
  );

-- ============================================================
-- TRIGGERS updated_at (reutiliza función de migration 001)
-- ============================================================
CREATE TRIGGER accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX accounts_status_idx      ON accounts(status);
CREATE INDEX accounts_team_id_idx     ON accounts(team_id);
CREATE INDEX accounts_assigned_to_idx ON accounts(assigned_to);
CREATE INDEX accounts_name_idx        ON accounts USING gin(to_tsvector('spanish', name));
CREATE INDEX contacts_account_id_idx  ON contacts(account_id);
