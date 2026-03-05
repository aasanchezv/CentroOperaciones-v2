-- Migration 018: URL de póliza
-- Añade campo policy_url a policies para almacenar el link al documento

ALTER TABLE policies
  ADD COLUMN IF NOT EXISTS policy_url TEXT;
