'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { updateAuditItemAction, approveAuditAction, voidAuditAction } from '@/app/actions/audit.actions';
import { cn, formatNumber } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';

interface AuditItem {
    id: string;
    inventoryItem: { name: string; sku: string; baseUnit: string };
    systemStock: number;
    countedStock: number;
    difference: number;
    costSnapshot: number | null;
    notes: string | null;
}

interface Audit {
    id: string;
    name: string | null;
    status: string;
    createdAt: Date;
    createdBy: { firstName: string | null; lastName: string | null };
    resolvedAt: Date | null;
    resolvedBy: { firstName: string | null; lastName: string | null } | null;
    items: AuditItem[];
    notes?: string | null;
}

export function AuditDetail({ audit }: { audit: Audit }) {
    const router = useRouter();
    const { user } = useAuthStore();
    const userId = user?.id || 'unknown';
    const [isApproving, setIsApproving] = useState(false);
    const [items, setItems] = useState(audit.items);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState<string>('');

    const handleStartEdit = (item: AuditItem) => {
        if (audit.status !== 'DRAFT') return;
        setEditingId(item.id);
        setEditValue(item.countedStock.toString());
    };

    const handleSaveEdit = async (id: string, originalCount: number) => {
        const val = parseFloat(editValue);
        if (isNaN(val)) return;

        if (val === originalCount) {
            setEditingId(null);
            return;
        }

        // Optimistic update
        setItems(items.map(i => i.id === id ? { ...i, countedStock: val, difference: val - i.systemStock } : i));
        setEditingId(null);

        const res = await updateAuditItemAction({ itemId: id, countedStock: val });
        if (!res.success) {
            toast.error(res.message);
            router.refresh();
        } else {
            toast.success('Guardado');
        }
    };

    const handleApprove = async () => {
        if (!confirm('¿Estás seguro de aprobar esta auditoría? Esto actualizará el inventario REAL.')) return;

        setIsApproving(true);
        const res = await approveAuditAction({ auditId: audit.id });
        setIsApproving(false);

        if (res.success) {
            toast.success('Auditoría Aprobada Exitosamente');
            router.refresh();
        } else {
            toast.error(res.message);
        }
    };

    const handleVoid = async () => {
        if (!confirm('⚠️ ¿Estás seguro de ANULAR esta auditoría?\n\nEsto revertirá todos los movimientos de stock generados.\nEsta acción no se puede deshacer.')) return;

        const res = await voidAuditAction(audit.id);
        if (res.success) {
            toast.success('Auditoría anulada correctamente');
            router.refresh();
        } else {
            toast.error(res.message);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="space-y-6">
            {/* Header / Actions - Hidden on Print */}
            <div className="flex flex-col justify-between gap-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800 print:hidden sm:flex-row sm:items-center">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            {audit.name || 'Auditoría sin nombre'}
                        </h1>
                        <span className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                            audit.status === 'DRAFT' ? "bg-yellow-100 text-yellow-800" :
                                audit.status === 'APPROVED' ? "bg-green-100 text-green-800" :
                                    audit.status === 'VOIDED' ? "bg-gray-100 text-gray-800" :
                                        "bg-red-100 text-red-800"
                        )}>
                            {audit.status}
                        </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                        Creado por {audit.createdBy.firstName} el {format(new Date(audit.createdAt), 'dd/MM/yyyy HH:mm')}
                    </p>
                    {audit.notes && (
                        <p className="mt-1 text-xs text-gray-400 max-w-md whitespace-pre-wrap">{audit.notes}</p>
                    )}
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={handlePrint}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                    >
                        🖨️ Imprimir
                    </button>

                    {audit.status === 'APPROVED' && (
                        <button
                            onClick={handleVoid}
                            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 shadow-sm hover:bg-red-100 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-400"
                        >
                            🚫 Anular Auditoría
                        </button>
                    )}

                    {audit.status === 'DRAFT' && (
                        <button
                            onClick={handleApprove}
                            disabled={isApproving}
                            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 disabled:opacity-50"
                        >
                            {isApproving ? 'Procesando...' : '✅ Aprobar y Ajustar Inventario'}
                        </button>
                    )}
                </div>
            </div>

            {/* Print Header (Visible only on print) */}
            <div className="hidden print:block mb-8">
                <h1 className="text-2xl font-bold">Reporte de Auditoría de Inventario</h1>
                <p className="text-sm">Ref: {audit.id}</p>
                <div className="mt-4 flex justify-between border-b pb-4">
                    <div>
                        <p><strong>Fecha:</strong> {format(new Date(audit.createdAt), 'dd/MM/yyyy HH:mm')}</p>
                        <p><strong>Responsable:</strong> {audit.createdBy.firstName} {audit.createdBy.lastName}</p>
                        <p><strong>Almacén:</strong> Global / Principal</p>
                    </div>
                    <div className="text-right">
                        <p><strong>Estado:</strong> {audit.status}</p>
                        <p><strong>Items:</strong> {audit.items.length}</p>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 print:border-0 print:shadow-none">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700/50 print:bg-gray-100">
                        <tr>
                            <th className="px-4 py-3 font-semibold text-gray-900 dark:text-white">Item</th>
                            <th className="px-4 py-3 font-semibold text-gray-900 dark:text-white text-right">Sistema</th>
                            <th className="px-4 py-3 font-semibold text-gray-900 dark:text-white text-right">Conteo Físico</th>
                            <th className="px-4 py-3 font-semibold text-gray-900 dark:text-white text-right">Diferencia</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {items.map((item) => (
                            <tr key={item.id} className="group">
                                <td className="px-4 py-3">
                                    <div className="font-medium text-gray-900 dark:text-white">{item.inventoryItem.name}</div>
                                    <div className="text-xs text-gray-500">{item.inventoryItem.sku}</div>
                                </td>
                                <td className="px-4 py-3 text-right text-gray-500">
                                    {formatNumber(item.systemStock)} {item.inventoryItem.baseUnit}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    {editingId === item.id ? (
                                        <input
                                            type="number"
                                            value={editValue}
                                            onChange={(e) => setEditValue(e.target.value)}
                                            onBlur={() => handleSaveEdit(item.id, item.countedStock)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(item.id, item.countedStock)}
                                            autoFocus
                                            className="w-24 rounded border border-blue-500 bg-white px-2 py-1 text-right outline-none dark:bg-gray-700"
                                        />
                                    ) : (
                                        <div
                                            onClick={() => handleStartEdit(item)}
                                            className={cn(
                                                "cursor-pointer rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700",
                                                audit.status !== 'DRAFT' && "cursor-default hover:bg-transparent"
                                            )}
                                        >
                                            <span className="font-bold">{formatNumber(item.countedStock)}</span>
                                        </div>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <span className={cn(
                                        "font-medium",
                                        item.difference > 0 ? "text-green-600" :
                                            item.difference < 0 ? "text-red-600" : "text-gray-400"
                                    )}>
                                        {item.difference > 0 ? '+' : ''}{formatNumber(item.difference)}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Footer Signature (Print Only) */}
            <div className="hidden print:flex mt-12 justify-between px-8">
                <div className="border-t border-black px-8 pt-2 text-center">
                    <p>Contado Por</p>
                </div>
                <div className="border-t border-black px-8 pt-2 text-center">
                    <p>Verificado Por</p>
                </div>
                <div className="border-t border-black px-8 pt-2 text-center">
                    <p>Aprobado Por</p>
                </div>
            </div>

            <style jsx global>{`
                @media print {
                    @page { margin: 1cm; size: A4; }
                    body { background: white; color: black; }
                    nav, aside, header { display: none !important; }
                    main { width: 100% !important; margin: 0 !important; padding: 0 !important; }
                }
            `}</style>
        </div>
    );
}
