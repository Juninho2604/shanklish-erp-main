'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth.store';
import { formatNumber, formatCurrency, getStockStatus, cn } from '@/lib/utils';
import { InventoryItemType } from '@/types';
import { ItemEditDialog } from './edit-item-dialog';
import { deleteInventoryItemAction } from '@/app/actions/inventory.actions';
import { Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

type FilterType = 'ALL' | InventoryItemType;
type StockFilter = 'ALL' | 'LOW' | 'OK';

interface InventoryViewProps {
    initialItems: any[];
    initialAreas?: { id: string; name: string }[];
}

export default function InventoryView({ initialItems, initialAreas = [] }: InventoryViewProps) {
    const { canViewCosts, hasRole } = useAuthStore();
    const showCosts = canViewCosts();

    // Filtros
    const [typeFilter, setTypeFilter] = useState<FilterType>('ALL');
    const [stockFilter, setStockFilter] = useState<StockFilter>('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedArea, setSelectedArea] = useState<string>('');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const [categoryFilter, setCategoryFilter] = useState('ALL');

    // Estado para edición
    const [editingItem, setEditingItem] = useState<any | null>(null);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);

    const handleDelete = async (item: any) => {
        if (!confirm(`¿Estás seguro de eliminar el producto "${item.name}"? Esta acción no se puede deshacer.`)) return;

        setIsDeleting(item.id);
        try {
            const res = await deleteInventoryItemAction(item.id);
            if (res.success) {
                toast.success('Producto eliminado correctamente');
                // Optimistically update UI or wait for revalidate
                window.location.reload();
            } else {
                toast.error(res.message);
            }
        } catch (error) {
            toast.error('Error al eliminar el producto');
            console.error(error);
        } finally {
            setIsDeleting(null);
        }
    };

    // Obtener categorías únicas
    const uniqueCategories = useMemo(() => {
        const cats = new Set(initialItems.map(i => i.category).filter(Boolean));
        return Array.from(cats).sort();
    }, [initialItems]);

    // Items filtrados
    const filteredItems = useMemo(() => {
        let items = initialItems.filter(item => {
            // Filtro por tipo
            if (typeFilter !== 'ALL' && item.type !== typeFilter) return false;

            // Filtro por stock
            if (stockFilter !== 'ALL') {
                const stockToCheck = selectedArea
                    ? (item.stockByArea?.find((s: any) => s.areaId === selectedArea)?.quantity || 0)
                    : item.currentStock;

                const status = getStockStatus(stockToCheck, item.minimumStock, item.reorderPoint);
                if (stockFilter === 'LOW' && status.status === 'ok') return false;
                if (stockFilter === 'OK' && status.status !== 'ok') return false;
            }

            // Filtro por categoría (Columna)
            if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;

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

        // Lógica de Ordenamiento
        if (sortConfig) {
            items.sort((a, b) => {
                let aValue = a[sortConfig.key];
                let bValue = b[sortConfig.key];

                // Casos especiales para campos anidados o calculados
                if (sortConfig.key === 'currentStock') {
                    aValue = selectedArea
                        ? (a.stockByArea?.find((s: any) => s.areaId === selectedArea)?.quantity || 0)
                        : a.currentStock;
                    bValue = selectedArea
                        ? (b.stockByArea?.find((s: any) => s.areaId === selectedArea)?.quantity || 0)
                        : b.currentStock;
                }

                if (aValue === bValue) return 0;

                // Manejo de nulos
                if (aValue === null || aValue === undefined) return 1;
                if (bValue === null || bValue === undefined) return -1;

                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return items;
    }, [initialItems, typeFilter, stockFilter, searchQuery, selectedArea, categoryFilter, sortConfig]);

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const SortIcon = ({ columnKey }: { columnKey: string }) => {
        if (sortConfig?.key !== columnKey) return <span className="ml-1 text-gray-300 opacity-0 group-hover:opacity-50 transition-opacity">↕</span>;
        return <span className="ml-1 text-amber-600 font-bold">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
    };

    // Stats dinámicos
    const stats = useMemo(() => ({
        total: initialItems.length,
        rawMaterials: initialItems.filter(i => i.type === 'RAW_MATERIAL').length,
        subRecipes: initialItems.filter(i => i.type === 'SUB_RECIPE').length,
        finished: initialItems.filter(i => i.type === 'FINISHED_GOOD').length,
        lowStock: initialItems.filter(i =>
            getStockStatus(i.currentStock, i.minimumStock, i.reorderPoint).status !== 'ok'
        ).length,
    }), [initialItems]); // Stats globales siempre

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

                <div className="flex items-center gap-4">
                    {/* Selector de Almacén */}
                    <div className="relative">
                        <select
                            value={selectedArea}
                            onChange={(e) => setSelectedArea(e.target.value)}
                            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-smfont-medium text-gray-700 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                        >
                            <option value="">🏢 Todos los Almacenes</option>
                            {initialAreas.map(area => (
                                <option key={area.id} value={area.id}>{area.name}</option>
                            ))}
                        </select>
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
                        <Link
                            href="/dashboard/inventario/importar"
                            className="inline-flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm font-medium text-green-700 transition-all hover:bg-green-100 dark:border-green-900 dark:bg-green-900/20 dark:text-green-300"
                        >
                            📥 Importar Excel
                        </Link>
                        <Link
                            href="/dashboard/inventario/diario"
                            className="inline-flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-4 py-2.5 text-sm font-medium text-purple-700 transition-all hover:bg-purple-100 dark:border-purple-900 dark:bg-purple-900/20 dark:text-purple-300"
                        >
                            📅 Cierre Diario
                        </Link>
                        <Link
                            href="/dashboard/inventario/historial"
                            className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 transition-all hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-900/20 dark:text-blue-300"
                        >
                            📜 Historial
                        </Link>
                    </div>
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
                <div className="overflow-x-auto max-h-[70vh]">
                    <table className="w-full relative">
                        <thead className="sticky top-0 z-10 shadow-sm">
                            <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                                <th
                                    className="group cursor-pointer px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700/50"
                                    onClick={() => handleSort('name')}
                                >
                                    <div className="flex items-center">
                                        Item <SortIcon columnKey="name" />
                                    </div>
                                </th>
                                <th
                                    className="group cursor-pointer px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700/50"
                                    onClick={() => handleSort('type')}
                                >
                                    <div className="flex items-center">
                                        Tipo <SortIcon columnKey="type" />
                                    </div>
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                                    <div className="flex items-center gap-2">
                                        <div
                                            className="group flex cursor-pointer items-center hover:text-gray-700 dark:hover:text-gray-300"
                                            onClick={() => handleSort('category')}
                                        >
                                            Categoría <SortIcon columnKey="category" />
                                        </div>
                                        <select
                                            value={categoryFilter}
                                            onChange={(e) => setCategoryFilter(e.target.value)}
                                            className="ml-1 rounded border-gray-200 py-0.5 px-1 text-xs font-normal text-gray-600 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <option value="ALL">Todas</option>
                                            {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                </th>
                                <th
                                    className="group cursor-pointer px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700/50"
                                    onClick={() => handleSort('currentStock')}
                                >
                                    <div className="flex items-center justify-end">
                                        {selectedArea ? 'Stock Local' : 'Stock Global'} <SortIcon columnKey="currentStock" />
                                    </div>
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
                                // CALCULAR STOCK A MOSTRAR
                                const displayStock = selectedArea
                                    ? (item.stockByArea?.find((s: any) => s.areaId === selectedArea)?.quantity || 0)
                                    : item.currentStock;

                                const stockStatus = getStockStatus(displayStock, item.minimumStock, item.reorderPoint);
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
                                                <span className={cn(
                                                    "font-mono text-sm font-semibold",
                                                    displayStock === 0 ? "text-gray-400" : "text-gray-900 dark:text-white"
                                                )}>
                                                    {formatNumber(displayStock)}
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
                                            <button
                                                onClick={() => setEditingItem(item)}
                                                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-gray-700"
                                                title="Editar ítem"
                                            >
                                                ✏️
                                            </button>
                                            {hasRole(['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER']) && (
                                                <button
                                                    onClick={() => handleDelete(item)}
                                                    disabled={isDeleting === item.id}
                                                    className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 disabled:opacity-50"
                                                    title="Eliminar ítem (Solo Gerentes)"
                                                >
                                                    {isDeleting === item.id ? (
                                                        <span className="animate-spin">⏳</span>
                                                    ) : (
                                                        <Trash2 className="h-4 w-4" />
                                                    )}
                                                </button>
                                            )}
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

            {/* Edit Dialog */}
            {editingItem && (
                <ItemEditDialog
                    item={editingItem}
                    isOpen={!!editingItem}
                    onClose={() => setEditingItem(null)}
                />
            )}
        </div>
    );
}
