'use client';

import { useState, useEffect } from 'react';
import { formatNumber, formatCurrency, cn } from '@/lib/utils';
import {
    getProteinItemsAction,
    getProcessingAreasAction,
    getSuppliersAction,
    createProteinProcessingAction,
    getProteinProcessingsAction,
    getProteinProcessingByIdAction,
    completeProteinProcessingAction,
    cancelProteinProcessingAction,
    getProteinProcessingStatsAction,
    getTemplateBySourceItemAction,
    getTemplateChainAction,
    getCompletedProcessingsForChainAction,
    SubProductInput
} from '@/app/actions/protein-processing.actions';
import { createQuickItem } from '@/app/actions/inventory.actions';
import { toast } from 'react-hot-toast';
import { Combobox } from '@/components/ui/combobox';
import ProcessingTemplates from './processing-templates';

const STEP_CONFIG: Record<string, { label: string; emoji: string; color: string; bgColor: string; borderColor: string }> = {
    'LIMPIEZA': { label: 'Limpieza', emoji: '🧹', color: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-300' },
    'MASERADO': { label: 'Maserado', emoji: '🥘', color: 'text-purple-700', bgColor: 'bg-purple-50', borderColor: 'border-purple-300' },
    'DISTRIBUCION': { label: 'Distribución', emoji: '📦', color: 'text-green-700', bgColor: 'bg-green-50', borderColor: 'border-green-300' },
    'CUSTOM': { label: 'Personalizado', emoji: '⚙️', color: 'text-gray-700', bgColor: 'bg-gray-50', borderColor: 'border-gray-300' },
};

interface SubProduct extends SubProductInput {
    id: string;
    outputItemId?: string; // ID del item de inventario al que corresponde
}

export default function ProteinProcessingView() {
    const [proteinItems, setProteinItems] = useState<any[]>([]);
    const [areas, setAreas] = useState<any[]>([]);
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [processings, setProcessings] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [selectedProcessing, setSelectedProcessing] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Estado del formulario
    const [viewMode, setViewMode] = useState<'list' | 'create' | 'detail' | 'templates'>('list');
    const [processDate, setProcessDate] = useState(new Date().toISOString().slice(0, 10));
    const [sourceItemId, setSourceItemId] = useState('');
    const [supplierId, setSupplierId] = useState('');
    const [supplierName, setSupplierName] = useState('');
    const [frozenWeight, setFrozenWeight] = useState<number>(0);
    const [drainedWeight, setDrainedWeight] = useState<number>(0);
    const [areaId, setAreaId] = useState('');
    const [notes, setNotes] = useState('');
    const [reportedWaste, setReportedWaste] = useState<number>(0);

    // Subproductos
    const [subProducts, setSubProducts] = useState<SubProduct[]>([]);
    const [newSubProductName, setNewSubProductName] = useState('');
    const [newSubProductItemId, setNewSubProductItemId] = useState('');
    const [newSubProductWeight, setNewSubProductWeight] = useState<number>(0);
    const [newSubProductUnits, setNewSubProductUnits] = useState<number>(1);
    const [newSubProductUnitType, setNewSubProductUnitType] = useState<string>('KG');

    // Estado para crear insumo nuevo (Subproducto)
    const [showCreateItem, setShowCreateItem] = useState(false);
    const [isCreatingItem, setIsCreatingItem] = useState(false);
    const [newItemName, setNewItemName] = useState('');
    const [newItemUnit, setNewItemUnit] = useState<string>('KG');
    const [newItemType, setNewItemType] = useState<string>('RAW_MATERIAL');

    // Estado para plantilla activa
    const [activeTemplate, setActiveTemplate] = useState<any>(null);
    const [templateChain, setTemplateChain] = useState<any[]>([]);
    const [loadingTemplate, setLoadingTemplate] = useState(false);

    // Estado para procesamiento en cadena
    const [processingStep, setProcessingStep] = useState('LIMPIEZA');
    const [parentProcessingId, setParentProcessingId] = useState('');
    const [completedProcessings, setCompletedProcessings] = useState<any[]>([]);

    // Cargar cadena de plantillas cuando cambia el sourceItem
    useEffect(() => {
        if (sourceItemId) {
            setLoadingTemplate(true);
            Promise.all([
                getTemplateBySourceItemAction(sourceItemId, processingStep),
                getTemplateChainAction(sourceItemId)
            ]).then(([template, chain]) => {
                setActiveTemplate(template);
                setTemplateChain(chain);
                setLoadingTemplate(false);
                if (template) {
                    toast.success(`📋 Plantilla "${template.name}" cargada (${(template as any).processingStep || 'LIMPIEZA'})`);
                    // Auto-detect if this step can gain weight
                    if ((template as any).canGainWeight) {
                        toast(`⬆️ En este paso el peso puede AUMENTAR (ej: condimentos)`, { icon: '🥘' });
                    }
                }
                if (chain.length > 1) {
                    toast(`🔗 Cadena de ${chain.length} pasos disponible para esta proteína`, { icon: '📋' });
                }
            });
        } else {
            setActiveTemplate(null);
            setTemplateChain([]);
        }
    }, [sourceItemId, processingStep]);

    // Lista de items filtrada: si hay plantilla, solo mostrar los outputs permitidos; si no, todos
    const availableSubItems = activeTemplate
        ? activeTemplate.allowedOutputs.map((o: any) => ({
            id: o.outputItem.id,
            name: o.outputItem.name,
            sku: o.outputItem.sku,
            baseUnit: o.outputItem.baseUnit,
            expectedWeight: o.expectedWeight,
            expectedUnits: o.expectedUnits,
            isIntermediate: o.isIntermediate || false,
        }))
        : proteinItems;

    // Cargar datos iniciales
    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setIsLoading(true);
        const [itemsData, areasData, suppliersData, processingsData, statsData, completedData] = await Promise.all([
            getProteinItemsAction(),
            getProcessingAreasAction(),
            getSuppliersAction(),
            getProteinProcessingsAction(),
            getProteinProcessingStatsAction(),
            getCompletedProcessingsForChainAction()
        ]);
        setProteinItems(itemsData);
        setAreas(areasData);
        setSuppliers(suppliersData);
        setProcessings(processingsData);
        setStats(statsData);
        setCompletedProcessings(completedData);

        if (areasData.length > 0) {
            setAreaId(areasData[0].id);
        }

        setIsLoading(false);
    }

    // Agregar subproducto
    function addSubProduct() {
        if ((!newSubProductName && !newSubProductItemId) || newSubProductWeight <= 0) {
            toast.error('Selecciona un producto y peso válido');
            return;
        }

        const selectedItem = proteinItems.find(i => i.id === newSubProductItemId);
        const name = selectedItem ? selectedItem.name : newSubProductName;

        const newProduct: SubProduct = {
            id: Date.now().toString(),
            name: name,
            weight: newSubProductWeight,
            units: newSubProductUnits,
            unitType: newSubProductUnitType,
            outputItemId: newSubProductItemId || undefined
        };

        setSubProducts([...subProducts, newProduct]);
        setNewSubProductName('');
        setNewSubProductItemId('');
        setNewSubProductWeight(0);
        setNewSubProductUnits(1);
    }

    // Crear insumo nuevo on-the-fly
    const handleCreateItem = async () => {
        if (!newItemName.trim()) return;
        setIsCreatingItem(true);
        try {
            // Asumimos userId fijo o del contexto si estuviera disponible, por ahora pasamos uno genérico si no lo tenemos a mano
            // Nota: En una app real usaríamos useAuthStore como en RecipeForm
            const result = await createQuickItem({
                name: newItemName.trim(),
                unit: newItemUnit,
                type: newItemType,
                userId: 'system', // El backend lo revalidará o usará session
                cost: 0,
            });
            if (result.success && result.item) {
                // Actualizar la lista local de items
                setProteinItems(prev => [...prev, result.item!].sort((a, b) => a.name.localeCompare(b.name)));

                // Seleccionar el nuevo item
                setNewSubProductItemId(result.item!.id);
                setNewSubProductName(result.item!.name);
                setNewSubProductUnitType(result.item!.baseUnit);

                toast.success(`Insumo "${newItemName}" creado`);
                setShowCreateItem(false);
                setNewItemName('');
            } else {
                toast.error(result.message || 'Error al crear item');
            }
        } catch (error) {
            toast.error('Error al crear item');
        } finally {
            setIsCreatingItem(false);
        }
    };

    // Eliminar subproducto
    function removeSubProduct(id: string) {
        setSubProducts(subProducts.filter(sp => sp.id !== id));
    }

    // Calcular totales
    const totalSubProductsWeight = subProducts.reduce((sum, sp) => sum + sp.weight, 0);
    const wasteWeight = Math.max(0, drainedWeight - totalSubProductsWeight);
    const wastePercentage = drainedWeight > 0 ? (wasteWeight / drainedWeight) * 100 : 0;
    const yieldPercentage = frozenWeight > 0 ? (totalSubProductsWeight / frozenWeight) * 100 : 0;
    const drainLoss = frozenWeight > 0 ? ((frozenWeight - drainedWeight) / frozenWeight) * 100 : 0;

    // Guardar procesamiento
    async function handleSubmit() {
        if (!sourceItemId) {
            alert('Selecciona el producto a procesar');
            return;
        }
        if (frozenWeight <= 0) {
            alert('Ingresa el peso congelado');
            return;
        }
        if (drainedWeight <= 0) {
            alert('Ingresa el peso escurrido');
            return;
        }
        if (subProducts.length === 0) {
            alert('Agrega al menos un subproducto');
            return;
        }

        setIsSubmitting(true);
        const result = await createProteinProcessingAction({
            processDate: new Date(processDate),
            sourceItemId,
            supplierId: supplierId || undefined,
            supplierName: supplierName || undefined,
            frozenWeight,
            drainedWeight,
            areaId,
            notes: notes || undefined,
            reportedWaste: reportedWaste || undefined,
            processingStep: processingStep || 'LIMPIEZA',
            parentProcessingId: parentProcessingId || undefined,
            subProducts: subProducts.map(sp => ({
                name: sp.name,
                weight: sp.weight,
                units: sp.units,
                unitType: sp.unitType,
                outputItemId: sp.outputItemId
            }))
        });

        if (result.success) {
            alert(`✅ ${result.message}`);
            resetForm();
            setViewMode('list');
            loadData();
        } else {
            alert(`❌ ${result.message}`);
        }
        setIsSubmitting(false);
    }

    // Resetear formulario
    function resetForm() {
        setProcessDate(new Date().toISOString().slice(0, 10));
        setSourceItemId('');
        setSupplierId('');
        setSupplierName('');
        setFrozenWeight(0);
        setDrainedWeight(0);
        setNotes('');
        setReportedWaste(0);
        setSubProducts([]);
        setProcessingStep('LIMPIEZA');
        setParentProcessingId('');
    }

    // Ver detalle
    async function viewDetail(id: string) {
        const processing = await getProteinProcessingByIdAction(id);
        setSelectedProcessing(processing);
        setViewMode('detail');
    }

    // Completar procesamiento
    async function handleComplete(id: string) {
        if (!confirm('¿Completar este procesamiento? Se actualizará el inventario.')) return;

        const result = await completeProteinProcessingAction(id);
        alert(result.message);
        if (result.success) {
            loadData();
            setViewMode('list');
        }
    }

    // Cancelar procesamiento
    async function handleCancel(id: string) {
        const reason = prompt('Motivo de la cancelación:');
        if (!reason) return;

        const result = await cancelProteinProcessingAction(id, reason);
        alert(result.message);
        if (result.success) {
            loadData();
            setViewMode('list');
        }
    }

    // Status badges
    function getStatusBadge(status: string) {
        const styles: Record<string, string> = {
            'DRAFT': 'bg-gray-100 text-gray-700',
            'IN_PROGRESS': 'bg-blue-100 text-blue-700',
            'COMPLETED': 'bg-emerald-100 text-emerald-700',
            'CANCELLED': 'bg-red-100 text-red-700'
        };
        const labels: Record<string, string> = {
            'DRAFT': '📝 Borrador',
            'IN_PROGRESS': '🔄 En Proceso',
            'COMPLETED': '✅ Completado',
            'CANCELLED': '❌ Cancelado'
        };
        return (
            <span className={cn('px-2.5 py-1 rounded-full text-xs font-medium', styles[status] || 'bg-gray-100')}>
                {labels[status] || status}
            </span>
        );
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto"></div>
                    <p className="mt-4 text-gray-500">Cargando...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        🥩 Procesamiento de Proteínas
                    </h1>
                    <p className="text-gray-500">
                        Registro de desposte y rendimiento de carnes
                    </p>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => { setViewMode('list'); setSelectedProcessing(null); }}
                        className={cn(
                            'px-4 py-2.5 rounded-lg text-sm font-medium transition-all',
                            viewMode === 'list'
                                ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg'
                                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                        )}
                    >
                        📋 Ver Registros
                    </button>
                    <button
                        onClick={() => { setViewMode('create'); resetForm(); }}
                        className={cn(
                            'px-4 py-2.5 rounded-lg text-sm font-medium transition-all',
                            viewMode === 'create'
                                ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg'
                                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                        )}
                    >
                        ➕ Nuevo Procesamiento
                    </button>
                    <button
                        onClick={() => setViewMode('templates')}
                        className={cn(
                            'px-4 py-2.5 rounded-lg text-sm font-medium transition-all',
                            viewMode === 'templates'
                                ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg'
                                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                        )}
                    >
                        📋 Plantillas
                    </button>
                </div>
            </div>

            {/* Estadísticas */}
            {stats && viewMode === 'list' && (
                <div className="grid gap-4 sm:grid-cols-5">
                    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                        <p className="text-sm text-gray-500">Total Procesamientos</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalProcessings}</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                        <p className="text-sm text-gray-500">Peso Total Procesado</p>
                        <p className="text-2xl font-bold text-blue-600">{formatNumber(stats.totalFrozenWeight)} kg</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                        <p className="text-sm text-gray-500">Subproductos Obtenidos</p>
                        <p className="text-2xl font-bold text-emerald-600">{formatNumber(stats.totalSubProducts)} kg</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                        <p className="text-sm text-gray-500">Rendimiento Promedio</p>
                        <p className="text-2xl font-bold text-amber-600">{formatNumber(stats.avgYield)}%</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                        <p className="text-sm text-gray-500">Desperdicio Promedio</p>
                        <p className="text-2xl font-bold text-red-600">{formatNumber(stats.avgWaste)}%</p>
                    </div>
                </div>
            )}

            {/* Vista: Lista de procesamientos */}
            {viewMode === 'list' && (
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="border-b border-gray-200 bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-500">Código</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-500">Fecha</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-500">Producto</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-500">Proveedor</th>
                                    <th className="px-6 py-3 text-center text-xs font-semibold uppercase text-gray-500">Peso Inicial</th>
                                    <th className="px-6 py-3 text-center text-xs font-semibold uppercase text-gray-500">Rendimiento</th>
                                    <th className="px-6 py-3 text-center text-xs font-semibold uppercase text-gray-500">Estado</th>
                                    <th className="px-6 py-3 text-center text-xs font-semibold uppercase text-gray-500">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {processings.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                                            <span className="text-4xl">🥩</span>
                                            <p className="mt-2">No hay procesamientos registrados</p>
                                            <button
                                                onClick={() => setViewMode('create')}
                                                className="mt-4 px-4 py-2 rounded-lg bg-amber-500 text-white text-sm hover:bg-amber-600"
                                            >
                                                Crear primer procesamiento
                                            </button>
                                        </td>
                                    </tr>
                                ) : (
                                    processings.map((p: any) => (
                                        <tr key={p.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4">
                                                <button
                                                    onClick={() => viewDetail(p.id)}
                                                    className="font-medium text-amber-600 hover:underline"
                                                >
                                                    {p.code}
                                                </button>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500">
                                                {new Date(p.processDate).toLocaleDateString('es-VE')}
                                            </td>
                                            <td className="px-6 py-4 font-medium text-gray-900">{p.sourceItem}</td>
                                            <td className="px-6 py-4 text-sm text-gray-500">{p.supplier}</td>
                                            <td className="px-6 py-4 text-center font-mono">{formatNumber(p.frozenWeight)} kg</td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={cn(
                                                    'font-semibold',
                                                    p.yieldPercentage >= 70 ? 'text-emerald-600' :
                                                        p.yieldPercentage >= 50 ? 'text-amber-600' : 'text-red-600'
                                                )}>
                                                    {formatNumber(p.yieldPercentage)}%
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {getStatusBadge(p.status)}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex justify-center gap-2">
                                                    <button
                                                        onClick={() => viewDetail(p.id)}
                                                        className="text-blue-500 hover:text-blue-700 text-sm"
                                                        title="Ver detalle"
                                                    >
                                                        👁️
                                                    </button>
                                                    {p.status === 'DRAFT' && (
                                                        <>
                                                            <button
                                                                onClick={() => handleComplete(p.id)}
                                                                className="text-emerald-500 hover:text-emerald-700 text-sm"
                                                                title="Completar"
                                                            >
                                                                ✅
                                                            </button>
                                                            <button
                                                                onClick={() => handleCancel(p.id)}
                                                                className="text-red-500 hover:text-red-700 text-sm"
                                                                title="Cancelar"
                                                            >
                                                                ❌
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Vista: Crear procesamiento */}
            {viewMode === 'create' && (
                <div className="grid gap-6 lg:grid-cols-2">
                    {/* Formulario principal */}
                    <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                            <h2 className="font-semibold text-gray-900 dark:text-white">
                                📋 Datos del Procesamiento
                            </h2>
                        </div>

                        <div className="p-6 space-y-4">
                            {/* Fecha */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                                <input
                                    type="date"
                                    value={processDate}
                                    onChange={(e) => setProcessDate(e.target.value)}
                                    className="w-full rounded-lg border border-gray-200 px-4 py-2.5 focus:border-amber-500 focus:outline-none"
                                />
                            </div>

                            {/* Paso del Procesamiento */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Paso del Procesamiento</label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {Object.entries(STEP_CONFIG).map(([value, config]) => {
                                        const hasTemplate = templateChain.some((t: any) => t.processingStep === value);
                                        return (
                                            <button
                                                key={value}
                                                type="button"
                                                onClick={() => setProcessingStep(value)}
                                                className={cn(
                                                    'rounded-xl px-3 py-3 text-xs font-medium border-2 transition-all relative',
                                                    processingStep === value
                                                        ? `${config.bgColor} ${config.borderColor} ${config.color} ring-2 ring-offset-1`
                                                        : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                                                )}
                                            >
                                                <span className="text-lg">{config.emoji}</span>
                                                <span className="block mt-0.5">{config.label}</span>
                                                {hasTemplate && (
                                                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 rounded-full border-2 border-white" title="Tiene plantilla"></span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                                {/* Template chain indicator */}
                                {templateChain.length > 0 && (
                                    <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                                        <span>📋 Cadena disponible:</span>
                                        {templateChain
                                            .sort((a: any, b: any) => a.chainOrder - b.chainOrder)
                                            .map((t: any, i: number) => {
                                                const sc = STEP_CONFIG[t.processingStep] || STEP_CONFIG['CUSTOM'];
                                                return (
                                                    <span key={t.id} className="flex items-center gap-0.5">
                                                        {i > 0 && <span className="text-gray-300">→</span>}
                                                        <span className={cn(
                                                            'rounded px-1.5 py-0.5 font-medium',
                                                            t.processingStep === processingStep ? `${sc.bgColor} ${sc.color}` : 'text-gray-400'
                                                        )}>
                                                            {sc.emoji} {sc.label}
                                                        </span>
                                                    </span>
                                                );
                                            })}
                                    </div>
                                )}
                            </div>

                            {/* Encadenar con procesamiento previo (P5) */}
                            {processingStep !== 'LIMPIEZA' && completedProcessings.length > 0 && (
                                <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-3 dark:border-purple-800 dark:bg-purple-900/10">
                                    <label className="block text-sm font-medium text-purple-800 dark:text-purple-300 mb-1">
                                        🔗 Encadenar con procesamiento anterior
                                    </label>
                                    <select
                                        value={parentProcessingId}
                                        onChange={(e) => {
                                            setParentProcessingId(e.target.value);
                                            // Auto-fill frozen weight from parent's total output
                                            if (e.target.value) {
                                                const parent = completedProcessings.find(p => p.id === e.target.value);
                                                if (parent) {
                                                    setFrozenWeight(parent.totalSubProducts);
                                                    // Auto-select the first sub-product as source item
                                                    if (parent.subProducts.length > 0 && parent.subProducts[0].outputItemId) {
                                                        setSourceItemId(parent.subProducts[0].outputItemId);
                                                    }
                                                }
                                            }
                                        }}
                                        className="w-full rounded-lg border border-purple-200 bg-white px-4 py-2.5 text-sm dark:border-purple-700 dark:bg-gray-800"
                                    >
                                        <option value="">Sin encadenar (nuevo procesamiento)</option>
                                        {completedProcessings.map(p => (
                                            <option key={p.id} value={p.id}>
                                                {p.code} — {p.sourceItem.name} ({p.processingStep}) — {p.totalSubProducts.toFixed(2)} kg output
                                            </option>
                                        ))}
                                    </select>
                                    <p className="mt-1 text-xs text-purple-600 dark:text-purple-400">
                                        El peso de entrada se auto-llenará con la salida del paso anterior
                                    </p>
                                </div>
                            )}

                            {/* Producto a procesar */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Producto a Procesar*</label>
                                <Combobox
                                    items={proteinItems.map(item => ({
                                        value: item.id,
                                        label: `${item.name} (${item.category || 'Sin categoría'})`
                                    }))}
                                    value={sourceItemId}
                                    onChange={(val) => setSourceItemId(val)}
                                    placeholder="Seleccionar producto..."
                                    searchPlaceholder="Buscar producto..."
                                    emptyMessage="No se encontró producto."
                                />
                            </div>

                            {/* Proveedor */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor</label>
                                <Combobox
                                    items={suppliers.map(s => ({
                                        value: s.id,
                                        label: s.name
                                    }))}
                                    value={supplierId}
                                    onChange={(val) => setSupplierId(val)}
                                    placeholder="Seleccionar proveedor..."
                                    searchPlaceholder="Buscar proveedor..."
                                    emptyMessage="No se encontró proveedor."
                                />
                                {!supplierId && (
                                    <input
                                        type="text"
                                        value={supplierName}
                                        onChange={(e) => setSupplierName(e.target.value)}
                                        placeholder="O escribir nombre del proveedor..."
                                        className="w-full mt-2 rounded-lg border border-gray-200 px-4 py-2.5 focus:border-amber-500 focus:outline-none"
                                    />
                                )}
                            </div>

                            {/* Área */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Área de Procesamiento</label>
                                <Combobox
                                    items={areas.map(area => ({
                                        value: area.id,
                                        label: area.name
                                    }))}
                                    value={areaId}
                                    onChange={(val) => setAreaId(val)}
                                    placeholder="Seleccionar área..."
                                    searchPlaceholder="Buscar área..."
                                    emptyMessage="No se encontró área."
                                />
                            </div>

                            {/* Pesos */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Peso Congelado (kg)*</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={frozenWeight || ''}
                                        onChange={(e) => setFrozenWeight(parseFloat(e.target.value) || 0)}
                                        placeholder="0.00"
                                        className="w-full rounded-lg border border-gray-200 px-4 py-2.5 focus:border-amber-500 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Peso Escurrido (kg)*</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={drainedWeight || ''}
                                        onChange={(e) => setDrainedWeight(parseFloat(e.target.value) || 0)}
                                        placeholder="0.00"
                                        className="w-full rounded-lg border border-gray-200 px-4 py-2.5 focus:border-amber-500 focus:outline-none"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Desperdicio Reportado (kg) - Entrada Manual</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={reportedWaste || ''}
                                        onChange={(e) => setReportedWaste(parseFloat(e.target.value) || 0)}
                                        placeholder="Ingresa el desperdicio real segun Excel..."
                                        className="w-full rounded-lg border border-red-200 bg-red-50/30 px-4 py-2.5 focus:border-red-500 focus:outline-none"
                                    />
                                    <p className="text-[10px] text-gray-500 mt-1">
                                        * Este valor se usará para tus reportes de merma real.
                                    </p>
                                </div>
                            </div>

                            {/* Pérdida por escurrido / Ganancia de peso */}
                            {frozenWeight > 0 && drainedWeight > 0 && (
                                <div className={cn(
                                    'p-3 rounded-lg text-sm',
                                    drainedWeight > frozenWeight ? 'bg-purple-50' : 'bg-blue-50'
                                )}>
                                    {drainedWeight > frozenWeight ? (
                                        <span className="text-purple-700">
                                            ⬆️ Ganancia de peso: <strong>{formatNumber(drainedWeight - frozenWeight)} kg</strong> ({formatNumber(((drainedWeight - frozenWeight) / frozenWeight) * 100)}%)
                                            <span className="block text-xs mt-0.5 opacity-70">Se agregaron condimentos/marinado</span>
                                        </span>
                                    ) : (
                                        <span className="text-blue-700">
                                            💧 Pérdida por escurrido: <strong>{formatNumber(frozenWeight - drainedWeight)} kg</strong> ({formatNumber(drainLoss)}%)
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Notas */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Observaciones del procesamiento..."
                                    rows={2}
                                    className="w-full rounded-lg border border-gray-200 px-4 py-2.5 focus:border-amber-500 focus:outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Subproductos */}
                    <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                            <h2 className="font-semibold text-gray-900 dark:text-white">
                                🍖 Subproductos ({subProducts.length})
                            </h2>
                        </div>

                        <div className="p-6 space-y-4">
                            {/* Agregar subproducto */}
                            <div className="space-y-4 rounded-lg bg-gray-50 p-4 border border-gray-100">
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-sm font-medium text-gray-700">Nuevo corte / subproducto</label>
                                    <button
                                        type="button"
                                        onClick={() => setShowCreateItem(!showCreateItem)}
                                        className="text-xs text-emerald-600 font-medium hover:text-emerald-700 underline"
                                    >
                                        {showCreateItem ? 'Cancelar creación' : '+ Crear nuevo item en inventario'}
                                    </button>
                                </div>

                                {/* Mini form crear item */}
                                {showCreateItem && (
                                    <div className="mb-4 p-3 bg-emerald-50 rounded-lg border border-emerald-100 animate-in fade-in slide-in-from-top-2">
                                        <div className="grid grid-cols-2 gap-3 mb-3">
                                            <input
                                                type="text"
                                                value={newItemName}
                                                onChange={(e) => setNewItemName(e.target.value)}
                                                placeholder="Nombre (ej: Huesos de Pollo)"
                                                className="col-span-2 rounded border border-emerald-200 px-3 py-1.5 text-sm"
                                                autoFocus
                                            />
                                            <select
                                                value={newItemUnit}
                                                onChange={(e) => setNewItemUnit(e.target.value)}
                                                className="rounded border border-emerald-200 px-3 py-1.5 text-sm"
                                            >
                                                <option value="KG">Kilogramos</option>
                                                <option value="G">Gramos</option>
                                                <option value="UNIT">Unidad</option>
                                            </select>
                                            <select
                                                value={newItemType}
                                                onChange={(e) => setNewItemType(e.target.value)}
                                                className="rounded border border-emerald-200 px-3 py-1.5 text-sm"
                                            >
                                                <option value="RAW_MATERIAL">Materia Prima</option>
                                                <option value="SUB_RECIPE">Sub-receta</option>
                                                <option value="FINISHED_GOOD">Producto Final</option>
                                            </select>
                                        </div>
                                        <button
                                            onClick={handleCreateItem}
                                            disabled={!newItemName.trim() || isCreatingItem}
                                            className="w-full rounded bg-emerald-600 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                                        >
                                            {isCreatingItem ? 'Creando...' : 'Guardar Item'}
                                        </button>
                                    </div>
                                )}

                                <div className="flex flex-col sm:flex-row gap-2">
                                    <div className="flex-1">
                                        {activeTemplate && (
                                            <div className={cn(
                                                'mb-2 px-3 py-2 rounded-lg border text-xs',
                                                STEP_CONFIG[activeTemplate.processingStep]?.bgColor || 'bg-amber-50',
                                                STEP_CONFIG[activeTemplate.processingStep]?.borderColor || 'border-amber-200',
                                                STEP_CONFIG[activeTemplate.processingStep]?.color || 'text-amber-700'
                                            )}>
                                                <div className="flex items-center gap-1.5">
                                                    {STEP_CONFIG[activeTemplate.processingStep]?.emoji || '📋'}
                                                    <strong>{activeTemplate.name}</strong>
                                                    <span className="opacity-70">({activeTemplate.allowedOutputs.length} subproductos)</span>
                                                    {activeTemplate.canGainWeight && (
                                                        <span className="ml-1 rounded-full bg-purple-200 px-1.5 py-0.5 text-[9px] font-bold text-purple-700">⬆️ Peso puede aumentar</span>
                                                    )}
                                                </div>
                                                {activeTemplate.allowedOutputs.some((o: any) => o.isIntermediate) && (
                                                    <p className="mt-1 text-[10px] opacity-70">
                                                        🔗 Algunos productos son intermedios y pasarán al siguiente paso de la cadena.
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                        <Combobox
                                            items={availableSubItems.map((item: any) => ({
                                                value: item.id,
                                                label: `${item.name} (${item.baseUnit})${item.expectedWeight ? ` ~${item.expectedWeight}kg` : ''}`
                                            }))}
                                            value={newSubProductItemId}
                                            onChange={(val) => {
                                                const item = availableSubItems.find((i: any) => i.id === val);
                                                setNewSubProductItemId(val);
                                                if (item) {
                                                    setNewSubProductName(item.name);
                                                    setNewSubProductUnitType(item.baseUnit);
                                                    // Pre-fill expected weight from template if available
                                                    if (item.expectedWeight && newSubProductWeight === 0) {
                                                        setNewSubProductWeight(item.expectedWeight);
                                                    }
                                                    if (item.expectedUnits) {
                                                        setNewSubProductUnits(item.expectedUnits);
                                                    }
                                                }
                                            }}
                                            placeholder={activeTemplate ? "-- Seleccionar subproducto de plantilla --" : "-- Seleccionar item existente --"}
                                            searchPlaceholder="Buscar item..."
                                            emptyMessage={activeTemplate ? "No hay más subproductos en esta plantilla." : "No se encontró el item."}
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="relative w-24">
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={newSubProductWeight || ''}
                                                onChange={(e) => setNewSubProductWeight(parseFloat(e.target.value) || 0)}
                                                placeholder="Peso"
                                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                                            />
                                            <span className="absolute right-2 top-2 text-xs text-gray-400">{newSubProductUnitType}</span>
                                        </div>
                                        <div className="relative w-20">
                                            <input
                                                type="number"
                                                value={newSubProductUnits || ''}
                                                onChange={(e) => setNewSubProductUnits(parseInt(e.target.value) || 1)}
                                                placeholder="Uds"
                                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                                            />
                                            <span className="absolute right-2 top-2 text-xs text-gray-400">pza</span>
                                        </div>
                                        <button
                                            onClick={addSubProduct}
                                            className="px-4 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Lista de subproductos */}
                            <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                {subProducts.length === 0 ? (
                                    <p className="text-center text-gray-500 py-8">
                                        Agrega los cortes/subproductos obtenidos
                                    </p>
                                ) : (
                                    subProducts.map((sp, index) => {
                                        // Check if this subproduct is intermediate
                                        const templateOutput = activeTemplate?.allowedOutputs?.find((o: any) => o.outputItem?.id === sp.outputItemId);
                                        const isIntermediate = templateOutput?.isIntermediate || false;
                                        return (
                                            <div key={sp.id} className={cn(
                                                'flex items-center justify-between p-3 rounded-lg',
                                                isIntermediate ? 'bg-orange-50 border border-orange-200' : 'bg-gray-50'
                                            )}>
                                                <div className="flex-1">
                                                    <span className="text-gray-400 mr-2">{index + 1}.</span>
                                                    <span className="font-medium">{sp.name}</span>
                                                    {isIntermediate && (
                                                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-orange-200 text-orange-700 font-medium">🔗 Intermedio</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="font-mono text-sm">{formatNumber(sp.weight)} kg</span>
                                                    <span className="text-xs text-gray-500">({sp.units} pza)</span>
                                                    <button
                                                        onClick={() => removeSubProduct(sp.id)}
                                                        className="text-red-500 hover:text-red-700"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* Resumen */}
                            <div className="border-t pt-4 space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Total Subproductos:</span>
                                    <span className="font-semibold">{formatNumber(totalSubProductsWeight)} kg</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Desperdicio:</span>
                                    <span className={cn('font-semibold', wasteWeight > 0 ? 'text-red-600' : 'text-gray-600')}>
                                        {formatNumber(wasteWeight)} kg ({formatNumber(wastePercentage)}%)
                                    </span>
                                </div>
                                <div className="flex justify-between text-lg font-bold">
                                    <span>Rendimiento:</span>
                                    <span className={cn(
                                        yieldPercentage >= 70 ? 'text-emerald-600' :
                                            yieldPercentage >= 50 ? 'text-amber-600' : 'text-red-600'
                                    )}>
                                        {formatNumber(yieldPercentage)}%
                                    </span>
                                </div>
                            </div>

                            {/* Botón guardar */}
                            <button
                                onClick={handleSubmit}
                                disabled={!sourceItemId || frozenWeight <= 0 || subProducts.length === 0 || isSubmitting}
                                className="w-full py-3 rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transition-all"
                            >
                                {isSubmitting ? 'Guardando...' : '💾 Guardar Procesamiento'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Vista: Detalle */}
            {viewMode === 'detail' && selectedProcessing && (
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                    <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700 flex justify-between items-center">
                        <div>
                            <h2 className="font-semibold text-gray-900 dark:text-white">
                                {selectedProcessing.code}
                            </h2>
                            <p className="text-sm text-gray-500">
                                {new Date(selectedProcessing.processDate).toLocaleDateString('es-VE', {
                                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                                })}
                            </p>
                        </div>
                        {getStatusBadge(selectedProcessing.status)}
                    </div>

                    <div className="p-6 grid gap-6 lg:grid-cols-2">
                        {/* Info general */}
                        <div className="space-y-4">
                            <h3 className="font-medium text-gray-900">Información General</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Producto:</span>
                                    <span className="font-medium">{selectedProcessing.sourceItem.name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Proveedor:</span>
                                    <span>{selectedProcessing.supplier?.name || selectedProcessing.supplierName || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Área:</span>
                                    <span>{selectedProcessing.area.name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Creado por:</span>
                                    <span>{selectedProcessing.createdBy.firstName} {selectedProcessing.createdBy.lastName}</span>
                                </div>
                            </div>

                            <h3 className="font-medium text-gray-900 pt-4">Pesos y Rendimiento</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Peso Congelado:</span>
                                    <span className="font-mono">{formatNumber(selectedProcessing.frozenWeight)} kg</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Peso Escurrido:</span>
                                    <span className="font-mono">{formatNumber(selectedProcessing.drainedWeight)} kg</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Total Subproductos:</span>
                                    <span className="font-mono text-emerald-600">{formatNumber(selectedProcessing.totalSubProducts)} kg</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Desperdicio:</span>
                                    <span className="font-mono text-red-600">{formatNumber(selectedProcessing.wasteWeight)} kg ({formatNumber(selectedProcessing.wastePercentage)}%)</span>
                                </div>
                                <div className="flex justify-between text-lg font-bold pt-2 border-t">
                                    <span>Rendimiento:</span>
                                    <span className={cn(
                                        selectedProcessing.yieldPercentage >= 70 ? 'text-emerald-600' :
                                            selectedProcessing.yieldPercentage >= 50 ? 'text-amber-600' : 'text-red-600'
                                    )}>
                                        {formatNumber(selectedProcessing.yieldPercentage)}%
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Subproductos */}
                        <div>
                            <h3 className="font-medium text-gray-900 mb-4">Subproductos Obtenidos</h3>
                            <div className="space-y-2">
                                {selectedProcessing.subProducts.map((sp: any, index: number) => (
                                    <div key={sp.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                                        <div>
                                            <span className="text-gray-400 mr-2">{index + 1}.</span>
                                            <span className="font-medium">{sp.name}</span>
                                            {sp.outputItem && (
                                                <span className="ml-2 text-xs text-amber-600">
                                                    → {sp.outputItem.name}
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <span className="font-mono">{formatNumber(sp.weight)} kg</span>
                                            <span className="text-xs text-gray-500 ml-2">({sp.units} pza)</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Acciones */}
                    {selectedProcessing.status === 'DRAFT' && (
                        <div className="border-t border-gray-200 px-6 py-4 flex gap-3 justify-end">
                            <button
                                onClick={() => handleCancel(selectedProcessing.id)}
                                className="px-4 py-2 rounded-lg border border-red-300 text-red-600 hover:bg-red-50"
                            >
                                ❌ Cancelar
                            </button>
                            <button
                                onClick={() => handleComplete(selectedProcessing.id)}
                                className="px-4 py-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600"
                            >
                                ✅ Completar y Actualizar Inventario
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Vista: Plantillas de Procesamiento */}
            {viewMode === 'templates' && (
                <ProcessingTemplates />
            )}
        </div>
    );
}
