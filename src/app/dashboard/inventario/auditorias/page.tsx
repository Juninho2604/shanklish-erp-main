import { getAuditsAction } from '@/app/actions/audit.actions';
import { AuditList } from './AuditList';
import Link from 'next/link';

export default async function AuditsPage() {
    const audits = await getAuditsAction();

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        Auditorías de Inventario
                    </h1>
                    <p className="text-gray-500">
                        Historial de revisiones y conteos físicos
                    </p>
                </div>
                <div className="flex gap-2">
                    <Link
                        href="/dashboard/inventario"
                        className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                    >
                        ← Volver al Inventario
                    </Link>
                    <Link
                        href="/dashboard/inventario/importar"
                        className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 shadow-sm"
                    >
                        + Nueva Revisión (Importar)
                    </Link>
                </div>
            </div>

            <AuditList initialAudits={audits as any} />
        </div>
    );
}
