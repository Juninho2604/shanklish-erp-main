'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth.store';
import { mockInventoryItems } from '@/lib/mock-data';
import { formatNumber, formatCurrency, getStockStatus, cn } from '@/lib/utils';
import { InventoryItemType } from '@/types';

type FilterType = 'ALL' | InventoryItemType;
type StockFilter = 'ALL' | 'LOW' | 'OK';

export default function InventarioPage() {
    const { canViewCosts } = useAuthStore();
    const showCosts = canViewCosts();

    // Filtros
    const [typeFilter, setTypeFilter] = useState<FilterType>('ALL');
    const [stockFilter, setStockFilter] = useState<StockFilter>('ALL');
    const [searchQuery, setSearchQuery] = useState('');

    // Items filtrados
    const filteredItems = useMemo(() => {
        return mockInventoryItems.filter(item => {
            // Filtro por tipo
            if (typeFilter !== 'ALL' && item.type !== typeFilter) return false;

            // Filtro por stock
            if (stockFilter !== 'ALL') {
                const status = getStockStatus(item.currentStock, item.minimumStock, item.reorderPoint);
                if (stockFilter === 'LOW' && status.status === 'ok') return false;
                if (stockFilter === 'OK' && status.status !== 'ok') return false;
            }

            // Filtro por búsqueda
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                return (
                    item.name.toLowerCase().includes(query) ||
                    item.sku.toLowerCase().includes(query) ||
                    item.category?.toLowerCase().includes(query)
                );
            }

            return true;
        });
    }, [typeFilter, stockFilter, searchQuery]);

    // Stats
    const stats = {
        total: mockInventoryItems.length,
        rawMaterials: mockInventoryItems.filter(i => i.type === 'RAW_MATERIAL').length,
        subRecipes: mockInventoryItems.filter(i => i.type === 'SUB_RECIPE').length,
        finished: mockInventoryItems.filter(i => i.type === 'FINISHED_GOOD').length,
        lowStock: mockInventoryItems.filter(i =>
            getStockStatus(i.currentStock, i.minimumStock, i.reorderPoint).status !== 'ok'
        ).length,
    };

    return (
        <div className="space-y-6 animate-in">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        Inventario
                    </h1>
                    <p className="text-gray-500">
                        {filteredItems.length} de {stats.total} items
                    </p>
                </div>
                <div className="flex gap-2">
                    <Link
                        href="/dashboard/inventario/entrada"
                        className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-amber-500/25 transition-all hover:shadow-xl"
                    >
                        📄 Entrada de Mercancía
                    </Link>
                    <Link
                        href="/dashboard/inventario/compras"
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
                    >
                        📦 Compra Rápida
                    </Link>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <button
                    onClick={() => { setTypeFilter('ALL'); setStockFilter('ALL'); }}
                    className={cn(
                        'rounded-lg border p-4 text-left transition-all',
                        typeFilter === 'ALL' && stockFilter === 'ALL'
                            ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                            : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800'
                    )}
                >
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
                    <p className="text-sm text-gray-500">Total Items</p>
                </button>

                <button
                    onClick={() => { setTypeFilter('RAW_MATERIAL'); setStockFilter('ALL'); }}
                    className={cn(
                        'rounded-lg border p-4 text-left transition-all',
                        typeFilter === 'RAW_MATERIAL'
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800'
                    )}
                >
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.rawMaterials}</p>
                    <p className="text-sm text-gray-500">📦 Insumos</p>
                </button>

                <button
                    onClick={() => { setTypeFilter('SUB_RECIPE'); setStockFilter('ALL'); }}
                    className={cn(
                        'rounded-lg border p-4 text-left transition-all',
                        typeFilter === 'SUB_RECIPE'
                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                            : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800'
                    )}
                >
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.subRecipes}</p>
                    <p className="text-sm text-gray-500">🧀 Sub-recetas</p>
                </button>

                <button
                    onClick={() => { setTypeFilter('FINISHED_GOOD'); setStockFilter('ALL'); }}
                    className={cn(
                        'rounded-lg border p-4 text-left transition-all',
                        typeFilter === 'FINISHED_GOOD'
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                            : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800'
                    )}
                >
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.finished}</p>
                    <p className="text-sm text-gray-500">🍽️ Productos</p>
                </button>

                <button
                    onClick={() => { setTypeFilter('ALL'); setStockFilter('LOW'); }}
                    className={cn(
                        'rounded-lg border p-4 text-left transition-all',
                        stockFilter === 'LOW'
                            ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                            : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800'
                    )}
                >
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.lowStock}</p>
                    <p className="text-sm text-gray-500">⚠️ Stock Bajo</p>
                </button>
            </div>

            {/* Search and Filters */}
            <div className="flex flex-col gap-4 sm:flex-row">
                <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Buscar por nombre, SKU o categoría..."
                        className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-gray-900 placeholder:text-gray-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    />
                </div>
            </div>

            {/* Table */}
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                                    Item
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                                    Tipo
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                                    Categoría
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                                    Stock
                                </th>
                                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">
                                    Estado
                                </th>
                                {showCosts && (
                                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                                        Costo/Unidad
                                    </th>
                                )}
                                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">
                                    Acciones
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {filteredItems.map((item) => {
                                const stockStatus = getStockStatus(item.currentStock, item.minimumStock, item.reorderPoint);
                                return (
                                    <tr key={item.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-lg dark:bg-gray-700">
                                                    {item.type === 'RAW_MATERIAL' ? '📦' :
                                                        item.type === 'SUB_RECIPE' ? '🧀' : '🍽️'}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-gray-900 dark:text-white">
                                                        {item.name}
                                                    </p>
                                                    <p className="text-xs text-gray-500">{item.sku}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={cn(
                                                'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
                                                item.type === 'RAW_MATERIAL'
                                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                                    : item.type === 'SUB_RECIPE'
                                                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                                                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                            )}>
                                                {item.type === 'RAW_MATERIAL' ? 'Insumo' :
                                                    item.type === 'SUB_RECIPE' ? 'Sub-receta' : 'Producto'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500">
                                            {item.category || '-'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div>
                                                <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white">
                                                    {formatNumber(item.currentStock)}
                                                </span>
                                                <span className="ml-1 text-xs text-gray-500">{item.baseUnit}</span>
                                            </div>
                                            <p className="text-xs text-gray-400">
                                                Mín: {formatNumber(item.minimumStock)}
                                            </p>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`alert-badge ${stockStatus.status === 'critical' ? 'alert-badge-critical' :
                                                stockStatus.status === 'warning' ? 'alert-badge-warning' :
                                                    'alert-badge-success'
                                                }`}>
                                                {stockStatus.status === 'critical' && '🔴 '}
                                                {stockStatus.status === 'warning' && '🟡 '}
                                                {stockStatus.status === 'ok' && '🟢 '}
                                                {stockStatus.label}
                                            </span>
                                        </td>
                                        {showCosts && (
                                            <td className="px-6 py-4 text-right font-mono text-sm text-gray-900 dark:text-white">
                                                {item.costPerUnit ? formatCurrency(item.costPerUnit) : '-'}
                                            </td>
                                        )}
                                        <td className="px-6 py-4 text-center">
                                            <button className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700">
                                                ✏️
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {filteredItems.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <span className="text-4xl">🔍</span>
                        <p className="mt-2 font-medium text-gray-900 dark:text-white">
                            No se encontraron items
                        </p>
                        <p className="text-sm text-gray-500">
                            Intenta con otros filtros
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
