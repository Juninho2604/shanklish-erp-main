'use client';

import { useState, useEffect } from 'react';
import { getDailyInventoryAction, saveDailyInventoryCountsAction, closeDailyInventoryAction } from '@/app/actions/inventory-daily.actions';
import { toast } from 'react-hot-toast';
import CriticalListManager from './critical-list-manager';
import SalesEntryModal from './sales-entry-modal';

interface Props {
    initialAreas: any[];
}

export default function DailyInventoryManager({ initialAreas }: Props) {
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedArea, setSelectedArea] = useState(initialAreas[0]?.id || '');
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<any>(null);
    const [items, setItems] = useState<any[]>([]);
    const [hasChanges, setHasChanges] = useState(false);
    const [showConfig, setShowConfig] = useState(false);
    const [showSalesModal, setShowSalesModal] = useState(false);

    // Cargar datos al cambiar fecha o área
    useEffect(() => {
        if (!selectedArea) return;
        loadData();
    }, [selectedDate, selectedArea]);

    async function loadData() {
        setLoading(true);
        try {
            const res = await getDailyInventoryAction(selectedDate, selectedArea);
            if (res.success && res.data) {
                setData(res.data);
                setItems(res.data.items);
                setHasChanges(false);
            } else {
                toast.error('No se pudo cargar el inventario');
            }
        } catch (error) {
            console.error(error);
            toast.error('Error de conexión');
        } finally {
            setLoading(false);
        }
    }

    const handleInputChange = (itemId: string, field: string, value: string) => {
        const numValue = parseFloat(value) || 0;
        setItems(prev => prev.map(item => {
            if (item.id === itemId) {
                return { ...item, [field]: numValue };
            }
            return item;
        }));
        setHasChanges(true);
    };

    const handleSave = async () => {
        if (!data) return;
        setLoading(true);
        try {
            const res = await saveDailyInventoryCountsAction(data.id, items);
            if (res.success) {
                toast.success('Guardado correctamente');
                setHasChanges(false);
                loadData(); // Recargar para ver teóricos calculados
            } else {
                toast.error('Error al guardar');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleCloseDay = async () => {
        if (!data) return;
        if (!confirm('¿Seguro que desea FINALIZAR el inventario de este día? Una vez cerrado no podrá editar los conteos.')) return;

        setLoading(true);
        try {
            // Primero guardar cambios pendientes
            if (hasChanges) await saveDailyInventoryCountsAction(data.id, items);

            const res = await closeDailyInventoryAction(data.id);
            if (res.success) {
                toast.success('Día finalizado exitosamente');
                loadData();
            } else {
                toast.error('Error al finalizar');
            }
        } finally {
            setLoading(false);
        }
    };

    const isClosed = data?.status === 'CLOSED';
    const selectedAreaName = initialAreas.find((a: any) => a.id === selectedArea)?.name || '';
    // Detectar si es un área tipo "producción" basado en el nombre
    const isProduction = selectedAreaName.toLowerCase().includes('producci');

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col h-[calc(100vh-12rem)]">

            {/* Modales */}
            {showConfig && (
                <CriticalListManager
                    areaId={selectedArea}
                    areaName={selectedAreaName}
                    onClose={() => setShowConfig(false)}
                    onUpdate={loadData}
                />
            )}
            {showSalesModal && data && (
                <SalesEntryModal
                    dailyId={data.id}
                    onClose={() => setShowSalesModal(false)}
                    onUpdate={loadData}
                />
            )}

            {/* Controles Superiores */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex flex-wrap gap-4 justify-between items-center">
                <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Fecha de Auditoría</label>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={e => setSelectedDate(e.target.value)}
                            className="rounded-xl border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 py-2.5 px-4 text-sm font-bold shadow-sm"
                        />
                    </div>
                    <div className="flex flex-col">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Área / Ubicación</label>
                        <select
                            value={selectedArea}
                            onChange={e => setSelectedArea(e.target.value)}
                            className="rounded-xl border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 py-2.5 px-4 text-sm font-bold min-w-[200px] shadow-sm appearance-none"
                        >
                            {initialAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    </div>

                    <div className="flex gap-2 self-end pb-0.5">
                        <button
                            onClick={() => setShowConfig(true)}
                            className="px-4 py-2 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 shadow-sm transition-all"
                        >
                            ⚙️ Configurar Items
                        </button>
                        {!isClosed && data && !isProduction && (
                            <button
                                onClick={() => setShowSalesModal(true)}
                                className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 transition-all flex items-center gap-2"
                            >
                                💳 Cargar Ventas POS
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex gap-3 items-center">
                    {data?.status === 'DRAFT' && <span className="bg-amber-100 text-amber-700 text-[10px] font-black tracking-tighter px-3 py-1 rounded-full border border-amber-200 uppercase">Borrador</span>}
                    {data?.status === 'CLOSED' && <span className="bg-red-500 text-white text-[10px] font-black tracking-tighter px-3 py-1 rounded-full border border-red-600 uppercase">Inventario Finalizado</span>}

                    {!isClosed && (
                        <div className="flex gap-2">
                            <button
                                onClick={handleSave}
                                disabled={!hasChanges || loading}
                                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold disabled:opacity-50 hover:bg-blue-700 transition shadow-lg shadow-blue-500/20"
                            >
                                {loading ? '...' : '💾 Guardar'}
                            </button>
                            <button
                                onClick={handleCloseDay}
                                disabled={loading}
                                className="px-6 py-2.5 bg-green-600 text-white rounded-xl font-bold disabled:opacity-50 hover:bg-green-700 transition shadow-lg shadow-green-500/20"
                            >
                                ✔ Finalizar Día
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* TABLA CONTENIDO */}
            <div className="flex-1 overflow-auto bg-white dark:bg-gray-800 relative">
                {loading && !items.length ? (
                    <div className="p-10 text-center text-gray-500">
                        <div className="animate-spin text-4xl mb-4">🌀</div>
                        Cargando planilla de inventario...
                    </div>
                ) : (
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="bg-blue-600 dark:bg-gray-900 sticky top-0 z-10 shadow-md">
                            <tr className="text-white text-[10px] h-12 uppercase tracking-widest font-black">
                                <th className="px-6 py-2 min-w-[240px] border-r border-blue-500/30">📦 Producto Critico</th>
                                <th className="px-4 py-2 text-center border-r border-blue-500/30 bg-blue-700/50">Apertura (AM)</th>
                                <th className="px-4 py-2 text-center border-r border-blue-500/30 bg-indigo-700/50" title={isProduction ? 'Producciones completadas hoy' : 'Transferencias recibidas de producción'}>
                                    {isProduction ? 'Producción (+)' : 'Transf. Entrada (+)'}
                                </th>
                                <th className="px-4 py-2 text-center border-r border-blue-500/30 bg-rose-700/40" title={isProduction ? 'Transferencias enviadas a restaurante' : 'Ventas del día cargadas manualmente'}>
                                    {isProduction ? 'Transf. Salida (-)' : 'Ventas POS (-)'}
                                </th>
                                <th className="px-4 py-2 text-center border-r border-blue-500/30 bg-gray-800/20">Teórico</th>
                                <th className="px-4 py-2 text-center border-r border-blue-500/30 bg-green-700/50">Cierre (PM)</th>
                                <th className="px-6 py-2 text-right bg-blue-800 font-extrabold underline decoration-blue-300">Variación</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {items.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-12 text-center text-gray-500 bg-gray-50/50">
                                        No hay productos críticos asignados a este reporte.
                                    </td>
                                </tr>
                            ) : items.map(item => {
                                const theoretical = item.theoreticalStock || 0;
                                const variance = item.variance || 0;
                                const isNegativeVariance = variance < -0.01;

                                return (
                                    <tr key={item.id} className="hover:bg-blue-50/30 dark:hover:bg-gray-700 transition-all group">
                                        <td className="px-6 py-4 border-r border-gray-100 dark:border-gray-700">
                                            <div className="flex flex-col">
                                                <span className="font-black text-gray-900 dark:text-gray-100 text-sm group-hover:text-blue-700 transition-colors uppercase tracking-tight">
                                                    {item.inventoryItem.name}
                                                </span>
                                                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                                                    {item.inventoryItem.sku} • {item.unit}
                                                </span>
                                            </div>
                                        </td>

                                        {/* INICIAL */}
                                        <td className="px-4 py-4 text-center border-r border-gray-100 dark:border-gray-700">
                                            <input
                                                type="number"
                                                disabled={isClosed}
                                                value={item.initialCount || 0}
                                                onChange={e => handleInputChange(item.id, 'initialCount', e.target.value)}
                                                className="w-20 text-center bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg py-1.5 focus:ring-2 focus:ring-blue-500 font-bold"
                                                onFocus={e => e.target.select()}
                                            />
                                        </td>

                                        {/* ENTRADAS (Transferencias Automáticas) */}
                                        <td className="px-4 py-4 text-center border-r border-gray-100 dark:border-gray-700 font-black text-indigo-600">
                                            {item.entries || 0}
                                        </td>

                                        {/* VENTAS (Punto de Venta Manual) */}
                                        <td className="px-4 py-4 text-center border-r border-gray-100 dark:border-gray-700 font-bold text-rose-600">
                                            {item.sales || 0}
                                        </td>

                                        {/* TEÓRICO (Calculado) */}
                                        <td className="px-4 py-4 text-center border-r border-gray-100 dark:border-gray-700 font-mono text-gray-500 bg-gray-50/50">
                                            {theoretical.toFixed(2)}
                                        </td>

                                        {/* FINAL */}
                                        <td className="px-4 py-4 text-center border-r border-gray-100 dark:border-gray-700">
                                            <input
                                                type="number"
                                                disabled={isClosed}
                                                value={item.finalCount || 0}
                                                onChange={e => handleInputChange(item.id, 'finalCount', e.target.value)}
                                                className="w-20 text-center bg-white dark:bg-gray-700 border-2 border-green-200 dark:border-green-900 rounded-lg py-1.5 focus:ring-2 focus:ring-green-500 font-black text-gray-800 dark:text-white"
                                                onFocus={e => e.target.select()}
                                            />
                                        </td>

                                        {/* VARIACIÓN */}
                                        <td className="px-6 py-4 text-right border-l border-gray-100 dark:border-gray-700">
                                            <div className="flex flex-col items-end">
                                                <span className={cn(
                                                    "text-lg font-black tracking-tighter",
                                                    isNegativeVariance ? "text-red-600" : (variance > 0.01 ? "text-blue-600" : "text-gray-400")
                                                )}>
                                                    {variance > 0 ? '+' : ''}{variance.toFixed(2)}
                                                </span>
                                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">
                                                    {isNegativeVariance ? "Faltante (Novedad)" : (variance > 0.01 ? "Sobrante" : "Sin Variación")}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="p-3 bg-blue-50 dark:bg-gray-900 text-[10px] font-bold text-blue-800 dark:text-blue-400 border-t border-gray-200 dark:border-gray-700 flex justify-between px-6">
                <span>⚠ LISTA CRÍTICA DE: <strong>{selectedAreaName.toUpperCase()}</strong> (Cada área tiene su propia lista)</span>
                <span className="flex gap-4">
                    <span>APERTURA + ENTRADAS - SALIDAS = TEÓRICO</span>
                    <span>CIERRE - TEÓRICO = VARIACIÓN</span>
                </span>
            </div>
        </div>
    );
}

function cn(...classes: any[]) {
    return classes.filter(Boolean).join(' ');
}

