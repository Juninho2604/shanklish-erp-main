import DailyInventoryManager from './daily-manager';
import { getAreasAction } from '@/app/actions/inventory.actions';

export const dynamic = 'force-dynamic';

export default async function DailyInventoryPage() {
    // Cargar áreas disponibles para el selector
    const areas = await getAreasAction();

    return (
        <div className="container mx-auto p-4 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-white">📅 Inventario Diario de Alimentos</h1>
            </div>

            {/* Orden recomendado de operaciones */}
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 dark:bg-amber-900/20 dark:border-amber-800 p-4">
                <h3 className="text-sm font-bold text-amber-800 dark:text-amber-200 mb-2">📋 Orden recomendado para el cierre</h3>
                <ol className="text-sm text-amber-900 dark:text-amber-100 space-y-1 list-decimal list-inside">
                    <li><strong>Transferencias</strong> → Marcar como completadas las del día (o de la semana si acumulaste)</li>
                    <li><strong>Ventas</strong> → &quot;Importar desde Cargar Ventas&quot; (si usaste POS/Cargar Ventas) o &quot;Cargar Ventas Manual&quot;</li>
                    <li><strong>Conteos</strong> → Revisar apertura, entradas, cierre físico y guardar</li>
                    <li><strong>Variaciones</strong> → Revisar diferencias y cerrar el día</li>
                </ol>
            </div>

            <DailyInventoryManager initialAreas={areas} />
        </div>
    );
}
