-- ============================================================
-- MIGRATION 008 — Contact Center (world-class omnichannel)
-- ============================================================

-- ── Tabla principal: conversaciones ───────────────────────────

CREATE TABLE IF NOT EXISTS conversations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Vínculos CRM
  contact_id          UUID REFERENCES contacts(id) ON DELETE SET NULL,
  account_id          UUID REFERENCES accounts(id) ON DELETE CASCADE,

  -- Canal y estado
  channel             TEXT NOT NULL CHECK (channel IN ('whatsapp','email','phone')),
  status              TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','assigned','resolved')),

  -- Prioridad y categorización
  priority            TEXT NOT NULL DEFAULT 'normal'
                        CHECK (priority IN ('low','normal','high','urgent')),
  tags                TEXT[] NOT NULL DEFAULT '{}',

  -- Para threading de email / WA
  subject             TEXT,
  external_thread_id  TEXT,    -- Message-ID de email o thread_id de WA

  -- Asignación
  assigned_to         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  team_id             UUID REFERENCES teams(id) ON DELETE SET NULL,

  -- SLA / tiempos
  first_response_at   TIMESTAMPTZ,         -- primera respuesta del agente
  resolved_at         TIMESTAMPTZ,         -- cuándo se resolvió
  waiting_since       TIMESTAMPTZ DEFAULT now(), -- desde cuándo espera el cliente
  last_message_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- UI
  unread_count        INT NOT NULL DEFAULT 0,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Tabla de mensajes ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cc_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,

  -- 'inbound' | 'outbound' | 'note' (nota interna, nunca sale al cliente)
  direction         TEXT NOT NULL CHECK (direction IN ('inbound','outbound','note')),
  channel           TEXT NOT NULL CHECK (channel IN ('whatsapp','email','phone')),

  body              TEXT,
  subject           TEXT,              -- email
  sender_name       TEXT,
  sender_phone      TEXT,
  sender_email      TEXT,
  sent_by           UUID REFERENCES profiles(id) ON DELETE SET NULL,
  external_id       TEXT,              -- WA message ID / email ID / Twilio SID
  duration_seconds  INT,               -- llamadas
  status            TEXT NOT NULL DEFAULT 'delivered',

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Tabla de eventos de auditoría ─────────────────────────────
-- Quién hizo qué y cuándo en cada conversación

CREATE TABLE IF NOT EXISTS conversation_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  event_type        TEXT NOT NULL,
  -- 'assigned' | 'unassigned' | 'resolved' | 'reopened'
  -- | 'priority_changed' | 'tagged' | 'transferred' | 'note_added'
  actor_id          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  metadata          JSONB,              -- {from, to, tags, etc.}
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── updated_at helper (idempotente) ──────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── updated_at triggers ───────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_conversations_updated_at'
  ) THEN
    CREATE TRIGGER set_conversations_updated_at
      BEFORE UPDATE ON conversations
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ── Habilitar Realtime ────────────────────────────────────────

ALTER TABLE conversations       REPLICA IDENTITY FULL;
ALTER TABLE cc_messages         REPLICA IDENTITY FULL;
ALTER TABLE conversation_events REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'cc_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cc_messages;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversation_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversation_events;
  END IF;
END $$;

-- ── RLS ───────────────────────────────────────────────────────

ALTER TABLE conversations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE cc_messages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_events ENABLE ROW LEVEL SECURITY;

-- Helper: es admin/ops/manager
CREATE OR REPLACE FUNCTION is_ops_or_above(uid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = uid AND role IN ('admin','ops','manager')
  )
$$;

-- conversations
DROP POLICY IF EXISTS "cc_conversations_select" ON conversations;
CREATE POLICY "cc_conversations_select" ON conversations FOR SELECT
  USING (
    is_ops_or_above(auth.uid())
    OR assigned_to = auth.uid()
    OR assigned_to IS NULL
  );

DROP POLICY IF EXISTS "cc_conversations_insert" ON conversations;
CREATE POLICY "cc_conversations_insert" ON conversations FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'readonly')
  );

DROP POLICY IF EXISTS "cc_conversations_update" ON conversations;
CREATE POLICY "cc_conversations_update" ON conversations FOR UPDATE
  USING (
    is_ops_or_above(auth.uid())
    OR assigned_to = auth.uid()
    OR assigned_to IS NULL
  );

-- cc_messages (solo outbound/note; inbound se inserta vía service_role)
DROP POLICY IF EXISTS "cc_messages_select" ON cc_messages;
CREATE POLICY "cc_messages_select" ON cc_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = cc_messages.conversation_id
        AND (
          is_ops_or_above(auth.uid())
          OR c.assigned_to = auth.uid()
          OR c.assigned_to IS NULL
        )
    )
  );

DROP POLICY IF EXISTS "cc_messages_insert" ON cc_messages;
CREATE POLICY "cc_messages_insert" ON cc_messages FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'readonly')
  );

-- conversation_events
DROP POLICY IF EXISTS "cc_events_select" ON conversation_events;
CREATE POLICY "cc_events_select" ON conversation_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_events.conversation_id
        AND (
          is_ops_or_above(auth.uid())
          OR c.assigned_to = auth.uid()
          OR c.assigned_to IS NULL
        )
    )
  );

DROP POLICY IF EXISTS "cc_events_insert" ON conversation_events;
CREATE POLICY "cc_events_insert" ON conversation_events FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'readonly')
  );

-- ── Índices ───────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_conversations_contact    ON conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_account    ON conversations(account_id);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned   ON conversations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_conversations_status     ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_priority   ON conversations(priority);
CREATE INDEX IF NOT EXISTS idx_conversations_last_msg   ON conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_waiting    ON conversations(waiting_since ASC) WHERE status <> 'resolved';
CREATE INDEX IF NOT EXISTS idx_cc_messages_conv         ON cc_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_cc_messages_created      ON cc_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_events_conv         ON conversation_events(conversation_id);
