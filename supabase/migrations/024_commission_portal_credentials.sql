-- Migration 024: credenciales del portal de aseguradora por clave de agente

ALTER TABLE commission_codes
  ADD COLUMN IF NOT EXISTS portal_user     TEXT,   -- usuario del portal de la aseguradora
  ADD COLUMN IF NOT EXISTS portal_password TEXT;   -- contraseña del portal (solo admin/ops puede ver)
