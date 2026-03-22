'use client';

import { useState, useEffect } from 'react';
import { getMenuItemsWithRecipesAction, processManualSalesAction } from '@/app/actions/inventory-daily.actions';
import { toast } from 'react-hot-toast';

interface Props {
    dailyId: string;
    onClose: () => void;
    onUpdate: () => void;
}

export default function SalesEntryModal({ dailyId, onClose, onUpdate }: Props) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [menuItems, setMenuItems] = useState<any[]>([]);
    const [sales, setSales] = useState<Record<string, number>>({});

    useEffect(() => {
        loadMenuItems();
    }, []);

    async function loadMenuItems() {
        const res = await getMenuItemsWithRecipesAction();
        if (res.success) {
            setMenuItems(res.data);
        }
        setLoading(false);
    }

    const handleChange = (id: string, qty: string) => {
        const val = parseInt(qty) || 0;
        setSales(prev => ({ ...prev, [id]: val }));
    };

    const handleSave = async () => {
        setSaving(true);
        const data = Object.entries(sales).map(([menuItemId, quantity]) => ({ menuItemId, quantity }));

        const res = await processManualSalesAction(dailyId, data);
        if (res.success) {
            toast.success('Ventas cargadas y consumo teórico actualizado');
            onUpdate();
            onClose();
        } else {
            toast.error(res.message);
        }
        setSaving(false);
    };

    // Agrupar por categoría
    const categories = menuItems.reduce((acc: any, item: any) => {
        const cat = item.category?.name || 'Varios';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(item);
        return acc;
    }, {});

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700">
                <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-600 to-indigo-700 text-white flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold">➕ Sumar Ventas POS</h2>
                        <p className="text-blue-100 text-sm">Ingrese cantidades para <b>SUMAR</b> a sus ventas del día. (Use negativos para restar errores)</p>
                    </div>
                    <button onClick={onClose} className="text-white hover:text-gray-200 text-2xl">×</button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    {loading ? (
                        <div className="text-center py-10 text-gray-500">Cargando menú...</div>
                    ) : (
                        Object.entries(categories).map(([cat, items]: any) => (
                            <div key={cat} className="space-y-3">
                                <h3 className="text-sm font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider border-b border-blue-100 dark:border-blue-900 pb-1">{cat}</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {items.map((item: any) => (
                                        <div key={item.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-900 hover:bg-white border border-transparent hover:border-blue-200 dark:hover:border-blue-800 transition shadow-sm">
                                            <div className="flex-1 mr-4">
                                                <p className="font-semibold text-gray-800 dark:text-gray-200 text-sm leading-tight">{item.name}</p>
                                                <p className="text-[10px] text-gray-500 font-mono mt-1">{item.sku}</p>
                                            </div>
                                            <input
                                                type="number"
                                                value={sales[item.id] || ''}
                                                placeholder="0"
                                                onChange={e => handleChange(item.id, e.target.value)}
                                                className="w-20 text-center bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg py-2 focus:ring-2 focus:ring-blue-500 font-bold"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 text-gray-600 font-semibold hover:bg-gray-200 rounded-xl transition"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-10 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-500/20 disabled:opacity-50"
                    >
                        {saving ? 'Procesando...' : '➕ Sumar al Inventario'}
                    </button>
                </div>
            </div>
        </div>
    );
}
