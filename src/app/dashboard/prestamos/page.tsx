import Link from 'next/link';
import { getLoansAction } from '@/app/actions/loan.actions';
import LoanList from './LoanList';
import prisma from '@/server/db';

export const dynamic = 'force-dynamic';

export default async function PrestamosPage() {
    const loans = await getLoansAction();
    const areas = await prisma.area.findMany({
        where: { isActive: true },
        select: { id: true, name: true }
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        Préstamos de Insumos
                    </h1>
                    <p className="text-gray-500">
                        Gestiona préstamos a restaurantes vecinos
                    </p>
                </div>
                <Link
                    href="/dashboard/prestamos/nuevo"
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:shadow-xl hover:from-blue-700 hover:to-indigo-700"
                >
                    ✨ Nuevo Préstamo
                </Link>
            </div>

            <LoanList loans={loans} areas={areas} />
        </div>
    );
}
