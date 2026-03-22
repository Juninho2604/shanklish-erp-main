import { getInventoryItemsForSelect, getAreasForSelect } from '@/app/actions/entrada.actions';
import { getRequisitions } from '@/app/actions/requisition.actions';
import TransferenciasView from './transferencias-view';
import BulkTransferPanel from './BulkTransferPanel';

// Esta página es Server Component para cargar datos iniciales seguros
export const dynamic = 'force-dynamic';

export default async function TransferenciasPage() {
    // Cargar datos en paralelo para mejor rendimiento
    const [items, areas, requisitions] = await Promise.all([
        getInventoryItemsForSelect(),
        getAreasForSelect(),
        getRequisitions('ALL') // Cargamos todas para filtrar en cliente
    ]);

    // Adaptar requisitions para el componente cliente (fechas string vs Date)
    // Prisma devuelve Date, pero Next.js prefiere serializables si pasan por boundary.
    // Sin embargo, en Server Components -> Client Components directos, Date es permitido en ultimas versiones.
    // Si falla, convertiremos a string. Por ahora lo paso directo.

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        Transferencias de Inventario
                    </h1>
                    <p className="text-gray-500">
                        Solicitud y Despacho de insumos entre áreas (Almacén Central → Cocina, Barra, etc.)
                    </p>
                </div>
            </div>

            {/* Panel de Transferencia Rápida por Categoría */}
            <BulkTransferPanel areasList={areas} />

            <TransferenciasView
                itemsList={items}
                areasList={areas}
                initialRequisitions={requisitions.data as any}
            />
        </div>
    );
}

