import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { CostImporter } from './CostImporter';
import { getCurrentCostsAction } from '@/app/actions/cost.actions';

export const dynamic = 'force-dynamic';

export default async function CostosPage() {
    const session = await getSession();

    if (!session) {
        redirect('/login');
    }

    // Get current costs for summary
    const costsResult = await getCurrentCostsAction();
    const items = costsResult.items || [];

    const withCost = items.filter(i => i.currentCost !== null).length;
    const withoutCost = items.filter(i => i.currentCost === null).length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        💰 Módulo de Costos
                    </h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Gestión de precios de compra y cálculo de COGS
                    </p>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-6 md:grid-cols-3">
                {/* Card 1: Materias Primas con Costo */}
                <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                    <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 text-2xl dark:bg-green-900/30">
                            ✅
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-900 dark:text-white">
                                Con Costo
                            </h3>
                            <p className="text-sm text-gray-500">
                                Materias primas
                            </p>
                        </div>
                    </div>
                    <div className="mt-4 text-3xl font-bold text-green-600">
                        {withCost}
                    </div>
                    <p className="text-xs text-gray-400">Ítems con precio registrado</p>
                </div>

                {/* Card 2: Sin Costo */}
                <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                    <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-100 text-2xl dark:bg-amber-900/30">
                            ⚠️
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-900 dark:text-white">
                                Sin Costo
                            </h3>
                            <p className="text-sm text-gray-500">
                                Pendientes de precio
                            </p>
                        </div>
                    </div>
                    <div className="mt-4 text-3xl font-bold text-amber-600">
                        {withoutCost}
                    </div>
                    <p className="text-xs text-gray-400">Requieren actualización</p>
                </div>

                {/* Card 3: Total */}
                <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                    <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 text-2xl dark:bg-blue-900/30">
                            📦
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-900 dark:text-white">
                                Total Items
                            </h3>
                            <p className="text-sm text-gray-500">
                                Materias primas
                            </p>
                        </div>
                    </div>
                    <div className="mt-4 text-3xl font-bold text-blue-600">
                        {items.length}
                    </div>
                    <p className="text-xs text-gray-400">En el inventario</p>
                </div>
            </div>

            {/* Cost Importer */}
            <CostImporter />

            {/* Current Costs Table */}
            {items.length > 0 && (
                <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            📋 Costos Actuales de Materias Primas
                        </h3>
                    </div>
                    <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoría</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unidad</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Costo Actual</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Moneda</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {items.map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{item.name}</td>
                                        <td className="px-4 py-3 text-gray-500 font-mono text-xs">{item.sku || '-'}</td>
                                        <td className="px-4 py-3 text-gray-500">{item.category || '-'}</td>
                                        <td className="px-4 py-3 text-gray-500">{item.baseUnit}</td>
                                        <td className="px-4 py-3 text-right font-mono">
                                            {item.currentCost !== null ? (
                                                <span className="text-green-600 font-semibold">
                                                    {item.currentCost.toFixed(2)}
                                                </span>
                                            ) : (
                                                <span className="text-amber-500">Sin precio</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {item.currentCost !== null && (
                                                <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${item.currency === 'USD'
                                                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                                        : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                                                    }`}>
                                                    {item.currency === 'USD' ? '$' : 'Bs'}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
