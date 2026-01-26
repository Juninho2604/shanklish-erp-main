'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth.store';
import { mockInventoryItems, calculateIngredientCost, getItemById } from '@/lib/mock-data';
import { formatNumber, formatCurrency, cn } from '@/lib/utils';
import { InventoryItem, RecipeIngredient, UnitOfMeasure } from '@/types';
import { UNIT_INFO } from '@/lib/constants/units';

interface DraftIngredient {
    id: string;
    itemId: string;
    quantity: number;
    unit: UnitOfMeasure;
    wastePercentage: number;
    notes: string;
}

const UNITS: { value: UnitOfMeasure; label: string }[] = [
    { value: 'KG', label: 'Kilogramos' },
    { value: 'G', label: 'Gramos' },
    { value: 'L', label: 'Litros' },
    { value: 'ML', label: 'Mililitros' },
    { value: 'UNIT', label: 'Unidades' },
    { value: 'PORTION', label: 'Porciones' },
];

export default function NuevaRecetaPage() {
    const { user, canViewCosts } = useAuthStore();
    const showCosts = canViewCosts();

    // Estados del formulario
    const [recipeName, setRecipeName] = useState('');
    const [description, setDescription] = useState('');
    const [outputQuantity, setOutputQuantity] = useState<number>(1);
    const [outputUnit, setOutputUnit] = useState<UnitOfMeasure>('PORTION');
    const [yieldPercentage, setYieldPercentage] = useState<number>(100);
    const [prepTime, setPrepTime] = useState<number>(0);
    const [cookTime, setCookTime] = useState<number>(0);

    // Ingredientes
    const [ingredients, setIngredients] = useState<DraftIngredient[]>([]);
    const [showAddIngredient, setShowAddIngredient] = useState(false);

    // Estado para nuevo ingrediente
    const [newIngredient, setNewIngredient] = useState<Partial<DraftIngredient>>({
        itemId: '',
        quantity: 0,
        unit: 'KG',
        wastePercentage: 0,
        notes: '',
    });

    // Filtrar items disponibles (no agregar el mismo dos veces)
    const availableItems = useMemo(() => {
        const usedIds = new Set(ingredients.map(i => i.itemId));
        return mockInventoryItems.filter(
            item => !usedIds.has(item.id) && item.type !== 'FINISHED_GOOD'
        );
    }, [ingredients]);

    // Calcular costos de todos los ingredientes
    const ingredientCosts = useMemo(() => {
        return ingredients.map(ing => {
            const item = getItemById(ing.itemId);
            const costs = calculateIngredientCost(ing.itemId, ing.quantity, ing.wastePercentage);
            return {
                ...ing,
                item,
                ...costs,
            };
        });
    }, [ingredients]);

    // Totales
    const totalIngredientsCost = useMemo(() => {
        return ingredientCosts.reduce((sum, ing) => sum + ing.totalCost, 0);
    }, [ingredientCosts]);

    const effectiveOutput = outputQuantity * (yieldPercentage / 100);
    const costPerUnit = effectiveOutput > 0 ? totalIngredientsCost / effectiveOutput : 0;

    // Agregar ingrediente
    const addIngredient = () => {
        if (!newIngredient.itemId || !newIngredient.quantity) return;

        const newIng: DraftIngredient = {
            id: `temp-${Date.now()}`,
            itemId: newIngredient.itemId,
            quantity: newIngredient.quantity || 0,
            unit: newIngredient.unit || 'KG',
            wastePercentage: newIngredient.wastePercentage || 0,
            notes: newIngredient.notes || '',
        };

        setIngredients([...ingredients, newIng]);
        setNewIngredient({ itemId: '', quantity: 0, unit: 'KG', wastePercentage: 0, notes: '' });
        setShowAddIngredient(false);
    };

    // Eliminar ingrediente
    const removeIngredient = (id: string) => {
        setIngredients(ingredients.filter(ing => ing.id !== id));
    };

    // Actualizar ingrediente
    const updateIngredient = (id: string, field: keyof DraftIngredient, value: any) => {
        setIngredients(ingredients.map(ing =>
            ing.id === id ? { ...ing, [field]: value } : ing
        ));
    };

    return (
        <div className="space-y-6 animate-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link
                        href="/dashboard/recetas"
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                    >
                        ←
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            Nueva Receta
                        </h1>
                        <p className="text-gray-500">
                            Creando como: {user?.firstName} ({user?.role})
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                {/* Formulario Principal */}
                <div className="space-y-6 lg:col-span-2">
                    {/* Info básica */}
                    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                        <h2 className="mb-4 font-semibold text-gray-900 dark:text-white">
                            Información Básica
                        </h2>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Nombre de la Receta *
                                </label>
                                <input
                                    type="text"
                                    value={recipeName}
                                    onChange={(e) => setRecipeName(e.target.value)}
                                    placeholder="Ej: Shanklish con Merey"
                                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                />
                            </div>

                            <div className="sm:col-span-2">
                                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Descripción
                                </label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Breve descripción del plato..."
                                    rows={2}
                                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                />
                            </div>

                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Cantidad Producida *
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="number"
                                        value={outputQuantity}
                                        onChange={(e) => setOutputQuantity(parseFloat(e.target.value) || 0)}
                                        min="0"
                                        step="0.1"
                                        className="w-24 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                    />
                                    <select
                                        value={outputUnit}
                                        onChange={(e) => setOutputUnit(e.target.value as UnitOfMeasure)}
                                        className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                    >
                                        {UNITS.map(u => (
                                            <option key={u.value} value={u.value}>{u.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Rendimiento (Yield) %
                                </label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        value={yieldPercentage}
                                        onChange={(e) => setYieldPercentage(parseFloat(e.target.value) || 100)}
                                        min="1"
                                        max="100"
                                        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 pr-10 text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                                </div>
                                <p className="mt-1 text-xs text-gray-500">
                                    Real: {formatNumber(effectiveOutput)} {UNIT_INFO[outputUnit]?.labelEs || outputUnit}
                                </p>
                            </div>

                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Tiempo Prep. (min)
                                </label>
                                <input
                                    type="number"
                                    value={prepTime}
                                    onChange={(e) => setPrepTime(parseInt(e.target.value) || 0)}
                                    min="0"
                                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                />
                            </div>

                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Tiempo Cocción (min)
                                </label>
                                <input
                                    type="number"
                                    value={cookTime}
                                    onChange={(e) => setCookTime(parseInt(e.target.value) || 0)}
                                    min="0"
                                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Ingredientes */}
                    <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                            <div>
                                <h2 className="font-semibold text-gray-900 dark:text-white">
                                    Ingredientes
                                </h2>
                                <p className="text-sm text-gray-500">
                                    {ingredients.length} ingrediente{ingredients.length !== 1 ? 's' : ''} agregado{ingredients.length !== 1 ? 's' : ''}
                                </p>
                            </div>
                            <button
                                onClick={() => setShowAddIngredient(true)}
                                className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600"
                            >
                                ➕ Agregar
                            </button>
                        </div>

                        {/* Lista de ingredientes */}
                        <div className="divide-y divide-gray-200 dark:divide-gray-700">
                            {ingredientCosts.map((ing, index) => (
                                <div key={ing.id} className="flex items-center gap-4 px-6 py-4">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-sm font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                                        {index + 1}
                                    </div>

                                    <div className="flex-1">
                                        <p className="font-medium text-gray-900 dark:text-white">
                                            {ing.item?.name || 'Item no encontrado'}
                                        </p>
                                        <div className="flex items-center gap-2 text-sm text-gray-500">
                                            <span>
                                                {formatNumber(ing.quantity)} {ing.unit}
                                            </span>
                                            {ing.wastePercentage > 0 && (
                                                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                                    {ing.wastePercentage}% merma
                                                </span>
                                            )}
                                            {ing.item?.type === 'SUB_RECIPE' && (
                                                <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                                                    Sub-receta
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {showCosts && (
                                        <div className="text-right">
                                            <p className="font-mono text-sm font-semibold text-gray-900 dark:text-white">
                                                {formatCurrency(ing.totalCost)}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                Bruto: {formatNumber(ing.grossQuantity, 3)} {ing.unit}
                                            </p>
                                        </div>
                                    )}

                                    <button
                                        onClick={() => removeIngredient(ing.id)}
                                        className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            ))}

                            {ingredients.length === 0 && !showAddIngredient && (
                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                    <span className="text-4xl">📝</span>
                                    <p className="mt-2 text-gray-500">
                                        No hay ingredientes. Agrega el primero.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Modal para agregar ingrediente */}
                        {showAddIngredient && (
                            <div className="border-t border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800/50">
                                <h3 className="mb-4 font-medium text-gray-900 dark:text-white">
                                    Agregar Ingrediente
                                </h3>
                                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                    <div className="sm:col-span-2">
                                        <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
                                            Insumo / Sub-receta
                                        </label>
                                        <select
                                            value={newIngredient.itemId}
                                            onChange={(e) => setNewIngredient({ ...newIngredient, itemId: e.target.value })}
                                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700"
                                        >
                                            <option value="">Seleccionar...</option>
                                            <optgroup label="🧀 Sub-recetas">
                                                {availableItems.filter(i => i.type === 'SUB_RECIPE').map(item => (
                                                    <option key={item.id} value={item.id}>
                                                        {item.name} ({item.baseUnit})
                                                    </option>
                                                ))}
                                            </optgroup>
                                            <optgroup label="📦 Insumos Base">
                                                {availableItems.filter(i => i.type === 'RAW_MATERIAL').map(item => (
                                                    <option key={item.id} value={item.id}>
                                                        {item.name} ({item.baseUnit})
                                                    </option>
                                                ))}
                                            </optgroup>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
                                            Cantidad
                                        </label>
                                        <div className="flex gap-2">
                                            <input
                                                type="number"
                                                value={newIngredient.quantity || ''}
                                                onChange={(e) => setNewIngredient({ ...newIngredient, quantity: parseFloat(e.target.value) || 0 })}
                                                min="0"
                                                step="0.01"
                                                placeholder="0.5"
                                                className="w-20 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700"
                                            />
                                            <select
                                                value={newIngredient.unit}
                                                onChange={(e) => setNewIngredient({ ...newIngredient, unit: e.target.value as UnitOfMeasure })}
                                                className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm dark:border-gray-600 dark:bg-gray-700"
                                            >
                                                {UNITS.map(u => (
                                                    <option key={u.value} value={u.value}>{u.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
                                            Merma %
                                        </label>
                                        <input
                                            type="number"
                                            value={newIngredient.wastePercentage || ''}
                                            onChange={(e) => setNewIngredient({ ...newIngredient, wastePercentage: parseFloat(e.target.value) || 0 })}
                                            min="0"
                                            max="99"
                                            placeholder="0"
                                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700"
                                        />
                                    </div>
                                </div>

                                <div className="mt-4 flex justify-end gap-2">
                                    <button
                                        onClick={() => setShowAddIngredient(false)}
                                        className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={addIngredient}
                                        disabled={!newIngredient.itemId || !newIngredient.quantity}
                                        className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        Agregar
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Panel lateral - Resumen de costos */}
                <div className="space-y-4">
                    {/* Costo Total Card */}
                    {showCosts ? (
                        <div className="sticky top-24 rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 shadow-sm dark:border-amber-800 dark:from-amber-900/20 dark:to-orange-900/20">
                            <div className="mb-4 flex items-center gap-2">
                                <span className="text-2xl">💰</span>
                                <h3 className="font-semibold text-gray-900 dark:text-white">
                                    Resumen de Costos
                                </h3>
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600 dark:text-gray-400">Costo ingredientes:</span>
                                    <span className="font-mono font-medium text-gray-900 dark:text-white">
                                        {formatCurrency(totalIngredientsCost)}
                                    </span>
                                </div>

                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600 dark:text-gray-400">Producción efectiva:</span>
                                    <span className="font-medium text-gray-900 dark:text-white">
                                        {formatNumber(effectiveOutput)} {UNIT_INFO[outputUnit]?.labelEs || outputUnit}
                                    </span>
                                </div>

                                <div className="border-t border-amber-200 pt-3 dark:border-amber-700">
                                    <div className="flex justify-between">
                                        <span className="font-medium text-gray-900 dark:text-white">
                                            Costo por unidad:
                                        </span>
                                        <span className="text-xl font-bold text-amber-600 dark:text-amber-400">
                                            {formatCurrency(costPerUnit)}
                                        </span>
                                    </div>
                                </div>

                                {/* Sugerencia de precio */}
                                <div className="mt-4 rounded-lg bg-white/50 p-3 dark:bg-gray-800/50">
                                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">
                                        Precio sugerido (margen)
                                    </p>
                                    <div className="grid grid-cols-3 gap-2 text-center text-sm">
                                        <div className="rounded bg-emerald-100 p-2 dark:bg-emerald-900/30">
                                            <p className="text-xs text-gray-500">30%</p>
                                            <p className="font-bold text-emerald-700 dark:text-emerald-400">
                                                {formatCurrency(costPerUnit * 1.3)}
                                            </p>
                                        </div>
                                        <div className="rounded bg-amber-100 p-2 dark:bg-amber-900/30">
                                            <p className="text-xs text-gray-500">50%</p>
                                            <p className="font-bold text-amber-700 dark:text-amber-400">
                                                {formatCurrency(costPerUnit * 1.5)}
                                            </p>
                                        </div>
                                        <div className="rounded bg-blue-100 p-2 dark:bg-blue-900/30">
                                            <p className="text-xs text-gray-500">100%</p>
                                            <p className="font-bold text-blue-700 dark:text-blue-400">
                                                {formatCurrency(costPerUnit * 2)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center dark:border-gray-700 dark:bg-gray-800">
                            <span className="text-4xl">🔒</span>
                            <p className="mt-2 text-sm text-gray-500">
                                Los costos no están disponibles para tu rol.
                            </p>
                        </div>
                    )}

                    {/* Guardar */}
                    <button
                        disabled={!recipeName || ingredients.length === 0}
                        className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 py-3 font-semibold text-white shadow-lg shadow-amber-500/25 transition-all hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        💾 Guardar Receta
                    </button>

                    <p className="text-center text-xs text-gray-500">
                        La receta quedará como borrador hasta que sea aprobada por un Gerente.
                    </p>
                </div>
            </div>
        </div>
    );
}
