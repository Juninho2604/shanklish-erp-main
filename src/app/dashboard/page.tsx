'use client';

import { useAuthStore } from '@/stores/auth.store';
import { mockLowStockItems, mockInventoryItems, mockSubRecipes, mockFinishedGoods } from '@/lib/mock-data';
import { formatNumber, formatCurrency, getStockStatus } from '@/lib/utils';
import Link from 'next/link';

export default function DashboardPage() {
    const { user, canViewCosts } = useAuthStore();
    const showCosts = canViewCosts();

    // Estadísticas generales
    const stats = {
        totalItems: mockInventoryItems.length,
        lowStockCount: mockLowStockItems.length,
        subRecipes: mockSubRecipes.length,
        finishedGoods: mockFinishedGoods.length,
    };

    return (
        <div className="space-y-6 animate-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        ¡Bienvenido, {user?.firstName}! 👋
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400">
                        Resumen de operaciones - Gerencia Operativa
                    </p>
                </div>
                <Link
                    href="/dashboard/recetas/nueva"
                    className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-amber-500/25 transition-all hover:shadow-xl"
                >
                    <span>➕</span>
                    Nueva Receta
                </Link>
            </div>

            {/* Stats Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* Total Items */}
                <div className="stat-card">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                                Total Insumos
                            </p>
                            <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">
                                {stats.totalItems}
                            </p>
                        </div>
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-2xl dark:bg-blue-900/30">
                            📦
                        </div>
                    </div>
                </div>

                {/* Low Stock Alert */}
                <div className="stat-card border-red-200 dark:border-red-800">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                                Stock Bajo
                            </p>
                            <p className="mt-1 text-3xl font-bold text-red-600 dark:text-red-400">
                                {stats.lowStockCount}
                            </p>
                        </div>
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 text-2xl dark:bg-red-900/30">
                            ⚠️
                        </div>
                    </div>
                    {stats.lowStockCount > 0 && (
                        <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                            Requieren atención inmediata
                        </p>
                    )}
                </div>

                {/* Sub-recipes */}
                <div className="stat-card">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                                Sub-recetas
                            </p>
                            <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">
                                {stats.subRecipes}
                            </p>
                        </div>
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-2xl dark:bg-emerald-900/30">
                            🧀
                        </div>
                    </div>
                </div>

                {/* Products */}
                <div className="stat-card">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                                Productos
                            </p>
                            <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">
                                {stats.finishedGoods}
                            </p>
                        </div>
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-2xl dark:bg-amber-900/30">
                            🍽️
                        </div>
                    </div>
                </div>
            </div>

            {/* Low Stock Alert Table */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 text-xl dark:bg-red-900/30">
                            🚨
                        </div>
                        <div>
                            <h2 className="font-semibold text-gray-900 dark:text-white">
                                Alertas de Stock Bajo
                            </h2>
                            <p className="text-sm text-gray-500">
                                Insumos por debajo del mínimo o punto de reorden
                            </p>
                        </div>
                    </div>
                    <Link
                        href="/dashboard/inventario"
                        className="text-sm font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400"
                    >
                        Ver todo →
                    </Link>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                                    Insumo
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                                    Categoría
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                                    Stock Actual
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                                    Mínimo
                                </th>
                                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">
                                    Estado
                                </th>
                                {showCosts && (
                                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                                        Costo Unit.
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {mockLowStockItems.map((item) => {
                                const stockStatus = getStockStatus(item.currentStock, item.minimumStock, item.reorderPoint);
                                return (
                                    <tr key={item.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-lg dark:bg-gray-700">
                                                    {item.type === 'RAW_MATERIAL' ? '📦' : item.type === 'SUB_RECIPE' ? '🧀' : '🍽️'}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-gray-900 dark:text-white">
                                                        {item.name}
                                                    </p>
                                                    <p className="text-xs text-gray-500">{item.sku}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500">
                                            {item.category || '-'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white">
                                                {formatNumber(item.currentStock)} {item.baseUnit}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right text-sm text-gray-500">
                                            {formatNumber(item.minimumStock)} {item.baseUnit}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`alert-badge ${stockStatus.status === 'critical' ? 'alert-badge-critical' :
                                                    stockStatus.status === 'warning' ? 'alert-badge-warning' :
                                                        'alert-badge-success'
                                                }`}>
                                                {stockStatus.status === 'critical' && '🔴'}
                                                {stockStatus.status === 'warning' && '🟡'}
                                                {stockStatus.label}
                                            </span>
                                        </td>
                                        {showCosts && (
                                            <td className="px-6 py-4 text-right font-mono text-sm text-gray-900 dark:text-white">
                                                {formatCurrency(item.costPerUnit || 0)}
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {mockLowStockItems.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <span className="text-4xl">✅</span>
                        <p className="mt-2 font-medium text-gray-900 dark:text-white">
                            ¡Todo en orden!
                        </p>
                        <p className="text-sm text-gray-500">
                            No hay insumos con stock bajo
                        </p>
                    </div>
                )}
            </div>

            {/* Quick Actions */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Link
                    href="/dashboard/recetas/nueva"
                    className="group flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 transition-all hover:border-amber-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
                >
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-2xl text-white shadow-lg shadow-amber-500/25">
                        ➕
                    </div>
                    <div>
                        <p className="font-semibold text-gray-900 dark:text-white">
                            Crear Receta
                        </p>
                        <p className="text-sm text-gray-500">
                            Con calculadora de costos
                        </p>
                    </div>
                    <span className="ml-auto text-gray-400 transition-transform group-hover:translate-x-1">
                        →
                    </span>
                </Link>

                <Link
                    href="/dashboard/inventario"
                    className="group flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 transition-all hover:border-blue-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
                >
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 text-2xl text-white shadow-lg shadow-blue-500/25">
                        📦
                    </div>
                    <div>
                        <p className="font-semibold text-gray-900 dark:text-white">
                            Ver Inventario
                        </p>
                        <p className="text-sm text-gray-500">
                            Gestionar insumos
                        </p>
                    </div>
                    <span className="ml-auto text-gray-400 transition-transform group-hover:translate-x-1">
                        →
                    </span>
                </Link>

                <Link
                    href="/dashboard/produccion"
                    className="group flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 transition-all hover:border-emerald-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
                >
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-500 text-2xl text-white shadow-lg shadow-emerald-500/25">
                        🏭
                    </div>
                    <div>
                        <p className="font-semibold text-gray-900 dark:text-white">
                            Producción
                        </p>
                        <p className="text-sm text-gray-500">
                            Órdenes de trabajo
                        </p>
                    </div>
                    <span className="ml-auto text-gray-400 transition-transform group-hover:translate-x-1">
                        →
                    </span>
                </Link>
            </div>
        </div>
    );
}
