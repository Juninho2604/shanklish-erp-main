'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils'; // Ensure utility exists or mock it
import { toast } from 'react-hot-toast';
import { deleteAuditAction } from '@/app/actions/audit.actions';

interface Audit {
    id: string;
    name: string | null;
    status: string;
    createdAt: Date;
    createdById: string;
    createdBy: { firstName: string | null; lastName: string | null };
    resolvedAt: Date | null;
    resolvedBy: { firstName: string | null; lastName: string | null } | null;
    _count: { items: number };
}

export function AuditList({ initialAudits }: { initialAudits: Audit[] }) {
    const [audits, setAudits] = useState(initialAudits);

    const handleDelete = async (id: string) => {
        if (!confirm('¿Estás seguro de eliminar esta auditoría?')) return;
        const res = await deleteAuditAction(id);
        if (res.success) {
            toast.success('Auditoría eliminada');
            setAudits(audits.filter(a => a.id !== id));
        } else {
            toast.error('Error al eliminar');
        }
    };

    return (
        <div className="space-y-6">
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <table className="w-full">
                    <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Fecha</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Nombre / Ref</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Estado</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Creado Por</th>
                            <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Items</th>
                            <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {audits.map((audit) => (
                            <tr key={audit.id} className="group hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                                    {format(new Date(audit.createdAt), "d MMM yyyy, HH:mm", { locale: es })}
                                </td>
                                <td className="px-6 py-4">
                                    <Link href={`/dashboard/inventario/auditorias/${audit.id}`} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
                                        {audit.name || 'Sin nombre'}
                                    </Link>
                                    <p className="text-xs text-gray-500 font-mono">{audit.id.substring(0, 8)}...</p>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={cn(
                                        "inline-flex rounded-full px-2 py-1 text-xs font-semibold",
                                        audit.status === 'DRAFT' && "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
                                        audit.status === 'APPROVED' && "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
                                        audit.status === 'REJECTED' && "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
                                        audit.status === 'VOIDED' && "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
                                    )}>
                                        {audit.status === 'DRAFT' && '📝 Borrador'}
                                        {audit.status === 'APPROVED' && '✅ Aprobado'}
                                        {audit.status === 'REJECTED' && '❌ Rechazado'}
                                        {audit.status === 'VOIDED' && '🚫 Anulado'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                                    {audit.createdBy.firstName} {audit.createdBy.lastName}
                                </td>
                                <td className="px-6 py-4 text-center text-sm font-medium">
                                    {audit._count.items}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                                        <Link
                                            href={`/dashboard/inventario/auditorias/${audit.id}`}
                                            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
                                            title="Ver Detalles"
                                        >
                                            👁️
                                        </Link>
                                        {audit.status === 'DRAFT' && (
                                            <button
                                                onClick={() => handleDelete(audit.id)}
                                                className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                                                title="Eliminar"
                                            >
                                                🗑️
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {audits.length === 0 && (
                    <div className="p-12 text-center text-gray-500">
                        No hay auditorías registradas.
                    </div>
                )}
            </div>
        </div>
    );
}
