'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/server/db';
import { calculateRecipeCost } from '@/server/services/cost.service';
import { UnitOfMeasure } from '@/types'; // Assuming this exists, otherwise we use string

/**
 * SHANKLISH CARACAS ERP - Recipe Actions
 * 
 * Server Actions para gestión de recetas y costos
 */

export interface ActionResult {
    success: boolean;
    message: string;
    data?: any;
}

export interface CreateRecipeInput {
    name: string;
    description?: string;
    outputQuantity: number;
    outputUnit: string;
    yieldPercentage: number;
    prepTime?: number;
    cookTime?: number;
    ingredients: {
        itemId: string; // The ingredient's InventoryItem ID
        quantity: number;
        unit: string;
        wastePercentage: number;
        notes?: string;
    }[];
    userId: string;
    type?: 'SUB_RECIPE' | 'FINISHED_GOOD';
    category?: string;
}

// ============================================================================
// READ ACTIONS
// ============================================================================

export async function getRecipesAction() {
    try {
        const recipes = await prisma.recipe.findMany({
            where: { isActive: true },
            include: {
                outputItem: {
                    include: {
                        costHistory: {
                            orderBy: { effectiveFrom: 'desc' },
                            take: 1
                        }
                    }
                },
                // createdBy: {
                //    select: { firstName: true, lastName: true }
                // }
            },
            orderBy: { name: 'asc' }
        });

        return recipes.map(recipe => {
            const currentCost = recipe.outputItem.costHistory[0]?.costPerUnit || 0;

            return {
                id: recipe.id,
                name: recipe.name,
                description: recipe.description,
                type: recipe.outputItem.type, // RAW_MATERIAL, SUB_RECIPE, FINISHED_GOOD
                category: recipe.outputItem.category || 'GENERAL',
                baseUnit: recipe.outputItem.baseUnit,
                outputQuantity: Number(recipe.outputQuantity),
                outputUnit: recipe.outputUnit,
                yieldPercentage: Number(recipe.yieldPercentage),
                costPerUnit: Number(currentCost),
                isApproved: recipe.isApproved,
                createdBy: 'Sistema',
                updatedAt: recipe.updatedAt,
            };
        });

    } catch (error) {
        console.error('Error fetching recipes:', error);
        return [];
    }
}

export async function getRecipeByIdAction(id: string) {
    try {
        const recipe = await prisma.recipe.findUnique({
            where: { id },
            include: {
                outputItem: {
                    include: {
                        costHistory: {
                            orderBy: { effectiveFrom: 'desc' },
                            take: 1
                        }
                    }
                },
                ingredients: {
                    include: {
                        ingredientItem: {
                            include: {
                                costHistory: {
                                    orderBy: { effectiveFrom: 'desc' },
                                    take: 1
                                }
                            }
                        }
                    },
                    orderBy: { sortOrder: 'asc' }
                },
                // createdBy: {
                //    select: { firstName: true, lastName: true }
                // }
            }
        });

        if (!recipe) return null;

        const currentCost = recipe.outputItem.costHistory[0]?.costPerUnit || 0;

        return {
            ...recipe,
            outputItem: {
                ...recipe.outputItem,
                currentCost: Number(currentCost) // Helper property
            },
            ingredients: recipe.ingredients.map(ing => ({
                ...ing,
                quantity: Number(ing.quantity),
                wastePercentage: Number(ing.wastePercentage),
                currentCost: Number(ing.ingredientItem.costHistory[0]?.costPerUnit || 0)
            }))
        };

    } catch (error) {
        console.error('Error fetching recipe:', error);
        return null;
    }
}

/**
 * Gets a light list of ingredients (Raw Materials and Sub-recipes) for the selector
 */
export async function getIngredientOptionsAction() {
    try {
        const items = await prisma.inventoryItem.findMany({
            where: {
                isActive: true,
                type: { in: ['RAW_MATERIAL', 'SUB_RECIPE'] }
            },
            select: {
                id: true,
                name: true,
                type: true,
                baseUnit: true,
                costHistory: {
                    orderBy: { effectiveFrom: 'desc' },
                    take: 1,
                    select: { costPerUnit: true }
                }
            },
            orderBy: { name: 'asc' }
        });

        return items.map(item => ({
            id: item.id,
            name: item.name,
            type: item.type,
            baseUnit: item.baseUnit,
            currentCost: item.costHistory[0]?.costPerUnit || 0
        }));
    } catch (error) {
        console.error("Error getting ingredient options:", error);
        return [];
    }
}

// ============================================================================
// WRITE ACTIONS
// ============================================================================

/**
 * Creates a new recipe and its corresponding Output InventoryItem (if needed)
 */
export async function createRecipeAction(input: CreateRecipeInput): Promise<ActionResult> {
    try {
        // Validation
        if (!input.name || input.ingredients.length === 0) {
            return { success: false, message: 'Faltan datos requeridos (nombre o ingredientes)' };
        }

        // Generate SKU roughly
        const sku = `REC-${input.name.substring(0, 3).toUpperCase()}-${Date.now().toString().slice(-4)}`;

        const result = await prisma.$transaction(async (tx) => {
            // 1. Create the Output Inventory Item (The thing this recipe makes)
            const outputItem = await tx.inventoryItem.create({
                data: {
                    name: input.name,
                    sku: sku,
                    category: input.category,
                    type: input.type || 'SUB_RECIPE', // Default to sub-recipe if not specified
                    baseUnit: input.outputUnit,
                    description: input.description,
                    isActive: true
                }
            });

            // 2. Create the Recipe
            const recipe = await tx.recipe.create({
                data: {
                    name: input.name,
                    description: input.description,
                    outputItemId: outputItem.id,
                    outputQuantity: input.outputQuantity,
                    outputUnit: input.outputUnit,
                    yieldPercentage: input.yieldPercentage,
                    prepTime: input.prepTime,
                    cookTime: input.cookTime,
                    isApproved: true, // Auto-approve for now
                    // createdById: input.userId, // Temporarily disabled until client regen
                    ingredients: {
                        create: input.ingredients.map((ing, index) => ({
                            ingredientItemId: ing.itemId,
                            quantity: ing.quantity,
                            unit: ing.unit,
                            wastePercentage: ing.wastePercentage,
                            notes: ing.notes,
                            sortOrder: index
                        }))
                    }
                }
            });

            return { recipe, outputItem };
        });

        // 3. Calculate initial cost (outside transaction to avoid locking if complex)
        // We call the service we already fixed
        const costResult = await calculateRecipeCost(prisma, result.recipe.id);

        if (costResult) {
            await prisma.costHistory.create({
                data: {
                    inventoryItemId: result.outputItem.id,
                    costPerUnit: costResult.costPerUnit,
                    currency: 'USD',
                    isCalculated: true,
                    costBreakdown: JSON.stringify(costResult),
                    effectiveFrom: new Date(),
                    reason: 'Costo inicial de receta',
                    createdById: input.userId
                }
            });
        }

        revalidatePath('/dashboard/recetas');
        return { success: true, message: 'Receta creada exitosamente', data: { recipeId: result.recipe.id } };

    } catch (error) {
        console.error('Error creating recipe:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Error al crear la receta'
        };
    }
}

export interface UpdateRecipeInput extends CreateRecipeInput {
    id: string;
}

export async function updateRecipeAction(input: UpdateRecipeInput): Promise<ActionResult> {
    try {
        if (!input.id || !input.name || input.ingredients.length === 0) {
            return { success: false, message: 'Faltan datos requeridos' };
        }

        const result = await prisma.$transaction(async (tx) => {
            // 1. Get existing recipe to know output item
            const existing = await tx.recipe.findUnique({
                where: { id: input.id },
                include: { outputItem: true }
            });
            if (!existing) throw new Error("Receta no encontrada");

            // 2. Update Output Item if name, category, or type changed
            const newType = input.type || existing.outputItem.type;
            if (existing.name !== input.name || existing.outputItem.category !== input.category || existing.outputItem.type !== newType) {
                await tx.inventoryItem.update({
                    where: { id: existing.outputItemId },
                    data: {
                        name: input.name,
                        category: input.category,
                        type: newType,
                    }
                });
            }

            // 3. Update Recipe Basic Info
            const updatedRecipe = await tx.recipe.update({
                where: { id: input.id },
                data: {
                    name: input.name,
                    description: input.description,
                    outputQuantity: input.outputQuantity,
                    outputUnit: input.outputUnit,
                    yieldPercentage: input.yieldPercentage,
                    prepTime: input.prepTime,
                    cookTime: input.cookTime,
                }
            });

            // 4. Replace Ingredients
            // Delete old
            await tx.recipeIngredient.deleteMany({
                where: { recipeId: input.id }
            });

            // Create new (createMany is faster)
            await tx.recipeIngredient.createMany({
                data: input.ingredients.map((ing, index) => ({
                    recipeId: input.id,
                    ingredientItemId: ing.itemId,
                    quantity: ing.quantity,
                    unit: ing.unit,
                    wastePercentage: ing.wastePercentage,
                    notes: ing.notes,
                    sortOrder: index
                }))
            });

            return updatedRecipe;
        });

        // 5. Recalculate Cost
        // We trigger it but don't fail the update if cost calc fails
        try {
            await updateRecipeCostAction(input.id, input.userId);
        } catch (e) {
            console.warn("Cost update failed after recipe update", e);
        }

        revalidatePath('/dashboard/recetas');
        // Revalidate the detail page specifically
        revalidatePath(`/dashboard/recetas/${input.id}`);

        return { success: true, message: 'Receta actualizada exitosamente' };

    } catch (error) {
        console.error('Error updating recipe:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Error al actualizar receta'
        };
    }
}

/**
 * Recalcula el costo de una receta y actualiza el historial
 */
export async function updateRecipeCostAction(
    recipeId: string,
    userId: string
): Promise<ActionResult> {
    try {
        console.log(`Calculando costo para receta ${recipeId}...`);

        // 1. Calcular usando el servicio
        const result = await calculateRecipeCost(prisma, recipeId);

        if (!result) {
            return {
                success: false,
                message: 'No se pudo calcular el costo. Verifique que la receta existe y es válida.'
            };
        }

        console.log(`Costo calculado: ${result.costPerUnit} (Total: ${result.totalCost})`);

        // 2. Obtener el outputItem ID de la receta
        const recipe = await prisma.recipe.findUnique({
            where: { id: recipeId },
            select: { outputItemId: true }
        });

        if (!recipe) throw new Error('Receta no encontrada');

        // 3. Guardar el nuevo costo en historial
        await prisma.costHistory.create({
            data: {
                inventoryItemId: recipe.outputItemId,
                costPerUnit: result.costPerUnit,
                currency: 'USD', // Por simplicidad asumimos USD
                isCalculated: true,
                costBreakdown: JSON.stringify(result),
                effectiveFrom: new Date(),
                reason: 'Cálculo automático de receta',
                createdById: userId
            }
        });

        // 4. Revalidar UI
        revalidatePath('/dashboard/recetas');
        revalidatePath(`/dashboard/recetas/${recipeId}`);
        revalidatePath('/dashboard/inventario'); // Si los precios del inventario se muestran

        return {
            success: true,
            message: `Costo actualizado: $${result.costPerUnit.toFixed(4)}`,
            data: result
        };

    } catch (error) {
        console.error('Error updating recipe cost:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Error interno al actualizar costo'
        };
    }
}
