'use client';

import { useState, useTransition } from 'react';
import { linkModifierToMenuItemAction, toggleModifierAvailabilityAction } from '@/app/actions/modifier.actions';

interface MenuItem {
    id: string;
    name: string;
    recipeId: string | null;
    category: { name: string };
}

interface Modifier {
    id: string;
    name: string;
    priceAdjustment: number;
    isAvailable: boolean;
    linkedMenuItemId: string | null;
    linkedMenuItem: { id: string; name: string } | null;
}

interface ModifierGroup {
    id: string;
    name: string;
    description: string | null;
    isRequired: boolean;
    minSelections: number;
    maxSelections: number;
    modifiers: Modifier[];
    menuItems: { menuItem: { id: string; name: string } }[];
}

interface Props {
    groups: ModifierGroup[];
    menuItems: MenuItem[];
}

export default function ModifierManagerClient({ groups, menuItems }: Props) {
    const [isPending, startTransition] = useTransition();
    const [localGroups, setLocalGroups] = useState<ModifierGroup[]>(groups);
    const [expandedGroup, setExpandedGroup] = useState<string | null>(groups[0]?.id || null);
    const [savingModifier, setSavingModifier] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    // Agrupar menuItems por categoría para el selector
    const itemsByCategory = menuItems.reduce<Record<string, MenuItem[]>>((acc, item) => {
        const cat = item.category.name;
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(item);
        return acc;
    }, {});

    const handleLink = (groupIdx: number, modIdx: number, menuItemId: string | null) => {
        const modifierId = localGroups[groupIdx].modifiers[modIdx].id;
        const linkedItem = menuItemId ? menuItems.find(i => i.id === menuItemId) : null;

        // Optimistic update
        setLocalGroups(prev => {
            const next = [...prev];
            next[groupIdx] = {
                ...next[groupIdx],
                modifiers: next[groupIdx].modifiers.map((m, idx) =>
                    idx === modIdx
                        ? { ...m, linkedMenuItemId: menuItemId, linkedMenuItem: linkedItem ? { id: linkedItem.id, name: linkedItem.name } : null }
                        : m
                )
            };
            return next;
        });

        setSavingModifier(modifierId);
        startTransition(async () => {
            const res = await linkModifierToMenuItemAction(modifierId, menuItemId);
            setSavingModifier(null);
            if (res.success) {
                setSuccessMsg(`✅ Modificador "${localGroups[groupIdx].modifiers[modIdx].name}" ${menuItemId ? 'vinculado' : 'desvinculado'}`);
                setTimeout(() => setSuccessMsg(null), 3000);
            }
        });
    };

    const handleToggleAvailability = (groupIdx: number, modIdx: number) => {
        const modifier = localGroups[groupIdx].modifiers[modIdx];
        const newVal = !modifier.isAvailable;

        setLocalGroups(prev => {
            const next = [...prev];
            next[groupIdx] = {
                ...next[groupIdx],
                modifiers: next[groupIdx].modifiers.map((m, idx) =>
                    idx === modIdx ? { ...m, isAvailable: newVal } : m
                )
            };
            return next;
        });

        startTransition(async () => {
            await toggleModifierAvailabilityAction(modifier.id, newVal);
        });
    };

    if (localGroups.length === 0) {
        return (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center text-gray-500">
                <p className="text-4xl mb-3">🔧</p>
                <p className="font-medium">No hay grupos de modificadores configurados.</p>
                <p className="text-sm mt-1">Usa los scripts de configuración inicial para crear grupos.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Toast de éxito */}
            {successMsg && (
                <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4">
                    {successMsg}
                </div>
            )}

            {/* Leyenda */}
            <div className="rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-800/50 dark:bg-blue-900/10 p-4 text-sm text-blue-800 dark:text-blue-300">
                <strong>¿Cómo funciona?</strong> Si un modificador tiene &quot;Plato Vinculado&quot;, al vender ese modificador el sistema buscará la receta de ese plato y descontará sus ingredientes del inventario automáticamente.
                Los modificadores <em>sin</em> vínculo solo afectan el precio, no el inventario.
            </div>

            {/* Lista de grupos */}
            {localGroups.map((group, groupIdx) => (
                <div key={group.id} className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    {/* Header del grupo */}
                    <button
                        onClick={() => setExpandedGroup(expandedGroup === group.id ? null : group.id)}
                        className="w-full flex items-center justify-between px-5 py-4 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors text-left"
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <span className="text-lg">{expandedGroup === group.id ? '▼' : '▶'}</span>
                            <div className="min-w-0">
                                <h3 className="font-bold text-gray-900 dark:text-white truncate">{group.name}</h3>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    {group.modifiers.length} opciones
                                    {group.isRequired && ' • Requerido'}
                                    {group.maxSelections < 99 && ` • máx. ${group.maxSelections} selección(es)`}
                                    {group.menuItems.length > 0 && ` • en: ${group.menuItems.map(m => m.menuItem.name).join(', ')}`}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4 shrink-0">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                group.modifiers.some(m => m.linkedMenuItemId)
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                                    : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                            }`}>
                                {group.modifiers.filter(m => m.linkedMenuItemId).length}/{group.modifiers.length} vinculados
                            </span>
                        </div>
                    </button>

                    {/* Modificadores del grupo */}
                    {expandedGroup === group.id && (
                        <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                            {group.modifiers.map((modifier, modIdx) => {
                                const linkedItem = menuItems.find(i => i.id === modifier.linkedMenuItemId);
                                const linkedHasRecipe = linkedItem?.recipeId != null;
                                const isSaving = savingModifier === modifier.id;

                                return (
                                    <div
                                        key={modifier.id}
                                        className={`flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-3 ${!modifier.isAvailable ? 'opacity-50' : ''}`}
                                    >
                                        {/* Nombre del modificador */}
                                        <div className="flex items-center gap-3 min-w-0 sm:w-56 sm:shrink-0">
                                            <button
                                                onClick={() => handleToggleAvailability(groupIdx, modIdx)}
                                                title={modifier.isAvailable ? 'Desactivar' : 'Activar'}
                                                className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                                                    modifier.isAvailable
                                                        ? 'bg-emerald-500 border-emerald-500 text-white'
                                                        : 'border-gray-400'
                                                }`}
                                            >
                                                {modifier.isAvailable && <span className="text-[10px] font-bold leading-none">✓</span>}
                                            </button>
                                            <span className="font-medium text-gray-900 dark:text-white truncate">{modifier.name}</span>
                                            {modifier.priceAdjustment !== 0 && (
                                                <span className={`text-xs font-mono shrink-0 ${modifier.priceAdjustment > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                    {modifier.priceAdjustment > 0 ? '+' : ''}${modifier.priceAdjustment.toFixed(2)}
                                                </span>
                                            )}
                                        </div>

                                        {/* Selector de plato vinculado */}
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                            <span className="text-gray-400 text-xs shrink-0">→ Descargo inventario de:</span>
                                            <div className="flex-1 min-w-0">
                                                <select
                                                    value={modifier.linkedMenuItemId || ''}
                                                    onChange={e => handleLink(groupIdx, modIdx, e.target.value || null)}
                                                    disabled={isSaving || isPending}
                                                    className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none disabled:opacity-50"
                                                >
                                                    <option value="">— Sin vínculo (solo precio) —</option>
                                                    {Object.entries(itemsByCategory).map(([cat, items]) => (
                                                        <optgroup key={cat} label={cat}>
                                                            {items.map(item => (
                                                                <option key={item.id} value={item.id}>
                                                                    {item.name}{!item.recipeId ? ' ⚠️ sin receta' : ''}
                                                                </option>
                                                            ))}
                                                        </optgroup>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        {/* Estado del vínculo */}
                                        <div className="shrink-0 w-24 text-right">
                                            {isSaving ? (
                                                <span className="text-xs text-gray-400">Guardando...</span>
                                            ) : modifier.linkedMenuItemId ? (
                                                <span className={`text-xs font-medium ${linkedHasRecipe ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500'}`}>
                                                    {linkedHasRecipe ? '✅ Con receta' : '⚠️ Sin receta'}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-gray-400">Sin vínculo</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            ))}

            {/* Nota sobre recetas */}
            <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-900/10 p-4 text-sm text-amber-800 dark:text-amber-300">
                <strong>⚠️ Modificadores vinculados sin receta</strong> no descontarán inventario. Asegúrate de que el plato vinculado tenga su receta completa en el módulo de Recetas.
            </div>
        </div>
    );
}
