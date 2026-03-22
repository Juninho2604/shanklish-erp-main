'use client';

import { useState, useEffect } from 'react';
import { searchItemsForCriticalListAction, toggleItemCriticalStatusAction } from '@/app/actions/inventory-daily.actions';
import { toast } from 'react-hot-toast';

interface Props {
    areaId: string;
    areaName: string;
    onClose: () => void;
    onUpdate: () => void;
}

export default function CriticalListManager({ areaId, areaName, onClose, onUpdate }: Props) {
    const [query, setQuery] = useState('');
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // Buscar al escribir (debounce)
    useEffect(() => {
        const timer = setTimeout(() => {
            searchItems();
        }, 500);
        return () => clearTimeout(timer);
    }, [query]);

    // Buscar inicial
    useEffect(() => {
        searchItems();
    }, []);

    async function searchItems() {
        setLoading(true);
        const res = await searchItemsForCriticalListAction(query, areaId);
        if (res.success) {
            setItems(res.data);
        }
        setLoading(false);
    }

    async function handleToggle(item: any) {
        const newValue = !item.isCriticalForArea;
        // Optimistic update
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, isCriticalForArea: newValue } : i));

        const res = await toggleItemCriticalStatusAction(item.id, newValue, areaId);
        if (!res.success) {
            // Revert
            setItems(prev => prev.map(i => i.id === item.id ? { ...i, isCriticalForArea: item.isCriticalForArea } : i));
            toast.error(res.message || 'Error actualizando item');
        }
    }

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col border border-gray-200 dark:border-gray-700">
                <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-t-2xl flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold">⚙️ Productos Críticos</h2>
                        <p className="text-amber-100 text-sm mt-1">Configurando para: <strong>{areaName}</strong></p>
                    </div>
                    <button onClick={() => { onUpdate(); onClose(); }} className="text-white hover:text-gray-200 text-2xl">×</button>
                </div>

                <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                    <input
                        type="text"
                        placeholder="Buscar producto por nombre o SKU..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        className="w-full rounded-xl border border-gray-300 px-4 py-2.5 focus:ring-2 focus:ring-amber-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white font-medium"
                        autoFocus
                    />
                    <p className="text-xs text-gray-500 mt-2">
                        Los productos marcados como críticos aparecerán en el reporte diario de <strong>{areaName}</strong>. Cada área tiene su propia lista.
                    </p>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {loading && items.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">Cargando...</div>
                    ) : (
                        <div className="space-y-2">
                            {items.map(item => (
                                <div key={item.id} className={`flex items-center justify-between p-3 rounded-xl border transition ${item.isCriticalForArea ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700' : 'border-gray-100 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50'}`}>
                                    <div>
                                        <p className="font-bold text-gray-900 dark:text-white text-sm">{item.name}</p>
                                        <p className="text-[10px] text-gray-500 font-mono">{item.sku} • {item.category || 'Sin categoría'} • {item.baseUnit}</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={item.isCriticalForArea}
                                            onChange={() => handleToggle(item)}
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-300 dark:peer-focus:ring-amber-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-amber-500"></div>
                                        <span className="ml-3 text-sm font-bold text-gray-900 dark:text-gray-300">
                                            {item.isCriticalForArea ? '✔ Crítico' : 'No'}
                                        </span>
                                    </label>
                                </div>
                            ))}
                            {items.length === 0 && !loading && (
                                <div className="text-center py-8 text-gray-500">No se encontraron productos</div>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-end rounded-b-2xl">
                    <button
                        onClick={() => { onUpdate(); onClose(); }}
                        className="px-8 py-2.5 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 transition shadow-lg shadow-amber-500/20"
                    >
                        Listo, volver al reporte
                    </button>
                </div>
            </div>
        </div>
    );
}
