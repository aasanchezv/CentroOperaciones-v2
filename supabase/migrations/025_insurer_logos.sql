-- Migration 025: logo de aseguradora

ALTER TABLE insurers
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Bucket público para logos de aseguradoras (máx 2 MB, solo imágenes)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'insurer-logos', 'insurer-logos', true, 2097152,
  ARRAY['image/png','image/jpeg','image/webp','image/svg+xml']
) ON CONFLICT (id) DO NOTHING;

-- Cualquier autenticado puede leer (es público)
CREATE POLICY "insurer_logos: public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'insurer-logos');

-- Solo admin/ops pueden subir
CREATE POLICY "insurer_logos: admin upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'insurer-logos'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','ops'))
  );

-- Solo admin/ops pueden borrar
CREATE POLICY "insurer_logos: admin delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'insurer-logos'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','ops'))
  );
