'use server';

import { prisma } from '@/server/db';
import { getSession } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit-log';

// ─── TIPOS ───────────────────────────────────────────────────────────────────

export interface ExpenseCategoryData {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  isActive: boolean;
  sortOrder: number;
  _count: { expenses: number };
}

export interface ExpenseData {
  id: string;
  description: string;
  notes: string | null;
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
  categoryIcon: string | null;
  amountUsd: number;
  amountBs: number | null;
  exchangeRate: number | null;
  paymentMethod: string;
  paymentRef: string | null;
  paidAt: Date;
  status: string;
  periodMonth: number;
  periodYear: number;
  createdById: string;
  createdByName: string;
  createdAt: Date;
}

export interface ExpenseSummary {
  totalUsd: number;
  countByCategory: { categoryId: string; categoryName: string; categoryColor: string | null; totalUsd: number; count: number }[];
  countByPaymentMethod: { method: string; totalUsd: number; count: number }[];
}

// ─── CATEGORÍAS ───────────────────────────────────────────────────────────────

export async function getExpenseCategoriesAction(): Promise<{ success: boolean; data?: ExpenseCategoryData[]; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: 'No autorizado' };

  try {
    const categories = await prisma.expenseCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { expenses: true } } },
    });
    return { success: true, data: categories as ExpenseCategoryData[] };
  } catch (e) {
    return { success: false, error: 'Error al obtener categorías' };
  }
}

export async function createExpenseCategoryAction(input: {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  sortOrder?: number;
}): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: 'No autorizado' };
  if (!['OWNER', 'ADMIN_MANAGER'].includes(session.role)) {
    return { success: false, error: 'Sin permisos para crear categorías' };
  }

  if (!input.name.trim()) return { success: false, error: 'El nombre es requerido' };

  try {
    const cat = await prisma.expenseCategory.create({
      data: {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        color: input.color || null,
        icon: input.icon || null,
        sortOrder: input.sortOrder ?? 0,
      },
    });
    await logAudit({
      userId: session.id, userName: `${session.firstName} ${session.lastName}`,
      userRole: session.role, action: 'CREATE', entityType: 'ExpenseCategory',
      entityId: cat.id, description: `Creó categoría de gasto: ${cat.name}`, module: 'CONFIG',
    });
    revalidatePath('/dashboard/gastos');
    return { success: true };
  } catch (e: any) {
    if (e.code === 'P2002') return { success: false, error: 'Ya existe una categoría con ese nombre' };
    return { success: false, error: 'Error al crear categoría' };
  }
}

export async function updateExpenseCategoryAction(
  id: string,
  input: { name?: string; description?: string; color?: string; icon?: string; isActive?: boolean; sortOrder?: number }
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: 'No autorizado' };
  if (!['OWNER', 'ADMIN_MANAGER'].includes(session.role)) {
    return { success: false, error: 'Sin permisos' };
  }

  try {
    await prisma.expenseCategory.update({
      where: { id },
      data: {
        ...(input.name && { name: input.name.trim() }),
        ...(input.description !== undefined && { description: input.description?.trim() || null }),
        ...(input.color !== undefined && { color: input.color || null }),
        ...(input.icon !== undefined && { icon: input.icon || null }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      },
    });
    revalidatePath('/dashboard/gastos');
    return { success: true };
  } catch (e) {
    return { success: false, error: 'Error al actualizar categoría' };
  }
}

// ─── GASTOS ───────────────────────────────────────────────────────────────────

export async function getExpensesAction(filters?: {
  month?: number;
  year?: number;
  categoryId?: string;
  status?: string;
}): Promise<{ success: boolean; data?: ExpenseData[]; summary?: ExpenseSummary; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: 'No autorizado' };
  if (!['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER', 'AUDITOR'].includes(session.role)) {
    return { success: false, error: 'Sin permisos para ver gastos' };
  }

  const now = new Date();
  const month = filters?.month ?? (now.getMonth() + 1);
  const year = filters?.year ?? now.getFullYear();

  try {
    const where: any = {
      periodMonth: month,
      periodYear: year,
      ...(filters?.categoryId && { categoryId: filters.categoryId }),
      ...(filters?.status ? { status: filters.status } : { status: 'CONFIRMED' }),
    };

    const expenses = await prisma.expense.findMany({
      where,
      include: {
        category: { select: { name: true, color: true, icon: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { paidAt: 'desc' },
    });

    const data: ExpenseData[] = expenses.map(e => ({
      id: e.id,
      description: e.description,
      notes: e.notes,
      categoryId: e.categoryId,
      categoryName: e.category.name,
      categoryColor: e.category.color,
      categoryIcon: e.category.icon,
      amountUsd: e.amountUsd,
      amountBs: e.amountBs,
      exchangeRate: e.exchangeRate,
      paymentMethod: e.paymentMethod,
      paymentRef: e.paymentRef,
      paidAt: e.paidAt,
      status: e.status,
      periodMonth: e.periodMonth,
      periodYear: e.periodYear,
      createdById: e.createdById,
      createdByName: `${e.createdBy.firstName} ${e.createdBy.lastName}`,
      createdAt: e.createdAt,
    }));

    // Summary
    const totalUsd = data.reduce((s, e) => s + e.amountUsd, 0);

    const byCat = new Map<string, { categoryName: string; categoryColor: string | null; totalUsd: number; count: number }>();
    for (const e of data) {
      const existing = byCat.get(e.categoryId);
      if (existing) {
        existing.totalUsd += e.amountUsd;
        existing.count++;
      } else {
        byCat.set(e.categoryId, { categoryName: e.categoryName, categoryColor: e.categoryColor, totalUsd: e.amountUsd, count: 1 });
      }
    }

    const byMethod = new Map<string, { totalUsd: number; count: number }>();
    for (const e of data) {
      const existing = byMethod.get(e.paymentMethod);
      if (existing) { existing.totalUsd += e.amountUsd; existing.count++; }
      else byMethod.set(e.paymentMethod, { totalUsd: e.amountUsd, count: 1 });
    }

    const summary: ExpenseSummary = {
      totalUsd,
      countByCategory: Array.from(byCat.entries()).map(([categoryId, v]) => ({ categoryId, ...v })),
      countByPaymentMethod: Array.from(byMethod.entries()).map(([method, v]) => ({ method, ...v })),
    };

    return { success: true, data, summary };
  } catch (e) {
    return { success: false, error: 'Error al obtener gastos' };
  }
}

export async function createExpenseAction(input: {
  description: string;
  notes?: string;
  categoryId: string;
  amountUsd: number;
  amountBs?: number;
  exchangeRate?: number;
  paymentMethod: string;
  paymentRef?: string;
  paidAt: string; // ISO date string
}): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: 'No autorizado' };
  if (!['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER'].includes(session.role)) {
    return { success: false, error: 'Sin permisos para registrar gastos' };
  }

  if (!input.description.trim()) return { success: false, error: 'La descripción es requerida' };
  if (!input.categoryId) return { success: false, error: 'La categoría es requerida' };
  if (!input.amountUsd || input.amountUsd <= 0) return { success: false, error: 'El monto debe ser mayor a 0' };
  if (!input.paymentMethod) return { success: false, error: 'El método de pago es requerido' };

  const paidAt = new Date(input.paidAt);
  if (isNaN(paidAt.getTime())) return { success: false, error: 'Fecha inválida' };

  try {
    const expense = await prisma.expense.create({
      data: {
        description: input.description.trim(),
        notes: input.notes?.trim() || null,
        categoryId: input.categoryId,
        amountUsd: input.amountUsd,
        amountBs: input.amountBs ?? null,
        exchangeRate: input.exchangeRate ?? null,
        paymentMethod: input.paymentMethod,
        paymentRef: input.paymentRef?.trim() || null,
        paidAt,
        periodMonth: paidAt.getMonth() + 1,
        periodYear: paidAt.getFullYear(),
        status: 'CONFIRMED',
        createdById: session.id,
      },
    });

    await logAudit({
      userId: session.id, userName: `${session.firstName} ${session.lastName}`,
      userRole: session.role, action: 'CREATE', entityType: 'Expense',
      entityId: expense.id,
      description: `Registró gasto: ${expense.description} — $${expense.amountUsd.toFixed(2)}`,
      module: 'CONFIG',
      metadata: { categoryId: input.categoryId, amountUsd: input.amountUsd, paymentMethod: input.paymentMethod },
    });

    revalidatePath('/dashboard/gastos');
    revalidatePath('/dashboard/finanzas');
    return { success: true };
  } catch (e) {
    console.error('[createExpenseAction]', e);
    return { success: false, error: 'Error al registrar el gasto' };
  }
}

export async function voidExpenseAction(
  id: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: 'No autorizado' };
  if (!['OWNER', 'ADMIN_MANAGER'].includes(session.role)) {
    return { success: false, error: 'Solo OWNER o ADMIN_MANAGER pueden anular gastos' };
  }
  if (!reason.trim()) return { success: false, error: 'Se requiere un motivo de anulación' };

  try {
    const expense = await prisma.expense.findUnique({ where: { id } });
    if (!expense) return { success: false, error: 'Gasto no encontrado' };
    if (expense.status === 'VOID') return { success: false, error: 'El gasto ya está anulado' };

    await prisma.expense.update({
      where: { id },
      data: { status: 'VOID', voidReason: reason.trim(), voidedAt: new Date(), voidedById: session.id },
    });

    await logAudit({
      userId: session.id, userName: `${session.firstName} ${session.lastName}`,
      userRole: session.role, action: 'VOID', entityType: 'Expense',
      entityId: id, description: `Anuló gasto: ${expense.description} — Motivo: ${reason}`, module: 'CONFIG',
    });

    revalidatePath('/dashboard/gastos');
    revalidatePath('/dashboard/finanzas');
    return { success: true };
  } catch (e) {
    return { success: false, error: 'Error al anular gasto' };
  }
}
