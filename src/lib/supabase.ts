import { createClient } from '@supabase/supabase-js';

// Cliente para uso en el cliente (browser) - Clave pública
export const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Cliente para uso en el servidor - Clave privada con permisos elevados
export const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    }
);

// Nombre del bucket para notas de entrega
export const NOTAS_BUCKET = 'notas-entrega';

// Tipos para Storage
export interface UploadResult {
    success: boolean;
    url?: string;
    path?: string;
    error?: string;
}

/**
 * Sube un archivo al Storage de Supabase
 */
export async function uploadToStorage(
    file: File,
    folder: string = 'notas-entrega',
    customName?: string
): Promise<UploadResult> {
    try {
        // Generar nombre único
        const timestamp = Date.now();
        const extension = file.name.split('.').pop() || 'jpg';
        const fileName = customName
            ? `${customName}-${timestamp}.${extension}`
            : `${timestamp}.${extension}`;
        const filePath = `${folder}/${fileName}`;

        // Subir archivo
        const { data, error } = await supabaseAdmin.storage
            .from(NOTAS_BUCKET)
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false,
            });

        if (error) {
            console.error('Error uploading to Supabase:', error);
            return { success: false, error: error.message };
        }

        // Obtener URL pública
        const { data: urlData } = supabaseAdmin.storage
            .from(NOTAS_BUCKET)
            .getPublicUrl(data.path);

        return {
            success: true,
            url: urlData.publicUrl,
            path: data.path,
        };
    } catch (error) {
        console.error('Error in uploadToStorage:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error desconocido',
        };
    }
}

/**
 * Elimina un archivo del Storage
 */
export async function deleteFromStorage(path: string): Promise<boolean> {
    try {
        const { error } = await supabaseAdmin.storage
            .from(NOTAS_BUCKET)
            .remove([path]);

        if (error) {
            console.error('Error deleting from Supabase:', error);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error in deleteFromStorage:', error);
        return false;
    }
}

/**
 * Obtiene URL firmada para archivos privados (si el bucket no es público)
 */
export async function getSignedUrl(
    path: string,
    expiresIn: number = 3600
): Promise<string | null> {
    try {
        const { data, error } = await supabaseAdmin.storage
            .from(NOTAS_BUCKET)
            .createSignedUrl(path, expiresIn);

        if (error) {
            console.error('Error getting signed URL:', error);
            return null;
        }

        return data.signedUrl;
    } catch (error) {
        console.error('Error in getSignedUrl:', error);
        return null;
    }
}
