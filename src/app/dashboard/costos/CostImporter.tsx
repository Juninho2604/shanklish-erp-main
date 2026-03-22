'use client';

import { useState, useCallback } from 'react';
import { parseCostUploadAction, processCostImportAction } from '@/app/actions/cost.actions';
import toast from 'react-hot-toast';

interface CostImportItem {
    row: number;
    date: string;
    category: string;
    productName: string;
    unit: string;
    quantity: number;
    supplier: string;
    currency: 'USD' | 'BS';
    unitCost: number;
    totalCost: number;
    matchedItemId?: string;
    status: 'MATCHED' | 'NOT_FOUND' | 'INVALID';
}

export function CostImporter() {
    const [isLoading, setIsLoading] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [previewItems, setPreviewItems] = useState<CostImportItem[]>([]);
    const [summary, setSummary] = useState<{ total: number; matched: number; notFound: number; invalid: number } | null>(null);

    const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsLoading(true);
        setPreviewItems([]);
        setSummary(null);

        try {
            const reader = new FileReader();
            reader.onload = async (event) => {
                const base64 = (event.target?.result as string)?.split(',')[1];
                if (!base64) {
                    toast.error('Error leyendo archivo');
                    setIsLoading(false);
                    return;
                }

                const result = await parseCostUploadAction(base64);

                if (result.success && result.items) {
                    setPreviewItems(result.items);
                    setSummary(result.summary || null);
                    toast.success(result.message);
                } else {
                    toast.error(result.message);
                }
                setIsLoading(false);
            };
            reader.readAsDataURL(file);
        } catch (error) {
            toast.error('Error procesando archivo');
            setIsLoading(false);
        }
    }, []);

    const handleProcessImport = async () => {
        const matchedItems = previewItems
            .filter(item => item.matchedItemId)
            .map(item => ({
                matchedItemId: item.matchedItemId!,
                unitCost: item.unitCost,
                currency: item.currency,
                supplier: item.supplier,
            }));

        if (matchedItems.length === 0) {
            toast.error('No hay items coincidentes para importar');
            return;
        }

        setIsProcessing(true);
        const result = await processCostImportAction(matchedItems);
        setIsProcessing(false);

        if (result.success) {
            toast.success(result.message);
            setPreviewItems([]);
            setSummary(null);
        } else {
            toast.error(result.message);
        }
    };

    return (
        <div className="space-y-6">
            {/* Upload Section */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    📁 Importar Costos desde Excel
                </h3>

                <div className="flex items-center gap-4">
                    <label className="flex-1">
                        <div className="flex items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-amber-500 transition-colors dark:border-gray-600 dark:hover:border-amber-400">
                            <div className="text-center">
                                <span className="text-3xl">📊</span>
                                <p className="mt-2 text-sm text-gray-500">
                                    {isLoading ? 'Procesando...' : 'Click para subir archivo COSTO.xlsx'}
                                </p>
                            </div>
                        </div>
                        <input
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={handleFileUpload}
                            disabled={isLoading}
                            className="hidden"
                        />
                    </label>
                </div>

                {/* Summary Cards */}
                {summary && (
                    <div className="mt-4 grid grid-cols-4 gap-3">
                        <div className="text-center p-3 bg-gray-100 rounded-lg dark:bg-gray-700">
                            <div className="text-2xl font-bold text-gray-900 dark:text-white">{summary.total}</div>
                            <div className="text-xs text-gray-500">Total</div>
                        </div>
                        <div className="text-center p-3 bg-green-100 rounded-lg dark:bg-green-900/30">
                            <div className="text-2xl font-bold text-green-600">{summary.matched}</div>
                            <div className="text-xs text-green-600">Coincidentes</div>
                        </div>
                        <div className="text-center p-3 bg-amber-100 rounded-lg dark:bg-amber-900/30">
                            <div className="text-2xl font-bold text-amber-600">{summary.notFound}</div>
                            <div className="text-xs text-amber-600">No Encontrados</div>
                        </div>
                        <div className="text-center p-3 bg-red-100 rounded-lg dark:bg-red-900/30">
                            <div className="text-2xl font-bold text-red-600">{summary.invalid}</div>
                            <div className="text-xs text-red-600">Inválidos</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Preview Table */}
            {previewItems.length > 0 && (
                <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
                    <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            Vista Previa ({previewItems.length} registros)
                        </h3>
                        <button
                            onClick={handleProcessImport}
                            disabled={isProcessing || summary?.matched === 0}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isProcessing ? 'Procesando...' : `✓ Importar ${summary?.matched || 0} Costos`}
                        </button>
                    </div>

                    <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoría</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Proveedor</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Costo Unit.</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Moneda</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {previewItems.slice(0, 100).map((item, idx) => (
                                    <tr
                                        key={idx}
                                        className={item.status === 'MATCHED'
                                            ? 'bg-green-50 dark:bg-green-900/10'
                                            : 'bg-amber-50 dark:bg-amber-900/10'
                                        }
                                    >
                                        <td className="px-4 py-3">
                                            {item.status === 'MATCHED' ? (
                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                                    ✓ Match
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                                                    ? No encontrado
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{item.date}</td>
                                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{item.productName}</td>
                                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{item.category}</td>
                                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{item.supplier}</td>
                                        <td className="px-4 py-3 text-right font-mono text-gray-900 dark:text-white">
                                            {item.unitCost.toFixed(2)}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${item.currency === 'USD'
                                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                                    : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                                                }`}>
                                                {item.currency === 'USD' ? '$' : 'Bs'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {previewItems.length > 100 && (
                            <div className="p-4 text-center text-sm text-gray-500 bg-gray-50 dark:bg-gray-700">
                                Mostrando 100 de {previewItems.length} registros
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
