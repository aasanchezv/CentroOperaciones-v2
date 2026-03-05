-- ============================================================
-- MIGRATION 042 — Portal como 4to canal de comunicación
-- ============================================================
-- Agrega 'portal' a los constraints CHECK de channel en
-- conversations y cc_messages para soportar el chat del portal.

-- ── conversations ──────────────────────────────────────────────

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_channel_check;
ALTER TABLE conversations
  ADD CONSTRAINT conversations_channel_check
  CHECK (channel IN ('whatsapp', 'email', 'phone', 'portal'));

-- ── cc_messages ────────────────────────────────────────────────

ALTER TABLE cc_messages DROP CONSTRAINT IF EXISTS cc_messages_channel_check;
ALTER TABLE cc_messages
  ADD CONSTRAINT cc_messages_channel_check
  CHECK (channel IN ('whatsapp', 'email', 'phone', 'portal'));
