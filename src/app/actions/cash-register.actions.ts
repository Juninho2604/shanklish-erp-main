'use server';

import { prisma } from '@/server/db';
import { getSession } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit-log';

export interface CashRegisterData {
  id: string;
  registerName: string;
  shiftDate: Date;
  shiftType: string;
  status: string;
  openingCashUsd: number;
  openingCashBs: number;
  openedAt: Date;
  openedByName: string;
  closingCashUsd: number | null;
  closingCashBs: number | null;
  closedAt: Date | null;
  closedByName: string | null;
  totalSalesUsd: number | null;
  totalExpenses: number | null;
  expectedCash: number | null;
  difference: number | null;
  notes: string | null;
}

export async function getCashRegistersAction(filters?: {
  month?: number;
  year?: number;
  status?: string;
}): Promise<{ success: boolean; data?: CashRegisterData[]; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: 'No autorizado' };
  if (!['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER', 'AUDITOR'].includes(session.role)) {
    return { success: false, error: 'Sin permisos' };
  }

  const now = new Date();
  const month = filters?.month ?? (now.getMonth() + 1);
  const year = filters?.year ?? now.getFullYear();

  // Fecha inicio y fin del mes
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  try {
    const registers = await prisma.cashRegister.findMany({
      where: {
        shiftDate: { gte: startDate, lte: endDate },
        ...(filters?.status && { status: filters.status }),
      },
      include: {
        openedBy: { select: { firstName: true, lastName: true } },
        closedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { shiftDate: 'desc' },
    });

    const data: CashRegisterData[] = registers.map(r => ({
      id: r.id,
      registerName: r.registerName,
      shiftDate: r.shiftDate,
      shiftType: r.shiftType,
      status: r.status,
      openingCashUsd: r.openingCashUsd,
      openingCashBs: r.openingCashBs,
      openedAt: r.openedAt,
      openedByName: `${r.openedBy.firstName} ${r.openedBy.lastName}`,
      closingCashUsd: r.closingCashUsd,
      closingCashBs: r.closingCashBs,
      closedAt: r.closedAt,
      closedByName: r.closedBy ? `${r.closedBy.firstName} ${r.closedBy.lastName}` : null,
      totalSalesUsd: r.totalSalesUsd,
      totalExpenses: r.totalExpenses,
      expectedCash: r.expectedCash,
      difference: r.difference,
      notes: r.notes,
    }));

    return { success: true, data };
  } catch (e) {
    return { success: false, error: 'Error al obtener registros de caja' };
  }
}

export async function openCashRegisterAction(input: {
  registerName: string;
  shiftType?: string;
  openingCashUsd: number;
  openingCashBs?: number;
  notes?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: 'No autorizado' };
  if (!['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER', 'CASHIER_RESTAURANT', 'CASHIER_DELIVERY'].includes(session.role)) {
    return { success: false, error: 'Sin permisos para abrir caja' };
  }

  if (!input.registerName.trim()) return { success: false, error: 'El nombre de caja es requerido' };
  if (input.openingCashUsd < 0) return { success: false, error: 'El fondo inicial no puede ser negativo' };

  // Obtener fecha del día en zona Caracas
  const now = new Date();
  const shiftDate = new Date(now.toLocaleDateString('en-CA', { timeZone: 'America/Caracas' }) + 'T00:00:00.000Z');

  try {
    // Verificar que no haya una caja abierta con el mismo nombre hoy
    const existing = await prisma.cashRegister.findFirst({
      where: {
        registerName: input.registerName.trim(),
        shiftDate,
        status: 'OPEN',
      },
    });
    if (existing) return { success: false, error: `Ya hay una caja "${input.registerName}" abierta hoy` };

    const register = await prisma.cashRegister.create({
      data: {
        registerName: input.registerName.trim(),
        shiftDate,
        shiftType: input.shiftType ?? 'DAY',
        openingCashUsd: input.openingCashUsd,
        openingCashBs: input.openingCashBs ?? 0,
        openedById: session.id,
        notes: input.notes?.trim() || null,
        status: 'OPEN',
      },
    });

    await logAudit({
      userId: session.id, userName: `${session.firstName} ${session.lastName}`,
      userRole: session.role, action: 'CREATE', entityType: 'CashRegister',
      entityId: register.id,
      description: `Abrió caja: ${register.registerName} — Fondo: $${register.openingCashUsd}`,
      module: 'POS',
    });

    revalidatePath('/dashboard/caja');
    return { success: true, id: register.id };
  } catch (e) {
    return { success: false, error: 'Error al abrir caja' };
  }
}

export async function closeCashRegisterAction(
  id: string,
  input: {
    closingCashUsd: number;
    closingCashBs?: number;
    notes?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: 'No autorizado' };
  if (!['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER', 'CASHIER_RESTAURANT', 'CASHIER_DELIVERY'].includes(session.role)) {
    return { success: false, error: 'Sin permisos para cerrar caja' };
  }

  try {
    const register = await prisma.cashRegister.findUnique({ where: { id } });
    if (!register) return { success: false, error: 'Caja no encontrada' };
    if (register.status === 'CLOSED') return { success: false, error: 'La caja ya está cerrada' };

    // Calcular totales de ventas del día en esa caja (usando SalesOrders del mismo día)
    const dayStart = new Date(register.shiftDate);
    const dayEnd = new Date(register.shiftDate);
    dayEnd.setHours(23, 59, 59, 999);

    const salesAgg = await prisma.salesOrder.aggregate({
      where: {
        status: 'COMPLETED',
        createdAt: { gte: dayStart, lte: dayEnd },
      },
      _sum: { total: true },
    });

    const expensesAgg = await prisma.expense.aggregate({
      where: {
        status: 'CONFIRMED',
        paidAt: { gte: dayStart, lte: dayEnd },
      },
      _sum: { amountUsd: true },
    });

    const totalSalesUsd = salesAgg._sum.total ?? 0;
    const totalExpenses = expensesAgg._sum.amountUsd ?? 0;
    const expectedCash = register.openingCashUsd + totalSalesUsd - totalExpenses;
    const difference = input.closingCashUsd - expectedCash;

    await prisma.cashRegister.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closingCashUsd: input.closingCashUsd,
        closingCashBs: input.closingCashBs ?? null,
        closedAt: new Date(),
        closedById: session.id,
        totalSalesUsd,
        totalExpenses,
        expectedCash,
        difference,
        ...(input.notes && { notes: input.notes.trim() }),
      },
    });

    await logAudit({
      userId: session.id, userName: `${session.firstName} ${session.lastName}`,
      userRole: session.role, action: 'UPDATE', entityType: 'CashRegister',
      entityId: id,
      description: `Cerró caja: ${register.registerName} — Diferencia: $${difference.toFixed(2)}`,
      module: 'POS',
      metadata: { totalSalesUsd, totalExpenses, expectedCash, difference },
    });

    revalidatePath('/dashboard/caja');
    return { success: true };
  } catch (e) {
    console.error('[closeCashRegisterAction]', e);
    return { success: false, error: 'Error al cerrar caja' };
  }
}
