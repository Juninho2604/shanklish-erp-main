import { getSession, hasPermission, PERMISSIONS } from '@/lib/auth';
import { getDashboardStatsAction } from '@/app/actions/dashboard.actions';
import { getFinancialSummaryAction } from '@/app/actions/finance.actions';
import { getEnabledModulesFromDB } from '@/app/actions/system-config.actions';
import { getVisibleModules } from '@/lib/constants/modules-registry';
import { formatNumber, formatCurrency } from '@/lib/utils';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import prisma from '@/server/db';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
    const session = await getSession();

    // Redirigir al primer módulo visible del usuario (respeta allowedModules individuales)
    if (session?.role === 'CASHIER' || session?.role === 'WAITER') {
        let userAllowedModules: string[] | null = null;
        if (session.id) {
            const dbUser = await prisma.user.findUnique({
                where: { id: session.id },
                select: { allowedModules: true },
            });
            if (dbUser?.allowedModules) {
                try { userAllowedModules = JSON.parse(dbUser.allowedModules); } catch { /* ignore */ }
            }
        }
        const enabledIds = await getEnabledModulesFromDB();
        const visible = getVisibleModules(session.role, enabledIds, userAllowedModules);
        const first = visible[0];
        redirect(first?.href ?? '/dashboard/pos/restaurante');
    }
    const showCosts = hasPermission(session?.role, PERMISSIONS.VIEW_COSTS);

    // Fetch real data
    const [{ stats, salesKPIs, lowStockItems }, financeSummary] = await Promise.all([
      getDashboardStatsAction(),
      showCosts ? getFinancialSummaryAction() : Promise.resolve({ success: false } as any),
    ]);
    const finance = financeSummary?.data ?? null;

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 glass-panel p-6 rounded-3xl border-primary/10 shadow-xl">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                        ¡Bienvenido, <span className="text-primary">{session?.firstName || 'Usuario'}</span>! 👋
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 font-medium">
                        Resumen de operaciones · <span className="text-amber-600 dark:text-amber-500">Gerencia Operativa CAPSULA</span>
                    </p>
                </div>
                <Link
                    href="/dashboard/recetas/nueva"
                    className="capsula-btn capsula-btn-primary shadow-amber-500/20 px-8"
                >
                    <span>➕</span>
                    Nueva Receta
                </Link>
            </div>

            {/* Sales KPIs — solo para roles admin */}
            {salesKPIs && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {/* Revenue Hoy */}
                    <div className="glass-panel rounded-2xl p-5 border border-amber-500/20 bg-amber-500/5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-500/70 mb-1">Ventas Hoy</p>
                        <p className="text-3xl font-black text-amber-500">${salesKPIs.todayRevenue.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        {salesKPIs.revenueChange !== null && (
                            <p className={`text-xs font-bold mt-1 ${salesKPIs.revenueChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {salesKPIs.revenueChange >= 0 ? '▲' : '▼'} {Math.abs(salesKPIs.revenueChange).toFixed(1)}% vs ayer
                            </p>
                        )}
                        {salesKPIs.revenueChange === null && (
                            <p className="text-xs text-gray-500 mt-1">Sin datos de ayer</p>
                        )}
                    </div>

                    {/* Órdenes Hoy */}
                    <div className="glass-panel rounded-2xl p-5 border border-blue-500/20 bg-blue-500/5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-blue-400/70 mb-1">Órdenes Hoy</p>
                        <p className="text-3xl font-black text-blue-400">{salesKPIs.todayOrders}</p>
                        <p className="text-xs text-gray-500 mt-1">Ayer: {salesKPIs.yesterdayOrders} órdenes</p>
                    </div>

                    {/* Ticket Promedio */}
                    <div className="glass-panel rounded-2xl p-5 border border-purple-500/20 bg-purple-500/5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-purple-400/70 mb-1">Ticket Promedio</p>
                        <p className="text-3xl font-black text-purple-400">${salesKPIs.avgTicket.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        <p className="text-xs text-gray-500 mt-1">Por orden hoy</p>
                    </div>

                    {/* Cuentas Abiertas */}
                    <div className={`glass-panel rounded-2xl p-5 border ${salesKPIs.openTabs > 0 ? 'border-orange-500/30 bg-orange-500/5' : 'border-gray-700/30'}`}>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400/70 mb-1">Cuentas Abiertas</p>
                        <p className={`text-3xl font-black ${salesKPIs.openTabs > 0 ? 'text-orange-400' : 'text-gray-500'}`}>{salesKPIs.openTabs}</p>
                        {salesKPIs.openTabs > 0 && (
                            <p className="text-xs text-orange-400/70 mt-1 font-bold">${salesKPIs.openTabsExposed.toFixed(2)} expuestos</p>
                        )}
                        {salesKPIs.openTabs === 0 && (
                            <p className="text-xs text-gray-500 mt-1">Todo cobrado</p>
                        )}
                    </div>
                </div>
            )}

            {/* Financial Summary Widget */}
            {finance && showCosts && (
              <div className="glass-panel rounded-2xl border border-border p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-xl">
                      📊
                    </div>
                    <div>
                      <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Resumen Financiero del Mes</h2>
                      <p className="text-xs text-muted-foreground">{finance.period.label}</p>
                    </div>
                  </div>
                  <Link
                    href="/dashboard/finanzas"
                    className="text-xs text-blue-500 hover:text-blue-400 font-medium"
                  >
                    Ver detalle →
                  </Link>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Ventas</p>
                    <p className="text-xl font-black text-emerald-500 mt-0.5">
                      ${finance.income.totalSalesUsd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    {finance.mom?.salesChange != null && (
                      <p className={`text-[10px] font-bold mt-0.5 ${finance.mom.salesChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {finance.mom.salesChange >= 0 ? '▲' : '▼'} {Math.abs(finance.mom.salesChange).toFixed(1)}%
                      </p>
                    )}
                  </div>
                  <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Gastos</p>
                    <p className="text-xl font-black text-red-500 mt-0.5">
                      ${finance.expenses.totalExpensesUsd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    {finance.mom?.expensesChange != null && (
                      <p className={`text-[10px] font-bold mt-0.5 ${finance.mom.expensesChange <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {finance.mom.expensesChange >= 0 ? '▲' : '▼'} {Math.abs(finance.mom.expensesChange).toFixed(1)}%
                      </p>
                    )}
                  </div>
                  <div className={`rounded-xl p-3 ${finance.profitLoss.operatingProfit >= 0 ? 'bg-blue-500/5 border border-blue-500/20' : 'bg-red-500/5 border border-red-500/20'}`}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Utilidad</p>
                    <p className={`text-xl font-black mt-0.5 ${finance.profitLoss.operatingProfit >= 0 ? 'text-blue-500' : 'text-red-500'}`}>
                      ${Math.abs(finance.profitLoss.operatingProfit).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Margen: {finance.profitLoss.operatingMarginPct}%</p>
                  </div>
                  <div className={`rounded-xl p-3 ${(finance.cashFlow?.net ?? 0) >= 0 ? 'bg-emerald-500/5 border border-emerald-500/20' : 'bg-red-500/5 border border-red-500/20'}`}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Flujo Neto</p>
                    <p className={`text-xl font-black mt-0.5 ${(finance.cashFlow?.net ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      ${Math.abs(finance.cashFlow?.net ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className={`rounded-xl p-3 border ${finance.accountsPayable.overdueUsd > 0 ? 'bg-red-500/5 border-red-500/20' : 'bg-muted/30 border-border'}`}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Deudas</p>
                    <p className={`text-xl font-black mt-0.5 ${finance.accountsPayable.overdueUsd > 0 ? 'text-red-500' : 'text-foreground'}`}>
                      ${finance.accountsPayable.totalPendingUsd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    {finance.accountsPayable.overdueUsd > 0 && (
                      <p className="text-[10px] font-bold text-red-400 mt-0.5">${finance.accountsPayable.overdueUsd.toLocaleString('es-VE', { minimumFractionDigits: 2 })} vencido</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Stats Grid */}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {/* Total Items */}
                <div className="stat-card group">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
                                Total Insumos
                            </p>
                            <p className="mt-2 text-4xl font-black text-gray-900 dark:text-white group-hover:scale-110 transition-transform origin-left duration-300">
                                {stats.totalItems}
                            </p>
                        </div>
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-3xl dark:bg-blue-500/20">
                            📦
                        </div>
                    </div>
                    <div className="mt-4 h-1 w-full bg-blue-500/10 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 w-2/3 rounded-full shimmer"></div>
                    </div>
                </div>

                {/* Low Stock Alert */}
                <div className={`stat-card group ${stats.lowStockCount > 0 ? 'border-red-500/50 bg-red-500/5' : ''}`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
                                Stock Bajo
                            </p>
                            <p className={`mt-2 text-4xl font-black ${stats.lowStockCount > 0 ? 'text-red-600 dark:text-red-500' : 'text-gray-900 dark:text-white'} group-hover:scale-110 transition-transform origin-left duration-300`}>
                                {stats.lowStockCount}
                            </p>
                        </div>
                        <div className={`flex h-14 w-14 items-center justify-center rounded-2xl text-3xl ${stats.lowStockCount > 0 ? 'bg-red-500/20 text-red-500 animate-pulse' : 'bg-gray-100 dark:bg-gray-800'}`}>
                            ⚠️
                        </div>
                    </div>
                    {stats.lowStockCount > 0 && (
                        <p className="mt-4 text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-1">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                            </span>
                            Requiere atención inmediata
                        </p>
                    )}
                </div>

                {/* Sub-recipes */}
                <div className="stat-card group">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
                                Sub-recetas
                            </p>
                            <p className="mt-2 text-4xl font-black text-gray-900 dark:text-white group-hover:scale-110 transition-transform origin-left duration-300">
                                {stats.subRecipes}
                            </p>
                        </div>
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-3xl dark:bg-emerald-500/20">
                            🧀
                        </div>
                    </div>
                    <div className="mt-4 h-1 w-full bg-emerald-500/10 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 w-1/2 rounded-full shimmer"></div>
                    </div>
                </div>

                {/* Products */}
                <div className="stat-card group">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
                                Productos
                            </p>
                            <p className="mt-2 text-4xl font-black text-gray-900 dark:text-white group-hover:scale-110 transition-transform origin-left duration-300">
                                {stats.finishedGoods}
                            </p>
                        </div>
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-3xl dark:bg-amber-500/20">
                            🍽️
                        </div>
                    </div>
                    <div className="mt-4 h-1 w-full bg-amber-500/10 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 w-3/4 rounded-full shimmer"></div>
                    </div>
                </div>
            </div>

            {/* Low Stock Alert Table */}
            <div className="capsula-card border-primary/20 p-0 overflow-hidden shadow-2xl transition-all duration-500">
                <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 px-8 py-6 bg-secondary/10">
                    <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500 text-white text-2xl shadow-lg shadow-red-500/30">
                            🚨
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">
                                Alertas Críticas de Stock
                            </h2>
                            <p className="text-sm font-medium text-gray-500">
                                Insumos por debajo del punto de reorden
                            </p>
                        </div>
                    </div>
                    <Link
                        href="/dashboard/inventario"
                        className="capsula-btn capsula-btn-secondary py-2 min-h-0 text-xs px-4 border-b-2"
                    >
                        Ver Inventario →
                    </Link>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-800">
                                <th className="px-8 py-4 text-left text-xs font-bold uppercase tracking-widest text-gray-400">
                                    Insumo
                                </th>
                                <th className="px-8 py-4 text-left text-xs font-bold uppercase tracking-widest text-gray-400">
                                    Categoría
                                </th>
                                <th className="px-8 py-4 text-right text-xs font-bold uppercase tracking-widest text-gray-400">
                                    Stock Actual
                                </th>
                                <th className="px-8 py-4 text-center text-xs font-bold uppercase tracking-widest text-gray-400">
                                    Estado
                                </th>
                                {showCosts && (
                                    <th className="px-8 py-4 text-right text-xs font-bold uppercase tracking-widest text-gray-400">
                                        Costo Unit.
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {lowStockItems.slice(0, 5).map((item) => (
                                <tr key={item.id} className="group transition-all hover:bg-primary/5 active:scale-[0.99] touch-manipulation">
                                    <td className="px-8 py-5">
                                        <div className="flex items-center gap-4">
                                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-2xl dark:bg-gray-800 transition-transform group-hover:rotate-12">
                                                {item.type === 'RAW_MATERIAL' ? '📦' : item.type === 'SUB_RECIPE' ? '🧀' : '🍽️'}
                                            </div>
                                            <div>
                                                <p className="font-bold text-gray-900 dark:text-white group-hover:text-primary transition-colors">
                                                    {item.name}
                                                </p>
                                                <p className="text-[10px] font-black text-gray-400 tracking-tighter uppercase">{item.sku}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5">
                                        <span className="text-xs font-bold text-gray-500 bg-gray-100 dark:bg-gray-800/50 px-2 py-1 rounded-md uppercase tracking-tighter">
                                            {item.category || '-'}
                                        </span>
                                    </td>
                                    <td className="px-8 py-5 text-right">
                                        <p className="font-black text-lg text-gray-900 dark:text-white">
                                            {formatNumber(item.currentStock)}
                                        </p>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase">{item.baseUnit}</p>
                                    </td>
                                    <td className="px-8 py-5 text-center">
                                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${item.status.status === 'critical' ? 'bg-red-500/10 text-red-600' :
                                            item.status.status === 'warning' ? 'bg-amber-500/10 text-amber-600' :
                                                'bg-emerald-500/10 text-emerald-600'
                                            }`}>
                                            {item.status.status === 'critical' && <span className="h-1.5 w-1.5 rounded-full bg-red-600 animate-pulse"></span>}
                                            {item.status.label}
                                        </span>
                                    </td>
                                    {showCosts && (
                                        <td className="px-8 py-5 text-right font-black text-gray-900 dark:text-white tabular-nums">
                                            {formatCurrency(item.costPerUnit || 0)}
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {lowStockItems.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 text-center animate-in zoom-in duration-500">
                        <div className="h-20 w-20 rounded-full bg-emerald-500/10 flex items-center justify-center text-5xl mb-4">
                            💎
                        </div>
                        <p className="text-xl font-black text-gray-900 dark:text-white">
                            ¡Inventario Perfecto!
                        </p>
                        <p className="text-sm text-gray-500 font-medium max-w-xs mx-auto">
                            No hay insumos críticos registrados en este momento. Sigue así.
                        </p>
                    </div>
                )}
            </div>

            {/* Quick Actions */}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <Link
                    href="/dashboard/recetas/nueva"
                    className="group capsula-card hover:border-amber-500 hover:shadow-amber-500/10 p-2"
                >
                    <div className="flex items-center gap-5 p-4 rounded-xl transition-all group-hover:bg-amber-500/5">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-3xl text-white shadow-xl shadow-amber-500/30 group-hover:scale-110 transition-transform">
                            ➕
                        </div>
                        <div>
                            <p className="text-lg font-black text-gray-900 dark:text-white">
                                Crear Receta
                            </p>
                            <p className="text-sm font-medium text-gray-500">
                                Calculadora de costos
                            </p>
                        </div>
                        <span className="ml-auto text-amber-500 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                            →
                        </span>
                    </div>
                </Link>

                <Link
                    href="/dashboard/inventario"
                    className="group capsula-card hover:border-blue-500 hover:shadow-blue-500/10 p-2"
                >
                    <div className="flex items-center gap-5 p-4 rounded-xl transition-all group-hover:bg-blue-500/5">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 text-3xl text-white shadow-xl shadow-blue-500/30 group-hover:scale-110 transition-transform">
                            📦
                        </div>
                        <div>
                            <p className="text-lg font-black text-gray-900 dark:text-white">
                                Inventario
                            </p>
                            <p className="text-sm font-medium text-gray-500">
                                Gestionar existencias
                            </p>
                        </div>
                        <span className="ml-auto text-blue-500 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                            →
                        </span>
                    </div>
                </Link>

                <Link
                    href="/dashboard/produccion"
                    className="group capsula-card hover:border-emerald-500 hover:shadow-emerald-500/10 p-2"
                >
                    <div className="flex items-center gap-5 p-4 rounded-xl transition-all group-hover:bg-emerald-500/5">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 text-3xl text-white shadow-xl shadow-emerald-500/30 group-hover:scale-110 transition-transform">
                            🏭
                        </div>
                        <div>
                            <p className="text-lg font-black text-gray-900 dark:text-white">
                                Producción
                            </p>
                            <p className="text-sm font-medium text-gray-500">
                                Procesar órdenes
                            </p>
                        </div>
                        <span className="ml-auto text-emerald-500 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                            →
                        </span>
                    </div>
                </Link>

                <Link
                    href="/dashboard/estadisticas"
                    className="group capsula-card hover:border-purple-500 hover:shadow-purple-500/10 p-2"
                >
                    <div className="flex items-center gap-5 p-4 rounded-xl transition-all group-hover:bg-purple-500/5">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 text-3xl text-white shadow-xl shadow-purple-500/30 group-hover:scale-110 transition-transform">
                            📈
                        </div>
                        <div>
                            <p className="text-lg font-black text-gray-900 dark:text-white">
                                Estadísticas
                            </p>
                            <p className="text-sm font-medium text-gray-500">
                                Análisis por rol
                            </p>
                        </div>
                        <span className="ml-auto text-purple-500 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                            →
                        </span>
                    </div>
                </Link>

                {salesKPIs && (
                    <Link
                        href="/dashboard/metas"
                        className="group capsula-card hover:border-rose-500 hover:shadow-rose-500/10 p-2"
                    >
                        <div className="flex items-center gap-5 p-4 rounded-xl transition-all group-hover:bg-rose-500/5">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 text-3xl text-white shadow-xl shadow-rose-500/30 group-hover:scale-110 transition-transform">
                                🎯
                            </div>
                            <div>
                                <p className="text-lg font-black text-gray-900 dark:text-white">
                                    Metas
                                </p>
                                <p className="text-sm font-medium text-gray-500">
                                    Objetivos y merma
                                </p>
                            </div>
                            <span className="ml-auto text-rose-500 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                                →
                            </span>
                        </div>
                    </Link>
                )}
                {showCosts && (
                  <Link
                    href="/dashboard/finanzas"
                    className="group capsula-card hover:border-emerald-500 hover:shadow-emerald-500/10 p-2"
                  >
                    <div className="flex items-center gap-5 p-4 rounded-xl transition-all group-hover:bg-emerald-500/5">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-3xl text-white shadow-xl shadow-emerald-500/30 group-hover:scale-110 transition-transform">
                        📊
                      </div>
                      <div>
                        <p className="text-lg font-black text-gray-900 dark:text-white">
                          Finanzas
                        </p>
                        <p className="text-sm font-medium text-gray-500">
                          P&L y flujo de caja
                        </p>
                      </div>
                      <span className="ml-auto text-emerald-500 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                        →
                      </span>
                    </div>
                  </Link>
                )}
            </div>
        </div>
    );
}
