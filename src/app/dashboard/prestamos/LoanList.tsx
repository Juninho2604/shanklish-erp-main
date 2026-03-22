'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatNumber, formatCurrency, cn } from '@/lib/utils';
import { resolveLoanAction } from '@/app/actions/loan.actions';
import { toast } from 'react-hot-toast';
import { useAuthStore } from '@/stores/auth.store';

interface Loan {
    id: string;
    loaneeName: string;
    status: string;
    type: string;
    quantity: number;
    unit: string;
    loanDate: Date;
    resolvedAt: Date | null;
    agreedPrice: number | null;
    notes: string | null;
    inventoryItem: {
        name: string;
        sku: string;
    };
    createdBy: {
        firstName: string;
        lastName: string;
    };
}

interface AreaOption {
    id: string;
    name: string;
}

interface LoanListProps {
    loans: Loan[];
    areas: AreaOption[];
}

export default function LoanList({ loans, areas }: LoanListProps) {
    const { user } = useAuthStore();
    const [resolvingId, setResolvingId] = useState<string | null>(null);
    const [showResolveModal, setShowResolveModal] = useState<string | null>(null);
    const [resolveNotes, setResolveNotes] = useState('');
    const [resolveAreaId, setResolveAreaId] = useState<string>(''); // For replacement logic

    const handleResolve = async (loan: Loan) => {
        if (!user) return;
        setResolvingId(loan.id);

        try {
            // Logic to confirm
            const result = await resolveLoanAction({
                loanId: loan.id,
                userId: user.id,
                resolutionType: loan.type as 'REPLACEMENT' | 'PAYMENT',
                notes: resolveNotes,
                areaId: resolveAreaId || undefined // Only relevant for replacement, usually Main Warehouse?
                // For now, we assume user picks area or default logic in action?
                // The action expects areaId if replacement. We need to pass it.
                // But wait, the list view simple button might not be enough if we need to pick location.
            });

            if (result.success) {
                toast.success('Préstamo finalizado con éxito');
                setShowResolveModal(null);
                setResolveNotes('');
            } else {
                toast.error(result.message);
            }
        } catch (error) {
            toast.error('Error al finalizar');
        } finally {
            setResolvingId(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {loans.map((loan) => (
                    <div
                        key={loan.id}
                        className={cn(
                            "group rounded-xl border p-5 shadow-sm transition-all hover:shadow-md",
                            loan.status === 'COMPLETED'
                                ? "border-green-200 bg-green-50/50 dark:border-green-900/30 dark:bg-green-900/10"
                                : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
                        )}
                    >
                        {/* Header */}
                        <div className="mb-4 flex items-start justify-between">
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    "flex h-10 w-10 items-center justify-center rounded-lg text-xl",
                                    loan.status === 'COMPLETED'
                                        ? "bg-green-100 text-green-600"
                                        : "bg-blue-100 text-blue-600"
                                )}>
                                    {loan.type === 'PAYMENT' ? '💰' : '📦'}
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900 dark:text-white">
                                        {loan.loaneeName}
                                    </h3>
                                    <p className="text-xs text-gray-500">
                                        {format(new Date(loan.loanDate), "d MMM, yyyy", { locale: es })}
                                    </p>
                                </div>
                            </div>
                            <span className={cn(
                                "rounded-full px-2 py-1 text-xs font-medium",
                                loan.status === 'COMPLETED'
                                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            )}>
                                {loan.status === 'COMPLETED' ? 'Completado' : 'Pendiente'}
                            </span>
                        </div>

                        {/* Content */}
                        <div className="mb-4 space-y-2 text-sm">
                            <p className="text-gray-900 dark:text-white">
                                <span className="font-medium">{formatNumber(loan.quantity)} {loan.unit}</span> de {loan.inventoryItem.name}
                            </p>

                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span>Tipo:</span>
                                <span className="font-medium uppercase text-gray-700 dark:text-gray-300">
                                    {loan.type === 'PAYMENT' ? 'Pago Acordado' : 'Reposición'}
                                </span>
                            </div>

                            {loan.type === 'PAYMENT' && loan.agreedPrice && (
                                <div className="rounded-lg bg-gray-50 p-2 dark:bg-gray-700/50">
                                    <p className="text-xs text-gray-500">Precio Acordado</p>
                                    <p className="font-mono font-medium text-gray-900 dark:text-white">
                                        {formatCurrency(loan.agreedPrice)} / u
                                    </p>
                                </div>
                            )}

                            {loan.notes && (
                                <p className="text-xs italic text-gray-500">
                                    "{loan.notes}"
                                </p>
                            )}
                        </div>

                        {/* Footer / Actions */}
                        <div className="flex items-center justify-between border-t border-gray-100 pt-3 dark:border-gray-700">
                            <p className="text-xs text-gray-400">
                                Por: {loan.createdBy.firstName}
                            </p>

                            {loan.status === 'PENDING' && (
                                <button
                                    onClick={() => setShowResolveModal(loan.id)}
                                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
                                >
                                    {loan.type === 'PAYMENT' ? 'Confirmar Pago' : 'Confirmar Reposición'}
                                </button>
                            )}
                        </div>
                    </div>
                ))}

                {loans.length === 0 && (
                    <div className="col-span-full py-12 text-center text-gray-500">
                        No hay préstamos registrados.
                    </div>
                )}
            </div>

            {/* Modal de Resolución */}
            {showResolveModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800 animate-in fade-in zoom-in-95">
                        <h3 className="mb-4 text-lg font-bold text-gray-900 dark:text-white">
                            Confirmar Resolución
                        </h3>

                        <div className="space-y-4">
                            <p className="text-sm text-gray-600 dark:text-gray-300">
                                ¿Estás seguro de marcar este préstamo como completado? Esto indica que:
                            </p>
                            <ul className="list-disc pl-5 text-sm text-gray-600 dark:text-gray-300">
                                {loans.find(l => l.id === showResolveModal)?.type === 'PAYMENT'
                                    ? <li>El dinero ha sido recibido (Cuentas por cobrar).</li>
                                    : <li>El producto ha sido devuelto al inventario.</li>
                                }
                            </ul>

                            {/* Location Selector for Replacement */}
                            {loans.find(l => l.id === showResolveModal)?.type === 'REPLACEMENT' && (
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Reingresar en Almacén
                                    </label>
                                    {/* Hardcoded for now, ideally fetch Areas */}
                                    <select
                                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                                        value={resolveAreaId}
                                        onChange={(e) => setResolveAreaId(e.target.value)}
                                    >
                                        <option value="">Seleccionar...</option>
                                        {areas.map(area => (
                                            <option key={area.id} value={area.id}>{area.name}</option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-amber-600 mt-1">
                                        * Debes seleccionar un almacén para reponer el stock.
                                    </p>
                                </div>
                            )}

                            <div>
                                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Notas de cierre (Opcional)
                                </label>
                                <textarea
                                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                                    rows={3}
                                    placeholder="Ej: Pagado en efectivo..."
                                    value={resolveNotes}
                                    onChange={(e) => setResolveNotes(e.target.value)}
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    onClick={() => {
                                        setShowResolveModal(null);
                                        setResolveAreaId('');
                                    }}
                                    className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => {
                                        const loan = loans.find(l => l.id === showResolveModal);
                                        if (loan) handleResolve(loan);
                                    }}
                                    disabled={
                                        resolvingId !== null ||
                                        (loans.find(l => l.id === showResolveModal)?.type === 'REPLACEMENT' && !resolveAreaId)
                                    }
                                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                                >
                                    {resolvingId ? 'Procesando...' : 'Confirmar'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
