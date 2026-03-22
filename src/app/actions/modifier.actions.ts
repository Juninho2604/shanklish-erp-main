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

// ============================================================================
// CRUD GRUPOS
// ============================================================================

export async function createModifierGroupAction(data: {
    name: string;
    description?: string;
    isRequired: boolean;
    minSelections: number;
    maxSelections: number;
}) {
    try {
        const maxSort = await prisma.menuModifierGroup.aggregate({ _max: { sortOrder: true } });
        const group = await prisma.menuModifierGroup.create({
            data: {
                name: data.name.trim(),
                description: data.description?.trim() || null,
                isRequired: data.isRequired,
                minSelections: data.minSelections,
                maxSelections: data.maxSelections,
                sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
            },
            include: {
                modifiers: { include: { linkedMenuItem: { select: { id: true, name: true } } } },
                menuItems: { include: { menuItem: { select: { id: true, name: true } } } }
            }
        });
        revalidatePath('/dashboard/menu/modificadores');
        return { success: true, data: group };
    } catch (error) {
        console.error(error);
        return { success: false, message: 'Error creando grupo' };
    }
}

export async function updateModifierGroupAction(id: string, data: {
    name?: string;
    description?: string | null;
    isRequired?: boolean;
    minSelections?: number;
    maxSelections?: number;
}) {
    try {
        await prisma.menuModifierGroup.update({
            where: { id },
            data: {
                ...(data.name !== undefined && { name: data.name.trim() }),
                ...(data.description !== undefined && { description: data.description }),
                ...(data.isRequired !== undefined && { isRequired: data.isRequired }),
                ...(data.minSelections !== undefined && { minSelections: data.minSelections }),
                ...(data.maxSelections !== undefined && { maxSelections: data.maxSelections }),
            }
        });
        revalidatePath('/dashboard/menu/modificadores');
        return { success: true };
    } catch (error) {
        return { success: false, message: 'Error actualizando grupo' };
    }
}

export async function deleteModifierGroupAction(id: string) {
    try {
        await prisma.menuModifierGroup.update({ where: { id }, data: { isActive: false } });
        revalidatePath('/dashboard/menu/modificadores');
        return { success: true };
    } catch (error) {
        return { success: false, message: 'Error eliminando grupo' };
    }
}

// ============================================================================
// CRUD MODIFICADORES
// ============================================================================

export async function addModifierAction(data: {
    groupId: string;
    name: string;
    priceAdjustment: number;
    linkedMenuItemId?: string | null;
}) {
    try {
        const maxSort = await prisma.menuModifier.aggregate({
            where: { groupId: data.groupId },
            _max: { sortOrder: true }
        });
        const modifier = await prisma.menuModifier.create({
            data: {
                groupId: data.groupId,
                name: data.name.trim(),
                priceAdjustment: data.priceAdjustment,
                linkedMenuItemId: data.linkedMenuItemId || null,
                sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
            },
            include: { linkedMenuItem: { select: { id: true, name: true } } }
        });
        revalidatePath('/dashboard/menu/modificadores');
        return { success: true, data: modifier };
    } catch (error) {
        console.error(error);
        return { success: false, message: 'Error creando modificador' };
    }
}

export async function updateModifierNamePriceAction(id: string, name: string, priceAdjustment: number) {
    try {
        await prisma.menuModifier.update({
            where: { id },
            data: { name: name.trim(), priceAdjustment }
        });
        revalidatePath('/dashboard/menu/modificadores');
        return { success: true };
    } catch (error) {
        return { success: false, message: 'Error actualizando modificador' };
    }
}

export async function deleteModifierAction(id: string) {
    try {
        await prisma.menuModifier.delete({ where: { id } });
        revalidatePath('/dashboard/menu/modificadores');
        return { success: true };
    } catch (error) {
        return { success: false, message: 'Error eliminando modificador' };
    }
}

// ============================================================================
// VINCULAR GRUPO A MENU ITEM (para que aparezca en POS)
// ============================================================================

export async function linkGroupToMenuItemAction(modifierGroupId: string, menuItemId: string) {
    try {
        await prisma.menuItemModifierGroup.upsert({
            where: { menuItemId_modifierGroupId: { menuItemId, modifierGroupId } },
            create: { menuItemId, modifierGroupId },
            update: {}
        });
        revalidatePath('/dashboard/menu/modificadores');
        return { success: true };
    } catch (error) {
        console.error(error);
        return { success: false, message: 'Error vinculando grupo a plato' };
    }
}

export async function unlinkGroupFromMenuItemAction(modifierGroupId: string, menuItemId: string) {
    try {
        await prisma.menuItemModifierGroup.delete({
            where: { menuItemId_modifierGroupId: { menuItemId, modifierGroupId } }
        });
        revalidatePath('/dashboard/menu/modificadores');
        return { success: true };
    } catch (error) {
        return { success: false, message: 'Error desvinculando grupo de plato' };
    }
}
