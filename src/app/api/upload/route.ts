import { NextRequest, NextResponse } from 'next/server';
import { uploadToStorage } from '@/lib/supabase';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// Detectar si estamos en producción (Vercel)
const IS_PRODUCTION = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';

// Directorio local para desarrollo
const LOCAL_UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'notas-entrega');

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const referenceNumber = formData.get('referenceNumber') as string | null;

        if (!file) {
            return NextResponse.json(
                { success: false, error: 'No se recibió ningún archivo' },
                { status: 400 }
            );
        }

        // Validar tipo de archivo
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json(
                { success: false, error: 'Tipo de archivo no permitido. Use JPG, PNG, WebP o PDF.' },
                { status: 400 }
            );
        }

        // Validar tamaño (máximo 5MB)
        const maxSize = 5 * 1024 * 1024;
        if (file.size > maxSize) {
            return NextResponse.json(
                { success: false, error: 'El archivo excede el tamaño máximo de 5MB' },
                { status: 400 }
            );
        }

        // Generar nombre único
        const timestamp = Date.now();
        const extension = file.name.split('.').pop() || 'jpg';
        const sanitizedRef = referenceNumber?.replace(/[^a-zA-Z0-9]/g, '-') || 'sin-ref';
        const fileName = `nota-${sanitizedRef}-${timestamp}.${extension}`;

        let publicUrl: string;

        if (IS_PRODUCTION) {
            // =========================================
            // PRODUCCIÓN: Usar Supabase Storage
            // =========================================
            console.log('📦 Subiendo a Supabase Storage...');

            const result = await uploadToStorage(file, 'notas', fileName.replace(`.${extension}`, ''));

            if (!result.success || !result.url) {
                return NextResponse.json(
                    { success: false, error: result.error || 'Error al subir a Supabase' },
                    { status: 500 }
                );
            }

            publicUrl = result.url;

            console.log('✅ Archivo subido a Supabase:', {
                fileName,
                url: publicUrl,
                size: file.size,
            });

        } else {
            // =========================================
            // DESARROLLO: Guardar localmente
            // =========================================
            console.log('📁 Guardando localmente...');

            // Crear directorio si no existe
            if (!existsSync(LOCAL_UPLOAD_DIR)) {
                await mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
            }

            const filePath = path.join(LOCAL_UPLOAD_DIR, fileName);

            // Guardar archivo
            const bytes = await file.arrayBuffer();
            const buffer = Buffer.from(bytes);
            await writeFile(filePath, buffer);

            publicUrl = `/uploads/notas-entrega/${fileName}`;

            console.log('✅ Archivo guardado localmente:', {
                fileName,
                path: publicUrl,
                size: file.size,
            });
        }

        return NextResponse.json({
            success: true,
            message: 'Archivo subido correctamente',
            data: {
                fileName,
                url: publicUrl,
                size: file.size,
                type: file.type,
                storage: IS_PRODUCTION ? 'supabase' : 'local',
            },
        });

    } catch (error) {
        console.error('❌ Error al subir archivo:', error);
        return NextResponse.json(
            { success: false, error: 'Error interno al procesar el archivo' },
            { status: 500 }
        );
    }
}

// Configuración para archivos grandes (Next.js 13+)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
