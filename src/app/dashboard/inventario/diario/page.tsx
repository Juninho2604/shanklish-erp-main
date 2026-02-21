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
            <DailyInventoryManager initialAreas={areas} />
        </div>
    );
}
