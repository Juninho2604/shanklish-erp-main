import { getInventoryHistoryAction } from '@/app/actions/inventory.actions';
import Link from 'next/link';
import HistoryList from './HistoryList';

export default async function InventoryHistoryPage() {
    // Aumentamos el límite para tener mejor contexto de agrupación
    const movements = await getInventoryHistoryAction({ limit: 500 });

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        Historial de Movimientos
                    </h1>
                    <p className="text-gray-500">
                        Registro agrupado de transacciones
                    </p>
                </div>
                <div>
                    <Link
                        href="/dashboard/inventario"
                        className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                    >
                        ← Volver al Inventario
                    </Link>
                </div>
            </div>

            <HistoryList initialMovements={movements} />
        </div>
    );
}
