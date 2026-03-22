'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/server/db';
import { UNIT_INFO, convertUnit, UnitOfMeasureType } from '@/lib/constants/units';

// Helper to safely map database units to our system units
function normalizeUnit(unit: string): UnitOfMeasureType {
    if (!unit) return 'UNIT';
    const u = unit.toUpperCase();
    if (u in UNIT_INFO) return u as UnitOfMeasureType;

    // Common aliases from dirty data
    switch (u) {
        case 'UNI':
        case 'UND':
        case 'UNIDAD': return 'UNIT';
        case 'KOS':
        case 'KILO': return 'KG';
        case 'LITRO':
        case 'LITROS': return 'L';
        case 'GR': return 'G';
        default: return 'UNIT'; // Fallback to avoid crash
    }
}

export interface CreateLoanInput {
    inventoryItemId: string;
    loaneeName: string;
    quantity: number;
    unit: string;
    type: 'REPLACEMENT' | 'PAYMENT';
    agreedPrice?: number;
    notes?: string;
    userId: string;
    areaId: string; // The area where the item is taken from
}

export interface ResolveLoanInput {
    loanId: string;
    userId: string;
    resolutionType: 'REPLACEMENT' | 'PAYMENT'; // Should match loan type usually, but could change? No, stick to type.
    notes?: string;
    areaId?: string; // Where it is returned to (only for REPLACEMENT)
}

/**
 * Get all loans, ordered by status (PENDING first) and date
 */
export async function getLoansAction() {
    try {
        const loans = await prisma.inventoryLoan.findMany({
            include: {
                inventoryItem: true,
                createdBy: {
                    select: { firstName: true, lastName: true }
                }
            },
            orderBy: [
                { status: 'asc' }, // PENDING comes before COMPLETED alphabetically? No. C before P.
                // We want PENDING first. We can sort in JS or use specific order.
                // Let's sort by date desc for now.
                { loanDate: 'desc' }
            ]
        });

        // Custom sort to put PENDING first
        return loans.sort((a: any, b: any) => {
            if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
            if (a.status !== 'PENDING' && b.status === 'PENDING') return 1;
            return 0;
        });

    } catch (error) {
        console.error('Error fetching loans:', error);
        return [];
    }
}

/**
 * Create a new loan (Préstamo)
 * Deducts inventory immediately.
 */
export async function createLoanAction(input: CreateLoanInput) {
    try {
        if (!input.inventoryItemId || !input.loaneeName || !input.quantity) {
            return { success: false, message: 'Faltan datos requeridos' };
        }

        const result = await prisma.$transaction(async (tx) => {
            // 0. Fetch Item for Base Unit
            const item = await tx.inventoryItem.findUnique({ where: { id: input.inventoryItemId } });
            if (!item) throw new Error("Item no encontrado");

            const targetUnit = normalizeUnit(item.baseUnit);
            const sourceUnit = normalizeUnit(input.unit);

            const stockDeduction = convertUnit(input.quantity, sourceUnit, targetUnit);

            // 1. Create the Loan Record
            const loan = await tx.inventoryLoan.create({
                data: {
                    inventoryItemId: input.inventoryItemId,
                    loaneeName: input.loaneeName,
                    quantity: input.quantity,
                    unit: input.unit,
                    type: input.type,
                    status: 'PENDING',
                    agreedPrice: input.agreedPrice,
                    notes: input.notes,
                    createdById: input.userId
                }
            });

            // 2. Create Inventory Movement (Outbound)
            // We need to know which Area permissions allow. Default to Principal or passed Area?
            // For now, let's assume 'Almacén Principal' logic or the passed areaId.
            // We should ensure enough stock exists or allow negative? Allow negative for now as per "Flexible" requirement?
            // Safer to check stock if possible, but let's just record movement to be safe.

            await tx.inventoryMovement.create({
                data: {
                    inventoryItemId: input.inventoryItemId,
                    movementType: 'LOAN_OUT', // We need to handle this type in UI/stats
                    quantity: -input.quantity, // Negative for OUT
                    unit: input.unit,
                    reason: `Préstamo a ${input.loaneeName}`,
                    notes: input.notes,
                    createdById: input.userId,
                    loanId: loan.id
                }
            });

            // 3. Update Inventory Location (Decrement)
            // We need to find the location. 
            // If areaId is provided use it.
            if (input.areaId) {
                const location = await tx.inventoryLocation.findUnique({
                    where: {
                        inventoryItemId_areaId: {
                            inventoryItemId: input.inventoryItemId,
                            areaId: input.areaId
                        }
                    }
                });

                if (location) {
                    await tx.inventoryLocation.update({
                        where: { id: location.id },
                        data: { currentStock: { decrement: stockDeduction } }
                    });
                } else {
                    // Create if not exists (negative stock)
                    await tx.inventoryLocation.create({
                        data: {
                            inventoryItemId: input.inventoryItemId,
                            areaId: input.areaId,
                            currentStock: -stockDeduction
                        }
                    });
                }
            }

            return loan;
        });

        revalidatePath('/dashboard/prestamos');
        revalidatePath('/dashboard/inventario');
        return { success: true, message: 'Préstamo registrado correctamente' };

    } catch (error) {
        console.error('Error creating loan:', error);
        if (error instanceof Error) {
            console.error('Stack:', error.stack);
        }
        console.log('Input was:', JSON.stringify(input));
        return { success: false, message: `Error: ${error instanceof Error ? error.message : 'Unknown'}` };
    }
}

/**
 * Resolve a loan (Complete/Pay/Return)
 */
export async function resolveLoanAction(input: ResolveLoanInput) {
    try {
        const result = await prisma.$transaction(async (tx) => {
            const loan = await tx.inventoryLoan.findUnique({
                where: { id: input.loanId },
                include: { inventoryItem: true } // Need item for baseUnit
            });
            if (!loan) throw new Error("Préstamo no encontrado");
            if (loan.status === 'COMPLETED') throw new Error("Este préstamo ya está completado");

            // 1. Update Loan Status
            await tx.inventoryLoan.update({
                where: { id: input.loanId },
                data: {
                    status: 'COMPLETED',
                    resolvedAt: new Date(),
                    notes: loan.notes ? `${loan.notes}\nResolución: ${input.notes}` : input.notes
                }
            });

            // 2. Handle Stock Return (Only if Replacement)
            if (input.resolutionType === 'REPLACEMENT' && input.areaId) {
                const targetUnit = normalizeUnit(loan.inventoryItem.baseUnit);
                const sourceUnit = normalizeUnit(loan.unit);

                const stockIncrement = convertUnit(
                    loan.quantity,
                    sourceUnit,
                    targetUnit
                );

                await tx.inventoryMovement.create({
                    data: {
                        inventoryItemId: loan.inventoryItemId,
                        movementType: 'LOAN_RETURN',
                        quantity: loan.quantity, // Positive for IN
                        unit: loan.unit,
                        reason: `Devolución préstamo: ${loan.loaneeName}`,
                        createdById: input.userId,
                        loanId: loan.id
                    }
                });

                // Update stock
                await tx.inventoryLocation.upsert({
                    where: {
                        inventoryItemId_areaId: {
                            inventoryItemId: loan.inventoryItemId,
                            areaId: input.areaId
                        }
                    },
                    create: {
                        inventoryItemId: loan.inventoryItemId,
                        areaId: input.areaId,
                        currentStock: stockIncrement
                    },
                    update: {
                        currentStock: { increment: stockIncrement }
                    }
                });
            }

            // If PAYMENT, we assume money is handled elsewhere (or we log a financial transaction later)
            // No stock coming back.

            return loan;
        });

        revalidatePath('/dashboard/prestamos');
        revalidatePath('/dashboard/inventario');
        return { success: true, message: 'Préstamo completado' };

    } catch (error) {
        console.error('Error resolving loan:', error);
        return { success: false, message: 'Error al completar préstamo' };
    }
}

export async function getLoanableItemsAction() {
    try {
        const items = await prisma.inventoryItem.findMany({
            where: { isActive: true },
            select: {
                id: true,
                name: true,
                sku: true,
                baseUnit: true,
                type: true,
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
            sku: item.sku,
            unit: item.baseUnit,
            type: item.type,
            estimatedCost: item.costHistory[0]?.costPerUnit || 0
        }));
    } catch (error) {
        console.error('Error fetching loanable items:', error);
        return [];
    }
}
