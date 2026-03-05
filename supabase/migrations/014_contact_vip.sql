-- Migration 014: VIP flag on contacts
-- Adds is_vip boolean and vip_notes text to contacts table

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS is_vip    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vip_notes TEXT;
