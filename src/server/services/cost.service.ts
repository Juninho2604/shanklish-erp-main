/**
 * SHANKLISH CARACAS ERP - Cost Calculation Service
 * 
 * Calcula COGS (Cost of Goods Sold) para productos elaborados
 * usando la estructura recursiva de recetas/sub-recetas
 */

import { Decimal } from '@prisma/client/runtime/library';

interface IngredientCost {
    itemId: string;
    itemName: string;
    quantity: number;
    unit: string;
    wastePercentage: number;
    grossQuantity: number;
    unitCost: number;
    totalCost: number;
}

interface RecipeCostBreakdown {
    recipeId: string;
    recipeName: string;
    outputQuantity: number;
    outputUnit: string;
    yieldPercentage: number;

    // Costos desglosados
    ingredientsCost: number;
    laborCost: number;
    overheadCost: number;
    totalCost: number;

    // Costo por unidad producida
    costPerUnit: number;

    // Detalle de ingredientes
    ingredients: IngredientCost[];

    // Sub-recetas incluidas (para trazabilidad)
    subRecipes: string[];
}

/**
 * Calcula la cantidad bruta necesaria considerando merma
 * grossQuantity = netQuantity / (1 - wastePercentage/100)
 */
export function calculateGrossQuantity(net: number, wastePercentage: number): number {
    if (wastePercentage >= 100) return Infinity;
    return net / (1 - wastePercentage / 100);
}

/**
 * Obtiene el costo actual de un item de inventario
 * Busca el registro más reciente en CostHistory
 */
export async function getCurrentItemCost(
    prisma: any,
    itemId: string
): Promise<{ cost: number; currency: string } | null> {
    const costRecord = await prisma.costHistory.findFirst({
        where: {
            inventoryItemId: itemId,
            effectiveTo: null, // Vigente actualmente
        },
        orderBy: { effectiveFrom: 'desc' },
    });

    if (!costRecord) return null;

    return {
        cost: Number(costRecord.costPerUnit),
        currency: costRecord.currency,
    };
}

/**
 * Calcula el costo completo de una receta (recursivo)
 * Maneja sub-recetas automáticamente
 */
export async function calculateRecipeCost(
    prisma: any,
    recipeId: string,
    laborCostPerHour: number = 0,
    overheadPercentage: number = 0,
    visitedRecipes: Set<string> = new Set()
): Promise<RecipeCostBreakdown | null> {
    // Prevenir recursión infinita
    if (visitedRecipes.has(recipeId)) {
        console.warn(`Recursión detectada en receta: ${recipeId}`);
        return null;
    }
    visitedRecipes.add(recipeId);

    const recipe = await prisma.recipe.findUnique({
        where: { id: recipeId },
        include: {
            outputItem: true,
            ingredients: {
                include: {
                    ingredientItem: {
                        include: {
                            recipe: true, // Para detectar sub-recetas
                        },
                    },
                },
            },
        },
    });

    if (!recipe) return null;

    const ingredientsCosts: IngredientCost[] = [];
    const subRecipes: string[] = [];
    let totalIngredientsCost = 0;

    // Procesar cada ingrediente
    for (const ing of recipe.ingredients) {
        const item = ing.ingredientItem;
        const quantity = Number(ing.quantity);
        const wastePercentage = Number(ing.wastePercentage);
        const grossQuantity = calculateGrossQuantity(quantity, wastePercentage);

        let unitCost = 0;

        // Si el ingrediente es una sub-receta, calcular su costo recursivamente
        if (item.type === 'SUB_RECIPE' && item.recipe) {
            subRecipes.push(item.id);
            const subRecipeCost = await calculateRecipeCost(
                prisma, item.recipe.id, laborCostPerHour, overheadPercentage, visitedRecipes
            );
            if (subRecipeCost) {
                unitCost = subRecipeCost.costPerUnit;
            }
        } else {
            // Obtener costo del historial
            const currentCost = await getCurrentItemCost(prisma, item.id);
            unitCost = currentCost?.cost || 0;
        }

        const totalCost = grossQuantity * unitCost;
        totalIngredientsCost += totalCost;

        ingredientsCosts.push({
            itemId: item.id,
            itemName: item.name,
            quantity,
            unit: ing.unit,
            wastePercentage,
            grossQuantity,
            unitCost,
            totalCost,
        });
    }

    // Calcular tiempo total y costo de mano de obra
    const totalMinutes = (recipe.prepTimeMinutes || 0) +
        (recipe.cookTimeMinutes || 0) +
        (recipe.restTimeMinutes || 0);
    const laborCost = (totalMinutes / 60) * laborCostPerHour;

    // Calcular overhead
    const subtotal = totalIngredientsCost + laborCost;
    const overheadCost = subtotal * (overheadPercentage / 100);

    const totalCost = subtotal + overheadCost;

    // Costo por unidad considerando rendimiento
    const outputQty = Number(recipe.outputQuantity);
    const yieldPct = Number(recipe.yieldPercentage);
    const effectiveOutput = outputQty * (yieldPct / 100);
    const costPerUnit = effectiveOutput > 0 ? totalCost / effectiveOutput : 0;

    return {
        recipeId: recipe.id,
        recipeName: recipe.name,
        outputQuantity: outputQty,
        outputUnit: recipe.outputUnit,
        yieldPercentage: yieldPct,
        ingredientsCost: totalIngredientsCost,
        laborCost,
        overheadCost,
        totalCost,
        costPerUnit,
        ingredients: ingredientsCosts,
        subRecipes,
    };
}
