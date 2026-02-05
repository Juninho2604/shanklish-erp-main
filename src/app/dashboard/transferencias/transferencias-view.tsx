'use client';

import { useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { createRequisition, approveRequisition, rejectRequisition } from '@/app/actions/requisition.actions';
import { formatNumber, cn } from '@/lib/utils';
import { UserRole } from '@/types';
import { Check, ChevronsUpDown, Trash2 } from 'lucide-react';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

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
    targetArea: { name: string };
    sourceArea: { name: string } | null;
    createdAt: Date;
    items: {
        inventoryItemId: string;
        inventoryItem: { name: string; sku: string; baseUnit: string };
        quantity: number;
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
}

function TransferItemRow({ index, item, itemsList, onUpdate, onRemove }: TransferItemRowProps) {
    const [open, setOpen] = useState(false);

    return (
        <tr>
            <td className="p-2">
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={open}
                            className="w-full justify-between border-gray-200 bg-white font-normal dark:border-gray-600 dark:bg-gray-800"
                        >
                            {item.id
                                ? itemsList.find((i) => i.id === item.id)?.name
                                : "Seleccionar Item..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0" align="start">
                        <Command>
                            <CommandInput placeholder="Buscar item..." />
                            <CommandList>
                                <CommandEmpty>No se encontró el item.</CommandEmpty>
                                <CommandGroup>
                                    {itemsList.map((i) => (
                                        <CommandItem
                                            key={i.id}
                                            value={i.name}
                                            onSelect={() => {
                                                onUpdate(index, {
                                                    id: i.id,
                                                    name: i.name,
                                                    unit: i.baseUnit
                                                });
                                                setOpen(false);
                                            }}
                                        >
                                            <Check
                                                className={cn(
                                                    "mr-2 h-4 w-4",
                                                    item.id === i.id ? "opacity-100" : "opacity-0"
                                                )}
                                            />
                                            {i.name}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
            </td>
            <td className="p-2">
                <input
                    type="number"
                    min="0"
                    value={item.quantity === 0 ? '' : item.quantity}
                    onChange={e => {
                        const val = parseFloat(e.target.value);
                        onUpdate(index, { quantity: isNaN(val) ? 0 : val });
                    }}
                    placeholder="0"
                    className="w-full rounded border border-gray-200 px-3 py-2 text-center focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800"
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

export default function TransferenciasView({ itemsList, areasList, initialRequisitions }: Props) {
    const { user } = useAuthStore();
    const [activeTab, setActiveTab] = useState<'NEW' | 'PENDING' | 'HISTORY'>('NEW');
    const [requisitions, setRequisitions] = useState<Requisition[]>(initialRequisitions);

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

    const handleApprove = async (req: Requisition) => {
        if (!confirm(`¿Confirmas el despacho de ${req.code}?`)) return;

        const itemsToDispatch = req.items.map(i => ({
            inventoryItemId: i.inventoryItemId,
            dispatchedQuantity: i.quantity
        }));

        const res = await approveRequisition({
            requisitionId: req.id,
            processedById: user?.id || 'cmkvq94uo0000ua0ns6g844yr',
            items: itemsToDispatch
        });

        if (res.success) {
            alert('✅ Transferencia aprobada y stock movido.');
            window.location.reload();
        } else {
            alert('❌ Error: ' + res.message);
        }
    };

    const handleReject = async (req: Requisition) => {
        if (!confirm(`¿Estás seguro de rechazar la solicitud ${req.code}?`)) return;

        const res = await rejectRequisition(
            req.id,
            user?.id || 'cmkvq94uo0000ua0ns6g844yr'
        );

        if (res.success) {
            alert('❌ Solicitud rechazada.');
            window.location.reload();
        } else {
            alert('Error: ' + res.message);
        }
    };

    // --- FILTROS DE LISTA ---
    const pendingReqs = requisitions.filter(r => r.status === 'PENDING');
    const historyReqs = requisitions.filter(r => r.status !== 'PENDING').sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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
                    ⏳ Pendientes ({pendingReqs.length})
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
                                <select
                                    value={sourceAreaId}
                                    onChange={e => setSourceAreaId(e.target.value)}
                                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                >
                                    <option value="">Seleccionar origen...</option>
                                    {areasList.map(a => (
                                        <option key={a.id} value={a.id}>{a.name}</option>
                                    ))}
                                </select>
                                <p className="mt-1 text-xs text-gray-500">De dónde sale la mercancía</p>
                            </div>

                            {/* Destino */}
                            <div>
                                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Para (Destino)
                                </label>
                                <select
                                    value={targetAreaId}
                                    onChange={e => setTargetAreaId(e.target.value)}
                                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                >
                                    <option value="">Seleccionar área destino...</option>
                                    {areasList.map(a => (
                                        <option key={a.id} value={a.id}>{a.name}</option>
                                    ))}
                                </select>
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

                {/* 2. PENDIENTES */}
                {activeTab === 'PENDING' && (
                    <div className="space-y-4">
                        {pendingReqs.length === 0 ? (
                            <div className="py-12 text-center text-gray-500">
                                No hay solicitudes pendientes por aprobar.
                            </div>
                        ) : (
                            pendingReqs.map(req => (
                                <div key={req.id} className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-amber-900/10">
                                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono font-bold text-amber-700 dark:text-amber-500">{req.code}</span>
                                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900 dark:text-amber-200">Pendiente</span>
                                            </div>
                                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                                                De: <strong>{req.sourceArea?.name || 'Almacén Principal'}</strong> → Para: <strong>{req.targetArea.name}</strong>
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                Por: {req.requestedBy.firstName} {req.requestedBy.lastName} • {new Date(req.createdAt).toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleReject(req)}
                                                className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:bg-gray-800 dark:hover:bg-red-900/20"
                                            >
                                                ❌ Rechazar
                                            </button>
                                            <button
                                                onClick={() => handleApprove(req)}
                                                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-600"
                                            >
                                                ✅ Aprobar
                                            </button>
                                        </div>
                                    </div>

                                    <div className="mt-4 border-t border-amber-200 pt-3 dark:border-amber-800">
                                        <p className="mb-2 text-xs font-semibold text-gray-500">ITEMS A DESPACHAR:</p>
                                        <ul className="grid gap-2 sm:grid-cols-2">
                                            {req.items.map(item => (
                                                <li key={item.inventoryItemId} className="flex justify-between rounded bg-white px-3 py-1.5 text-sm dark:bg-gray-800">
                                                    <span className="text-gray-700 dark:text-gray-300">{item.inventoryItem.name}</span>
                                                    <span className="font-mono font-medium">{formatNumber(item.quantity)} {item.inventoryItem.baseUnit}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            ))
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
                                                                    req.status === 'REJECTED' ? "bg-red-100 text-red-800" :
                                                                        "bg-gray-100 text-gray-800"
                                                            )}>
                                                                {req.status}
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
        </div>
    );
}
