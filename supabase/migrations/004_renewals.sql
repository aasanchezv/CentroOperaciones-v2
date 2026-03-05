-- ============================================================
-- RENEWAL STAGES (configurable desde Admin)
-- ============================================================
CREATE TABLE renewal_stages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  days_before         INT  NOT NULL,
  send_email          BOOLEAN NOT NULL DEFAULT false,
  send_whatsapp       BOOLEAN NOT NULL DEFAULT false,
  requires_new_policy BOOLEAN NOT NULL DEFAULT false,
  sort_order          INT  NOT NULL,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed: 4 stages iniciales
INSERT INTO renewal_stages (name, days_before, send_email, send_whatsapp, requires_new_policy, sort_order)
VALUES
  ('Aviso inicial',  45, true,  false, false, 1),
  ('Póliza enviada', 30, true,  true,  true,  2),
  ('Alerta',         15, true,  true,  false, 3),
  ('Llamada',         5, false, false, false, 4);

-- ============================================================
-- RENEWAL STATUS ENUM
-- ============================================================
CREATE TYPE renewal_status AS ENUM (
  'in_progress',
  'changes_requested',
  'cancelled',
  'renewed_pending_payment',
  'renewed_paid'
);

-- ============================================================
-- RENEWALS
-- ============================================================
CREATE TABLE renewals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id           UUID NOT NULL REFERENCES policies(id)       ON DELETE CASCADE,
  new_policy_id       UUID           REFERENCES policies(id)       ON DELETE SET NULL,
  account_id          UUID NOT NULL REFERENCES accounts(id),
  assigned_to         UUID NOT NULL REFERENCES profiles(id),
  current_stage_id    UUID           REFERENCES renewal_stages(id) ON DELETE SET NULL,
  status              renewal_status NOT NULL DEFAULT 'in_progress',
  client_confirmed_at TIMESTAMPTZ,
  call_attempts       INT  NOT NULL DEFAULT 0,
  notes               TEXT,
  created_by          UUID NOT NULL REFERENCES profiles(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX renewals_policy_id       ON renewals(policy_id);
CREATE INDEX renewals_account_id      ON renewals(account_id);
CREATE INDEX renewals_assigned_to     ON renewals(assigned_to);
CREATE INDEX renewals_status          ON renewals(status);
CREATE INDEX renewals_current_stage   ON renewals(current_stage_id);

-- ============================================================
-- RENEWAL EVENTS (audit log por renovación)
-- ============================================================
CREATE TABLE renewal_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  renewal_id  UUID NOT NULL REFERENCES renewals(id) ON DELETE CASCADE,
  stage_id    UUID           REFERENCES renewal_stages(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,   -- email_sent | whatsapp_sent | call_attempted | confirmed | closed | stage_advanced
  actor_id    UUID           REFERENCES profiles(id),
  notes       TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX renewal_events_renewal_id ON renewal_events(renewal_id);

-- ============================================================
-- TASKS (general — sirve para renovaciones, siniestros, manual)
-- ============================================================
CREATE TABLE tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  description  TEXT,
  source_type  TEXT NOT NULL DEFAULT 'manual',  -- manual | renewal | claim
  source_id    UUID,
  insurer      TEXT,
  due_date     DATE,
  status       TEXT NOT NULL DEFAULT 'pending', -- pending | in_progress | done
  assigned_to  UUID REFERENCES profiles(id),
  created_by   UUID NOT NULL REFERENCES profiles(id),
  account_id   UUID REFERENCES accounts(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX tasks_source       ON tasks(source_type, source_id);
CREATE INDEX tasks_status        ON tasks(status);

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER renewals_updated_at
  BEFORE UPDATE ON renewals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE renewal_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE renewals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE renewal_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks            ENABLE ROW LEVEL SECURITY;

-- renewal_stages: todos los autenticados pueden leer, solo admin escribe
CREATE POLICY "renewal_stages: authenticated read" ON renewal_stages
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "renewal_stages: admin write" ON renewal_stages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- renewals: ejecutivo asignado ve las suyas; admin/ops ven todas
CREATE POLICY "renewals: own or admin/ops" ON renewals
  FOR SELECT USING (
    assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin','ops','manager')
    )
  );

CREATE POLICY "renewals: operator insert" ON renewals
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role <> 'readonly')
  );

CREATE POLICY "renewals: assigned or admin update" ON renewals
  FOR UPDATE USING (
    assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin','ops')
    )
  );

-- renewal_events: solo lectura para autenticados (service_role inserta)
CREATE POLICY "renewal_events: authenticated read" ON renewal_events
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "renewal_events: service insert" ON renewal_events
  FOR INSERT WITH CHECK (true);

-- tasks: assigned_to ve las suyas + admin/ops ven todas
CREATE POLICY "tasks: own or admin/ops" ON tasks
  FOR SELECT USING (
    assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin','ops','manager')
    )
  );

CREATE POLICY "tasks: operator insert" ON tasks
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role <> 'readonly')
  );

CREATE POLICY "tasks: assigned or admin update" ON tasks
  FOR UPDATE USING (
    assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin','ops')
    )
  );
