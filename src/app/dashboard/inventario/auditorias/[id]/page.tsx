
import { getAuditAction } from '@/app/actions/audit.actions';
import { notFound } from 'next/navigation';
import { AuditDetail } from './AuditDetail';

export default async function AuditDetailPage({ params }: { params: { id: string } }) {
    const audit = await getAuditAction(params.id);

    if (!audit) {
        notFound();
    }

    return (
        <div className="max-w-[1200px] mx-auto">
            {/* Back link handled in list or here? Print view hides it */}
            <div className="mb-4 print:hidden">
                <a href="/dashboard/inventario/auditorias" className="text-sm text-gray-500 hover:text-gray-900">
                    ← Volver a Auditorías
                </a>
            </div>
            <AuditDetail audit={audit as any} />
        </div>
    );
}
