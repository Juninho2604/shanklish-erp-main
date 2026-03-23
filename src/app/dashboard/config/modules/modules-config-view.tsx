'use client';

import { useState, useTransition } from 'react';
import { MODULE_REGISTRY, type ModuleDefinition } from '@/lib/constants/modules-registry';
import { saveEnabledModules } from '@/app/actions/system-config.actions';

const SECTIONS = [
    { key: 'operations' as const, label: 'Operaciones',              icon: '⚙️'  },
    { key: 'sales'      as const, label: 'Ventas',                   icon: '💳'  },
    { key: 'games'      as const, label: 'Entretenimiento / Juegos', icon: '🎮'  },
    { key: 'admin'      as const, label: 'Administración',           icon: '🔐'  },
];

interface Props {
    /** IDs actualmente habilitados — viene de la BD vía el Server Component padre */
    initialEnabledIds: string[];
}

export function ModulesConfigView({ initialEnabledIds }: Props) {
    const [enabled, setEnabled] = useState<Set<string>>(new Set(initialEnabledIds));
    const [isPending, startTransition] = useTransition();
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

    function toggle(id: string) {
        // module_config no se puede desactivar (protección)
        if (id === 'module_config') return;

        setEnabled(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
        setSaveStatus('idle');
    }

    function handleSave() {
        startTransition(async () => {
            const result = await saveEnabledModules(Array.from(enabled));
            setSaveStatus(result.ok ? 'saved' : 'error');
        });
    }

    const hasChanges = !setsEqual(enabled, new Set(initialEnabledIds));

    return (
        <div className="space-y-6">
            {/* ── Save bar ── */}
            <div className={`flex flex-wrap items-center gap-3 rounded-xl border p-4 transition-colors ${
                saveStatus === 'saved'
                    ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20'
                    : saveStatus === 'error'
                    ? 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20'
                    : hasChanges
                    ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20'
                    : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50'
            }`}>
                <div className="flex-1 min-w-0">
                    {saveStatus === 'saved' && (
                        <p className="font-medium text-green-700 dark:text-green-400">
                            ✅ Guardado — el sidebar se actualizará en el próximo acceso al dashboard
                        </p>
                    )}
                    {saveStatus === 'error' && (
                        <p className="font-medium text-red-700 dark:text-red-400">
                            ❌ Error al guardar. Intenta de nuevo.
                        </p>
                    )}
                    {saveStatus === 'idle' && hasChanges && (
                        <p className="font-medium text-amber-700 dark:text-amber-400">
                            ⚠️ Tienes cambios sin guardar — {enabled.size} módulos seleccionados
                        </p>
                    )}
                    {saveStatus === 'idle' && !hasChanges && (
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {enabled.size} módulo{enabled.size !== 1 ? 's' : ''} activo{enabled.size !== 1 ? 's' : ''} — los cambios se aplican al instante sin reiniciar
                        </p>
                    )}
                </div>

                <button
                    onClick={handleSave}
                    disabled={isPending || (!hasChanges && saveStatus !== 'error')}
                    className={`rounded-lg px-5 py-2 text-sm font-semibold text-white transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
                        isPending
                            ? 'bg-gray-400'
                            : hasChanges || saveStatus === 'error'
                            ? 'bg-amber-500 hover:bg-amber-600'
                            : 'bg-gray-400'
                    }`}
                >
                    {isPending ? 'Guardando…' : 'Guardar cambios'}
                </button>
            </div>

            {/* ── Sections ── */}
            {SECTIONS.map(section => {
                const modules = MODULE_REGISTRY
                    .filter(m => m.section === section.key)
                    .sort((a, b) => a.sortOrder - b.sortOrder);

                const activeCount = modules.filter(m => enabled.has(m.id)).length;

                return (
                    <div
                        key={section.key}
                        className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
                    >
                        <div className="flex items-center gap-3 border-b border-gray-200 bg-gray-50 px-5 py-3 dark:border-gray-700 dark:bg-gray-800/50">
                            <span className="text-xl">{section.icon}</span>
                            <h2 className="font-semibold text-gray-800 dark:text-gray-100">{section.label}</h2>
                            <span className="ml-auto rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                                {activeCount}/{modules.length}
                            </span>
                        </div>

                        <div className="divide-y divide-gray-100 dark:divide-gray-800">
                            {modules.map(mod => (
                                <ModuleRow
                                    key={mod.id}
                                    mod={mod}
                                    isEnabled={enabled.has(mod.id)}
                                    isLocked={mod.id === 'module_config'}
                                    onToggle={() => toggle(mod.id)}
                                    isPending={isPending}
                                />
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setsEqual(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) return false;
    for (const v of Array.from(a)) if (!b.has(v)) return false;
    return true;
}

// ─── Module Row ──────────────────────────────────────────────────────────────

interface ModuleRowProps {
    mod: ModuleDefinition;
    isEnabled: boolean;
    isLocked: boolean;
    onToggle: () => void;
    isPending: boolean;
}

function ModuleRow({ mod, isEnabled, isLocked, onToggle, isPending }: ModuleRowProps) {
    return (
        <div className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
            <span className="text-2xl" aria-hidden="true">{mod.icon}</span>

            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{mod.label}</p>
                    {isLocked && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-400 dark:bg-gray-800">
                            fijo
                        </span>
                    )}
                </div>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">{mod.description}</p>
                <p className="mt-0.5 font-mono text-[10px] text-gray-300 dark:text-gray-600">{mod.id}</p>
            </div>

            <span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-xs font-medium sm:block ${
                isEnabled
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500'
            }`}>
                {isEnabled ? 'Activo' : 'Inactivo'}
            </span>

            {/* iOS Switch */}
            <button
                type="button"
                role="switch"
                aria-checked={isEnabled}
                aria-label={`${isEnabled ? 'Desactivar' : 'Activar'} ${mod.label}`}
                onClick={onToggle}
                disabled={isLocked || isPending}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 ${
                    isLocked || isPending
                        ? 'cursor-not-allowed opacity-60'
                        : 'cursor-pointer'
                } ${isEnabled ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
                <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        isEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                />
            </button>
        </div>
    );
}
