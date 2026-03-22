
import Link from 'next/link';
import { getRecipesAction } from '@/app/actions/recipe.actions';
import { getMenuItemsWithoutRecipeAction } from '@/app/actions/menu.actions';
import RecipeList from './RecipeList';
import MissingRecipesPanel from './MissingRecipesPanel';

export const dynamic = 'force-dynamic';

export default async function RecetasPage() {
    const [allRecipes, missingResult] = await Promise.all([
        getRecipesAction(),
        getMenuItemsWithoutRecipeAction(),
    ]);

    const missingItems = missingResult.data ?? [];

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
                        {missingItems.length > 0 && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                                ⚠️ {missingItems.length} platos sin receta
                            </span>
                        )}
                    </p>
                </div>
                <Link
                    href="/dashboard/recetas/nueva"
                    className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-amber-500/25 transition-all hover:shadow-xl"
                >
                    ➕ Nueva Receta
                </Link>
            </div>

            {/* Platos del Menú sin Receta */}
            {missingItems.length > 0 && (
                <MissingRecipesPanel items={missingItems} />
            )}

            {/* Recipe List Component */}
            {allRecipes.length > 0 ? (
                <RecipeList recipes={allRecipes} />
            ) : (
                /* Empty State */
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16 text-center dark:border-gray-600">
                    <span className="text-5xl">📋</span>
                    <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
                        No hay recetas
                    </h3>
                    <p className="mt-1 text-gray-500">
                        Comienza creando tu primera receta para calcular sus costos
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
