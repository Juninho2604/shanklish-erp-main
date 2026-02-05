'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import {
    getCategoriesForTransferAction,
    previewBulkTransferAction,
    executeBulkTransferAction
} from '@/app/actions/requisition.actions';
import { formatNumber, cn } from '@/lib/utils';
import { Trash2 } from 'lucide-react';

interface Area {
    id: string;
    name: string;
}

interface PreviewItem {
    id: string;
    name: string;
    currentStock: number;
    unit: string;
}

interface Props {
    areasList: Area[];
}

export default function BulkTransferPanel({ areasList }: Props) {
    const { user } = useAuthStore();
    const [categories, setCategories] = useState<{ name: string; count: number }[]>([]);
    const [selectedCategory, setSelectedCategory] = useState('');
    const [sourceAreaId, setSourceAreaId] = useState('');
    const [targetAreaId, setTargetAreaId] = useState('');
    const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
    const [excludedIds, setExcludedIds] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

    // Cargar categorías al montar
    useEffect(() => {
        getCategoriesForTransferAction().then(res => {
            if (res.success && res.categories) {
                setCategories(res.categories);
            }
        });
    }, []);

    // Preview cuando cambia categoría o área origen
    useEffect(() => {
        if (selectedCategory && sourceAreaId) {
            setIsLoading(true);
            previewBulkTransferAction(selectedCategory, sourceAreaId).then(res => {
                if (res.success && res.items) {
                    setPreviewItems(res.items);
                    setMessage({ type: 'info', text: res.message });
                } else {
                    setPreviewItems([]);
                    setMessage({ type: 'error', text: res.message });
                }
                setIsLoading(false);
            });
        } else {
            setPreviewItems([]);
            setExcludedIds([]);
            setMessage(null);
        }
    }, [selectedCategory, sourceAreaId]);

    const handleExecuteTransfer = async () => {
        if (!selectedCategory || !sourceAreaId || !targetAreaId) {
            setMessage({ type: 'error', text: 'Selecciona categoría, origen y destino' });
            return;
        }

        if (sourceAreaId === targetAreaId) {
            setMessage({ type: 'error', text: 'Origen y destino no pueden ser iguales' });
            return;
        }

        if (!confirm(`¿Confirmas transferir TODO el stock de "${selectedCategory}" al destino seleccionado?`)) {
            return;
        }

        setIsExecuting(true);
        const res = await executeBulkTransferAction(
            selectedCategory,
            sourceAreaId,
            targetAreaId,
            user?.id || '',
            excludedIds
        );

        if (res.success) {
            setMessage({ type: 'success', text: res.message });
            setPreviewItems([]);
            setSelectedCategory('');
            // Reload after short delay
            setTimeout(() => window.location.reload(), 1500);
        } else {
            setMessage({ type: 'error', text: res.message });
        }
        setIsExecuting(false);
    };

    return (
        <div className="rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50 p-6 dark:border-purple-900/50 dark:from-purple-900/10 dark:to-indigo-900/10">
            <div className="mb-6">
                <h3 className="flex items-center gap-2 text-lg font-semibold text-purple-900 dark:text-purple-300">
                    ⚡ Transferencia Rápida por Categoría
                </h3>
                <p className="text-sm text-purple-600 dark:text-purple-400">
                    Mueve TODO el stock de una categoría de un área a otra en un solo clic
                </p>
            </div>

            {/* Selectores */}
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
                {/* Categoría */}
                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Categoría
                    </label>
                    <select
                        value={selectedCategory}
                        onChange={e => setSelectedCategory(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    >
                        <option value="">Seleccionar categoría...</option>
                        {categories.map(cat => (
                            <option key={cat.name} value={cat.name}>
                                {cat.name} ({cat.count} items)
                            </option>
                        ))}
                    </select>
                </div>

                {/* Origen */}
                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Desde (Origen)
                    </label>
                    <select
                        value={sourceAreaId}
                        onChange={e => setSourceAreaId(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    >
                        <option value="">Seleccionar origen...</option>
                        {areasList.map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                    </select>
                </div>

                {/* Destino */}
                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Hacia (Destino)
                    </label>
                    <select
                        value={targetAreaId}
                        onChange={e => setTargetAreaId(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    >
                        <option value="">Seleccionar destino...</option>
                        {areasList.filter(a => a.id !== sourceAreaId).map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Preview */}
            {isLoading ? (
                <div className="py-8 text-center text-gray-500">
                    <span className="animate-pulse">Cargando preview...</span>
                </div>
            ) : previewItems.length > 0 ? (
                <div className="mb-6 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Producto</th>
                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Stock a Transferir</th>
                                <th className="w-10 px-4 py-2"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {previewItems.filter(i => !excludedIds.includes(i.id)).map(item => (
                                <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <td className="px-4 py-2 text-gray-900 dark:text-white">{item.name}</td>
                                    <td className="px-4 py-2 text-right font-mono text-purple-600">
                                        {formatNumber(item.currentStock)} {item.unit}
                                    </td>
                                    <td className="px-4 py-2 text-center">
                                        <button
                                            onClick={() => setExcludedIds([...excludedIds, item.id])}
                                            className="text-gray-400 hover:text-red-500 transition-colors"
                                            title="Excluir item de la transferencia"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : null}

            {/* Message */}
            {message && (
                <div className={cn(
                    "mb-4 rounded-lg px-4 py-2 text-sm font-medium",
                    message.type === 'success' ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" :
                        message.type === 'error' ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" :
                            "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                )}>
                    {message.text}
                </div>
            )}

            {/* Botón de ejecución */}
            <button
                onClick={handleExecuteTransfer}
                disabled={isExecuting || previewItems.length === 0 || !targetAreaId}
                className="w-full rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-3 font-semibold text-white shadow-lg transition-all hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
            >
                {isExecuting ? (
                    <span className="flex items-center justify-center gap-2">
                        <span className="animate-spin">⏳</span> Ejecutando...
                    </span>
                ) : (
                    <span>⚡ Transferir {previewItems.length - excludedIds.length} items de "{selectedCategory}"</span>
                )}
            </button>
        </div>
    );
}
