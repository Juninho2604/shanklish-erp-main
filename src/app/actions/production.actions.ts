'use server';

/**
 * SHANKLISH CARACAS ERP - Production Actions
 * 
 * Server Actions para gestión de producción desde el frontend
 */

import { revalidatePath } from 'next/cache';

// ============================================================================
// TIPOS
// ============================================================================

export interface QuickProductionFormData {
    recipeId: string;
    recipeName: string;
    actualQuantity: number;
    unit: string;
    areaId: string;
    notes?: string;
}

export interface ProductionActionResult {
    success: boolean;
    message: string;
    data?: {
        orderNumber?: string;
        productAdded?: { name: string; quantity: number; unit: string };
        ingredientsConsumed?: { name: string; quantity: number; unit: string }[];
        actualYield?: number;
    };
}

// ============================================================================
// MOCK: Datos simulados para desarrollo
// ============================================================================

// Stock simulado
const mockStock: Record<string, number> = {
    'ins-leche': 200,
    'ins-sal': 25,
    'ins-zaatar': 8,
    'ins-carne': 30,
    'ins-burgol': 15,
    'ins-cebolla': 10,
    'ins-aceite': 40,
    'sub-cuajada': 8,
    'sub-shanklish': 50,
    'sub-masa-kibbe': 10,
};

// Recetas simuladas con sus ingredientes
const mockRecipes: Record<string, {
    name: string;
    outputItem: string;
    outputQuantity: number;
    outputUnit: string;
    yieldPercentage: number;
    ingredients: { itemId: string; name: string; quantity: number; unit: string; wastePercentage: number }[];
}> = {
    'recipe-cuajada': {
        name: 'Cuajada Base',
        outputItem: 'sub-cuajada',
        outputQuantity: 2,
        outputUnit: 'KG',
        yieldPercentage: 95,
        ingredients: [
            { itemId: 'ins-leche', name: 'Leche Entera', quantity: 10, unit: 'L', wastePercentage: 0 },
            { itemId: 'ins-sal', name: 'Sal Fina', quantity: 0.02, unit: 'KG', wastePercentage: 0 },
        ],
    },
    'recipe-shanklish': {
        name: 'Bola de Shanklish Seco',
        outputItem: 'sub-shanklish',
        outputQuantity: 25,
        outputUnit: 'UNIT',
        yieldPercentage: 90,
        ingredients: [
            { itemId: 'sub-cuajada', name: 'Cuajada Base', quantity: 2, unit: 'KG', wastePercentage: 5 },
            { itemId: 'ins-zaatar', name: "Za'atar", quantity: 0.3, unit: 'KG', wastePercentage: 10 },
            { itemId: 'ins-sal', name: 'Sal Fina', quantity: 0.05, unit: 'KG', wastePercentage: 0 },
        ],
    },
    'recipe-masa-kibbe': {
        name: 'Masa de Kibbe',
        outputItem: 'sub-masa-kibbe',
        outputQuantity: 2.5,
        outputUnit: 'KG',
        yieldPercentage: 98,
        ingredients: [
            { itemId: 'ins-carne', name: 'Carne de Res Molida', quantity: 1.5, unit: 'KG', wastePercentage: 5 },
            { itemId: 'ins-burgol', name: 'Trigo Burgol', quantity: 0.5, unit: 'KG', wastePercentage: 0 },
            { itemId: 'ins-cebolla', name: 'Cebolla Blanca', quantity: 0.3, unit: 'KG', wastePercentage: 15 },
            { itemId: 'ins-sal', name: 'Sal Fina', quantity: 0.025, unit: 'KG', wastePercentage: 0 },
        ],
    },
};

let orderCounter = 1;

// ============================================================================
// ACTION: PRODUCCIÓN RÁPIDA
// ============================================================================

/**
 * Registra una producción rápida (sin orden previa)
 * - Víctor termina 20kg de Cuajada → Botón "Finalizar Producción"
 * - Sistema resta ingredientes proporcionales
 * - Sistema suma producto terminado
 */
export async function quickProductionAction(
    formData: QuickProductionFormData,
    userId: string = 'user-chef-victor'
): Promise<ProductionActionResult> {
    try {
        await new Promise(resolve => setTimeout(resolve, 500));

        const recipe = mockRecipes[formData.recipeId];
        if (!recipe) {
            return { success: false, message: 'Receta no encontrada' };
        }

        // Calcular factor de escala
        const scaleFactor = formData.actualQuantity / recipe.outputQuantity;

        // Calcular ingredientes a consumir
        const ingredientsConsumed: { name: string; quantity: number; unit: string }[] = [];
        const stockErrors: string[] = [];

        for (const ing of recipe.ingredients) {
            const requiredQty = ing.quantity * scaleFactor;
            const grossQty = ing.wastePercentage < 100
                ? requiredQty / (1 - ing.wastePercentage / 100)
                : requiredQty;

            const currentStock = mockStock[ing.itemId] || 0;

            if (currentStock < grossQty) {
                stockErrors.push(`${ing.name}: necesario ${grossQty.toFixed(3)}, disponible ${currentStock.toFixed(3)}`);
            } else {
                ingredientsConsumed.push({
                    name: ing.name,
                    quantity: parseFloat(grossQty.toFixed(3)),
                    unit: ing.unit,
                });
            }
        }

        // Si hay errores de stock, no procesar
        if (stockErrors.length > 0) {
            return {
                success: false,
                message: `Stock insuficiente:\n${stockErrors.join('\n')}`,
            };
        }

        // Generar número de orden
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const orderNumber = `PROD-${today}-${String(orderCounter++).padStart(4, '0')}`;

        // Procesar: restar ingredientes, sumar producto
        for (const ing of recipe.ingredients) {
            const requiredQty = ing.quantity * scaleFactor;
            const grossQty = ing.wastePercentage < 100
                ? requiredQty / (1 - ing.wastePercentage / 100)
                : requiredQty;

            mockStock[ing.itemId] = (mockStock[ing.itemId] || 0) - grossQty;
        }

        // Sumar producto terminado
        mockStock[recipe.outputItem] = (mockStock[recipe.outputItem] || 0) + formData.actualQuantity;

        // Calcular rendimiento real
        const expectedQty = recipe.outputQuantity * scaleFactor * (recipe.yieldPercentage / 100);
        const actualYield = (formData.actualQuantity / expectedQty) * 100;

        console.log('🏭 PRODUCCIÓN COMPLETADA:', {
            orden: orderNumber,
            receta: recipe.name,
            producido: `${formData.actualQuantity} ${formData.unit}`,
            rendimiento: `${actualYield.toFixed(1)}%`,
            ingredientes: ingredientsConsumed,
        });

        // Revalidar páginas
        revalidatePath('/dashboard');
        revalidatePath('/dashboard/inventario');
        revalidatePath('/dashboard/produccion');

        return {
            success: true,
            message: `¡Producción completada! Orden: ${orderNumber}`,
            data: {
                orderNumber,
                productAdded: {
                    name: recipe.name,
                    quantity: formData.actualQuantity,
                    unit: formData.unit,
                },
                ingredientsConsumed,
                actualYield: parseFloat(actualYield.toFixed(1)),
            },
        };

    } catch (error) {
        console.error('Error en quickProductionAction:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Error al registrar producción',
        };
    }
}

// ============================================================================
// ACTION: CALCULAR INGREDIENTES NECESARIOS
// ============================================================================

export interface IngredientRequirement {
    itemId: string;
    itemName: string;
    required: number;
    gross: number;
    unit: string;
    available: number;
    sufficient: boolean;
}

export async function calculateRequirementsAction(
    recipeId: string,
    quantity: number
): Promise<{ success: boolean; requirements: IngredientRequirement[] }> {
    const recipe = mockRecipes[recipeId];
    if (!recipe) {
        return { success: false, requirements: [] };
    }

    const scaleFactor = quantity / recipe.outputQuantity;

    const requirements: IngredientRequirement[] = recipe.ingredients.map(ing => {
        const required = ing.quantity * scaleFactor;
        const gross = ing.wastePercentage < 100
            ? required / (1 - ing.wastePercentage / 100)
            : required;
        const available = mockStock[ing.itemId] || 0;

        return {
            itemId: ing.itemId,
            itemName: ing.name,
            required: parseFloat(required.toFixed(4)),
            gross: parseFloat(gross.toFixed(4)),
            unit: ing.unit,
            available: parseFloat(available.toFixed(3)),
            sufficient: available >= gross,
        };
    });

    return { success: true, requirements };
}

// ============================================================================
// ACTION: OBTENER RECETAS DISPONIBLES
// ============================================================================

export async function getProductionRecipesAction() {
    return Object.entries(mockRecipes).map(([id, recipe]) => ({
        id,
        name: recipe.name,
        outputQuantity: recipe.outputQuantity,
        outputUnit: recipe.outputUnit,
        ingredientCount: recipe.ingredients.length,
    }));
}
