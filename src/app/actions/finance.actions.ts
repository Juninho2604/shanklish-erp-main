'use server';

import { prisma } from '@/server/db';
import { getSession } from '@/lib/auth';

export interface FinancialSummary {
  period: { month: number; year: number; label: string };
  income: {
    totalSalesUsd: number;
    ordersCount: number;
    byType: { type: string; total: number }[];
  };
  expenses: {
    totalExpensesUsd: number;
    count: number;
    byCategory: { name: string; color: string | null; total: number }[];
  };
  cogs: {
    totalCogsUsd: number;
  };
  purchases: {
    totalPurchasesUsd: number;
    ordersCount: number;
  };
  accountsPayable: {
    totalPendingUsd: number;
    overdueUsd: number;
    count: number;
  };
  profitLoss: {
    grossProfit: number;       // ventas - COGS
    grossMarginPct: number;
    operatingProfit: number;   // gross profit - gastos operativos
    operatingMarginPct: number;
  };
}

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export async function getFinancialSummaryAction(month?: number, year?: number): Promise<{
  success: boolean;
  data?: FinancialSummary;
  error?: string;
}> {
  const session = await getSession();
  if (!session) return { success: false, error: 'No autorizado' };
  if (!['OWNER', 'ADMIN_MANAGER', 'AUDITOR'].includes(session.role)) {
    return { success: false, error: 'Sin permisos para ver el resumen financiero' };
  }

  const now = new Date();
  const m = month ?? (now.getMonth() + 1);
  const y = year ?? now.getFullYear();
  const startDate = new Date(y, m - 1, 1);
  const endDate = new Date(y, m, 0, 23, 59, 59, 999);

  try {
    // 1. Ventas del período
    const salesOrders = await prisma.salesOrder.findMany({
      where: { status: 'COMPLETED', createdAt: { gte: startDate, lte: endDate } },
      select: {
        total: true,
        orderType: true,
        items: { select: { costTotal: true } },
      },
    });

    const totalSalesUsd = salesOrders.reduce((s, o) => s + o.total, 0);
    const totalCogsUsd = salesOrders.reduce((s, o) =>
      s + o.items.reduce((si, i) => si + (i.costTotal ?? 0), 0), 0);

    // Ventas por tipo
    const salesByType = new Map<string, number>();
    for (const o of salesOrders) {
      salesByType.set(o.orderType, (salesByType.get(o.orderType) ?? 0) + o.total);
    }

    // 2. Gastos del período
    const expenses = await prisma.expense.findMany({
      where: { status: 'CONFIRMED', periodMonth: m, periodYear: y },
      include: { category: { select: { name: true, color: true } } },
    });

    const totalExpensesUsd = expenses.reduce((s, e) => s + e.amountUsd, 0);

    const expByCategory = new Map<string, { name: string; color: string | null; total: number }>();
    for (const e of expenses) {
      const existing = expByCategory.get(e.categoryId);
      if (existing) existing.total += e.amountUsd;
      else expByCategory.set(e.categoryId, { name: e.category.name, color: e.category.color, total: e.amountUsd });
    }

    // 3. Compras del período
    const purchaseAgg = await prisma.purchaseOrder.aggregate({
      where: {
        status: { in: ['RECEIVED', 'PARTIAL'] },
        receivedDate: { gte: startDate, lte: endDate },
      },
      _sum: { totalAmount: true },
      _count: true,
    });

    // 4. Cuentas por pagar pendientes (todo historial, no solo el mes)
    const pendingAccounts = await prisma.accountPayable.findMany({
      where: { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
      select: { remainingUsd: true, dueDate: true },
    });
    const now2 = new Date();
    const totalPendingUsd = pendingAccounts.reduce((s, a) => s + a.remainingUsd, 0);
    const overdueUsd = pendingAccounts
      .filter(a => a.dueDate && a.dueDate < now2)
      .reduce((s, a) => s + a.remainingUsd, 0);

    // 5. P&L
    const grossProfit = totalSalesUsd - totalCogsUsd;
    const grossMarginPct = totalSalesUsd > 0 ? (grossProfit / totalSalesUsd) * 100 : 0;
    const operatingProfit = grossProfit - totalExpensesUsd;
    const operatingMarginPct = totalSalesUsd > 0 ? (operatingProfit / totalSalesUsd) * 100 : 0;

    const data: FinancialSummary = {
      period: { month: m, year: y, label: `${MONTH_NAMES[m - 1]} ${y}` },
      income: {
        totalSalesUsd,
        ordersCount: salesOrders.length,
        byType: Array.from(salesByType.entries()).map(([type, total]) => ({ type, total })),
      },
      expenses: {
        totalExpensesUsd,
        count: expenses.length,
        byCategory: Array.from(expByCategory.values()).sort((a, b) => b.total - a.total),
      },
      cogs: { totalCogsUsd },
      purchases: {
        totalPurchasesUsd: purchaseAgg._sum.totalAmount ?? 0,
        ordersCount: purchaseAgg._count,
      },
      accountsPayable: {
        totalPendingUsd,
        overdueUsd,
        count: pendingAccounts.length,
      },
      profitLoss: {
        grossProfit,
        grossMarginPct: Math.round(grossMarginPct * 10) / 10,
        operatingProfit,
        operatingMarginPct: Math.round(operatingMarginPct * 10) / 10,
      },
    };

    return { success: true, data };
  } catch (e) {
    console.error('[getFinancialSummaryAction]', e);
    return { success: false, error: 'Error al calcular resumen financiero' };
  }
}

export async function getMonthlyTrendAction(months = 6): Promise<{
  success: boolean;
  data?: { label: string; sales: number; expenses: number; profit: number }[];
  error?: string;
}> {
  const session = await getSession();
  if (!session) return { success: false, error: 'No autorizado' };
  if (!['OWNER', 'ADMIN_MANAGER', 'AUDITOR'].includes(session.role)) {
    return { success: false, error: 'Sin permisos' };
  }

  try {
    const results: { label: string; sales: number; expenses: number; profit: number }[] = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = d.getMonth() + 1;
      const y = d.getFullYear();
      const startDate = new Date(y, m - 1, 1);
      const endDate = new Date(y, m, 0, 23, 59, 59, 999);

      const [salesAgg, expAgg] = await Promise.all([
        prisma.salesOrder.aggregate({
          where: { status: 'COMPLETED', createdAt: { gte: startDate, lte: endDate } },
          _sum: { total: true },
        }),
        prisma.expense.aggregate({
          where: { status: 'CONFIRMED', periodMonth: m, periodYear: y },
          _sum: { amountUsd: true },
        }),
      ]);

      const sales = salesAgg._sum.total ?? 0;
      const expenses = expAgg._sum.amountUsd ?? 0;

      results.push({
        label: `${MONTH_NAMES[m - 1].slice(0, 3)} ${y}`,
        sales,
        expenses,
        profit: sales - expenses,
      });
    }

    return { success: true, data: results };
  } catch (e) {
    return { success: false, error: 'Error al calcular tendencia' };
  }
}
