/**
 * Tipos de datos simulados para desarrollo de UI
 * En producción estos vendrán de Prisma
 */

export interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    areaId?: string;
    avatarUrl?: string;
}

export type UserRole =
    | 'OWNER'
    | 'AUDITOR'
    | 'ADMIN_MANAGER'
    | 'OPS_MANAGER'
    | 'HR_MANAGER'
    | 'CHEF'
    | 'AREA_LEAD'
    | 'CASHIER_RESTAURANT'
    | 'CASHIER_DELIVERY'
    | 'KITCHEN_CHEF';

export type InventoryItemType = 'RAW_MATERIAL' | 'SUB_RECIPE' | 'FINISHED_GOOD';

export type UnitOfMeasure = 'KG' | 'G' | 'LB' | 'OZ' | 'L' | 'ML' | 'GAL' | 'UNIT' | 'DOZEN' | 'PORTION';

export interface InventoryItem {
    id: string;
    sku: string;
    name: string;
    description?: string;
    type: InventoryItemType;
    baseUnit: UnitOfMeasure;
    minimumStock: number;
    reorderPoint?: number;
    currentStock: number;
    category?: string;
    storageTemp?: string;
    costPerUnit?: number;
}

export interface RecipeIngredient {
    id: string;
    ingredientItem: InventoryItem;
    quantity: number;
    unit: UnitOfMeasure;
    wastePercentage: number;
    notes?: string;
    isOptional: boolean;
    sortOrder: number;
    // Calculados
    grossQuantity: number;
    unitCost: number;
    totalCost: number;
}

export interface Recipe {
    id: string;
    name: string;
    description?: string;
    outputItem: InventoryItem;
    outputQuantity: number;
    outputUnit: UnitOfMeasure;
    yieldPercentage: number;
    prepTimeMinutes?: number;
    cookTimeMinutes?: number;
    restTimeMinutes?: number;
    ingredients: RecipeIngredient[];
    isApproved: boolean;
    // Calculados
    totalCost: number;
    costPerUnit: number;
}

export interface Area {
    id: string;
    name: string;
    description?: string;
}

// Permisos por rol - quién puede ver costos/márgenes
export const COST_VISIBLE_ROLES: UserRole[] = ['OWNER', 'AUDITOR', 'ADMIN_MANAGER', 'OPS_MANAGER'];

export function canViewCosts(role: UserRole): boolean {
    return COST_VISIBLE_ROLES.includes(role);
}

export function canEditRecipes(role: UserRole): boolean {
    return ['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER', 'CHEF'].includes(role);
}

export function canApproveRecipes(role: UserRole): boolean {
    return ['OWNER', 'OPS_MANAGER'].includes(role);
}
