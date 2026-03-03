'use client';

import { useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { createRequisition, dispatchRequisition, approveRequisition, rejectRequisition, receiveRequisition } from '@/app/actions/requisition.actions';
import { formatNumber, cn } from '@/lib/utils';
import { UserRole } from '@/types';
import { Trash2 } from 'lucide-react';
import { Combobox } from '@/components/ui/combobox';
import { QuickCreateItemDialog } from '@/components/ui/quick-create-item-dialog';

// Tipos locales para props
interface Item {
    id: string;
    name: string;
    baseUnit: string;
    currentStock?: number;
}

interface Area {
    id: string;
    name: string;
}

interface Requisition {
    id: string;
    code: string;
    status: string;
    requestedBy: { firstName: string; lastName: string };
    processedBy: { firstName: string; lastName: string } | null;
    dispatchedBy?: { firstName: string; lastName: string } | null;
    receivedBy?: { firstName: string; lastName: string } | null;
    dispatchedAt?: Date | null;
    receivedAt?: Date | null;
    targetArea: { name: string };
    sourceArea: { name: string } | null;
    createdAt: Date;
    notes?: string | null;
    items: {
        inventoryItemId: string;
        inventoryItem: { name: string; sku: string; baseUnit: string };
        quantity: number;
        sentQuantity?: number | null;
        receivedQuantity?: number | null;
        dispatchedQuantity: number | null;
    }[];
}

interface Props {
    itemsList: Item[];
    areasList: Area[];
    initialRequisitions: Requisition[];
}

interface TransferItemRowProps {
    index: number;
    item: { id: string, name: string, quantity: number, unit: string };
    itemsList: Item[];
    onUpdate: (index: number, updates: Partial<{ id: string, name: string, quantity: number, unit: string }>) => void;
    onRemove: (index: number) => void;
    onRequestCreate: (searchTerm: string, rowIndex: number) => void;
}

function TransferItemRow({ index, item, itemsList, onUpdate, onRemove, onRequestCreate }: TransferItemRowProps) {
    // Map items for Combobox
    const comboboxItems = itemsList.map(i => ({ value: i.id, label: i.name }));

    return (
        <tr>
            <td className="p-2">
                <Combobox
                    items={comboboxItems}
                    value={item.id}
                    onChange={(val) => {
                        const selected = itemsList.find(i => i.id === val);
                        if (selected) {
                            onUpdate(index, {
                                id: selected.id,
                                name: selected.name,
                                unit: selected.baseUnit
                            });
                        }
                    }}
                    placeholder="Seleccionar Item..."
                    searchPlaceholder="Buscar item..."
                    className="w-full justify-between"
                    allowCreate={true}
                    onCreateNew={(term) => onRequestCreate(term, index)}
                />
            </td>
            <td className="p-2">
                <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={item.quantity === 0 ? '' : item.quantity}
                    onChange={e => {
                        const val = parseFloat(e.target.value);
                        onUpdate(index, { quantity: isNaN(val) ? 0 : val });
                    }}
                    placeholder="0"
                    className="w-full rounded border border-gray-200 px-3 py-2 text-center focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 min-h-[44px]"
                />
            </td>
            <td className="p-2 text-center text-gray-500 font-mono text-xs">
                {item.unit}
            </td>
            <td className="p-2 text-center">
                <button
                    onClick={() => onRemove(index)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    title="Eliminar fila"
                >
                    <Trash2 className="h-4 w-4" />
                </button>
            </td>
        </tr>
    );
}

export default function TransferenciasView({ itemsList: initialItemsList, areasList, initialRequisitions }: Props) {
    const { user } = useAuthStore();
    const [activeTab, setActiveTab] = useState<'NEW' | 'PENDING' | 'HISTORY'>('NEW');
    const [requisitions, setRequisitions] = useState<Requisition[]>(initialRequisitions);
    const [itemsList, setItemsList] = useState<Item[]>(initialItemsList);

    // --- ESTADOS DE NUEVA SOLICITUD ---
    const [targetAreaId, setTargetAreaId] = useState('');
    const [sourceAreaId, setSourceAreaId] = useState(''); // Opcional, backend usa default

    // Lista dinámica de items { id, name, quantity, unit }
    const [requestItems, setRequestItems] = useState<{ id: string, name: string, quantity: number, unit: string }[]>([
        { id: '', name: '', quantity: 0, unit: '-' }
    ]);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [msg, setMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Estado para expandir/colapsar historial
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // --- ESTADOS DE DESPACHO ESCALONADO ---
    const [dispatchQuantities, setDispatchQuantities] = useState<Record<string, number>>({});

    // --- ESTADOS DE RECEPCIÓN (Jefe de Cocina) ---
    const [receiveQuantities, setReceiveQuantities] = useState<Record<string, number>>({});
    const [receiveNotes, setReceiveNotes] = useState('');

    // --- ESTADOS DE CREACIÓN RÁPIDA ---
    const [showQuickCreate, setShowQuickCreate] = useState(false);
    const [quickCreateName, setQuickCreateName] = useState('');
    const [quickCreateRowIndex, setQuickCreateRowIndex] = useState<number>(0);

    // --- MANEJADORES ---

    const handleCreateRequisition = async () => {
        const validItems = requestItems.filter(i => i.id && i.quantity > 0);

        if (!targetAreaId || validItems.length === 0) {
            setMsg({ type: 'error', text: 'Selecciona un área y agrega al menos un item válido.' });
            return;
        }

        if (sourceAreaId === targetAreaId) {
            setMsg({ type: 'error', text: 'El origen y destino no pueden ser iguales.' });
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await createRequisition({
                requestedById: user?.id || 'cmkvq94uo0000ua0ns6g844yr',
                targetAreaId,
                sourceAreaId: sourceAreaId || undefined, // Si está vacío, undefined (backend usa default)
                items: validItems.map(i => ({
                    inventoryItemId: i.id,
                    quantity: i.quantity,
                    unit: i.unit
                }))
            });

            if (res.success) {
                setMsg({ type: 'success', text: res.message });
                setRequestItems([{ id: '', name: '', quantity: 0, unit: '-' }]);
                setTargetAreaId('');
                setTimeout(() => window.location.reload(), 1000);
            } else {
                setMsg({ type: 'error', text: res.message });
            }
        } catch (e) {
            setMsg({ type: 'error', text: 'Error de conexión' });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Despachar (Jefe de Producción) — paso intermedio
    const handleDispatch = async (req: Requisition) => {
        if (!confirm(`¿Confirmas el despacho de ${req.code}?`)) return;
        setIsSubmitting(true);

        const items = req.items.map(i => ({
            inventoryItemId: i.inventoryItemId,
            sentQuantity: dispatchQuantities[i.inventoryItemId] ?? i.quantity
        }));

        const res = await dispatchRequisition({
            requisitionId: req.id,
            dispatchedById: user?.id || '',
            items
        });

        if (res.success) {
            alert('📦 Despacho registrado. Pendiente de aprobación.');
            window.location.reload();
        } else {
            alert('❌ Error: ' + res.message);
        }
        setIsSubmitting(false);
    };

    // Aprobar (Gerente) — paso final, mueve inventario
    const handleApprove = async (req: Requisition) => {
        if (!confirm(`¿Confirmas la recepción de ${req.code}? Esto moverá el inventario.`)) return;
        setIsSubmitting(true);

        const itemsToDispatch = req.items.map(i => ({
            inventoryItemId: i.inventoryItemId,
            dispatchedQuantity: i.sentQuantity || i.dispatchedQuantity || i.quantity
        }));

        const res = await approveRequisition({
            requisitionId: req.id,
            processedById: user?.id || '',
            items: itemsToDispatch
        });

        if (res.success) {
            alert('✅ Transferencia aprobada y stock movido.');
            window.location.reload();
        } else {
            alert('❌ Error: ' + res.message);
        }
        setIsSubmitting(false);
    };

    const handleReject = async (req: Requisition) => {
        if (!confirm(`¿Estás seguro de rechazar la solicitud ${req.code}?`)) return;
        setIsSubmitting(true);

        const res = await rejectRequisition(
            req.id,
            user?.id || ''
        );

        if (res.success) {
            alert('❌ Solicitud rechazada.');
            window.location.reload();
        } else {
            alert('Error: ' + res.message);
        }
        setIsSubmitting(false);
    };

    // Recibir (Jefe de Cocina) — verifica cantidades recibidas
    const handleReceive = async (req: Requisition) => {
        if (!confirm(`¿Confirmas la recepción de ${req.code}?`)) return;
        setIsSubmitting(true);

        const items = req.items.map(i => ({
            inventoryItemId: i.inventoryItemId,
            receivedQuantity: receiveQuantities[i.inventoryItemId] ?? (i.sentQuantity ?? i.dispatchedQuantity ?? i.quantity)
        }));

        const res = await receiveRequisition({
            requisitionId: req.id,
            receivedById: user?.id || '',
            items,
            notes: receiveNotes || undefined
        });

        if (res.success) {
            alert('✅ Recepción confirmada.');
            setReceiveNotes('');
            window.location.reload();
        } else {
            alert('❌ Error: ' + res.message);
        }
        setIsSubmitting(false);
    };

    // --- FILTROS DE LISTA ---
    const pendingReqs = requisitions.filter(r => r.status === 'PENDING');
    const dispatchedReqs = requisitions.filter(r => r.status === 'DISPATCHED');
    const activeReqs = [...pendingReqs, ...dispatchedReqs];
    const historyReqs = requisitions.filter(r => !['PENDING', 'DISPATCHED'].includes(r.status)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Permisos simples (Mejora futura: usar hook de permisos)
    // Asumimos que cualquiera puede pedir, pero aprobar/rechazar requiere rol > CHEF
    // Por ahora mostramos botones a todos, el backend valida si acaso.

    return (
        <div className="space-y-6">
            {/* TABS HEADER */}
            <div className="flex gap-4 border-b border-gray-200 dark:border-gray-700">
                <button
                    onClick={() => setActiveTab('NEW')}
                    className={cn(
                        "pb-3 text-sm font-medium transition-colors border-b-2",
                        activeTab === 'NEW'
                            ? "border-blue-500 text-blue-600 dark:text-blue-400"
                            : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                    )}
                >
                    📝 Nueva Solicitud
                </button>
                <button
                    onClick={() => setActiveTab('PENDING')}
                    className={cn(
                        "pb-3 text-sm font-medium transition-colors border-b-2",
                        activeTab === 'PENDING'
                            ? "border-amber-500 text-amber-600 dark:text-amber-400"
                            : "border-transparent text-gray-500 hover:text-gray-700"
                    )}
                >
                    ⏳ En Proceso ({activeReqs.length})
                </button>
                <button
                    onClick={() => setActiveTab('HISTORY')}
                    className={cn(
                        "pb-3 text-sm font-medium transition-colors border-b-2",
                        activeTab === 'HISTORY'
                            ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                            : "border-transparent text-gray-500 hover:text-gray-700"
                    )}
                >
                    📜 Historial
                </button>
            </div>

            {/* CONTENIDO */}
            <div className="min-h-[400px]">
                {/* 1. NUEVA SOLICITUD */}
                {activeTab === 'NEW' && (
                    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                        <div className="mb-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Nueva Requisición</h3>
                            <p className="text-sm text-gray-500">Arma tu pedido seleccionando origen y destino.</p>
                        </div>

                        <div className="mb-6 grid gap-6 sm:grid-cols-2">
                            {/* Origen */}
                            <div>
                                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Desde (Origen)
                                </label>
                                <Combobox
                                    items={areasList.map(a => ({ value: a.id, label: a.name }))}
                                    value={sourceAreaId}
                                    onChange={setSourceAreaId}
                                    placeholder="Seleccionar origen..."
                                    searchPlaceholder="Buscar área..."
                                />
                                <p className="mt-1 text-xs text-gray-500">De dónde sale la mercancía</p>
                            </div>

                            {/* Destino */}
                            <div>
                                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Para (Destino)
                                </label>
                                <Combobox
                                    items={areasList.map(a => ({ value: a.id, label: a.name }))}
                                    value={targetAreaId}
                                    onChange={setTargetAreaId}
                                    placeholder="Seleccionar área destino..."
                                    searchPlaceholder="Buscar área..."
                                />
                                <p className="mt-1 text-xs text-gray-500">Quién recibe la mercancía</p>
                            </div>
                        </div>

                        {/* Tabla de Items */}
                        <div className="mb-6 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-left dark:bg-gray-800">
                                    <tr>
                                        <th className="px-4 py-3 font-medium text-gray-500">Insumo</th>
                                        <th className="w-32 px-4 py-3 font-medium text-gray-500">Cantidad</th>
                                        <th className="w-24 px-4 py-3 font-medium text-gray-500">Unidad</th>
                                        <th className="w-16 px-4 py-3"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                                    {requestItems.map((item, index) => (
                                        <TransferItemRow
                                            key={index}
                                            index={index}
                                            item={item}
                                            itemsList={itemsList}
                                            onUpdate={(idx, updates) => {
                                                const newItems = [...requestItems];
                                                newItems[idx] = { ...newItems[idx], ...updates };
                                                setRequestItems(newItems);
                                            }}
                                            onRemove={(idx) => {
                                                if (requestItems.length > 1) {
                                                    const newItems = requestItems.filter((_, i) => i !== idx);
                                                    setRequestItems(newItems);
                                                } else {
                                                    setRequestItems([{ id: '', name: '', quantity: 0, unit: '-' }]);
                                                }
                                            }}
                                            onRequestCreate={(term, rowIdx) => {
                                                setQuickCreateName(term);
                                                setQuickCreateRowIndex(rowIdx);
                                                setShowQuickCreate(true);
                                            }}
                                        />
                                    ))}
                                </tbody>
                            </table>

                            <button
                                onClick={() => setRequestItems([...requestItems, { id: '', name: '', quantity: 0, unit: '-' }])}
                                className="flex w-full items-center justify-center gap-2 border-t border-gray-200 bg-gray-50 py-3 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-blue-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                            >
                                <span className="text-lg font-bold text-blue-500">+</span> Agregar otra fila
                            </button>
                        </div>

                        {/* Acciones */}
                        <div className="flex flex-col items-end gap-4 border-t border-gray-100 pt-6 dark:border-gray-700">
                            {msg && (
                                <div className={cn("rounded-lg px-4 py-2 text-sm font-medium", msg.type === 'success' ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800")}>
                                    {msg.text}
                                </div>
                            )}

                            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
                                <button
                                    onClick={handleCreateRequisition}
                                    disabled={isSubmitting || requestItems.filter(i => i.id && i.quantity > 0).length === 0 || !targetAreaId}
                                    className="w-full sm:w-auto rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-3 font-semibold text-white shadow-lg transition-all hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isSubmitting ? 'Enviando...' : '📨 Enviar Solicitud'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. EN PROCESO (PENDIENTES + DESPACHADAS) */}
                {activeTab === 'PENDING' && (
                    <div className="space-y-6">
                        {activeReqs.length === 0 ? (
                            <div className="py-12 text-center text-gray-500">
                                <span className="text-4xl">📭</span>
                                <p className="mt-2">No hay solicitudes en proceso.</p>
                            </div>
                        ) : (
                            <>
                                {/* Sección PENDING - Esperando despacho */}
                                {pendingReqs.length > 0 && (
                                    <div>
                                        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
                                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-xs dark:bg-amber-900">1</span>
                                            Esperando Despacho ({pendingReqs.length})
                                        </h3>
                                        <div className="space-y-3">
                                            {pendingReqs.map(req => (
                                                <div key={req.id} className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-amber-900/10">
                                                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-mono font-bold text-amber-700 dark:text-amber-500">{req.code}</span>
                                                                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">⏳ Pendiente</span>
                                                            </div>
                                                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                                                                De: <strong>{req.sourceArea?.name || 'Almacén Principal'}</strong> → Para: <strong>{req.targetArea.name}</strong>
                                                            </p>
                                                            <p className="text-xs text-gray-500">
                                                                Solicitó: {req.requestedBy.firstName} {req.requestedBy.lastName} • {new Date(req.createdAt).toLocaleString('es-VE')}
                                                            </p>
                                                        </div>
                                                        <div className="flex flex-wrap gap-2">
                                                            <button
                                                                onClick={() => handleReject(req)}
                                                                disabled={isSubmitting}
                                                                className="min-h-[44px] rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:bg-gray-800 dark:hover:bg-red-900/20"
                                                            >
                                                                ❌ Rechazar
                                                            </button>
                                                            <button
                                                                onClick={() => handleDispatch(req)}
                                                                disabled={isSubmitting}
                                                                className="min-h-[44px] rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-600 disabled:opacity-50"
                                                            >
                                                                📦 Despachar
                                                            </button>
                                                            <button
                                                                onClick={() => handleApprove(req)}
                                                                disabled={isSubmitting}
                                                                className="min-h-[44px] rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-600 disabled:opacity-50"
                                                            >
                                                                ✅ Aprobar Directo
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div className="mt-4 border-t border-amber-200 pt-3 dark:border-amber-800">
                                                        <p className="mb-2 text-xs font-semibold text-gray-500">ITEMS SOLICITADOS (ajustá cantidades de despacho si difieren):</p>
                                                        <div className="grid gap-2 sm:grid-cols-2">
                                                            {req.items.map(item => (
                                                                <div key={item.inventoryItemId} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 dark:bg-gray-800">
                                                                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{item.inventoryItem.name}</span>
                                                                    <div className="flex items-center gap-2 ml-2">
                                                                        <span className="text-xs text-gray-400">Pedido: {formatNumber(item.quantity)}</span>
                                                                        <input
                                                                            type="number"
                                                                            inputMode="decimal"
                                                                            min={0}
                                                                            defaultValue={item.quantity}
                                                                            onChange={e => setDispatchQuantities(prev => ({ ...prev, [item.inventoryItemId]: parseFloat(e.target.value) || 0 }))}
                                                                            className="w-20 rounded border border-gray-200 px-2 py-1 text-center text-sm font-mono dark:border-gray-600 dark:bg-gray-700 min-h-[36px]"
                                                                        />
                                                                        <span className="text-xs text-gray-500">{item.inventoryItem.baseUnit}</span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Sección DISPATCHED - Esperando aprobación gerencial */}
                                {dispatchedReqs.length > 0 && (
                                    <div>
                                        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-400">
                                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs dark:bg-blue-900">2</span>
                                            Despachadas — Esperando Recepción ({dispatchedReqs.length})
                                        </h3>
                                        <div className="space-y-3">
                                            {dispatchedReqs.map(req => (
                                                <div key={req.id} className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/50 dark:bg-blue-900/10">
                                                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-mono font-bold text-blue-700 dark:text-blue-400">{req.code}</span>
                                                                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">📦 Despachado</span>
                                                            </div>
                                                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                                                                De: <strong>{req.sourceArea?.name || 'Almacén Principal'}</strong> → Para: <strong>{req.targetArea.name}</strong>
                                                            </p>
                                                            <p className="text-xs text-gray-500">
                                                                Solicitó: {req.requestedBy.firstName} • Despachó: {req.dispatchedBy?.firstName || '—'}
                                                                {req.dispatchedAt && ` • ${new Date(req.dispatchedAt).toLocaleString('es-VE')}`}
                                                            </p>
                                                        </div>
                                                        <div className="flex flex-wrap gap-2">
                                                            <button
                                                                onClick={() => handleReject(req)}
                                                                disabled={isSubmitting}
                                                                className="min-h-[44px] rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                                                            >
                                                                ❌ Rechazar
                                                            </button>
                                                            <button
                                                                onClick={() => handleReceive(req)}
                                                                disabled={isSubmitting}
                                                                className="min-h-[44px] rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-600 disabled:opacity-50"
                                                            >
                                                                📋 Confirmar Recepción
                                                            </button>
                                                            <button
                                                                onClick={() => handleApprove(req)}
                                                                disabled={isSubmitting}
                                                                className="min-h-[44px] rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-emerald-600 disabled:opacity-50"
                                                            >
                                                                ✅ Aprobar Directo
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div className="mt-4 border-t border-blue-200 pt-3 dark:border-blue-800">
                                                        <p className="mb-2 text-xs font-semibold text-gray-500">ITEMS DESPACHADOS (verificar cantidades recibidas):</p>
                                                        <div className="grid gap-2 sm:grid-cols-2">
                                                            {req.items.map(item => {
                                                                const dispatchedQty = item.sentQuantity ?? item.dispatchedQuantity ?? item.quantity;
                                                                return (
                                                                    <div key={item.inventoryItemId} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 dark:bg-gray-800">
                                                                        <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{item.inventoryItem.name}</span>
                                                                        <div className="flex items-center gap-2 ml-2">
                                                                            <span className="text-xs text-gray-400">Enviado: {formatNumber(dispatchedQty)}</span>
                                                                            <input
                                                                                type="number"
                                                                                inputMode="decimal"
                                                                                min={0}
                                                                                defaultValue={dispatchedQty}
                                                                                onChange={e => setReceiveQuantities(prev => ({ ...prev, [item.inventoryItemId]: parseFloat(e.target.value) || 0 }))}
                                                                                className="w-20 rounded border border-gray-200 px-2 py-1 text-center text-sm font-mono dark:border-gray-600 dark:bg-gray-700 min-h-[36px]"
                                                                            />
                                                                            <span className="text-xs text-gray-500">{item.inventoryItem.baseUnit}</span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                        <div className="mt-3">
                                                            <input
                                                                type="text"
                                                                placeholder="Notas de recepción (opcional)..."
                                                                value={receiveNotes}
                                                                onChange={e => setReceiveNotes(e.target.value)}
                                                                className="w-full rounded border border-gray-200 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* 3. HISTORIAL COMPLETO Y EXPORTAR HTML YA EXISTENTE... (mantenemos igual) */}
                {activeTab === 'HISTORY' && (
                    <div className="space-y-4">
                        <div className="flex justify-end">
                            <button
                                onClick={() => {
                                    const headers = ['Código', 'Fecha', 'Origen', 'Destino', 'Solicitado Por', 'Aprobado Por', 'Estado', 'Items'];
                                    const rows = historyReqs.map(req => [
                                        req.code,
                                        new Date(req.createdAt).toLocaleDateString(),
                                        req.sourceArea?.name || '-',
                                        req.targetArea.name,
                                        `${req.requestedBy.firstName} ${req.requestedBy.lastName}`,
                                        req.processedBy ? `${req.processedBy.firstName} ${req.processedBy.lastName}` : '-',
                                        req.status,
                                        req.items.map(i => `${i.quantity} ${i.inventoryItem.name}`).join('; ')
                                    ]);

                                    const csvContent = [
                                        headers.join(','),
                                        ...rows.map(r => r.map(c => `"${c}"`).join(','))
                                    ].join('\n');

                                    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                                    const url = URL.createObjectURL(blob);
                                    const link = document.createElement('a');
                                    link.href = url;
                                    link.setAttribute('download', `transferencias_${new Date().toISOString().split('T')[0]}.csv`);
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                }}
                                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                            >
                                📥 Exportar CSV
                            </button>
                        </div>

                        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-left dark:bg-gray-800">
                                    <tr>
                                        <th className="px-4 py-3 font-medium text-gray-500">Código</th>
                                        <th className="px-4 py-3 font-medium text-gray-500">Fecha</th>
                                        <th className="px-4 py-3 font-medium text-gray-500">Origen → Destino</th>
                                        <th className="px-4 py-3 font-medium text-gray-500">Solicitante</th>
                                        <th className="px-4 py-3 font-medium text-gray-500">Aprobador</th>
                                        <th className="px-4 py-3 font-medium text-gray-500">Estado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {historyReqs.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="p-8 text-center text-gray-500">
                                                No hay historial.
                                            </td>
                                        </tr>
                                    ) : (
                                        historyReqs.map(req => (
                                            <>
                                                <tr
                                                    key={req.id}
                                                    onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
                                                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                                                >
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`transform transition-transform duration-200 ${expandedId === req.id ? 'rotate-90' : ''}`}>
                                                                ▶
                                                            </span>
                                                            <span className="font-mono text-gray-600 dark:text-gray-400">{req.code}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                                                        {new Date(req.createdAt).toLocaleDateString()}
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-900 dark:text-white">
                                                        <span className="text-gray-500">{req.sourceArea?.name || 'ALM'}</span> → {req.targetArea.name}
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                                                        {req.requestedBy.firstName}
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                                                        {req.processedBy?.firstName || '-'}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <span className={cn(
                                                                "rounded-full px-2 py-0.5 text-xs font-medium",
                                                                req.status === 'COMPLETED' ? "bg-emerald-100 text-emerald-800" :
                                                                    req.status === 'RECEIVED' ? "bg-purple-100 text-purple-800" :
                                                                        req.status === 'REJECTED' ? "bg-red-100 text-red-800" :
                                                                            req.status === 'DISPATCHED' ? "bg-blue-100 text-blue-800" :
                                                                                "bg-gray-100 text-gray-800"
                                                            )}>
                                                                {req.status === 'COMPLETED' ? '✅ Completado' : req.status === 'RECEIVED' ? '📋 Recibido' : req.status === 'REJECTED' ? '❌ Rechazado' : req.status === 'DISPATCHED' ? '📦 Despachado' : req.status}
                                                            </span>
                                                            <span className="text-xs text-gray-400">
                                                                {req.items.length} items
                                                            </span>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {/* Fila expandible con detalles */}
                                                {expandedId === req.id && (
                                                    <tr key={`${req.id}-details`}>
                                                        <td colSpan={6} className="bg-gray-50 dark:bg-gray-800/30 p-0">
                                                            <div className="p-4 animate-in slide-in-from-top-2 duration-200">
                                                                <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                                                                    📦 Items Transferidos ({req.items.length})
                                                                </div>
                                                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                                                    {req.items.map((item, idx) => (
                                                                        <div
                                                                            key={idx}
                                                                            className="flex items-center justify-between rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2"
                                                                        >
                                                                            <span className="text-sm text-gray-900 dark:text-white truncate">
                                                                                {item.inventoryItem.name}
                                                                            </span>
                                                                            <span className="ml-2 whitespace-nowrap text-sm font-medium text-amber-600 dark:text-amber-400">
                                                                                {formatNumber(item.dispatchedQuantity || item.quantity)} {item.inventoryItem.baseUnit}
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                                {req.items.length > 6 && (
                                                                    <div className="mt-2 text-center text-xs text-gray-500">
                                                                        ... y más items
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal de Creación Rápida de Producto */}
            <QuickCreateItemDialog
                open={showQuickCreate}
                onClose={() => setShowQuickCreate(false)}
                initialName={quickCreateName}
                userId={user?.id || ''}
                onItemCreated={(newItem) => {
                    // Agregar al listado local
                    setItemsList(prev => [...prev, { id: newItem.id, name: newItem.name, baseUnit: newItem.baseUnit }]);
                    // Auto-seleccionar en la fila que gatilló la creación
                    const newItems = [...requestItems];
                    newItems[quickCreateRowIndex] = {
                        ...newItems[quickCreateRowIndex],
                        id: newItem.id,
                        name: newItem.name,
                        unit: newItem.baseUnit
                    };
                    setRequestItems(newItems);
                    setMsg({ type: 'success', text: `✅ Producto "${newItem.name}" creado y seleccionado` });
                }}
            />
        </div>
    );
}
