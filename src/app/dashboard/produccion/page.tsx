'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth.store';
import { mockAreas } from '@/lib/mock-data';
import { formatNumber, formatCurrency, cn } from '@/lib/utils';
import {
    quickProductionAction,
    calculateRequirementsAction,
    getProductionRecipesAction,
    IngredientRequirement,
    ProductionActionResult,
} from '@/app/actions/production.actions';

interface RecipeOption {
    id: string;
    name: string;
    outputQuantity: number;
    outputUnit: string;
    ingredientCount: number;
}

export default function ProduccionPage() {
    const { user, canViewCosts } = useAuthStore();
    const showCosts = canViewCosts();

    // Estado
    const [recipes, setRecipes] = useState<RecipeOption[]>([]);
    const [selectedRecipe, setSelectedRecipe] = useState('');
    const [quantity, setQuantity] = useState<number>(0);
    const [areaId, setAreaId] = useState('area-cocina');
    const [notes, setNotes] = useState('');

    // Requerimientos calculados
    const [requirements, setRequirements] = useState<IngredientRequirement[]>([]);
    const [isCalculating, setIsCalculating] = useState(false);

    // Estado de procesamiento
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [result, setResult] = useState<ProductionActionResult | null>(null);

    // Historial de producciones
    const [productionHistory, setProductionHistory] = useState<{
        orderNumber: string;
        product: string;
        quantity: number;
        unit: string;
        timestamp: Date;
    }[]>([]);

    // Cargar recetas al inicio
    useEffect(() => {
        getProductionRecipesAction().then(setRecipes);
    }, []);

    // Calcular requerimientos cuando cambia receta o cantidad
    useEffect(() => {
        if (!selectedRecipe || quantity <= 0) {
            setRequirements([]);
            return;
        }

        setIsCalculating(true);
        calculateRequirementsAction(selectedRecipe, quantity)
            .then(res => {
                if (res.success) {
                    setRequirements(res.requirements);
                }
            })
            .finally(() => setIsCalculating(false));
    }, [selectedRecipe, quantity]);

    // Obtener receta seleccionada
    const selectedRecipeData = recipes.find(r => r.id === selectedRecipe);

    // Verificar si todos los ingredientes tienen stock suficiente
    const allIngredientsAvailable = requirements.length > 0 &&
        requirements.every(r => r.sufficient);

    // Manejar producción
    const handleProduction = async () => {
        if (!selectedRecipe || quantity <= 0 || !allIngredientsAvailable) return;

        setIsSubmitting(true);
        setResult(null);

        try {
            const response = await quickProductionAction({
                recipeId: selectedRecipe,
                recipeName: selectedRecipeData?.name || '',
                actualQuantity: quantity,
                unit: selectedRecipeData?.outputUnit || 'KG',
                areaId,
                notes,
            });

            setResult(response);

            if (response.success && response.data) {
                // Agregar al historial
                setProductionHistory(prev => [{
                    orderNumber: response.data!.orderNumber || 'N/A',
                    product: response.data!.productAdded?.name || '',
                    quantity: response.data!.productAdded?.quantity || 0,
                    unit: response.data!.productAdded?.unit || '',
                    timestamp: new Date(),
                }, ...prev.slice(0, 4)]);

                // Limpiar formulario
                setSelectedRecipe('');
                setQuantity(0);
                setNotes('');
                setRequirements([]);
            }
        } catch (error) {
            setResult({
                success: false,
                message: 'Error al procesar la producción',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6 animate-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        Producción
                    </h1>
                    <p className="text-gray-500">
                        Registrar producción y consumo de ingredientes
                    </p>
                </div>
                <Link
                    href="/dashboard/inventario/compras"
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
                >
                    📦 Registrar Compra
                </Link>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                {/* Formulario de producción */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Selección de receta y cantidad */}
                    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                        <div className="mb-6 flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-500 text-2xl text-white shadow-lg">
                                🏭
                            </div>
                            <div>
                                <h2 className="font-semibold text-gray-900 dark:text-white">
                                    Finalizar Producción
                                </h2>
                                <p className="text-sm text-gray-500">
                                    Chef: {user?.firstName} {user?.lastName}
                                </p>
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            {/* Receta */}
                            <div className="sm:col-span-2">
                                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    ¿Qué acabas de producir? *
                                </label>
                                <select
                                    value={selectedRecipe}
                                    onChange={(e) => {
                                        setSelectedRecipe(e.target.value);
                                        const recipe = recipes.find(r => r.id === e.target.value);
                                        if (recipe) {
                                            setQuantity(recipe.outputQuantity);
                                        }
                                    }}
                                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                >
                                    <option value="">Seleccionar producto...</option>
                                    {recipes.map(recipe => (
                                        <option key={recipe.id} value={recipe.id}>
                                            {recipe.name} (Rinde: {recipe.outputQuantity} {recipe.outputUnit})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Cantidad producida */}
                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Cantidad Producida *
                                </label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        value={quantity || ''}
                                        onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
                                        min="0"
                                        step="0.1"
                                        placeholder="20"
                                        className="w-24 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                    />
                                    <span className="font-medium text-gray-900 dark:text-white">
                                        {selectedRecipeData?.outputUnit || 'unidades'}
                                    </span>
                                </div>
                            </div>

                            {/* Área */}
                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Área de Producción
                                </label>
                                <select
                                    value={areaId}
                                    onChange={(e) => setAreaId(e.target.value)}
                                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                >
                                    {mockAreas.map(area => (
                                        <option key={area.id} value={area.id}>
                                            {area.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Notas */}
                            <div className="sm:col-span-2">
                                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Notas (opcional)
                                </label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Ej: Lote #45, Temperatura perfecta"
                                    rows={2}
                                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Tabla de ingredientes a consumir */}
                    {requirements.length > 0 && (
                        <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                            <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                                <h3 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                                    <span>📋</span>
                                    Ingredientes que se consumirán
                                </h3>
                                <p className="text-sm text-gray-500">
                                    Estos insumos se descontarán automáticamente del inventario
                                </p>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
                                            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                                                Ingrediente
                                            </th>
                                            <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                                                Necesario
                                            </th>
                                            <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                                                Disponible
                                            </th>
                                            <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">
                                                Estado
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                        {requirements.map((req) => (
                                            <tr key={req.itemId} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                                <td className="px-6 py-4">
                                                    <span className="font-medium text-gray-900 dark:text-white">
                                                        {req.itemName}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <span className="font-mono text-gray-900 dark:text-white">
                                                        {formatNumber(req.gross, 3)} {req.unit}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <span className={cn(
                                                        'font-mono',
                                                        req.sufficient ? 'text-gray-500' : 'text-red-600'
                                                    )}>
                                                        {formatNumber(req.available, 3)} {req.unit}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    {req.sufficient ? (
                                                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                                            ✓ OK
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                                            ✗ Falta {formatNumber(req.gross - req.available, 3)}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Resultado */}
                    {result && (
                        <div className={cn(
                            'rounded-xl p-6',
                            result.success
                                ? 'border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20'
                                : 'border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
                        )}>
                            <div className="flex items-start gap-3">
                                <span className="text-2xl">{result.success ? '✅' : '❌'}</span>
                                <div>
                                    <p className={cn(
                                        'font-semibold',
                                        result.success ? 'text-emerald-800 dark:text-emerald-400' : 'text-red-800 dark:text-red-400'
                                    )}>
                                        {result.message}
                                    </p>

                                    {result.success && result.data && (
                                        <div className="mt-3 space-y-2 text-sm text-emerald-700 dark:text-emerald-300">
                                            <p>📦 Producido: {result.data.productAdded?.quantity} {result.data.productAdded?.unit} de {result.data.productAdded?.name}</p>
                                            <p>📊 Rendimiento: {result.data.actualYield}%</p>
                                            {result.data.ingredientsConsumed && (
                                                <div className="mt-2">
                                                    <p className="font-medium">Ingredientes consumidos:</p>
                                                    <ul className="ml-4 list-disc">
                                                        {result.data.ingredientsConsumed.map((ing, idx) => (
                                                            <li key={idx}>
                                                                {ing.name}: {formatNumber(ing.quantity, 3)} {ing.unit}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Panel lateral */}
                <div className="space-y-4">
                    {/* Botón de finalizar */}
                    <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-50 p-6 dark:border-emerald-800 dark:from-emerald-900/20 dark:to-green-900/20">
                        <button
                            onClick={handleProduction}
                            disabled={isSubmitting || !selectedRecipe || quantity <= 0 || !allIngredientsAvailable}
                            className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 py-4 text-lg font-bold text-white shadow-lg shadow-emerald-500/25 transition-all hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isSubmitting ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className="animate-spin">⏳</span>
                                    Procesando...
                                </span>
                            ) : (
                                <span className="flex items-center justify-center gap-2">
                                    ✅ Finalizar Producción
                                </span>
                            )}
                        </button>

                        {requirements.length > 0 && !allIngredientsAvailable && (
                            <p className="mt-3 text-center text-sm text-red-600 dark:text-red-400">
                                ⚠️ Stock insuficiente de algunos ingredientes
                            </p>
                        )}

                        {selectedRecipe && quantity > 0 && allIngredientsAvailable && (
                            <p className="mt-3 text-center text-sm text-emerald-600 dark:text-emerald-400">
                                ✓ Todo listo para producir
                            </p>
                        )}
                    </div>

                    {/* Historial de producción */}
                    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                        <h3 className="mb-4 flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                            <span>🕐</span> Producción Reciente
                        </h3>

                        {productionHistory.length === 0 ? (
                            <p className="text-center text-sm text-gray-500">
                                Las producciones de esta sesión aparecerán aquí
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {productionHistory.map((prod, idx) => (
                                    <div
                                        key={idx}
                                        className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50"
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="font-medium text-gray-900 dark:text-white">
                                                {prod.product}
                                            </span>
                                            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                                {prod.orderNumber}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-sm text-gray-500">
                                            +{formatNumber(prod.quantity)} {prod.unit}
                                        </p>
                                        <p className="text-xs text-gray-400">
                                            {prod.timestamp.toLocaleTimeString('es-VE')}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Tips */}
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
                        <h4 className="mb-2 flex items-center gap-2 font-medium text-amber-800 dark:text-amber-400">
                            💡 Recuerda
                        </h4>
                        <ul className="space-y-1 text-sm text-amber-700 dark:text-amber-300">
                            <li>• Los ingredientes se descuentan automáticamente</li>
                            <li>• El costo se recalcula en cada producción</li>
                            <li>• Revisa el stock antes de producir</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}
