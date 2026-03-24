'use server';

import prisma from '@/server/db';
import { getSession } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export interface AreaItem {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  stockCount: number;
}

// ============================================================================
// LISTAR ÁREAS / ALMACENES
// ============================================================================

export async function getAreasAction(): Promise<{ success: boolean; data?: AreaItem[]; message?: string }> {
  try {
    const session = await getSession();
    if (!session) return { success: false, message: 'No autorizado' };

    const areas = await prisma.area.findMany({
      where: { deletedAt: null },
      include: { _count: { select: { inventoryLocations: true } } },
      orderBy: { name: 'asc' },
    });

    return {
      success: true,
      data: areas.map(a => ({
        id: a.id,
        name: a.name,
        description: a.description,
        isActive: a.isActive,
        stockCount: a._count.inventoryLocations,
      })),
    };
  } catch (error) {
    console.error('[areas] getAreasAction error:', error);
    return { success: false, message: 'Error al cargar almacenes' };
  }
}

// ============================================================================
// CREAR ÁREA
// ============================================================================

export async function createAreaAction(
  name: string,
  description?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const session = await getSession();
    if (!session) return { success: false, message: 'No autorizado' };
    if (!['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER'].includes(session.role)) {
      return { success: false, message: 'Sin permisos para crear almacenes' };
    }
    if (!name?.trim()) return { success: false, message: 'El nombre es obligatorio' };

    await prisma.area.create({
      data: { name: name.trim().toUpperCase(), description: description?.trim() || null },
    });

    revalidatePath('/dashboard/almacenes');
    return { success: true, message: 'Almacén creado correctamente' };
  } catch (error: any) {
    console.error('[areas] createAreaAction error:', error);
    return { success: false, message: 'Error al crear almacén' };
  }
}

// ============================================================================
// ACTIVAR / DESACTIVAR ÁREA
// ============================================================================

export async function toggleAreaStatusAction(
  id: string,
  isActive: boolean
): Promise<{ success: boolean; message: string }> {
  try {
    const session = await getSession();
    if (!session) return { success: false, message: 'No autorizado' };
    if (!['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER'].includes(session.role)) {
      return { success: false, message: 'Sin permisos' };
    }

    await prisma.area.update({ where: { id }, data: { isActive } });

    revalidatePath('/dashboard/almacenes');
    return { success: true, message: isActive ? 'Almacén activado' : 'Almacén desactivado' };
  } catch (error) {
    console.error('[areas] toggleAreaStatusAction error:', error);
    return { success: false, message: 'Error al actualizar estado' };
  }
}

// ============================================================================
// DETECTAR DUPLICADOS (nombres muy similares)
// ============================================================================

export async function findDuplicateAreasAction(): Promise<{ success: boolean; groups?: string[][]; message?: string }> {
  try {
    const session = await getSession();
    if (!session) return { success: false, message: 'No autorizado' };

    const areas = await prisma.area.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    });

    // Normalizar nombres para comparar
    const normalize = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '').trim();

    const grouped = new Map<string, string[]>();
    for (const area of areas) {
      const key = normalize(area.name);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(area.name);
    }

    const duplicates = Array.from(grouped.values()).filter(g => g.length > 1);

    return { success: true, groups: duplicates };
  } catch (error) {
    console.error('[areas] findDuplicateAreasAction error:', error);
    return { success: false, message: 'Error al buscar duplicados' };
  }
}
