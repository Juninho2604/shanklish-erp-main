'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/server/db';

/**
 * Obtiene todos los grupos de modificadores con sus modificadores
 * y el MenuItem vinculado para descargo de inventario (si aplica)
 */
export async function getModifierGroupsWithItemsAction() {
    try {
        const groups = await prisma.menuModifierGroup.findMany({
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            include: {
                modifiers: {
                    orderBy: { sortOrder: 'asc' },
                    include: {
                        linkedMenuItem: {
                            select: { id: true, name: true }
                        }
                    }
                },
                menuItems: {
                    include: {
                        menuItem: { select: { id: true, name: true } }
                    }
                }
            }
        });
        return { success: true, data: groups };
    } catch (error) {
        console.error('Error fetching modifier groups:', error);
        return { success: false, message: 'Error cargando grupos de modificadores' };
    }
}

/**
 * Vincula (o desvincula) un modificador a un MenuItem para descargo de inventario.
 * @param modifierId - ID del MenuModifier
 * @param menuItemId - ID del MenuItem a vincular, o null para desvincular
 */
export async function linkModifierToMenuItemAction(modifierId: string, menuItemId: string | null) {
    try {
        await prisma.menuModifier.update({
            where: { id: modifierId },
            data: { linkedMenuItemId: menuItemId }
        });
        revalidatePath('/dashboard/menu/modificadores');
        return { success: true };
    } catch (error) {
        console.error('Error linking modifier to menu item:', error);
        return { success: false, message: 'Error al vincular modificador' };
    }
}

/**
 * Obtiene todos los MenuItems activos para el selector de vinculación
 */
export async function getMenuItemsForModifierLinkAction() {
    try {
        const items = await prisma.menuItem.findMany({
            where: { isActive: true },
            select: {
                id: true,
                name: true,
                recipeId: true,
                category: { select: { name: true } }
            },
            orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }]
        });
        return { success: true, data: items };
    } catch (error) {
        return { success: false, message: 'Error cargando items del menú' };
    }
}

/**
 * Actualiza disponibilidad de un modificador
 */
export async function toggleModifierAvailabilityAction(modifierId: string, isAvailable: boolean) {
    try {
        await prisma.menuModifier.update({
            where: { id: modifierId },
            data: { isAvailable }
        });
        revalidatePath('/dashboard/menu/modificadores');
        return { success: true };
    } catch (error) {
        return { success: false, message: 'Error actualizando modificador' };
    }
}
