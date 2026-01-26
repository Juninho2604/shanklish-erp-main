/**
 * Datos mock para desarrollo de UI
 * Basados en el seed.ts real - mismos datos para consistencia
 */

import { InventoryItem, Recipe, RecipeIngredient, User, Area } from '@/types';

// Áreas
export const mockAreas: Area[] = [
    { id: 'area-cocina', name: 'Cocina Principal', description: 'Área principal de producción' },
    { id: 'area-almacen', name: 'Almacén Seco', description: 'Almacenamiento de insumos secos' },
    { id: 'area-frio', name: 'Cuarto Frío', description: 'Refrigeración y congelación' },
];

// Usuario actual (simulado)
export const mockCurrentUser: User = {
    id: 'user-admin',
    email: 'admin@shanklish.com',
    firstName: 'Omar',
    lastName: 'Admin',
    role: 'OWNER',
};

// Todos los usuarios
export const mockUsers: User[] = [
    mockCurrentUser,
    { id: 'user-chef-victor', email: 'victor@shanklish.com', firstName: 'Víctor', lastName: 'García', role: 'CHEF', areaId: 'area-cocina' },
    { id: 'user-chef-miguel', email: 'miguel@shanklish.com', firstName: 'Miguel', lastName: 'López', role: 'CHEF', areaId: 'area-cocina' },
    { id: 'user-ops', email: 'gerente@shanklish.com', firstName: 'Ana', lastName: 'Martínez', role: 'OPS_MANAGER' },
];

// INSUMOS BASE (RAW_MATERIAL)
export const mockRawMaterials: InventoryItem[] = [
    {
        id: 'ins-leche',
        sku: 'INS-LECHE-001',
        name: 'Leche Entera',
        description: 'Leche entera pasteurizada',
        type: 'RAW_MATERIAL',
        baseUnit: 'L',
        minimumStock: 100,
        reorderPoint: 50,
        currentStock: 45, // ⚠️ Por debajo del mínimo
        category: 'Lácteos',
        storageTemp: 'Refrigerado',
        costPerUnit: 2.5,
    },
    {
        id: 'ins-sal',
        sku: 'INS-SAL-001',
        name: 'Sal Fina',
        type: 'RAW_MATERIAL',
        baseUnit: 'KG',
        minimumStock: 10,
        reorderPoint: 5,
        currentStock: 25,
        category: 'Condimentos',
        storageTemp: 'Ambiente',
        costPerUnit: 0.8,
    },
    {
        id: 'ins-zaatar',
        sku: 'INS-ZAATAR-001',
        name: "Za'atar",
        description: 'Mezcla de especias árabes',
        type: 'RAW_MATERIAL',
        baseUnit: 'KG',
        minimumStock: 5,
        reorderPoint: 2,
        currentStock: 1.5, // ⚠️ Por debajo del mínimo
        category: 'Especias',
        storageTemp: 'Ambiente',
        costPerUnit: 25,
    },
    {
        id: 'ins-carne',
        sku: 'INS-CARNE-001',
        name: 'Carne de Res Molida',
        description: 'Carne magra para kibbe',
        type: 'RAW_MATERIAL',
        baseUnit: 'KG',
        minimumStock: 20,
        reorderPoint: 10,
        currentStock: 8, // ⚠️ Por debajo del mínimo
        category: 'Carnes',
        storageTemp: 'Refrigerado',
        costPerUnit: 8.5,
    },
    {
        id: 'ins-burgol',
        sku: 'INS-BURGOL-001',
        name: 'Trigo Burgol',
        type: 'RAW_MATERIAL',
        baseUnit: 'KG',
        minimumStock: 10,
        reorderPoint: 5,
        currentStock: 15,
        category: 'Granos',
        storageTemp: 'Ambiente',
        costPerUnit: 3.2,
    },
    {
        id: 'ins-cebolla',
        sku: 'INS-CEBOLLA-001',
        name: 'Cebolla Blanca',
        type: 'RAW_MATERIAL',
        baseUnit: 'KG',
        minimumStock: 5,
        reorderPoint: 3,
        currentStock: 10,
        category: 'Vegetales',
        storageTemp: 'Ambiente',
        costPerUnit: 1.5,
    },
    {
        id: 'ins-aceite',
        sku: 'INS-ACEITE-001',
        name: 'Aceite Vegetal',
        type: 'RAW_MATERIAL',
        baseUnit: 'L',
        minimumStock: 20,
        reorderPoint: 10,
        currentStock: 12, // ⚠️ En punto de reorden
        category: 'Aceites',
        storageTemp: 'Ambiente',
        costPerUnit: 4.0,
    },
    {
        id: 'ins-merey',
        sku: 'INS-MEREY-001',
        name: 'Merey (Semillas)',
        type: 'RAW_MATERIAL',
        baseUnit: 'KG',
        minimumStock: 2,
        reorderPoint: 1,
        currentStock: 5,
        category: 'Frutos Secos',
        storageTemp: 'Ambiente',
        costPerUnit: 18,
    },
    {
        id: 'ins-pan',
        sku: 'INS-PAN-001',
        name: 'Pan de Hamburguesa',
        type: 'RAW_MATERIAL',
        baseUnit: 'UNIT',
        minimumStock: 50,
        reorderPoint: 25,
        currentStock: 100,
        category: 'Panadería',
        storageTemp: 'Ambiente',
        costPerUnit: 0.5,
    },
];

// SUB-RECETAS
export const mockSubRecipes: InventoryItem[] = [
    {
        id: 'sub-cuajada',
        sku: 'SUB-CUAJADA-001',
        name: 'Cuajada Base',
        description: 'Cuajada fresca para quesos',
        type: 'SUB_RECIPE',
        baseUnit: 'KG',
        minimumStock: 5,
        currentStock: 8,
        category: 'Productos Intermedios',
        storageTemp: 'Refrigerado',
        costPerUnit: 14.04, // Calculado
    },
    {
        id: 'sub-shanklish',
        sku: 'SUB-SHANK-001',
        name: 'Bola de Shanklish Seco',
        description: "Queso shanklish curado con za'atar",
        type: 'SUB_RECIPE',
        baseUnit: 'UNIT',
        minimumStock: 20,
        currentStock: 50,
        category: 'Quesos',
        storageTemp: 'Refrigerado',
        costPerUnit: 2.85, // Calculado
    },
    {
        id: 'sub-masa-kibbe',
        sku: 'SUB-KIBBE-001',
        name: 'Masa de Kibbe',
        description: 'Masa de carne y trigo',
        type: 'SUB_RECIPE',
        baseUnit: 'KG',
        minimumStock: 5,
        currentStock: 3, // ⚠️ Bajo
        category: 'Masas',
        storageTemp: 'Refrigerado',
        costPerUnit: 7.23, // Calculado
    },
];

// PRODUCTOS FINALES
export const mockFinishedGoods: InventoryItem[] = [
    {
        id: 'prod-shanklish-merey',
        sku: 'PROD-SHANK-MEREY-001',
        name: 'Shanklish con Merey',
        description: 'Plato de shanklish con merey tostado',
        type: 'FINISHED_GOOD',
        baseUnit: 'PORTION',
        minimumStock: 0,
        currentStock: 0,
        category: 'Platos Principales',
        costPerUnit: 3.39, // Calculado
    },
    {
        id: 'prod-kibbe',
        sku: 'PROD-KIBBE-001',
        name: 'Kibbe Frito',
        type: 'FINISHED_GOOD',
        baseUnit: 'UNIT',
        minimumStock: 0,
        currentStock: 0,
        category: 'Frituras',
        costPerUnit: 0.54, // Calculado
    },
    {
        id: 'prod-arab-burger',
        sku: 'PROD-ARABBURG-001',
        name: 'Arab Burger',
        description: 'Hamburguesa estilo árabe',
        type: 'FINISHED_GOOD',
        baseUnit: 'UNIT',
        minimumStock: 0,
        currentStock: 0,
        category: 'Hamburguesas',
        costPerUnit: 2.03, // Calculado
    },
];

// Todos los items combinados
export const mockInventoryItems: InventoryItem[] = [
    ...mockRawMaterials,
    ...mockSubRecipes,
    ...mockFinishedGoods,
];

// Items con stock bajo
export const mockLowStockItems = mockInventoryItems.filter(
    item => item.currentStock < item.minimumStock ||
        (item.reorderPoint && item.currentStock <= item.reorderPoint)
);

// Función helper para obtener item por ID
export function getItemById(id: string): InventoryItem | undefined {
    return mockInventoryItems.find(item => item.id === id);
}

// Función para calcular costo de ingrediente
export function calculateIngredientCost(
    itemId: string,
    quantity: number,
    wastePercentage: number = 0
): { grossQuantity: number; unitCost: number; totalCost: number } {
    const item = getItemById(itemId);
    if (!item) return { grossQuantity: quantity, unitCost: 0, totalCost: 0 };

    const grossQuantity = wastePercentage < 100
        ? quantity / (1 - wastePercentage / 100)
        : quantity;
    const unitCost = item.costPerUnit || 0;
    const totalCost = grossQuantity * unitCost;

    return { grossQuantity, unitCost, totalCost };
}
