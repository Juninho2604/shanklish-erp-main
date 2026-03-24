'use server';

/**
 * SKU STUDIO ACTIONS
 * ─────────────────────────────────────────────────────────────────────────────
 * Creación rápida de productos (InventoryItem + MenuItem) usando plantillas.
 *
 * TODO: Copiar/adaptar la lógica de Table-Pong repo si existía.
 *
 * Funciones a implementar:
 *   getProductFamilies()                  — listar familias de productos
 *   createProductFamily(data)             — crear familia
 *   getSkuTemplates(familyId?)            — listar plantillas
 *   getSkuTemplateById(id)                — detalle de plantilla
 *   createSkuTemplate(data)               — crear plantilla con defaults JSON
 *   updateSkuTemplate(id, data)           — editar plantilla
 *   deleteSkuTemplate(id)                 — soft delete plantilla
 *
 *   createProductFromTemplate(templateId, overrides)
 *     → Crea InventoryItem + MenuItem en un solo paso usando los defaults
 *       de la plantilla fusionados con los overrides del usuario.
 */

import prisma from '@/server/db';
import { getSession } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

// ─── Product Families ─────────────────────────────────────────────────────────

export async function getProductFamilies() {
    const session = await getSession();
    if (!session) throw new Error('No autorizado');

    return prisma.productFamily.findMany({
        where: { isActive: true },
        include: { _count: { select: { items: true, templates: true } } },
        orderBy: { name: 'asc' },
    });
}

export async function createProductFamily(data: {
    code: string;
    name: string;
    description?: string;
    icon?: string;
}) {
    const session = await getSession();
    if (!session) throw new Error('No autorizado');
    if (!['OWNER', 'ADMIN_MANAGER'].includes(session.role)) {
        throw new Error('Sin permiso para crear familias de producto');
    }

    const family = await prisma.productFamily.create({ data });
    revalidatePath('/dashboard/config/sku-studio');
    return { ok: true, family };
}

// ─── SKU Templates ───────────────────────────────────────────────────────────

export async function getSkuTemplates(productFamilyId?: string) {
    const session = await getSession();
    if (!session) throw new Error('No autorizado');

    return prisma.skuCreationTemplate.findMany({
        where: {
            isActive: true,
            ...(productFamilyId && { productFamilyId }),
        },
        include: { productFamily: { select: { id: true, code: true, name: true } } },
        orderBy: { name: 'asc' },
    });
}

export async function createSkuTemplate(data: {
    name: string;
    description?: string;
    productFamilyId?: string;
    defaultFields: Record<string, unknown>; // se serializa a JSON
}) {
    const session = await getSession();
    if (!session) throw new Error('No autorizado');
    if (!['OWNER', 'ADMIN_MANAGER'].includes(session.role)) {
        throw new Error('Sin permiso para crear plantillas SKU');
    }

    const template = await prisma.skuCreationTemplate.create({
        data: {
            name: data.name,
            description: data.description,
            productFamilyId: data.productFamilyId,
            defaultFields: JSON.stringify(data.defaultFields),
        },
    });

    revalidatePath('/dashboard/config/sku-studio');
    return { ok: true, template };
}

/**
 * Crea un InventoryItem y opcionalmente un MenuItem desde una plantilla.
 * Los `overrides` reemplazan los defaultFields de la plantilla.
 */
export async function createProductFromTemplate(
    templateId: string,
    overrides: Record<string, unknown>
) {
    const session = await getSession();
    if (!session) throw new Error('No autorizado');
    if (!['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER'].includes(session.role)) {
        throw new Error('Sin permiso para crear productos');
    }

    const template = await prisma.skuCreationTemplate.findUniqueOrThrow({
        where: { id: templateId },
    });

    const defaults = JSON.parse(template.defaultFields) as Record<string, unknown>;
    const merged   = { ...defaults, ...overrides };

    // ── Create InventoryItem ────────────────────────────────────────────────
    const invItem = await prisma.inventoryItem.create({
        data: {
            sku:         merged.sku          as string,
            name:        merged.name         as string,
            description: merged.description  as string | undefined,
            type:        (merged.type        as string) ?? 'FINISHED_GOOD',
            category:    merged.category     as string | undefined,
            baseUnit:    (merged.baseUnit    as string) ?? 'UNIT',
            purchaseUnit: merged.purchaseUnit as string | undefined,
            isBeverage:  (merged.isBeverage  as boolean) ?? false,
            beverageCategory: merged.beverageCategory as string | undefined,
            productFamilyId:  template.productFamilyId ?? undefined,
        },
    });

    // ── Optionally create MenuItem ──────────────────────────────────────────
    let menuItem = null;
    if (merged.createMenuItem && merged.menuCategoryId) {
        menuItem = await prisma.menuItem.create({
            data: {
                sku:            invItem.sku,
                name:           invItem.name,
                description:    invItem.description ?? undefined,
                categoryId:     merged.menuCategoryId as string,
                price:          (merged.price         as number) ?? 0,
                serviceCategory: merged.serviceCategory as string | undefined,
                kitchenRouting:  merged.kitchenRouting  as string | undefined,
            },
        });
    }

    revalidatePath('/dashboard/menu');
    revalidatePath('/dashboard/inventario');
    return { ok: true, invItem, menuItem };
}

// ─── Crear ítem directo desde SKU Studio (UI con chips) ───────────────────

export async function createSkuItemAction(input: {
    name: string;
    skuPrefix?: string;
    type: 'RAW_MATERIAL' | 'SUB_RECIPE' | 'FINISHED_GOOD';
    baseUnit: string;
    category?: string;
    productFamilyId?: string;
    operativeRole?: string;
    trackingMode?: string;
    isBeverage?: boolean;
    initialCost?: number;
}): Promise<{ success: boolean; message: string; data?: { id: string; sku: string; name: string } }> {
    try {
        const session = await getSession();
        if (!session) return { success: false, message: 'No autorizado' };
        if (!input.name?.trim()) return { success: false, message: 'El nombre es obligatorio' };
        if (!input.baseUnit) return { success: false, message: 'La unidad base es obligatoria' };

        // Generar SKU
        const prefix = input.skuPrefix?.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '') || 'SKU';
        const count = await prisma.inventoryItem.count({ where: { sku: { startsWith: prefix } } });
        const candidateSku = `${prefix}-${String(count + 1).padStart(3, '0')}`;
        const existing = await prisma.inventoryItem.findUnique({ where: { sku: candidateSku } });
        const finalSku = existing ? `${prefix}-${Date.now().toString().slice(-5)}` : candidateSku;

        // Metadata SKU Studio en description
        const descParts: string[] = [];
        if (input.operativeRole && input.operativeRole !== 'Ninguno') descParts.push(`Rol: ${input.operativeRole}`);
        if (input.trackingMode && input.trackingMode !== 'Por unidad') descParts.push(`Seguimiento: ${input.trackingMode}`);
        const description = descParts.length ? descParts.join(' | ') : null;

        const item = await prisma.inventoryItem.create({
            data: {
                name: input.name.trim(),
                sku: finalSku,
                type: input.type,
                category: input.category?.trim() || null,
                baseUnit: input.baseUnit.toUpperCase(),
                purchaseUnit: input.baseUnit.toUpperCase(),
                conversionRate: 1,
                minimumStock: 0,
                reorderPoint: 0,
                description,
                isBeverage: input.isBeverage ?? false,
                isActive: true,
                productFamilyId: input.productFamilyId || null,
            },
        });

        if (input.initialCost && input.initialCost > 0) {
            await prisma.costHistory.create({
                data: {
                    inventoryItemId: item.id,
                    costPerUnit: input.initialCost,
                    currency: 'USD',
                    reason: 'Costo inicial — SKU Studio',
                    createdById: session.id,
                },
            });
        }

        revalidatePath('/dashboard/sku-studio');
        revalidatePath('/dashboard/inventario');
        revalidatePath('/dashboard/costos');

        return { success: true, message: `"${item.name}" creado · SKU: ${item.sku}`, data: { id: item.id, sku: item.sku, name: item.name } };
    } catch (error: any) {
        if (error?.code === 'P2002') return { success: false, message: 'El SKU ya existe — modifica el prefijo' };
        console.error('[sku-studio] createSkuItemAction error:', error);
        return { success: false, message: 'Error al crear ítem' };
    }
}
