'use server';

import prisma from '@/server/db';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';

// ============================================================================
// TIPOS
// ============================================================================

export interface MenuItemData {
    name: string;
    description?: string;
    price: number;
    categoryId: string;
    sku?: string;
    isActive?: boolean;
}

export interface ActionResult {
    success: boolean;
    message: string;
    data?: any;
}

// ============================================================================
// LECTURA
// ============================================================================

export async function getFullMenuAction() {
    try {
        const categories = await prisma.menuCategory.findMany({
            include: {
                items: {
                    orderBy: { name: 'asc' }
                }
            },
            orderBy: { sortOrder: 'asc' }
        });
        return { success: true, data: categories };
    } catch (error) {
        console.error('Error fetching menu:', error);
        return { success: false, message: 'Error al cargar el menú' };
    }
}

export async function getCategoriesAction() {
    try {
        const categories = await prisma.menuCategory.findMany({
            orderBy: { sortOrder: 'asc' }
        });
        return { success: true, data: categories };
    } catch (error) {
        return { success: false, message: 'Error al cargar categorías' };
    }
}

// ============================================================================
// ESCRITURA
// ============================================================================

export async function createMenuItemAction(data: MenuItemData): Promise<ActionResult> {
    try {
        const session = await getSession();

        // Generar SKU automático si no viene
        let sku = data.sku;
        if (!sku) {
            const prefix = data.name.substring(0, 3).toUpperCase();
            const count = await prisma.menuItem.count();
            sku = `${prefix}-${String(count + 1).padStart(3, '0')}`;
        }

        const newItem = await prisma.menuItem.create({
            data: {
                name: data.name,
                description: data.description,
                price: parseFloat(data.price.toString()),
                categoryId: data.categoryId,
                sku: sku,
                isActive: data.isActive ?? true,
            }
        });

        // AUTO-CREAR STUB DE RECETA vinculado al item del menú
        try {
            const invSku = `FG-${data.name.substring(0, 5).toUpperCase().replace(/\s/g, '')}-${Date.now().toString().slice(-4)}`;
            const invItem = await prisma.inventoryItem.create({
                data: {
                    name: data.name,
                    sku: invSku,
                    type: 'FINISHED_GOOD',
                    baseUnit: 'PORCION',
                    isActive: true,
                    description: data.description,
                    category: 'MENU',
                }
            });

            const recipe = await prisma.recipe.create({
                data: {
                    name: data.name,
                    description: `Receta de ${data.name} - completar ingredientes`,
                    outputItemId: invItem.id,
                    outputQuantity: 1,
                    outputUnit: 'PORCION',
                    yieldPercentage: 100,
                    isApproved: true,
                    createdById: session?.id ?? null,
                }
            });

            await prisma.menuItem.update({
                where: { id: newItem.id },
                data: { recipeId: recipe.id }
            });
        } catch (recipeErr) {
            // No fallamos la creación del item si la receta falla
            console.warn('No se pudo auto-crear receta stub:', recipeErr);
        }

        revalidatePath('/dashboard/menu');
        revalidatePath('/dashboard/pos/restaurante');
        revalidatePath('/dashboard/pos/delivery');
        revalidatePath('/dashboard/recetas');

        return { success: true, message: 'Producto creado con receta vacía lista para completar', data: newItem };
    } catch (error) {
        console.error('Error creating item:', error);
        return { success: false, message: 'Error al crear el producto' };
    }
}

export async function updateMenuItemPriceAction(id: string, newPrice: number): Promise<ActionResult> {
    try {
        await prisma.menuItem.update({
            where: { id },
            data: { price: parseFloat(newPrice.toString()) }
        });

        revalidatePath('/dashboard/menu');
        revalidatePath('/dashboard/pos/restaurante');
        revalidatePath('/dashboard/pos/delivery');

        return { success: true, message: 'Precio actualizado' };
    } catch (error) {
        return { success: false, message: 'Error al actualizar precio' };
    }
}

export async function toggleMenuItemStatusAction(id: string, isActive: boolean): Promise<ActionResult> {
    try {
        await prisma.menuItem.update({
            where: { id },
            data: { isActive }
        });

        revalidatePath('/dashboard/menu');
        revalidatePath('/dashboard/pos/restaurante');

        return { success: true, message: isActive ? 'Producto activado' : 'Producto desactivado' };
    } catch (error) {
        return { success: false, message: 'Error al cambiar estado' };
    }
}

export async function updateMenuItemNameAction(id: string, newName: string): Promise<ActionResult> {
    try {
        if (!newName.trim()) return { success: false, message: 'El nombre no puede estar vacío' };

        await prisma.menuItem.update({
            where: { id },
            data: { name: newName.trim() }
        });

        revalidatePath('/dashboard/menu');
        revalidatePath('/dashboard/pos/restaurante');
        revalidatePath('/dashboard/pos/delivery');
        revalidatePath('/dashboard/ventas/cargar');

        return { success: true, message: 'Nombre actualizado' };
    } catch (error) {
        return { success: false, message: 'Error al actualizar nombre' };
    }
}

// ============================================================================
// RECETAS VINCULADAS AL MENÚ
// ============================================================================

/**
 * Retorna los items del menú que NO tienen receta asignada
 */
export async function getMenuItemsWithoutRecipeAction() {
    try {
        const items = await prisma.menuItem.findMany({
            where: {
                isActive: true,
                recipeId: null,
            },
            include: {
                category: { select: { name: true } }
            },
            orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }]
        });
        return { success: true, data: items };
    } catch (error) {
        console.error('Error fetching items without recipe:', error);
        return { success: false, message: 'Error al cargar items sin receta', data: [] };
    }
}

/**
 * Vincula manualmente un MenuItem a una Receta existente
 */
export async function linkMenuItemToRecipeAction(menuItemId: string, recipeId: string): Promise<ActionResult> {
    try {
        await prisma.menuItem.update({
            where: { id: menuItemId },
            data: { recipeId }
        });
        revalidatePath('/dashboard/menu');
        revalidatePath('/dashboard/recetas');
        return { success: true, message: 'Receta vinculada exitosamente' };
    } catch (error) {
        return { success: false, message: 'Error al vincular receta' };
    }
}

/**
 * Auto-crea stub de receta para un MenuItem existente que no tiene receta
 */
export async function createRecipeStubForMenuItemAction(menuItemId: string): Promise<ActionResult> {
    try {
        const session = await getSession();
        const menuItem = await prisma.menuItem.findUnique({ where: { id: menuItemId } });
        if (!menuItem) return { success: false, message: 'Item no encontrado' };
        if (menuItem.recipeId) return { success: false, message: 'El item ya tiene receta' };

        const invSku = `FG-${menuItem.name.substring(0, 5).toUpperCase().replace(/\s/g, '')}-${Date.now().toString().slice(-4)}`;
        const invItem = await prisma.inventoryItem.create({
            data: {
                name: menuItem.name,
                sku: invSku,
                type: 'FINISHED_GOOD',
                baseUnit: 'PORCION',
                isActive: true,
                category: 'MENU',
            }
        });

        const recipe = await prisma.recipe.create({
            data: {
                name: menuItem.name,
                description: `Receta de ${menuItem.name} - completar ingredientes`,
                outputItemId: invItem.id,
                outputQuantity: 1,
                outputUnit: 'PORCION',
                yieldPercentage: 100,
                isApproved: true,
                createdById: session?.id ?? null,
            }
        });

        await prisma.menuItem.update({
            where: { id: menuItemId },
            data: { recipeId: recipe.id }
        });

        revalidatePath('/dashboard/menu');
        revalidatePath('/dashboard/recetas');
        return { success: true, message: 'Receta stub creada exitosamente', data: { recipeId: recipe.id } };
    } catch (error) {
        console.error('Error creating recipe stub:', error);
        return { success: false, message: 'Error al crear receta stub' };
    }
}

// ============================================================================
// UTILIDAD: SEED CATEGORÍAS (Si está vacío)
// ============================================================================

export async function ensureBasicCategoriesAction() {
    const count = await prisma.menuCategory.count();
    if (count === 0) {
        const basicCats = [
            { name: 'Shawarmas', sortOrder: 1, icon: '🥙' },
            { name: 'Platos Mixtos', sortOrder: 2, icon: '🍛' },
            { name: 'Raciones', sortOrder: 3, icon: '🥟' },
            { name: 'Ensaladas', sortOrder: 4, icon: '🥗' },
            { name: 'Bebidas', sortOrder: 5, icon: '🥤' }
        ];

        for (const cat of basicCats) {
            await prisma.menuCategory.create({ data: cat });
        }
        return { success: true, message: 'Categorías base creadas' };
    }
    return { success: true, message: 'Categorías ya existen' };
}
