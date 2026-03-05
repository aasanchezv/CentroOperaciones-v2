-- Migration 041: Portal Cliente
-- Añade token de acceso al portal del cliente por cuenta

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS portal_token            UUID    UNIQUE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS portal_enabled          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_last_accessed_at TIMESTAMPTZ DEFAULT NULL;

-- Índice único parcial para búsqueda rápida por token
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_portal_token
  ON accounts(portal_token) WHERE portal_token IS NOT NULL;
