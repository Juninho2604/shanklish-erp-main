'use client';

import Link from 'next/link';
import { useAuthStore } from '@/stores/auth.store';
import { mockSubRecipes, mockFinishedGoods } from '@/lib/mock-data';
import { formatNumber, formatCurrency, cn } from '@/lib/utils';

export default function RecetasPage() {
    const { canViewCosts } = useAuthStore();
    const showCosts = canViewCosts();

    const allRecipes = [...mockSubRecipes, ...mockFinishedGoods].map(item => ({
        ...item,
        isApproved: true, // Mock: todas aprobadas
        createdBy: 'Chef Víctor',
    }));

    return (
        <div className="space-y-6 animate-in">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        Recetas
                    </h1>
                    <p className="text-gray-500">
                        {allRecipes.length} recetas disponibles
                    </p>
                </div>
                <Link
                    href="/dashboard/recetas/nueva"
                    className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-amber-500/25 transition-all hover:shadow-xl"
                >
                    ➕ Nueva Receta
                </Link>
            </div>

            {/* Recipe Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {allRecipes.map((recipe) => (
                    <div
                        key={recipe.id}
                        className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-amber-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
                    >
                        {/* Header */}
                        <div className="mb-4 flex items-start justify-between">
                            <div className="flex items-center gap-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 text-2xl dark:from-amber-900/30 dark:to-orange-900/30">
                                    {recipe.type === 'SUB_RECIPE' ? '🧀' : '🍽️'}
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900 dark:text-white">
                                        {recipe.name}
                                    </h3>
                                    <span className={cn(
                                        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                                        recipe.type === 'SUB_RECIPE'
                                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                    )}>
                                        {recipe.type === 'SUB_RECIPE' ? 'Sub-receta' : 'Producto Final'}
                                    </span>
                                </div>
                            </div>
                            {recipe.isApproved && (
                                <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                    ✓ Aprobada
                                </span>
                            )}
                        </div>

                        {/* Description */}
                        {recipe.description && (
                            <p className="mb-4 line-clamp-2 text-sm text-gray-500">
                                {recipe.description}
                            </p>
                        )}

                        {/* Details */}
                        <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
                            <div className="rounded-lg bg-gray-50 p-2 dark:bg-gray-700/50">
                                <p className="text-xs text-gray-500">Rinde</p>
                                <p className="font-medium text-gray-900 dark:text-white">
                                    1 {recipe.baseUnit}
                                </p>
                            </div>
                            <div className="rounded-lg bg-gray-50 p-2 dark:bg-gray-700/50">
                                <p className="text-xs text-gray-500">Categoría</p>
                                <p className="font-medium text-gray-900 dark:text-white">
                                    {recipe.category}
                                </p>
                            </div>
                        </div>

                        {/* Cost (if visible) */}
                        {showCosts && recipe.costPerUnit && (
                            <div className="mb-4 rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 p-3 dark:from-amber-900/10 dark:to-orange-900/10">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                        Costo unitario:
                                    </span>
                                    <span className="font-mono text-lg font-bold text-amber-600 dark:text-amber-400">
                                        {formatCurrency(recipe.costPerUnit)}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Footer */}
                        <div className="flex items-center justify-between border-t border-gray-100 pt-4 dark:border-gray-700">
                            <p className="text-xs text-gray-500">
                                Por: {recipe.createdBy}
                            </p>
                            <Link
                                href={`/dashboard/recetas/${recipe.id}`}
                                className="text-sm font-medium text-amber-600 transition-colors hover:text-amber-700 dark:text-amber-400"
                            >
                                Ver detalles →
                            </Link>
                        </div>
                    </div>
                ))}
            </div>

            {/* Empty State */}
            {allRecipes.length === 0 && (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16 text-center dark:border-gray-600">
                    <span className="text-5xl">📋</span>
                    <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
                        No hay recetas
                    </h3>
                    <p className="mt-1 text-gray-500">
                        Comienza creando tu primera receta
                    </p>
                    <Link
                        href="/dashboard/recetas/nueva"
                        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white"
                    >
                        ➕ Crear Receta
                    </Link>
                </div>
            )}
        </div>
    );
}
