
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatNumber, formatCurrency, cn } from '@/lib/utils';
import { getRecipeByIdAction } from '@/app/actions/recipe.actions';
import { UNIT_INFO } from '@/lib/constants/units';

import { getSession } from '@/lib/auth';
import { canViewCosts, UserRole } from '@/types';

export default async function RecipeDetailPage({ params }: { params: { id: string } }) {
    const session = await getSession();
    const showCosts = session ? canViewCosts(session.role as UserRole) : false;

    const recipe = await getRecipeByIdAction(params.id);

    if (!recipe) {
        notFound();
    }

    const effectiveOutput = recipe.outputQuantity * (recipe.yieldPercentage / 100);
    const totalCost = recipe.outputItem.currentCost * effectiveOutput;

    return (
        <div className="space-y-6 animate-in">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                    <Link
                        href="/dashboard/recetas"
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                    >
                        ←
                    </Link>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                                {recipe.name}
                            </h1>
                            <span className={cn(
                                'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                                recipe.outputItem.type === 'SUB_RECIPE'
                                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                            )}>
                                {recipe.outputItem.type === 'SUB_RECIPE' ? 'Sub-receta' : 'Producto Final'}
                            </span>
                        </div>
                        <p className="text-gray-500">
                            {recipe.description || 'Sin descripción'}
                        </p>
                    </div>
                </div>

                <div className="flex gap-2">
                    <Link
                        href={`/dashboard/recetas/${params.id}/editar`}
                        className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                    >
                        🖊️ Editar
                    </Link>
                    {/* Placeholder for future actions like 'Print' or 'Export' */}
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                {/* Main Content - Ingredients & Instructions */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Ingredients Table */}
                    <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                            <h3 className="font-semibold text-gray-900 dark:text-white">
                                Ingredientes ({recipe.ingredients.length})
                            </h3>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700/50 dark:text-gray-400">
                                    <tr>
                                        <th className="px-6 py-3 font-medium">Ingrediente</th>
                                        <th className="px-6 py-3 font-medium text-right">Cant. Neta</th>
                                        <th className="px-6 py-3 font-medium text-right">Merma</th>
                                        <th className="px-6 py-3 font-medium text-right">Cant. Bruta</th>
                                        {showCosts && (
                                            <>
                                                <th className="px-6 py-3 font-medium text-right">Costo Unit.</th>
                                                <th className="px-6 py-3 font-medium text-right">Total</th>
                                            </>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {recipe.ingredients.map((ing) => {
                                        const grossQty = ing.quantity / (1 - ing.wastePercentage / 100);
                                        const totalIngCost = grossQty * ing.currentCost; // Approximate if units match

                                        return (
                                            <tr key={ing.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                                <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                                                    {ing.ingredientItem.name}
                                                </td>
                                                <td className="px-6 py-4 text-right text-gray-600 dark:text-gray-300">
                                                    {formatNumber(ing.quantity)} {ing.unit}
                                                </td>
                                                <td className="px-6 py-4 text-right text-gray-500">
                                                    {ing.wastePercentage > 0 ? (
                                                        <span className="text-red-600 dark:text-red-400">
                                                            {ing.wastePercentage}%
                                                        </span>
                                                    ) : '-'}
                                                </td>
                                                <td className="px-6 py-4 text-right text-gray-600 dark:text-gray-300">
                                                    {formatNumber(grossQty, 3)} {ing.unit}
                                                </td>
                                                {showCosts && (
                                                    <>
                                                        <td className="px-6 py-4 text-right text-gray-600 dark:text-gray-400">
                                                            {formatCurrency(ing.currentCost)}
                                                        </td>
                                                        <td className="px-6 py-4 text-right font-medium text-gray-900 dark:text-white">
                                                            ~{formatCurrency(totalIngCost)}
                                                        </td>
                                                    </>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Sidebar - Stats & Costs */}
                <div className="space-y-6">
                    {/* Production Info */}
                    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                        <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">
                            Detalles de Producción
                        </h3>
                        <div className="space-y-4">
                            <div className="flex justify-between border-b border-gray-100 pb-2 dark:border-gray-700">
                                <span className="text-sm text-gray-500">Cantidad Base</span>
                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                    {formatNumber(recipe.outputQuantity)} {recipe.outputUnit}
                                </span>
                            </div>
                            <div className="flex justify-between border-b border-gray-100 pb-2 dark:border-gray-700">
                                <span className="text-sm text-gray-500">Rendimiento (Yield)</span>
                                <span className={`text-sm font-medium ${recipe.yieldPercentage < 100 ? 'text-amber-600' : 'text-green-600'
                                    }`}>
                                    {recipe.yieldPercentage}%
                                </span>
                            </div>
                            <div className="flex justify-between border-b border-gray-100 pb-2 dark:border-gray-700">
                                <span className="text-sm text-gray-500">Producción Efectiva</span>
                                <span className="text-sm font-bold text-gray-900 dark:text-white">
                                    {formatNumber(effectiveOutput)} {recipe.outputUnit}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-sm text-gray-500">Tiempo Total</span>
                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                    {(recipe.prepTime || 0) + (recipe.cookTime || 0)} min
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Cost Summary */}
                    {showCosts && (
                        <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 shadow-sm dark:border-amber-800 dark:from-amber-900/20 dark:to-orange-900/20">
                            <div className="mb-4 flex items-center gap-2">
                                <span className="text-2xl">💰</span>
                                <h3 className="font-semibold text-gray-900 dark:text-white">
                                    Análisis de Costos
                                </h3>
                            </div>

                            <div className="space-y-1">
                                <p className="text-xs text-gray-500 uppercase tracking-wider">Costo Unitario</p>
                                <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                                    {formatCurrency(recipe.outputItem.currentCost)}
                                </p>
                                <p className="text-sm text-gray-500">
                                    por {UNIT_INFO[recipe.outputUnit as keyof typeof UNIT_INFO]?.labelEs || recipe.outputUnit}
                                </p>
                            </div>

                            <div className="mt-6 space-y-3 border-t border-amber-200 pt-4 dark:border-amber-700">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600 dark:text-gray-400">Costo Total Lote:</span>
                                    <span className="font-medium text-gray-900 dark:text-white">
                                        {formatCurrency(totalCost)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-blue-800 dark:border-blue-900/30 dark:bg-blue-900/20 dark:text-blue-300">
                        <p className="text-xs">
                            <span className="font-bold">Info:</span> Los costos mostrados son calculados automáticamente basados en el precio actual de inventario (FIFO/Promedio) de cada ingrediente.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
