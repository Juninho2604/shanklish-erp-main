'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { formatNumber, cn } from '@/lib/utils';
import {
    quickProductionAction,
    calculateRequirementsAction,
    getProductionRecipesAction,
    getProductionHistoryAction,
    getProductionAreasAction,
    getProductionItemsAction,
    manualProductionAction,
    updateProductionOrderAction,
    deleteProductionOrderAction,
    IngredientRequirement,
    ProductionActionResult,
} from '@/app/actions/production.actions';
import { Factory, Plus, Clock, CheckCircle, AlertTriangle, ChefHat, Package, Trash2, Edit3, X, Wrench } from 'lucide-react';
import { Combobox } from '@/components/ui/combobox';
import toast from 'react-hot-toast';

interface RecipeOption {
    id: string;
    name: string;
    outputItemName: string;
    outputQuantity: number;
    outputUnit: string;
    ingredientCount: number;
}

interface ProductionRecord {
    id: string;
    orderNumber: string;
    recipeName: string;
    plannedQuantity: number;
    actualQuantity: number | null;
    unit: string;
    status: string;
    createdBy: string;
    createdAt: Date;
    completedAt: Date | null;
    notes: string | null;
}

interface AreaOption {
    id: string;
    name: string;
}

interface InventoryItemOption {
    id: string;
    name: string;
    type: string;
    baseUnit: string;
    category: string | null;
}

interface ManualIngredient {
    id: string; // temp id
    itemId: string;
    quantity: number;
    unit: string;
}

export default function ProduccionPage() {
    const { user } = useAuthStore();

    // Estado
    const [activeTab, setActiveTab] = useState<'receta' | 'manual' | 'historial'>('receta');
    const [recipes, setRecipes] = useState<RecipeOption[]>([]);
    const [areas, setAreas] = useState<AreaOption[]>([]);
    const [allItems, setAllItems] = useState<InventoryItemOption[]>([]);
    const [productionHistory, setProductionHistory] = useState<ProductionRecord[]>([]);

    // ── Formulario por Receta ──
    const [selectedRecipe, setSelectedRecipe] = useState('');
    const [quantity, setQuantity] = useState<number>(0);
    const [areaId, setAreaId] = useState('');
    const [notes, setNotes] = useState('');

    // Requerimientos calculados
    const [requirements, setRequirements] = useState<IngredientRequirement[]>([]);
    const [isCalculating, setIsCalculating] = useState(false);

    // ── Formulario Manual ──
    const [manualOutputItem, setManualOutputItem] = useState('');
    const [manualOutputQty, setManualOutputQty] = useState<number>(0);
    const [manualOutputUnit, setManualOutputUnit] = useState('KG');
    const [manualAreaId, setManualAreaId] = useState('');
    const [manualNotes, setManualNotes] = useState('');
    const [manualIngredients, setManualIngredients] = useState<ManualIngredient[]>([]);
    const [newIngItemId, setNewIngItemId] = useState('');
    const [newIngQty, setNewIngQty] = useState<number>(0);
    const [newIngUnit, setNewIngUnit] = useState('KG');

    // Estado de procesamiento
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [result, setResult] = useState<ProductionActionResult | null>(null);

    // ── Edición en historial ──
    const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
    const [editNotes, setEditNotes] = useState('');

    // Cargar datos al inicio
    useEffect(() => {
        Promise.all([
            getProductionRecipesAction(),
            getProductionAreasAction(),
            getProductionHistoryAction({ limit: 50 }),
            getProductionItemsAction(),
        ]).then(([recipesData, areasData, historyData, itemsData]) => {
            setRecipes(recipesData);
            setAreas(areasData);
            setProductionHistory(historyData);
            setAllItems(itemsData);
            if (areasData.length > 0 && !areaId) {
                const prodArea = areasData.find(a =>
                    a.name.toLowerCase().includes('producción') ||
                    a.name.toLowerCase().includes('produccion')
                );
                const defaultArea = prodArea?.id || areasData[0].id;
                setAreaId(defaultArea);
                setManualAreaId(defaultArea);
            }
        });
    }, []);

    // Calcular requerimientos cuando cambia receta o cantidad
    useEffect(() => {
        if (!selectedRecipe || quantity <= 0 || !areaId) {
            setRequirements([]);
            return;
        }
        setIsCalculating(true);
        calculateRequirementsAction(selectedRecipe, quantity, areaId)
            .then(res => {
                if (res.success) {
                    setRequirements(res.requirements);
                }
            })
            .finally(() => setIsCalculating(false));
    }, [selectedRecipe, quantity, areaId]);

    // Obtener receta seleccionada
    const selectedRecipeData = recipes.find(r => r.id === selectedRecipe);

    // Verificar si todos los ingredientes tienen stock suficiente
    const allIngredientsAvailable = requirements.length > 0 &&
        requirements.every(r => r.sufficient);

    // ── Handlers ──

    const handleRecipeProduction = async () => {
        if (!selectedRecipe || quantity <= 0 || !allIngredientsAvailable || !areaId) return;
        setIsSubmitting(true);
        setResult(null);
        try {
            const response = await quickProductionAction({
                recipeId: selectedRecipe,
                actualQuantity: quantity,
                areaId,
                notes,
            });
            setResult(response);
            if (response.success) {
                toast.success(response.message);
                const newHistory = await getProductionHistoryAction({ limit: 50 });
                setProductionHistory(newHistory);
                setSelectedRecipe('');
                setQuantity(0);
                setNotes('');
                setRequirements([]);
            } else {
                toast.error(response.message);
            }
        } catch (error) {
            toast.error('Error al procesar la producción');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleManualProduction = async () => {
        if (!manualOutputItem || manualOutputQty <= 0 || !manualAreaId) return;
        setIsSubmitting(true);
        setResult(null);
        try {
            const response = await manualProductionAction({
                outputItemId: manualOutputItem,
                outputQuantity: manualOutputQty,
                outputUnit: manualOutputUnit,
                areaId: manualAreaId,
                ingredients: manualIngredients.map(i => ({
                    itemId: i.itemId,
                    quantity: i.quantity,
                    unit: i.unit,
                })),
                notes: manualNotes,
            });
            setResult(response);
            if (response.success) {
                toast.success(response.message);
                const newHistory = await getProductionHistoryAction({ limit: 50 });
                setProductionHistory(newHistory);
                setManualOutputItem('');
                setManualOutputQty(0);
                setManualNotes('');
                setManualIngredients([]);
            } else {
                toast.error(response.message);
            }
        } catch (error) {
            toast.error('Error al procesar la producción manual');
        } finally {
            setIsSubmitting(false);
        }
    };

    const addManualIngredient = () => {
        if (!newIngItemId || newIngQty <= 0) return;
        setManualIngredients(prev => [...prev, {
            id: `temp-${Date.now()}`,
            itemId: newIngItemId,
            quantity: newIngQty,
            unit: newIngUnit,
        }]);
        setNewIngItemId('');
        setNewIngQty(0);
    };

    const removeManualIngredient = (tempId: string) => {
        setManualIngredients(prev => prev.filter(i => i.id !== tempId));
    };

    const handleEditOrder = async (orderId: string) => {
        const response = await updateProductionOrderAction(orderId, { notes: editNotes });
        if (response.success) {
            toast.success(response.message);
            const newHistory = await getProductionHistoryAction({ limit: 50 });
            setProductionHistory(newHistory);
            setEditingOrderId(null);
        } else {
            toast.error(response.message);
        }
    };

    const handleCancelOrder = async (orderId: string) => {
        if (!confirm('¿Estás seguro de cancelar esta orden de producción?')) return;
        const response = await deleteProductionOrderAction(orderId);
        if (response.success) {
            toast.success(response.message);
            const newHistory = await getProductionHistoryAction({ limit: 50 });
            setProductionHistory(newHistory);
        } else {
            toast.error(response.message);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'COMPLETED':
                return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"><CheckCircle className="h-3 w-3" /> Completado</span>;
            case 'IN_PROGRESS':
                return <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"><Clock className="h-3 w-3" /> En Proceso</span>;
            case 'CANCELLED':
                return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400"><AlertTriangle className="h-3 w-3" /> Cancelado</span>;
            default:
                return <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">{status}</span>;
        }
    };

    // Helper: get item name by id
    const getItemName = (itemId: string) => allItems.find(i => i.id === itemId)?.name || itemId;
    const getItemUnit = (itemId: string) => allItems.find(i => i.id === itemId)?.baseUnit || 'KG';

    return (
        <div className="space-y-6 animate-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                        <Factory className="h-7 w-7 text-emerald-600" />
                        Producción
                    </h1>
                    <p className="text-gray-500">
                        Registrar producciones y consumo de ingredientes
                    </p>
                </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="-mb-px flex gap-6">
                    <button
                        onClick={() => { setActiveTab('receta'); setResult(null); }}
                        className={cn(
                            'flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition-colors',
                            activeTab === 'receta'
                                ? 'border-emerald-500 text-emerald-600'
                                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                        )}
                    >
                        <ChefHat className="h-4 w-4" />
                        Desde Receta
                    </button>
                    <button
                        onClick={() => { setActiveTab('manual'); setResult(null); }}
                        className={cn(
                            'flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition-colors',
                            activeTab === 'manual'
                                ? 'border-amber-500 text-amber-600'
                                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                        )}
                    >
                        <Wrench className="h-4 w-4" />
                        Producción Manual
                    </button>
                    <button
                        onClick={() => setActiveTab('historial')}
                        className={cn(
                            'flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition-colors',
                            activeTab === 'historial'
                                ? 'border-emerald-500 text-emerald-600'
                                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                        )}
                    >
                        <Clock className="h-4 w-4" />
                        Historial ({productionHistory.length})
                    </button>
                </nav>
            </div>

            {/* ═══════════════════════════════════════════════════════════════════
                TAB: PRODUCCIÓN DESDE RECETA
               ═══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'receta' && (
                <div className="grid gap-6 lg:grid-cols-3">
                    <div className="lg:col-span-2 space-y-6">
                        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                            <div className="mb-6 flex items-center gap-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-500 text-white shadow-lg">
                                    <ChefHat className="h-6 w-6" />
                                </div>
                                <div>
                                    <h2 className="font-semibold text-gray-900 dark:text-white">
                                        Producción desde Receta
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
                                    <Combobox
                                        items={recipes.map(r => ({
                                            value: r.id,
                                            label: `${r.name} (Rinde: ${r.outputQuantity} ${r.outputUnit})`
                                        }))}
                                        value={selectedRecipe}
                                        onChange={(val) => {
                                            setSelectedRecipe(val);
                                            const recipe = recipes.find(r => r.id === val);
                                            if (recipe) setQuantity(recipe.outputQuantity);
                                        }}
                                        placeholder="Seleccionar producto..."
                                        searchPlaceholder="Buscar receta..."
                                        emptyMessage="No hay recetas disponibles"
                                    />
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
                                        Área de Producción *
                                    </label>
                                    <select
                                        value={areaId}
                                        onChange={(e) => setAreaId(e.target.value)}
                                        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                    >
                                        {areas.map(area => (
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
                                        <Package className="h-5 w-5 text-gray-400" />
                                        Ingredientes que se consumirán
                                    </h3>
                                    <p className="text-sm text-gray-500">
                                        Estos insumos se descontarán automáticamente del área seleccionada
                                    </p>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
                                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Ingrediente</th>
                                                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Necesario</th>
                                                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Disponible</th>
                                                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Estado</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                            {requirements.map((req) => (
                                                <tr key={req.itemId} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                                    <td className="px-6 py-4">
                                                        <span className="font-medium text-gray-900 dark:text-white">{req.itemName}</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <span className="font-mono text-gray-900 dark:text-white">{formatNumber(req.gross, 3)} {req.unit}</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <span className={cn('font-mono', req.sufficient ? 'text-gray-500' : 'text-red-600')}>
                                                            {formatNumber(req.available, 3)} {req.unit}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        {req.sufficient ? (
                                                            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">✓ OK</span>
                                                        ) : (
                                                            <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">✗ Falta {formatNumber(req.gross - req.available, 3)}</span>
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
                            <ResultCard result={result} />
                        )}
                    </div>

                    {/* Panel lateral */}
                    <div className="space-y-4">
                        <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-50 p-6 dark:border-emerald-800 dark:from-emerald-900/20 dark:to-green-900/20">
                            <button
                                onClick={handleRecipeProduction}
                                disabled={isSubmitting || !selectedRecipe || quantity <= 0 || !allIngredientsAvailable || !areaId}
                                className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 py-4 text-lg font-bold text-white shadow-lg shadow-emerald-500/25 transition-all hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isSubmitting ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <span className="animate-spin">⏳</span> Procesando...
                                    </span>
                                ) : (
                                    <span className="flex items-center justify-center gap-2">
                                        <CheckCircle className="h-5 w-5" /> Registrar Producción
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

                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
                            <h4 className="mb-2 flex items-center gap-2 font-medium text-amber-800 dark:text-amber-400">
                                💡 Recuerda
                            </h4>
                            <ul className="space-y-1 text-sm text-amber-700 dark:text-amber-300">
                                <li>• Los ingredientes se descuentan del área seleccionada</li>
                                <li>• El producto terminado se suma a la misma área</li>
                                <li>• Luego puedes transferir al Restaurante</li>
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════
                TAB: PRODUCCIÓN MANUAL
               ═══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'manual' && (
                <div className="grid gap-6 lg:grid-cols-3">
                    <div className="lg:col-span-2 space-y-6">
                        {/* Producto de salida */}
                        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                            <div className="mb-6 flex items-center gap-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg">
                                    <Wrench className="h-6 w-6" />
                                </div>
                                <div>
                                    <h2 className="font-semibold text-gray-900 dark:text-white">
                                        Producción Manual
                                    </h2>
                                    <p className="text-sm text-gray-500">
                                        Crea una producción personalizada sin necesidad de receta
                                    </p>
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                {/* Producto que produces */}
                                <div className="sm:col-span-2">
                                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        ¿Qué producto estás produciendo? *
                                    </label>
                                    <Combobox
                                        items={allItems.map(item => ({
                                            value: item.id,
                                            label: `${item.name} (${item.baseUnit})`
                                        }))}
                                        value={manualOutputItem}
                                        onChange={(val) => {
                                            setManualOutputItem(val);
                                            const item = allItems.find(i => i.id === val);
                                            if (item) setManualOutputUnit(item.baseUnit);
                                        }}
                                        placeholder="Seleccionar producto de salida..."
                                        searchPlaceholder="Buscar producto..."
                                        emptyMessage="No hay productos disponibles"
                                    />
                                </div>

                                {/* Cantidad */}
                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Cantidad Producida *
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            value={manualOutputQty || ''}
                                            onChange={(e) => setManualOutputQty(parseFloat(e.target.value) || 0)}
                                            min="0"
                                            step="0.1"
                                            placeholder="0"
                                            className="w-24 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                        />
                                        <span className="font-medium text-gray-900 dark:text-white">
                                            {manualOutputUnit}
                                        </span>
                                    </div>
                                </div>

                                {/* Área */}
                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Área de Producción *
                                    </label>
                                    <select
                                        value={manualAreaId}
                                        onChange={(e) => setManualAreaId(e.target.value)}
                                        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                    >
                                        {areas.map(area => (
                                            <option key={area.id} value={area.id}>{area.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Notas */}
                                <div className="sm:col-span-2">
                                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Notas (opcional)
                                    </label>
                                    <textarea
                                        value={manualNotes}
                                        onChange={(e) => setManualNotes(e.target.value)}
                                        placeholder="Ej: Producción especial, ajuste de inventario..."
                                        rows={2}
                                        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Ingredientes manuales */}
                        <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                                <div>
                                    <h3 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                                        <Package className="h-5 w-5 text-gray-400" />
                                        Ingredientes a Consumir
                                    </h3>
                                    <p className="text-sm text-gray-500">
                                        Agrega los insumos que se consumieron en esta producción
                                    </p>
                                </div>
                                <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                    {manualIngredients.length} items
                                </span>
                            </div>

                            {/* Lista de ingredientes agregados */}
                            {manualIngredients.length > 0 && (
                                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {manualIngredients.map((ing, idx) => (
                                        <div key={ing.id} className="flex items-center justify-between px-6 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                                                    {idx + 1}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-gray-900 dark:text-white">{getItemName(ing.itemId)}</p>
                                                    <p className="text-sm text-gray-500">{formatNumber(ing.quantity)} {ing.unit}</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => removeManualIngredient(ing.id)}
                                                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Form para agregar ingrediente */}
                            <div className="border-t border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                                <p className="mb-3 text-sm font-medium text-gray-600 dark:text-gray-400">Agregar ingrediente:</p>
                                <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
                                    <Combobox
                                        items={allItems
                                            .filter(item => !manualIngredients.some(i => i.itemId === item.id) && item.id !== manualOutputItem)
                                            .map(item => ({
                                                value: item.id,
                                                label: `${item.name} (${item.baseUnit})`
                                            }))}
                                        value={newIngItemId}
                                        onChange={(val) => {
                                            setNewIngItemId(val);
                                            const item = allItems.find(i => i.id === val);
                                            if (item) setNewIngUnit(item.baseUnit);
                                        }}
                                        placeholder="Seleccionar insumo..."
                                        searchPlaceholder="Buscar insumo..."
                                        emptyMessage="No hay insumos disponibles"
                                    />
                                    <input
                                        type="number"
                                        value={newIngQty || ''}
                                        onChange={(e) => setNewIngQty(parseFloat(e.target.value) || 0)}
                                        min="0"
                                        step="0.01"
                                        placeholder="Cant."
                                        className="w-20 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                    />
                                    <span className="flex items-center text-sm font-medium text-gray-500">
                                        {newIngUnit}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={addManualIngredient}
                                        disabled={!newIngItemId || newIngQty <= 0}
                                        className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <Plus className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Resultado */}
                        {result && <ResultCard result={result} />}
                    </div>

                    {/* Panel lateral */}
                    <div className="space-y-4">
                        <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 dark:border-amber-800 dark:from-amber-900/20 dark:to-orange-900/20">
                            <button
                                onClick={handleManualProduction}
                                disabled={isSubmitting || !manualOutputItem || manualOutputQty <= 0 || !manualAreaId}
                                className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-4 text-lg font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isSubmitting ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <span className="animate-spin">⏳</span> Procesando...
                                    </span>
                                ) : (
                                    <span className="flex items-center justify-center gap-2">
                                        <CheckCircle className="h-5 w-5" /> Registrar Producción Manual
                                    </span>
                                )}
                            </button>

                            {manualOutputItem && manualOutputQty > 0 && (
                                <div className="mt-4 rounded-lg bg-white/60 p-3 dark:bg-gray-800/50">
                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Resumen:</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                        + {formatNumber(manualOutputQty)} {manualOutputUnit} de <strong>{getItemName(manualOutputItem)}</strong>
                                    </p>
                                    {manualIngredients.length > 0 && (
                                        <div className="mt-2 border-t pt-2">
                                            <p className="text-xs text-gray-500">Se consumirán {manualIngredients.length} ingredientes</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                            <h4 className="mb-2 flex items-center gap-2 font-medium text-blue-800 dark:text-blue-400">
                                💡 ¿Cuándo usar producción manual?
                            </h4>
                            <ul className="space-y-1 text-sm text-blue-700 dark:text-blue-300">
                                <li>• Cuando no tienes una receta definida aún</li>
                                <li>• Para ajustes o producciones especiales</li>
                                <li>• Para registrar producción con cantidades personalizadas</li>
                                <li>• Los ingredientes son opcionales</li>
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════
                TAB: HISTORIAL
               ═══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'historial' && (
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Orden</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Producto</th>
                                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Cantidad</th>
                                    <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Estado</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Responsable</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Notas</th>
                                    <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {productionHistory.map((order) => (
                                    <tr key={order.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                        <td className="px-6 py-4">
                                            <span className="font-mono text-sm font-medium text-emerald-600">{order.orderNumber}</span>
                                            <p className="text-xs text-gray-400">{new Date(order.createdAt).toLocaleString()}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="font-medium text-gray-900 dark:text-white">{order.recipeName}</span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="font-mono text-gray-900 dark:text-white">
                                                {formatNumber(order.actualQuantity || order.plannedQuantity)} {order.unit}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">{getStatusBadge(order.status)}</td>
                                        <td className="px-6 py-4 text-gray-500 text-sm">{order.createdBy}</td>
                                        <td className="px-6 py-4 max-w-[200px]">
                                            {editingOrderId === order.id ? (
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        value={editNotes}
                                                        onChange={(e) => setEditNotes(e.target.value)}
                                                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                                        autoFocus
                                                    />
                                                    <button
                                                        onClick={() => handleEditOrder(order.id)}
                                                        className="rounded bg-emerald-500 p-1 text-white hover:bg-emerald-600"
                                                    >
                                                        <CheckCircle className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingOrderId(null)}
                                                        className="rounded bg-gray-300 p-1 text-gray-700 hover:bg-gray-400"
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <p className="truncate text-sm text-gray-500" title={order.notes || ''}>
                                                    {order.notes || '—'}
                                                </p>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {order.status !== 'CANCELLED' && (
                                                <div className="flex items-center justify-center gap-1">
                                                    <button
                                                        onClick={() => {
                                                            setEditingOrderId(order.id);
                                                            setEditNotes(order.notes || '');
                                                        }}
                                                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-500 dark:hover:bg-blue-900/20"
                                                        title="Editar notas"
                                                    >
                                                        <Edit3 className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleCancelOrder(order.id)}
                                                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                                                        title="Cancelar orden"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {productionHistory.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                                            No hay producciones registradas
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Component: Result Card ──
function ResultCard({ result }: { result: ProductionActionResult }) {
    return (
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
                            {result.data.ingredientsConsumed && result.data.ingredientsConsumed.length > 0 && (
                                <div className="mt-2">
                                    <p className="font-medium">Ingredientes consumidos:</p>
                                    <ul className="ml-4 list-disc">
                                        {result.data.ingredientsConsumed.map((ing, idx) => (
                                            <li key={idx}>{ing.name}: {formatNumber(ing.quantity, 3)} {ing.unit}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
