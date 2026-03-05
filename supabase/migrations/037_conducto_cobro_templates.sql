-- Migration 037: conducto_cobro_filter en plantillas + plantillas alternativas para domiciliado en stages

-- Plantillas: filtro por conducto de cobro
-- NULL = todos los conductos (por defecto)
-- 'domiciliado' = solo para pólizas con conducto domiciliado
-- 'no_domiciliado' = solo para pólizas sin conducto domiciliado
ALTER TABLE collection_templates
  ADD COLUMN IF NOT EXISTS conducto_cobro_filter TEXT;

-- Stages de cobranza: plantilla alternativa para cuando el conducto es domiciliado
ALTER TABLE cobranza_stages
  ADD COLUMN IF NOT EXISTS email_template_domiciliado_id    UUID REFERENCES collection_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_template_domiciliado_id UUID REFERENCES collection_templates(id) ON DELETE SET NULL;

COMMENT ON COLUMN collection_templates.conducto_cobro_filter IS
  'NULL = todos, ''domiciliado'' = solo domiciliado, ''no_domiciliado'' = solo no domiciliado';

COMMENT ON COLUMN cobranza_stages.email_template_domiciliado_id IS
  'Plantilla de correo a usar cuando el conducto de cobro es domiciliado (override de email_template_id)';

COMMENT ON COLUMN cobranza_stages.whatsapp_template_domiciliado_id IS
  'Plantilla de WhatsApp a usar cuando el conducto de cobro es domiciliado (override de whatsapp_template_id)';
