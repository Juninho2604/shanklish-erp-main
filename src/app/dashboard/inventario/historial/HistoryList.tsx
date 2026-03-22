'use client';

import { useState, useMemo } from 'react';
import { formatNumber, cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, Clock, User, FileText, Download } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Movement {
    id: string;
    createdAt: Date;
    movementType: string;
    quantity: number;
    unit: string;
    inventoryItem: {
        name: string;
        sku: string;
        baseUnit: string;
    };
    createdBy: {
        firstName: string;
        lastName: string;
    };
    reason: string | null;
    notes: string | null;
}

interface GroupedTransaction {
    id: string;
    date: Date;
    type: string;
    reason: string;
    user: string;
    items: Movement[];
    totalItems: number;
}

export default function HistoryList({ initialMovements }: { initialMovements: any[] }) {
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    const groupedTransactions = useMemo(() => {
        const groups: GroupedTransaction[] = [];
        if (!initialMovements.length) return groups;

        // Sort by date desc (should already be sorted but ensuring)
        const sorted = [...initialMovements].sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        let currentGroup: GroupedTransaction | null = null;

        for (const mov of sorted) {
            const movDate = new Date(mov.createdAt);
            const movTime = movDate.getTime();

            // Heuristic to group movements: 
            // Same User AND Same Type AND (Same Reason OR Close Time < 2 seconds)
            const isSameGroup = currentGroup &&
                currentGroup.user === (mov.createdBy?.firstName + ' ' + mov.createdBy?.lastName) &&
                currentGroup.type === mov.movementType &&
                (Math.abs(currentGroup.date.getTime() - movTime) < 5000) && // 5 sec threshold
                (currentGroup.reason === (mov.reason || 'Sin razón'));

            if (isSameGroup) {
                currentGroup!.items.push(mov);
                currentGroup!.totalItems++;
            } else {
                if (currentGroup) groups.push(currentGroup);

                currentGroup = {
                    id: mov.id, // Use first movement ID as group ID
                    date: movDate,
                    type: mov.movementType,
                    reason: mov.reason || 'Movimiento Manual',
                    user: mov.createdBy?.firstName + ' ' + mov.createdBy?.lastName || 'Sistema',
                    items: [mov],
                    totalItems: 1
                };
            }
        }
        if (currentGroup) groups.push(currentGroup);

        return groups;
    }, [initialMovements]);

    const toggleGroup = (id: string) => {
        const newExpanded = new Set(expandedGroups);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }
        setExpandedGroups(newExpanded);
    };

    const getTypeLabel = (type: string) => {
        switch (type) {
            case 'INCOMING': return { label: 'Entrada de Mercancía', color: 'text-green-600 bg-green-50 border-green-200' };
            case 'OUTGOING': return { label: 'Salida / Merma', color: 'text-red-600 bg-red-50 border-red-200' };
            case 'TRANSFER_IN': return { label: 'Transferencia Recibida', color: 'text-blue-600 bg-blue-50 border-blue-200' };
            case 'TRANSFER_OUT': return { label: 'Transferencia Enviada', color: 'text-orange-600 bg-orange-50 border-orange-200' };
            case 'ADJUSTMENT_IN': return { label: 'Ajuste de Inventario (+)', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' };
            case 'ADJUSTMENT_OUT': return { label: 'Ajuste de Inventario (-)', color: 'text-rose-600 bg-rose-50 border-rose-200' };
            default: return { label: type, color: 'text-gray-600 bg-gray-50 border-gray-200' };
        }
    };

    const handleExportCSV = () => {
        const headers = ['Fecha', 'Usuario', 'Tipo de Movimiento', 'Producto', 'SKU', 'Cantidad', 'Unidad', 'Razon/Area', 'Notas'];
        const rows = initialMovements.map(m => {
            const date = new Date(m.createdAt).toLocaleString();
            const user = `${m.createdBy?.firstName || ''} ${m.createdBy?.lastName || ''}`.trim();
            const type = getTypeLabel(m.movementType).label;
            const producto = m.inventoryItem?.name || '';
            const sku = m.inventoryItem?.sku || '';
            const qty = m.quantity;
            const unit = m.unit;
            const reason = m.reason ? m.reason.replace(/,/g, ' ') : '';
            const notes = m.notes ? m.notes.replace(/,/g, ' ') : '';
            return `${date},${user},${type},${producto},${sku},${qty},${unit},${reason},${notes}`;
        });

        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob(["\\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `historial_inventario_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            <div className="flex justify-end">
                <button
                    onClick={handleExportCSV}
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition shadow-sm"
                >
                    <Download className="w-4 h-4" />
                    Descargar Excel (CSV)
                </button>
            </div>
            <ScrollArea className="h-[calc(100vh-250px)] pr-4">
                <div className="space-y-4">
                    {groupedTransactions.map((group) => {
                        const typeStyle = getTypeLabel(group.type);
                        const isExpanded = expandedGroups.has(group.id);

                        return (
                            <div key={group.id} className="rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
                                {/* Header del Grupo */}
                                <div
                                    onClick={() => toggleGroup(group.id)}
                                    className="flex cursor-pointer items-center justify-between p-4"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg border", typeStyle.color)}>
                                            {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-semibold text-gray-900 dark:text-white">
                                                    {typeStyle.label}
                                                </h3>
                                                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                                                    {group.totalItems} items
                                                </span>
                                            </div>
                                            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                                                <span className="flex items-center gap-1">
                                                    <Clock className="h-3.5 w-3.5" />
                                                    {group.date.toLocaleString()}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <User className="h-3.5 w-3.5" />
                                                    {group.user}
                                                </span>
                                                {group.reason && (
                                                    <span className="flex items-center gap-1">
                                                        <FileText className="h-3.5 w-3.5" />
                                                        {group.reason.length > 30 ? group.reason.substring(0, 30) + '...' : group.reason}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Detalles Desplegables */}
                                {isExpanded && (
                                    <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/20">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-left text-xs font-medium text-gray-500">
                                                    <th className="pb-2 pl-2">Producto</th>
                                                    <th className="pb-2 text-right">Cantidad</th>
                                                    <th className="pb-2 pl-4">Nota Item</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                                {group.items.map((item) => (
                                                    <tr key={item.id}>
                                                        <td className="py-2 pl-2">
                                                            <span className="font-medium text-gray-900 dark:text-white">{item.inventoryItem.name}</span>
                                                            <span className="ml-2 text-xs text-gray-400">{item.inventoryItem.sku}</span>
                                                        </td>
                                                        <td className={cn(
                                                            "py-2 text-right font-mono",
                                                            item.quantity > 0 ? "text-emerald-600" : "text-rose-600"
                                                        )}>
                                                            {item.quantity > 0 ? '+' : ''}{formatNumber(item.quantity)} {item.unit}
                                                        </td>
                                                        <td className="py-2 pl-4 text-gray-500 text-xs">
                                                            {item.notes || '-'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {groupedTransactions.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-center text-gray-500">
                            <p>No hay movimientos registrados recientes</p>
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
