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
        <div className="capsula-card border-primary/20 bg-gradient-to-br from-background to-secondary/30 p-8">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h3 className="flex items-center gap-2 text-xl font-bold text-primary dark:text-primary">
                        ⚡ Transferencia Rápida
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        Mueve stock por categoría con un solo toque táctil
                    </p>
                </div>
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl">
                    🚀
                </div>
            </div>

            {/* Selectores */}
            <div className="mb-8 grid gap-6 sm:grid-cols-3">
                {/* Categoría */}
                <div className="space-y-1.5">
                    <label className="block text-sm font-bold text-foreground/80 ml-1">
                        Categoría
                    </label>
                    <select
                        value={selectedCategory}
                        onChange={e => setSelectedCategory(e.target.value)}
                        className="w-full rounded-xl border-2 border-border bg-card px-4 py-3 text-gray-900 shadow-sm focus:border-primary focus:ring-4 focus:ring-primary/10 dark:text-white min-h-[52px]"
                    >
                        <option value="">Seleccionar...</option>
                        {categories.map(cat => (
                            <option key={cat.name} value={cat.name}>
                                {cat.name} ({cat.count})
                            </option>
                        ))}
                    </select>
                </div>

                {/* Origen */}
                <div className="space-y-1.5">
                    <label className="block text-sm font-bold text-foreground/80 ml-1">
                        Desde (Origen)
                    </label>
                    <select
                        value={sourceAreaId}
                        onChange={e => setSourceAreaId(e.target.value)}
                        className="w-full rounded-xl border-2 border-border bg-card px-4 py-3 text-gray-900 shadow-sm focus:border-primary focus:ring-4 focus:ring-primary/10 dark:text-white min-h-[52px]"
                    >
                        <option value="">Seleccionar...</option>
                        {areasList.map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                    </select>
                </div>

                {/* Destino */}
                <div className="space-y-1.5">
                    <label className="block text-sm font-bold text-foreground/80 ml-1">
                        Hacia (Destino)
                    </label>
                    <select
                        value={targetAreaId}
                        onChange={e => setTargetAreaId(e.target.value)}
                        className="w-full rounded-xl border-2 border-border bg-card px-4 py-3 text-gray-900 shadow-sm focus:border-primary focus:ring-4 focus:ring-primary/10 dark:text-white min-h-[52px]"
                    >
                        <option value="">Seleccionar...</option>
                        {areasList.filter(a => a.id !== sourceAreaId).map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Preview */}
            {isLoading ? (
                <div className="py-12 text-center text-primary">
                    <div className="inline-block animate-bounce text-3xl mb-2">🔄</div>
                    <p className="font-bold animate-pulse">Preparando lotes...</p>
                </div>
            ) : previewItems.length > 0 ? (
                <div className="mb-8 max-h-64 overflow-y-auto rounded-2xl border-2 border-border bg-card shadow-inner">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-secondary/50 backdrop-blur-md">
                            <tr>
                                <th className="px-6 py-4 text-left font-bold text-foreground/70 uppercase tracking-wider">Producto</th>
                                <th className="px-6 py-4 text-right font-bold text-foreground/70 uppercase tracking-wider">Stock</th>
                                <th className="w-16 px-6 py-4"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {previewItems.filter(i => !excludedIds.includes(i.id)).map(item => (
                                <tr key={item.id} className="hover:bg-primary/5 transition-colors group">
                                    <td className="px-6 py-4 font-medium text-foreground">{item.name}</td>
                                    <td className="px-6 py-4 text-right font-mono font-bold text-primary">
                                        {formatNumber(item.currentStock)} {item.unit}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <button
                                            onClick={() => setExcludedIds([...excludedIds, item.id])}
                                            className="h-10 w-10 flex items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all active:scale-90"
                                            title="Excluir"
                                        >
                                            <Trash2 className="h-5 w-5" />
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
                    "mb-6 rounded-2xl p-4 text-sm font-bold flex items-center gap-3 animate-in fade-in zoom-in duration-300",
                    message.type === 'success' ? "bg-emerald-100 text-emerald-800 border-2 border-emerald-200" :
                        message.type === 'error' ? "bg-red-100 text-red-800 border-2 border-red-200" :
                            "bg-blue-100 text-blue-800 border-2 border-blue-200"
                )}>
                    <span className="text-xl">
                        {message.type === 'success' ? '✅' : message.type === 'error' ? '❌' : 'ℹ️'}
                    </span>
                    {message.text}
                </div>
            )}

            {/* Botón de ejecución */}
            <button
                onClick={handleExecuteTransfer}
                disabled={isExecuting || previewItems.length === 0 || !targetAreaId}
                className="capsula-btn capsula-btn-primary w-full text-lg shadow-primary/20"
            >
                {isExecuting ? (
                    <span className="flex items-center justify-center gap-3">
                        <span className="animate-spin text-2xl">⚡</span> Procesando transferencia...
                    </span>
                ) : (
                    <span className="flex items-center justify-center gap-2">
                        🚀 Confirmar Movimiento de {previewItems.length - excludedIds.length} Items
                    </span>
                )}
            </button>
        </div>
    );
}
