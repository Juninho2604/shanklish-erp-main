'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
    getProcessingTemplatesAction,
    createProcessingTemplateAction,
    deleteProcessingTemplateAction,
    getProteinItemsAction
} from '@/app/actions/protein-processing.actions';
import { Combobox } from '@/components/ui/combobox';

interface TemplateOutput {
    outputItemId: string;
    outputItemName: string;
    expectedWeight?: number;
    expectedUnits?: number;
    isIntermediate?: boolean;
}

interface Template {
    id: string;
    name: string;
    description: string | null;
    processingStep: string;
    canGainWeight: boolean;
    chainOrder: number;
    sourceItem: { id: string; name: string; sku: string };
    allowedOutputs: {
        id: string;
        outputItem: { id: string; name: string; sku: string; baseUnit: string };
        expectedWeight: number | null;
        expectedUnits: number | null;
        sortOrder: number;
        isIntermediate: boolean;
    }[];
}

const STEP_CONFIG: Record<string, { label: string; emoji: string; color: string; bgColor: string; borderColor: string; description: string }> = {
    'LIMPIEZA': { label: 'Limpieza', emoji: '🧹', color: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-200', description: 'Limpiar y separar la proteína cruda' },
    'MASERADO': { label: 'Maserado', emoji: '🥘', color: 'text-purple-700', bgColor: 'bg-purple-50', borderColor: 'border-purple-200', description: 'Agregar condimentos/marinado (peso puede aumentar)' },
    'DISTRIBUCION': { label: 'Distribución', emoji: '📦', color: 'text-green-700', bgColor: 'bg-green-50', borderColor: 'border-green-200', description: 'Repartir en productos finales para venta' },
    'CUSTOM': { label: 'Personalizado', emoji: '⚙️', color: 'text-gray-700', bgColor: 'bg-gray-50', borderColor: 'border-gray-200', description: 'Paso personalizado' },
};

export default function ProcessingTemplates() {
    const [templates, setTemplates] = useState<Template[]>([]);
    const [items, setItems] = useState<{ id: string; name: string; sku: string; baseUnit?: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);

    // Form state
    const [templateName, setTemplateName] = useState('');
    const [templateDescription, setTemplateDescription] = useState('');
    const [sourceItemId, setSourceItemId] = useState('');
    const [processingStep, setProcessingStep] = useState('LIMPIEZA');
    const [canGainWeight, setCanGainWeight] = useState(false);
    const [chainOrder, setChainOrder] = useState(0);
    const [outputs, setOutputs] = useState<TemplateOutput[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    // Auto-set canGainWeight when step is MASERADO
    useEffect(() => {
        if (processingStep === 'MASERADO') {
            setCanGainWeight(true);
        } else {
            setCanGainWeight(false);
        }
    }, [processingStep]);

    // Auto-generate name based on source item and step
    useEffect(() => {
        if (sourceItemId && processingStep) {
            const item = items.find(i => i.id === sourceItemId);
            if (item) {
                const stepLabel = STEP_CONFIG[processingStep]?.label || processingStep;
                setTemplateName(`${stepLabel} de ${item.name}`);
            }
        }
    }, [sourceItemId, processingStep, items]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [tmpl, allItems] = await Promise.all([
                getProcessingTemplatesAction(),
                getProteinItemsAction()
            ]);
            setTemplates(tmpl as unknown as Template[]);
            setItems(allItems);
        } catch {
            console.error('Error loading templates');
        }
        setLoading(false);
    };

    const addOutput = () => {
        setOutputs([...outputs, { outputItemId: '', outputItemName: '', expectedWeight: undefined, isIntermediate: false }]);
    };

    const removeOutput = (idx: number) => {
        setOutputs(outputs.filter((_, i) => i !== idx));
    };

    const updateOutput = (idx: number, updates: Partial<TemplateOutput>) => {
        const newOutputs = [...outputs];
        newOutputs[idx] = { ...newOutputs[idx], ...updates };
        setOutputs(newOutputs);
    };

    const handleCreate = async () => {
        if (!templateName || !sourceItemId || outputs.filter(o => o.outputItemId).length === 0) {
            setMsg({ type: 'error', text: 'Completa nombre, item fuente y al menos un sub-producto.' });
            return;
        }

        setIsSubmitting(true);
        const res = await createProcessingTemplateAction({
            name: templateName,
            description: templateDescription || undefined,
            sourceItemId,
            processingStep,
            canGainWeight,
            chainOrder,
            outputs: outputs.filter(o => o.outputItemId).map(o => ({
                outputItemId: o.outputItemId,
                expectedWeight: o.expectedWeight,
                expectedUnits: o.expectedUnits,
                isIntermediate: o.isIntermediate || false,
            }))
        });

        if (res.success) {
            setMsg({ type: 'success', text: '✅ Plantilla creada exitosamente' });
            setShowCreate(false);
            resetForm();
            loadData();
        } else {
            setMsg({ type: 'error', text: res.message });
        }
        setIsSubmitting(false);
    };

    const resetForm = () => {
        setTemplateName('');
        setTemplateDescription('');
        setSourceItemId('');
        setProcessingStep('LIMPIEZA');
        setCanGainWeight(false);
        setChainOrder(0);
        setOutputs([]);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Eliminar esta plantilla?')) return;
        const res = await deleteProcessingTemplateAction(id);
        if (res.success) {
            loadData();
        } else {
            alert('Error: ' + res.message);
        }
    };

    // Agrupar plantillas por source item para visualización de cadena
    const templatesBySource = templates.reduce((acc, t) => {
        const key = t.sourceItem.id;
        if (!acc[key]) {
            acc[key] = { sourceItem: t.sourceItem, templates: [] };
        }
        acc[key].templates.push(t);
        return acc;
    }, {} as Record<string, { sourceItem: { id: string; name: string; sku: string }; templates: Template[] }>);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600 mx-auto"></div>
                    <p className="mt-2 text-sm text-gray-500">Cargando plantillas...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        📋 Plantillas de Procesamiento
                    </h2>
                    <p className="text-sm text-gray-500">
                        Define los pasos y sub-productos de cada proteína. Puedes crear plantillas por paso (Limpieza → Maserado → Distribución).
                    </p>
                </div>
                <button
                    onClick={() => { setShowCreate(!showCreate); if (showCreate) resetForm(); }}
                    className="min-h-[44px] rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:shadow-md transition-all"
                >
                    {showCreate ? '✕ Cancelar' : '+ Nueva Plantilla'}
                </button>
            </div>

            {/* Mensaje */}
            {msg && (
                <div className={cn(
                    "rounded-lg px-4 py-3 text-sm font-medium",
                    msg.type === 'success' ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" :
                        "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                )}>
                    {msg.text}
                </div>
            )}

            {/* Formulario de Creación */}
            {showCreate && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-6 dark:border-amber-900/50 dark:bg-amber-900/10 space-y-5">
                    <h3 className="font-semibold text-gray-900 dark:text-white">Nueva Plantilla de Procesamiento</h3>

                    {/* Paso del procesamiento */}
                    <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Paso del Procesamiento *
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {Object.entries(STEP_CONFIG).map(([value, config]) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setProcessingStep(value)}
                                    className={cn(
                                        'rounded-xl px-4 py-3 text-sm font-medium border-2 transition-all text-left',
                                        processingStep === value
                                            ? `${config.bgColor} ${config.borderColor} ${config.color} ring-2 ring-offset-1 ring-opacity-50`
                                            : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400'
                                    )}
                                >
                                    <div className="text-lg mb-1">{config.emoji}</div>
                                    <div className="font-semibold">{config.label}</div>
                                    <div className="text-[10px] opacity-70 mt-0.5 leading-tight">{config.description}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        {/* Proteína Fuente */}
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Proteína / Item Fuente *
                            </label>
                            <Combobox
                                items={items.map(i => ({ value: i.id, label: i.name }))}
                                value={sourceItemId}
                                onChange={setSourceItemId}
                                placeholder="Seleccionar proteína..."
                                searchPlaceholder="Buscar proteína..."
                            />
                        </div>

                        {/* Nombre */}
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Nombre de la Plantilla *
                            </label>
                            <input
                                type="text"
                                value={templateName}
                                onChange={e => setTemplateName(e.target.value)}
                                placeholder="Se auto-genera basado en item y paso"
                                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white min-h-[44px]"
                            />
                        </div>
                    </div>

                    {/* Opciones avanzadas */}
                    <div className="grid gap-4 sm:grid-cols-3">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Descripción (opcional)
                            </label>
                            <input
                                type="text"
                                value={templateDescription}
                                onChange={e => setTemplateDescription(e.target.value)}
                                placeholder="Notas sobre esta plantilla"
                                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white min-h-[44px]"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Orden en Cadena
                            </label>
                            <input
                                type="number"
                                min={0}
                                value={chainOrder}
                                onChange={e => setChainOrder(parseInt(e.target.value) || 0)}
                                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white min-h-[44px]"
                            />
                            <p className="text-[10px] text-gray-400 mt-0.5">0 = primer paso, 1 = segundo, etc.</p>
                        </div>
                        <div className="flex items-center gap-3 pt-5">
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={canGainWeight}
                                    onChange={e => setCanGainWeight(e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600 dark:bg-gray-700"></div>
                            </label>
                            <div>
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">¿Peso puede aumentar?</span>
                                <p className="text-[10px] text-gray-400">Ej: maserado agrega condimentos</p>
                            </div>
                        </div>
                    </div>

                    {/* Sub-productos permitidos */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Sub-Productos / Salidas de este Paso *
                            </label>
                            <button
                                onClick={addOutput}
                                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-400 min-h-[36px]"
                            >
                                + Agregar Sub-Producto
                            </button>
                        </div>

                        {outputs.length === 0 ? (
                            <div className="rounded-lg border-2 border-dashed border-gray-300 py-6 text-center dark:border-gray-600">
                                <p className="text-sm text-gray-500">
                                    Agrega los cortes/sub-productos que se obtienen en este paso
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {outputs.map((output, idx) => (
                                    <div key={idx} className="flex items-center gap-3 rounded-lg bg-white p-3 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                                        <div className="flex-1">
                                            <Combobox
                                                items={items.map(i => ({ value: i.id, label: i.name }))}
                                                value={output.outputItemId}
                                                onChange={val => {
                                                    const itemFound = items.find(i => i.id === val);
                                                    updateOutput(idx, { outputItemId: val, outputItemName: itemFound?.name || '' });
                                                }}
                                                placeholder="Seleccionar sub-producto..."
                                                searchPlaceholder="Buscar..."
                                            />
                                        </div>
                                        <div className="w-24">
                                            <input
                                                type="number"
                                                inputMode="decimal"
                                                min={0}
                                                step={0.1}
                                                value={output.expectedWeight ?? ''}
                                                onChange={e => updateOutput(idx, { expectedWeight: parseFloat(e.target.value) || undefined })}
                                                placeholder="Peso kg"
                                                className="w-full rounded border border-gray-200 px-2 py-2 text-center text-sm dark:border-gray-600 dark:bg-gray-700 min-h-[40px]"
                                            />
                                        </div>
                                        {/* Toggle intermedio */}
                                        <div className="flex items-center gap-1.5" title="¿Es producto intermedio? (pasa al siguiente paso)">
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={output.isIntermediate || false}
                                                    onChange={e => updateOutput(idx, { isIntermediate: e.target.checked })}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500 dark:bg-gray-700"></div>
                                            </label>
                                            <span className="text-[10px] text-gray-500 leading-tight w-12">
                                                {output.isIntermediate ? '🔗 Inter.' : 'Final'}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => removeOutput(idx)}
                                            className="flex h-9 w-9 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 min-h-[44px] min-w-[44px]"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <p className="text-[10px] text-gray-400 mt-2">
                            💡 Marca como &quot;Intermedio&quot; los productos que serán input del siguiente paso (ej: Lomito Limpio → Maserado).
                            Los productos finales se agregan directamente al inventario.
                        </p>
                    </div>

                    {/* Acciones */}
                    <div className="flex justify-end border-t border-amber-200 pt-4 dark:border-amber-800">
                        <button
                            onClick={handleCreate}
                            disabled={isSubmitting}
                            className="min-h-[44px] rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-2.5 font-medium text-white shadow-sm hover:shadow-md disabled:opacity-50 transition-all"
                        >
                            {isSubmitting ? '⏳ Guardando...' : '💾 Crear Plantilla'}
                        </button>
                    </div>
                </div>
            )}

            {/* Lista de Plantillas - Agrupadas por Proteína */}
            {templates.length === 0 && !showCreate ? (
                <div className="rounded-xl border-2 border-dashed border-gray-300 py-12 text-center dark:border-gray-600">
                    <span className="text-5xl">📋</span>
                    <p className="mt-3 text-gray-500">No hay plantillas de procesamiento definidas.</p>
                    <p className="text-sm text-gray-400">Crea una para estandarizar el procesamiento de proteínas.</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {Object.entries(templatesBySource).map(([sourceId, group]) => (
                        <div key={sourceId} className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
                            {/* Header del grupo */}
                            <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 px-5 py-3 border-b border-gray-200 dark:border-gray-700">
                                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                    🥩 {group.sourceItem.name}
                                    <span className="text-xs font-normal text-gray-500">
                                        ({group.templates.length} {group.templates.length === 1 ? 'paso' : 'pasos'})
                                    </span>
                                </h3>
                            </div>

                            {/* Cadena de pasos como timeline */}
                            <div className="p-5">
                                <div className="relative">
                                    {/* Línea de conexión */}
                                    {group.templates.length > 1 && (
                                        <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-gradient-to-b from-blue-300 via-purple-300 to-green-300 dark:from-blue-700 dark:via-purple-700 dark:to-green-700"></div>
                                    )}

                                    <div className="space-y-4">
                                        {group.templates
                                            .sort((a, b) => a.chainOrder - b.chainOrder)
                                            .map((template, tIdx) => {
                                                const stepConfig = STEP_CONFIG[template.processingStep] || STEP_CONFIG['CUSTOM'];
                                                return (
                                                    <div key={template.id} className="relative flex gap-4">
                                                        {/* Step indicator */}
                                                        <div className={cn(
                                                            'relative z-10 flex h-12 w-12 items-center justify-center rounded-xl border-2 text-lg flex-shrink-0',
                                                            stepConfig.bgColor, stepConfig.borderColor
                                                        )}>
                                                            {stepConfig.emoji}
                                                        </div>

                                                        {/* Content */}
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-start justify-between mb-2">
                                                                <div>
                                                                    <div className="flex items-center gap-2">
                                                                        <h4 className={cn('font-semibold text-sm', stepConfig.color)}>
                                                                            {stepConfig.label}
                                                                        </h4>
                                                                        <span className="text-xs text-gray-400">Paso {template.chainOrder + 1}</span>
                                                                        {template.canGainWeight && (
                                                                            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                                                                                ⬆️ Peso puede aumentar
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <p className="text-xs text-gray-500">{template.name}</p>
                                                                </div>
                                                                <button
                                                                    onClick={() => handleDelete(template.id)}
                                                                    className="opacity-0 group-hover:opacity-100 rounded-lg p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all dark:hover:bg-red-900/20"
                                                                    title="Eliminar"
                                                                >
                                                                    🗑️
                                                                </button>
                                                            </div>

                                                            {/* Outputs */}
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {template.allowedOutputs.map(out => (
                                                                    <span
                                                                        key={out.id}
                                                                        className={cn(
                                                                            'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium',
                                                                            out.isIntermediate
                                                                                ? 'bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-900/20 dark:text-orange-400'
                                                                                : 'bg-gray-100 text-gray-700 border border-gray-200 dark:bg-gray-700/50 dark:text-gray-300'
                                                                        )}
                                                                    >
                                                                        {out.isIntermediate && '🔗 '}
                                                                        {out.outputItem.name}
                                                                        {out.expectedWeight && (
                                                                            <span className="font-mono text-[10px] opacity-60">~{out.expectedWeight}kg</span>
                                                                        )}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
