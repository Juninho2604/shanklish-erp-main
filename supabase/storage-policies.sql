-- =============================================================================
-- SUPABASE STORAGE POLICIES - Shanklish Caracas ERP
-- =============================================================================
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- Esto configura las políticas de acceso al bucket de notas de entrega
-- =============================================================================

-- 1. Crear el bucket si no existe (normalmente se crea desde UI)
-- INSERT INTO storage.buckets (id, name, public) 
-- VALUES ('notas-entrega', 'notas-entrega', true)
-- ON CONFLICT DO NOTHING;

-- 2. Política: Cualquiera puede VER archivos (bucket público)
CREATE POLICY "Acceso público de lectura"
ON storage.objects FOR SELECT
USING (bucket_id = 'notas-entrega');

-- 3. Política: Solo usuarios autenticados pueden SUBIR
CREATE POLICY "Usuarios autenticados pueden subir"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'notas-entrega' 
  AND auth.role() = 'authenticated'
);

-- 4. Política: Solo el propietario o admin puede ELIMINAR
CREATE POLICY "Solo propietario o admin puede eliminar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'notas-entrega' 
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR auth.jwt() ->> 'role' = 'service_role'
  )
);

-- 5. Política alternativa: Backend con service_role puede hacer todo
-- (Esto ya está habilitado por defecto con service_role key)

-- =============================================================================
-- NOTAS:
-- - El bucket 'notas-entrega' debe estar marcado como PÚBLICO desde la UI
-- - Las imágenes subidas son accesibles sin autenticación (para el Auditor)
-- - Solo el backend (service_role) puede subir/eliminar
-- =============================================================================
