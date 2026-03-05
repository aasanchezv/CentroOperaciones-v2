-- Migration 026: Módulo Cobranza — Recibos + Etapas + Eventos

-- 1. Frecuencia de pago en pólizas
ALTER TABLE policies
  ADD COLUMN IF NOT EXISTS payment_frequency TEXT DEFAULT 'anual';
  -- 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual'

-- 2. Recibos de cobranza (unidad de trabajo del agente)
CREATE TABLE IF NOT EXISTS policy_receipts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id        UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  account_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  receipt_number   TEXT,          -- número del recibo (para importación futura desde DB central)
  due_date         DATE NOT NULL,
  amount           NUMERIC(12,2),
  status           TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'paid' | 'overdue' | 'cancelled'
  current_stage_id UUID,          -- FK a cobranza_stages; se agrega con ALTER después del seed
  paid_at          TIMESTAMPTZ,
  collected_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes            TEXT,
  created_by       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE policy_receipts ENABLE ROW LEVEL SECURITY;

-- RLS: mismo patrón que migration 020 (accounts por rol)
CREATE POLICY "policy_receipts: role read" ON policy_receipts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','ops'))
    OR (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'manager')
      AND account_id IN (
        SELECT id FROM accounts WHERE team_id = (SELECT team_id FROM profiles WHERE id = auth.uid())
      )
    )
    OR account_id IN (SELECT id FROM accounts WHERE assigned_to = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'readonly')
  );
CREATE POLICY "policy_receipts: agent+ insert" ON policy_receipts
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','ops','manager','agent'))
  );
CREATE POLICY "policy_receipts: update" ON policy_receipts
  FOR UPDATE USING (
    account_id IN (SELECT id FROM accounts WHERE assigned_to = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','ops','manager'))
  );

-- 3. Etapas de cobranza (admin-configurable)
CREATE TABLE IF NOT EXISTS cobranza_stages (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  description           TEXT,
  days_before           INT,            -- días antes del vencimiento para activar este aviso
  send_email            BOOLEAN NOT NULL DEFAULT false,
  send_whatsapp         BOOLEAN NOT NULL DEFAULT false,
  email_template_id     UUID REFERENCES collection_templates(id) ON DELETE SET NULL,
  whatsapp_template_id  UUID REFERENCES collection_templates(id) ON DELETE SET NULL,
  sort_order            INT NOT NULL DEFAULT 0,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE cobranza_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cobranza_stages: auth read"   ON cobranza_stages FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cobranza_stages: admin write" ON cobranza_stages FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','ops')));

-- Seed default stages
INSERT INTO cobranza_stages (name, description, days_before, sort_order) VALUES
  ('Primer aviso',        'Enviar primer recordatorio de pago',    15, 1),
  ('Recordatorio',        'Enviar recordatorio urgente de pago',    5, 2),
  ('Seguimiento directo', 'Contacto directo con el cliente',        2, 3),
  ('Cobrado',             'Registrar el pago recibido',             0, 4);

-- FK de recibos → etapas (después del seed para poder referenciar)
ALTER TABLE policy_receipts
  ADD CONSTRAINT policy_receipts_current_stage_fk
  FOREIGN KEY (current_stage_id) REFERENCES cobranza_stages(id) ON DELETE SET NULL;

-- 4. Log de eventos por recibo (audit trail)
CREATE TABLE IF NOT EXISTS receipt_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id  UUID NOT NULL REFERENCES policy_receipts(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,  -- 'notice_sent' | 'stage_advanced' | 'paid' | 'cancelled'
  stage_id    UUID REFERENCES cobranza_stages(id) ON DELETE SET NULL,
  actor_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes       TEXT,
  metadata    JSONB,           -- canal enviado, template usado, etc.
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE receipt_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "receipt_events: auth read" ON receipt_events
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "receipt_events: agent+ insert" ON receipt_events
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','ops','manager','agent'))
  );

-- 5. Vincular avisos enviados → recibo (link collection_send → receipt)
ALTER TABLE collection_sends
  ADD COLUMN IF NOT EXISTS receipt_id UUID REFERENCES policy_receipts(id) ON DELETE SET NULL;

-- 6. App settings para semáforo de cobranza
INSERT INTO app_settings (key, value) VALUES
  ('cobranza_semaforo_red',    '3'),
  ('cobranza_semaforo_yellow', '1')
ON CONFLICT (key) DO NOTHING;

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_policy_receipts_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER policy_receipts_updated_at
  BEFORE UPDATE ON policy_receipts FOR EACH ROW
  EXECUTE FUNCTION update_policy_receipts_updated_at();

-- Índices
CREATE INDEX IF NOT EXISTS idx_policy_receipts_due_date    ON policy_receipts(due_date);
CREATE INDEX IF NOT EXISTS idx_policy_receipts_status      ON policy_receipts(status);
CREATE INDEX IF NOT EXISTS idx_policy_receipts_account_id  ON policy_receipts(account_id);
CREATE INDEX IF NOT EXISTS idx_policy_receipts_policy_id   ON policy_receipts(policy_id);
CREATE INDEX IF NOT EXISTS idx_policy_receipts_stage       ON policy_receipts(current_stage_id);
CREATE INDEX IF NOT EXISTS idx_receipt_events_receipt_id   ON receipt_events(receipt_id);
