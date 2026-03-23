'use server';

import prisma from '@/server/db';
import { getSession } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { MODULE_REGISTRY } from '@/lib/constants/modules-registry';

const ENABLED_MODULES_KEY = 'enabled_modules';

/**
 * Lee los módulos habilitados desde la BD.
 * Si no existe el registro, devuelve los módulos con enabledByDefault=true.
 * Llamar solo desde Server Components o Server Actions.
 */
export async function getEnabledModulesFromDB(): Promise<string[]> {
    try {
        const config = await prisma.systemConfig.findUnique({
            where: { key: ENABLED_MODULES_KEY },
        });

        if (config) {
            const parsed = JSON.parse(config.value);
            if (Array.isArray(parsed)) return parsed as string[];
        }
    } catch {
        // Si falla la BD (primera vez, tabla vacía, etc.), usar defaults
    }

    // Fallback: leer de env var (compatibilidad hacia atrás) o defaults
    const envModules = process.env.NEXT_PUBLIC_ENABLED_MODULES;
    if (envModules) {
        return envModules.split(',').map(m => m.trim()).filter(Boolean);
    }

    return MODULE_REGISTRY.filter(m => m.enabledByDefault).map(m => m.id);
}

/**
 * Guarda los módulos habilitados en la BD.
 * Solo OWNER puede ejecutar esta acción.
 */
export async function saveEnabledModules(moduleIds: string[]): Promise<{ ok: boolean; error?: string }> {
    const session = await getSession();
    if (!session) return { ok: false, error: 'No autorizado' };
    if (session.role !== 'OWNER') return { ok: false, error: 'Solo el OWNER puede cambiar los módulos' };

    // Validar que todos los IDs son módulos conocidos
    const validIds = new Set(MODULE_REGISTRY.map(m => m.id));
    const filtered = moduleIds.filter(id => validIds.has(id));

    // Siempre incluir module_config para que el OWNER no se quede sin acceso
    if (!filtered.includes('module_config')) {
        filtered.push('module_config');
    }

    await prisma.systemConfig.upsert({
        where: { key: ENABLED_MODULES_KEY },
        create: {
            key: ENABLED_MODULES_KEY,
            value: JSON.stringify(filtered),
            updatedBy: session.id,
        },
        update: {
            value: JSON.stringify(filtered),
            updatedBy: session.id,
        },
    });

    // Revalidar todo el dashboard para que el Sidebar refleje los cambios
    revalidatePath('/dashboard', 'layout');

    return { ok: true };
}
