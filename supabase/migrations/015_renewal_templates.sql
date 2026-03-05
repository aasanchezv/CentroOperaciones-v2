-- Migration 015: Plantillas de renovación
-- Añade tipo a collection_templates y FKs de plantilla a renewal_stages

-- 1. Añadir columna type a collection_templates (default 'cobranza' para registros existentes)
ALTER TABLE collection_templates
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'cobranza';

-- 2. Añadir FKs de plantilla a renewal_stages
ALTER TABLE renewal_stages
  ADD COLUMN IF NOT EXISTS email_template_id    UUID REFERENCES collection_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_template_id UUID REFERENCES collection_templates(id) ON DELETE SET NULL;
