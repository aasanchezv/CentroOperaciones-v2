-- Migration 034: Ampliar unique constraint de sync_field_mappings
-- El constraint original (entity_type, external_field) solo permite un local_field
-- por campo externo. Necesitamos mapear el mismo campo externo a múltiples locales
-- (ej. Contratante → external_id Y Contratante → name).

ALTER TABLE sync_field_mappings
  DROP CONSTRAINT IF EXISTS sync_field_mappings_entity_type_external_field_key;

ALTER TABLE sync_field_mappings
  ADD CONSTRAINT sync_field_mappings_entity_external_local_key
  UNIQUE (entity_type, external_field, local_field);
