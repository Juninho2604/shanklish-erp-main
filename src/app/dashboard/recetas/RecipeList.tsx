'use client';

import Link from 'next/link';
import { useAuthStore } from '@/stores/auth.store';
import { formatCurrency, cn } from '@/lib/utils';
import { updateRecipeCostAction } from '@/app/actions/recipe.actions';
import { toast } from 'react-hot-toast';
import { useState, useEffect } from 'react';
import { RefreshCcw } from 'lucide-react';

interface Recipe {
    id: string;
    name: string;
    description: string | null;
    type: string;
    category: string;
    baseUnit: string;
    costPerUnit: number;
    isApproved: boolean;
    createdBy: string;
}

interface RecipeListProps {
    recipes: Recipe[];
}

export default function RecipeList({ recipes }: RecipeListProps) {
    const { canViewCosts, user } = useAuthStore();
    const [showCosts, setShowCosts] = useState(false);
    useEffect(() => { setShowCosts(canViewCosts()); }, [canViewCosts]);
    const [updatingId, setUpdatingId] = useState<string | null>(null);

    const handleCalculateCost = async (e: React.MouseEvent, recipe: Recipe) => {
        e.preventDefault();
        e.stopPropagation();

        if (!user) return;

        setUpdatingId(recipe.id);
        toast.loading('Calculando costos...', { id: 'cost-calc' });

        try {
            const result = await updateRecipeCostAction(recipe.id, user.id);

            if (result.success) {
                toast.success(result.message, { id: 'cost-calc' });
            } else {
                toast.error(result.message || 'Error al calcular costos', { id: 'cost-calc' });
            }
        } catch (error) {
            console.error(error);
            toast.error('Error de conexión', { id: 'cost-calc' });
        } finally {
            setUpdatingId(null);
        }
    };

    // Group recipes by category
    const groupedRecipes = recipes.reduce((acc, recipe) => {
        const cat = recipe.category || 'Sin Categoría';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(recipe);
        return acc;
    }, {} as Record<string, Recipe[]>);

    const sortedCategories = Object.keys(groupedRecipes).sort();

    return (
        <div className="space-y-8">
            {sortedCategories.map(category => (
                <div key={category} className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-gray-200 pb-2 dark:border-gray-700">
                        <span className="text-2xl">
                            {category.includes('CREMA') ? '🥣' :
                                category.includes('PANTRY') ? '🥫' :
                                    category.includes('PRODUCCION') ? '🏭' : '📋'}
                        </span>
                        <h2 className="text-xl font-bold text-gray-800 dark:text-white">
                            {category}
                        </h2>
                        <span className="text-sm text-gray-500">
                            ({groupedRecipes[category].length})
                        </span>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {groupedRecipes[category].map((recipe) => (
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
                                {showCosts && (
                                    <div className="mb-4 rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 p-3 dark:from-amber-900/10 dark:to-orange-900/10">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-gray-600 dark:text-gray-400">
                                                Costo unitario:
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-lg font-bold text-amber-600 dark:text-amber-400">
                                                    {formatCurrency(recipe.costPerUnit)}
                                                </span>
                                                <button
                                                    onClick={(e) => handleCalculateCost(e, recipe)}
                                                    disabled={updatingId === recipe.id}
                                                    className="rounded-full p-1 text-amber-600 hover:bg-amber-100 disabled:opacity-50 dark:text-amber-400 dark:hover:bg-amber-900/30"
                                                    title="Recalcular costos"
                                                >
                                                    <RefreshCcw className={cn("h-4 w-4", updatingId === recipe.id && "animate-spin")} />
                                                </button>
                                            </div>
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
                </div>
            ))}
        </div>
    );
}
