'use server';

import { prisma } from '@/server/db';
import { checkActionPermission } from '@/lib/permissions/action-guard';
import { PERM } from '@/lib/constants/permissions-registry';

export interface FinancialSummary {
  period: { month: number; year: number; label: string };
  income: {
    totalSalesUsd: number;
    ordersCount: number;
    avgTicket: number;
    byType: { type: string; total: number; count: number }[];
    byPaymentMethod: { method: string; total: number; count: number }[];
    dailySales: { day: number; total: number; orders: number }[];
  };
  expenses: {
    totalExpensesUsd: number;
    count: number;
    byCategory: { name: string; color: string | null; total: number; pct: number }[];
    topExpenses: { description: string; categoryName: string; amount: number; paidAt: string }[];
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
    aging: { range: string; amount: number; count: number }[];
  };
  cashFlow: {
    inflows: number;
    outflows: number;
    net: number;
  };
  profitLoss: {
    grossProfit: number;
    grossMarginPct: number;
    operatingProfit: number;
    operatingMarginPct: number;
  };
  mom: {
    salesChange: number | null;
    expensesChange: number | null;
    profitChange: number | null;
    ordersChange: number | null;
  };
}

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export async function getFinancialSummaryAction(month?: number, year?: number): Promise<{
  success: boolean;
  data?: FinancialSummary;
  error?: string;
}> {
  const guard = await checkActionPermission(PERM.VIEW_FINANCES);
  if (!guard.ok) return { success: false, error: guard.message };

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
        createdAt: true,
        paymentMethod: true,
        items: { select: { costTotal: true } },
      },
    });

    const totalSalesUsd = salesOrders.reduce((s: number, o) => s + o.total, 0);
    const totalCogsUsd = salesOrders.reduce((s: number, o) =>
      s + o.items.reduce((si: number, i) => si + (i.costTotal ?? 0), 0), 0);

    // avgTicket
    const avgTicket = salesOrders.length > 0 ? totalSalesUsd / salesOrders.length : 0;

    // Ventas por tipo (with count)
    const salesByType = new Map<string, { total: number; count: number }>();
    for (const o of salesOrders) {
      const existing = salesByType.get(o.orderType) ?? { total: 0, count: 0 };
      existing.total += o.total;
      existing.count += 1;
      salesByType.set(o.orderType, existing);
    }

    // Ventas por método de pago
    const salesByPaymentMethod = new Map<string, { total: number; count: number }>();
    for (const o of salesOrders) {
      const method = o.paymentMethod ?? 'UNKNOWN';
      const existing = salesByPaymentMethod.get(method) ?? { total: 0, count: 0 };
      existing.total += o.total;
      existing.count += 1;
      salesByPaymentMethod.set(method, existing);
    }

    // Ventas diarias
    const dailySalesMap = new Map<number, { total: number; orders: number }>();
    for (const o of salesOrders) {
      const day = new Date(o.createdAt).getDate();
      const existing = dailySalesMap.get(day) || { total: 0, orders: 0 };
      existing.total += o.total;
      existing.orders += 1;
      dailySalesMap.set(day, existing);
    }
    const dailySales = Array.from(dailySalesMap.entries())
      .map(([day, data]) => ({ day, ...data }))
      .sort((a, b) => a.day - b.day);

    // 2. Gastos del período
    const expenses = await prisma.expense.findMany({
      where: { status: 'CONFIRMED', periodMonth: m, periodYear: y },
      include: { category: { select: { name: true, color: true } } },
    });

    const totalExpensesUsd = expenses.reduce((s: number, e) => s + e.amountUsd, 0);

    const expByCategory = new Map<string, { name: string; color: string | null; total: number }>();
    for (const e of expenses) {
      const existing = expByCategory.get(e.categoryId);
      if (existing) existing.total += e.amountUsd;
      else expByCategory.set(e.categoryId, { name: e.category.name, color: e.category.color, total: e.amountUsd });
    }

    const byCategorySorted = Array.from(expByCategory.values())
      .sort((a, b) => b.total - a.total)
      .map(c => ({
        ...c,
        pct: totalExpensesUsd > 0 ? Math.round((c.total / totalExpensesUsd) * 1000) / 10 : 0,
      }));

    const topExpenses = [...expenses]
      .sort((a, b) => b.amountUsd - a.amountUsd)
      .slice(0, 5)
      .map(e => ({
        description: e.description,
        categoryName: e.category.name,
        amount: e.amountUsd,
        paidAt: e.paidAt.toISOString(),
      }));

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
    const totalPendingUsd = pendingAccounts.reduce((s: number, a) => s + a.remainingUsd, 0);
    const overdueUsd = pendingAccounts
      .filter(a => a.dueDate && a.dueDate < now2)
      .reduce((s: number, a) => s + a.remainingUsd, 0);

    // Aging buckets
    const agingBuckets: Record<string, { amount: number; count: number }> = {
      '0-30': { amount: 0, count: 0 },
      '31-60': { amount: 0, count: 0 },
      '61-90': { amount: 0, count: 0 },
      '90+': { amount: 0, count: 0 },
    };
    for (const a of pendingAccounts) {
      if (!a.dueDate) continue;
      const daysPast = Math.floor((now2.getTime() - a.dueDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysPast <= 0) continue;
      const bucket = daysPast <= 30 ? '0-30' : daysPast <= 60 ? '31-60' : daysPast <= 90 ? '61-90' : '90+';
      agingBuckets[bucket].amount += a.remainingUsd;
      agingBuckets[bucket].count += 1;
    }
    const aging = Object.entries(agingBuckets).map(([range, data]) => ({ range, ...data }));

    // 5. P&L
    const grossProfit = totalSalesUsd - totalCogsUsd;
    const grossMarginPct = totalSalesUsd > 0 ? (grossProfit / totalSalesUsd) * 100 : 0;
    const operatingProfit = grossProfit - totalExpensesUsd;
    const operatingMarginPct = totalSalesUsd > 0 ? (operatingProfit / totalSalesUsd) * 100 : 0;

    // 6. Cash Flow
    const accountPayments = await prisma.accountPayment.aggregate({
      where: { paidAt: { gte: startDate, lte: endDate } },
      _sum: { amountUsd: true },
    });
    const outflows = totalExpensesUsd + (accountPayments._sum.amountUsd ?? 0);
    const cashFlow = {
      inflows: totalSalesUsd,
      outflows,
      net: totalSalesUsd - outflows,
    };

    // 7. Month over Month
    const prevMonth = m === 1 ? 12 : m - 1;
    const prevYear = m === 1 ? y - 1 : y;
    const prevStart = new Date(prevYear, prevMonth - 1, 1);
    const prevEnd = new Date(prevYear, prevMonth, 0, 23, 59, 59, 999);

    const [prevSalesOrders, prevExpAgg] = await Promise.all([
      prisma.salesOrder.findMany({
        where: { status: 'COMPLETED', createdAt: { gte: prevStart, lte: prevEnd } },
        select: { total: true, items: { select: { costTotal: true } } },
      }),
      prisma.expense.aggregate({
        where: { status: 'CONFIRMED', periodMonth: prevMonth, periodYear: prevYear },
        _sum: { amountUsd: true },
      }),
    ]);

    const prevSales = prevSalesOrders.reduce((s: number, o) => s + o.total, 0);
    const prevCogs = prevSalesOrders.reduce((s: number, o) =>
      s + o.items.reduce((si: number, i) => si + (i.costTotal ?? 0), 0), 0);
    const prevExpenses = prevExpAgg._sum.amountUsd ?? 0;
    const prevOrders = prevSalesOrders.length;
    const prevProfit = prevSales - prevCogs - prevExpenses;

    const pctChange = (curr: number, prev: number): number | null =>
      prev > 0 ? Math.round(((curr - prev) / prev) * 1000) / 10 : null;

    const mom = {
      salesChange: pctChange(totalSalesUsd, prevSales),
      expensesChange: pctChange(totalExpensesUsd, prevExpenses),
      profitChange: pctChange(operatingProfit, prevProfit),
      ordersChange: pctChange(salesOrders.length, prevOrders),
    };

    const data: FinancialSummary = {
      period: { month: m, year: y, label: `${MONTH_NAMES[m - 1]} ${y}` },
      income: {
        totalSalesUsd,
        ordersCount: salesOrders.length,
        avgTicket: Math.round(avgTicket * 100) / 100,
        byType: Array.from(salesByType.entries()).map(([type, { total, count }]) => ({ type, total, count })),
        byPaymentMethod: Array.from(salesByPaymentMethod.entries()).map(([method, { total, count }]) => ({ method, total, count })),
        dailySales,
      },
      expenses: {
        totalExpensesUsd,
        count: expenses.length,
        byCategory: byCategorySorted,
        topExpenses,
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
        aging,
      },
      cashFlow,
      profitLoss: {
        grossProfit,
        grossMarginPct: Math.round(grossMarginPct * 10) / 10,
        operatingProfit,
        operatingMarginPct: Math.round(operatingMarginPct * 10) / 10,
      },
      mom,
    };

    return { success: true, data };
  } catch (e) {
    console.error('[getFinancialSummaryAction]', e);
    return { success: false, error: 'Error al calcular resumen financiero' };
  }
}

export async function getMonthlyTrendAction(months = 6): Promise<{
  success: boolean;
  data?: { label: string; sales: number; cogs: number; expenses: number; profit: number }[];
  error?: string;
}> {
  const guard = await checkActionPermission(PERM.VIEW_FINANCES);
  if (!guard.ok) return { success: false, error: guard.message };

  try {
    const results: { label: string; sales: number; cogs: number; expenses: number; profit: number }[] = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = d.getMonth() + 1;
      const y = d.getFullYear();
      const startDate = new Date(y, m - 1, 1);
      const endDate = new Date(y, m, 0, 23, 59, 59, 999);

      const salesOrders = await prisma.salesOrder.findMany({
        where: { status: 'COMPLETED', createdAt: { gte: startDate, lte: endDate } },
        select: { total: true, items: { select: { costTotal: true } } },
      });
      const sales = salesOrders.reduce((s: number, o) => s + o.total, 0);
      const cogs = salesOrders.reduce((s: number, o) => s + o.items.reduce((si: number, i) => si + (i.costTotal ?? 0), 0), 0);

      const expAgg = await prisma.expense.aggregate({
        where: { status: 'CONFIRMED', periodMonth: m, periodYear: y },
        _sum: { amountUsd: true },
      });
      const expenses = expAgg._sum.amountUsd ?? 0;

      results.push({
        label: `${MONTH_NAMES[m - 1].slice(0, 3)} ${y}`,
        sales,
        cogs,
        expenses,
        profit: sales - cogs - expenses,
      });
    }

    return { success: true, data: results };
  } catch (e) {
    return { success: false, error: 'Error al calcular tendencia' };
  }
}

export async function getDailySalesAction(month: number, year: number): Promise<{
  success: boolean;
  data?: { day: number; total: number; orders: number }[];
  error?: string;
}> {
  const guard = await checkActionPermission(PERM.VIEW_FINANCES);
  if (!guard.ok) return { success: false, error: guard.message };

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);

  try {
    const salesOrders = await prisma.salesOrder.findMany({
      where: { status: 'COMPLETED', createdAt: { gte: startDate, lte: endDate } },
      select: { total: true, createdAt: true },
    });

    const dailySalesMap = new Map<number, { total: number; orders: number }>();
    for (const o of salesOrders) {
      const day = new Date(o.createdAt).getDate();
      const existing = dailySalesMap.get(day) || { total: 0, orders: 0 };
      existing.total += o.total;
      existing.orders += 1;
      dailySalesMap.set(day, existing);
    }

    const data = Array.from(dailySalesMap.entries())
      .map(([day, d]) => ({ day, ...d }))
      .sort((a, b) => a.day - b.day);

    return { success: true, data };
  } catch (e) {
    console.error('[getDailySalesAction]', e);
    return { success: false, error: 'Error al calcular ventas diarias' };
  }
}
