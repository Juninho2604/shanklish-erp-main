'use server';

import prisma from '@/server/db';
import { getSession } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

// ============================================================================
// TIPOS
// ============================================================================

export interface CreateRawMaterialInput {
  name: string;
  sku: string;
  type: 'RAW_MATERIAL' | 'SUB_RECIPE';
  category: string;
  baseUnit: string;
  purchaseUnit?: string;
  conversionRate?: number;
  minimumStock?: number;
  reorderPoint?: number;
  description?: string;
  isBeverage?: boolean;
  beverageCategory?: string;
  isAlcoholic?: boolean;
}

export interface MenuRecipeStatus {
  id: string;
  sku: string;
  name: string;
  price: number;
  categoryName: string;
  recipeStatus: 'COMPLETE' | 'STUB' | 'NONE';
  ingredientCount: number;
  recipeId: string | null;
}

// ============================================================================
// CREAR MATERIA PRIMA / SUB-RECETA
// ============================================================================

export async function createRawMaterialAction(
  input: CreateRawMaterialInput
): Promise<{ success: boolean; message: string; data?: { id: string; sku: string; name: string } }> {
  try {
    const session = await getSession();
    if (!session) return { success: false, message: 'No autorizado' };

    // Validaciones
    if (!input.name?.trim()) return { success: false, message: 'El nombre es obligatorio' };
    if (!input.sku?.trim()) return { success: false, message: 'El SKU es obligatorio' };
    if (!input.baseUnit?.trim()) return { success: false, message: 'La unidad base es obligatoria' };

    // Verificar SKU único
    const existing = await prisma.inventoryItem.findUnique({ where: { sku: input.sku.trim().toUpperCase() } });
    if (existing) {
      return { success: false, message: `Ya existe un ítem con el SKU "${input.sku}" — usa uno diferente` };
    }

    const item = await prisma.inventoryItem.create({
      data: {
        name: input.name.trim(),
        sku: input.sku.trim().toUpperCase(),
        type: input.type,
        category: input.category,
        baseUnit: input.baseUnit.toUpperCase(),
        purchaseUnit: input.purchaseUnit?.toUpperCase() || input.baseUnit.toUpperCase(),
        conversionRate: input.conversionRate ?? 1,
        minimumStock: input.minimumStock ?? 0,
        reorderPoint: input.reorderPoint ?? 0,
        description: input.description?.trim() || null,
        isBeverage: input.isBeverage ?? false,
        beverageCategory: input.beverageCategory || null,
        isAlcoholic: input.isAlcoholic ?? false,
        isActive: true,
      },
    });

    revalidatePath('/dashboard/asistente');
    revalidatePath('/dashboard/inventario');
    revalidatePath('/dashboard/recetas');

    return { success: true, message: `"${item.name}" creado correctamente`, data: { id: item.id, sku: item.sku, name: item.name } };
  } catch (error: any) {
    console.error('[asistente] createRawMaterial error:', error);
    if (error?.code === 'P2002') return { success: false, message: 'El SKU ya existe — elige otro' };
    return { success: false, message: 'Error al crear el ítem de inventario' };
  }
}

// ============================================================================
// GENERAR SKU SUGERIDO
// ============================================================================

export async function suggestSkuAction(prefix: string): Promise<string> {
  try {
    const clean = prefix.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    const count = await prisma.inventoryItem.count({
      where: { sku: { startsWith: clean } },
    });
    return `${clean}-${String(count + 1).padStart(3, '0')}`;
  } catch {
    return `${prefix.toUpperCase()}-001`;
  }
}

// ============================================================================
// ESTADO DE RECETAS POR ITEM DEL MENÚ
// ============================================================================

export async function getMenuRecipeStatusAction(): Promise<{
  success: boolean;
  data?: MenuRecipeStatus[];
  summary?: { total: number; complete: number; stub: number; none: number };
}> {
  try {
    const categories = await prisma.menuCategory.findMany({
      include: {
        items: {
          where: { isActive: true },
          select: { id: true, sku: true, name: true, price: true, recipeId: true },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    // Collect all recipeIds and fetch ingredient counts in one query
    const allItems = categories.flatMap((c) => c.items);
    const recipeIds = allItems.map((i) => i.recipeId).filter(Boolean) as string[];
    const recipesWithCounts = recipeIds.length
      ? await prisma.recipe.findMany({
          where: { id: { in: recipeIds } },
          select: { id: true, _count: { select: { ingredients: true } } },
        })
      : [];
    const recipeCountMap = new Map(recipesWithCounts.map((r) => [r.id, r._count.ingredients]));

    const items: MenuRecipeStatus[] = [];

    for (const cat of categories) {
      for (const item of cat.items) {
        let recipeStatus: 'COMPLETE' | 'STUB' | 'NONE' = 'NONE';
        let ingredientCount = 0;

        if (item.recipeId) {
          ingredientCount = recipeCountMap.get(item.recipeId) ?? 0;
          recipeStatus = ingredientCount > 0 ? 'COMPLETE' : 'STUB';
        }

        items.push({
          id: item.id,
          sku: item.sku,
          name: item.name,
          price: item.price,
          categoryName: cat.name,
          recipeStatus,
          ingredientCount,
          recipeId: item.recipeId,
        });
      }
    }

    const complete = items.filter((i) => i.recipeStatus === 'COMPLETE').length;
    const stub = items.filter((i) => i.recipeStatus === 'STUB').length;
    const none = items.filter((i) => i.recipeStatus === 'NONE').length;

    return {
      success: true,
      data: items,
      summary: { total: items.length, complete, stub, none },
    };
  } catch (error) {
    console.error('[asistente] getMenuRecipeStatus error:', error);
    return { success: false };
  }
}

// ============================================================================
// LISTAR INSUMOS EXISTENTES (para evitar duplicados)
// ============================================================================

export async function getRawMaterialsListAction(): Promise<{
  success: boolean;
  data?: { id: string; sku: string; name: string; type: string; baseUnit: string; category: string }[];
}> {
  try {
    const items = await prisma.inventoryItem.findMany({
      where: {
        isActive: true,
        type: { in: ['RAW_MATERIAL', 'SUB_RECIPE'] },
      },
      select: { id: true, sku: true, name: true, type: true, baseUnit: true, category: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    return { success: true, data: items.map((i) => ({ ...i, category: i.category ?? '' })) };
  } catch {
    return { success: false };
  }
}
