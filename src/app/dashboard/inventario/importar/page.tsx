'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { createAuditAction } from '@/app/actions/audit.actions';
import { parseUploadAction, processImportAction, type ImportPreviewResult } from '@/app/actions/import.actions';
import { getAreasForSelect } from '@/app/actions/entrada.actions';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

export default function ImportPage() {
    const { user } = useAuthStore();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [importType, setImportType] = useState<'ENTRADA_ALMACEN' | 'MERMA' | 'INVENTARIO_INICIAL'>('INVENTARIO_INICIAL');
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isDraft, setIsDraft] = useState(false);

    // NEW: Area selector state
    const [areas, setAreas] = useState<{ id: string; name: string }[]>([]);
    const [selectedAreaId, setSelectedAreaId] = useState<string>('');

    // Fetch areas on mount
    useEffect(() => {
        getAreasForSelect().then(list => {
            setAreas(list);
            // Set default to Almacén Principal if exists
            const almacen = list.find(a => a.name.toLowerCase().includes('almacen principal'));
            if (almacen) setSelectedAreaId(almacen.id);
        });
    }, []);

    // ... (rest of handlers unchanged until handleImport)

    const handleImport = async () => {
        if (!preview || !preview.items || !user) return;

        // Filter valid items: must have match OR can be new in MASTER LOAD
        const validItems = preview.items.filter(i =>
            (i.matchedItemId || importType === 'INVENTARIO_INICIAL') &&
            (i.quantity >= 0 || i.shouldRename) // Allow 0 quantity for creation
        );

        if (validItems.length === 0) {
            toast.error('No hay items válidos para importar');
            return;
        }

        // --- DRAFT / AUDIT FLOW ---
        if (isDraft) {
            const auditItems = validItems
                .filter(i => i.matchedItemId) // Only existing items
                .map(i => ({
                    inventoryItemId: i.matchedItemId!,
                    countedStock: i.quantity
                }));

            if (auditItems.length === 0) {
                toast.error('Para auditoría solo se procesan items ya existentes (Coincidencias)');
                return;
            }

            if (!confirm(`Se creará un BORRADOR de Auditoría con ${auditItems.length} items.\nEl inventario NO se afectará hasta que se apruebe.\n¿Continuar?`)) return;

            setIsProcessing(true);
            const res = await createAuditAction({
                name: `Importación ${importType} - ${new Date().toLocaleDateString()}`,
                items: auditItems,
                areaId: undefined // Global for now
            });

            setIsProcessing(false);
            if (res.success) {
                toast.success('Auditoría borrador creada');
                // Redirect
                window.location.href = `/dashboard/inventario/auditorias/${res.auditId}`;
                return;
            } else {
                toast.error(res.message);
                return;
            }
        }

        // --- NORMAL FLOW ---
        const countRename = validItems.filter(i => i.shouldRename).length;
        const countStock = validItems.filter(i => i.quantity > 0).length;
        const countNew = validItems.filter(i => !i.matchedItemId).length;

        if (!confirm(`Importar:\n- ${countNew} Nuevos Items\n- ${countStock} Ajustes de Stock\n- ${countRename} Renombres\n¿Confirmar?`)) return;

        setIsProcessing(true);
        try {
            const mappedItems = validItems.map(i => ({
                matchedItemId: i.matchedItemId,
                quantity: i.quantity,
                unit: i.unit,
                shouldRename: i.shouldRename,
                newName: i.itemName,
                category: i.category,
                itemName: i.itemName
            }));

            const result = await processImportAction(mappedItems, importType, selectedAreaId || undefined);
            if (result.success) {
                toast.success(result.message);
                setFile(null);
                setPreview(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
            } else {
                toast.error(result.message);
            }
        } catch (error) {
            toast.error('Error al procesar importación');
        } finally {
            setIsProcessing(false);
        }
    };


    const handleUnitChange = (index: number, newUnit: string) => {
        if (!preview || !preview.items) return;
        const newItems = [...preview.items];
        newItems[index] = { ...newItems[index], unit: newUnit };
        setPreview({ ...preview, items: newItems });
    };

    const handleQuantityChange = (index: number, newQty: string) => {
        if (!preview || !preview.items) return;
        // Allow typing (string) but validate later
        const qty = parseFloat(newQty);
        const newItems = [...preview.items];
        newItems[index] = { ...newItems[index], quantity: isNaN(qty) ? 0 : qty };
        setPreview({ ...preview, items: newItems });
    };

    const handleMatchChange = (index: number, itemId: string) => {
        if (!preview || !preview.items) return;
        const newItems = [...preview.items];
        const match = preview.allItems?.find(i => i.id === itemId);

        newItems[index] = {
            ...newItems[index],
            matchedItemId: itemId,
            status: itemId ? 'MATCHED' : 'NOT_FOUND',
            // If manual match and names differ, suggest rename?
            shouldRename: false // Reset
        };
        setPreview({ ...preview, items: newItems });
    };

    const handleRenameToggle = (index: number) => {
        if (!preview || !preview.items) return;
        const newItems = [...preview.items];
        newItems[index] = { ...newItems[index], shouldRename: !newItems[index].shouldRename };
        setPreview({ ...preview, items: newItems });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setPreview(null);
        }
    };

    const handleAnalyze = async () => {
        if (!file) {
            toast.error('Por favor selecciona un archivo primero');
            return;
        }
        setIsProcessing(true);
        console.log('Iniciando análisis...', file.name, file.size);

        try {
            const reader = new FileReader();

            reader.onload = async () => {
                try {
                    console.log('Archivo leído, enviando al servidor...');
                    const base64 = reader.result as string;
                    const result = await parseUploadAction(base64, importType);
                    console.log('Resultado del servidor:', result);

                    if (result.success) {
                        setPreview(result);
                        if (result.items && result.items.length === 0) {
                            toast.error('El archivo se leyó pero no se encontraron filas válidas.');
                        } else {
                            toast.success(`Análisis completado: ${result.items?.length} filas.`);
                        }
                    } else {
                        toast.error(result.message || 'Error desconocido al analizar');
                    }
                } catch (serverError) {
                    console.error('Error procesando respuesta:', serverError);
                    toast.error('Error al procesar la respuesta del servidor');
                } finally {
                    setIsProcessing(false);
                }
            };

            reader.onerror = () => {
                console.error('Error de lectura de archivo');
                toast.error('Error al leer el archivo localmente');
                setIsProcessing(false);
            };

            reader.readAsDataURL(file);

        } catch (error) {
            console.error('Error general:', error);
            toast.error('Error inesperado');
            setIsProcessing(false);
        }
    };

    return (
        <div className="space-y-6 animate-in">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Importación Masiva de Planillas
            </h1>

            <Card>
                <CardContent className="pt-6">
                    <div className="mb-6 grid gap-6 md:grid-cols-3">
                        <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                1. Selecciona el Tipo de Planilla
                            </label>
                            <select
                                value={importType}
                                onChange={(e) => setImportType(e.target.value as any)}
                                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                            >
                                <option value="INVENTARIO_INICIAL">Inventario Inicial (Planilla Orden de Compra)</option>
                                <option value="ENTRADA_ALMACEN">Entrada de Almacén (Planilla Diaria)</option>
                                <option value="MERMA">Registro de Mermas</option>
                            </select>
                            <p className="mt-1 text-xs text-gray-500">
                                Formatos soportados: "ORDEN DE COMPRA NO TOCAR", "ENTRADA ALMACEN", "REGISTRO DE MERMA".
                            </p>
                        </div>

                        <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                2. Área Destino
                            </label>
                            <select
                                value={selectedAreaId}
                                onChange={(e) => setSelectedAreaId(e.target.value)}
                                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                            >
                                <option value="">Seleccionar área...</option>
                                {areas.map(area => (
                                    <option key={area.id} value={area.id}>{area.name}</option>
                                ))}
                            </select>
                            <p className="mt-1 text-xs text-gray-500">
                                Donde se registrará el inventario importado
                            </p>
                        </div>

                        <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                3. Sube tu archivo
                            </label>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx, .xls"
                                onChange={handleFileChange}
                                className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-full file:border-0 file:bg-amber-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-amber-700 hover:file:bg-amber-100 dark:file:bg-amber-900/30 dark:file:text-amber-400"
                            />
                        </div>
                    </div>

                    {file && !preview && (
                        <Button
                            onClick={handleAnalyze}
                            isLoading={isProcessing}
                        >
                            {isProcessing ? 'Analizando...' : 'Analizar Archivo'}
                        </Button>
                    )}
                </CardContent>
            </Card>

            {/* Preview Section */}
            {preview && preview.items && (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between border-b border-gray-100 py-4">
                        <div className="flex items-center justify-between w-full">
                            <CardTitle className="text-lg">
                                Vista Previa ({preview.items.length} filas detectadas)
                            </CardTitle>
                            <div className="text-sm font-normal">
                                <span className="mr-4 text-green-600">
                                    {preview.items.filter(i => i.status === 'MATCHED').length} Validados
                                </span>
                                <span className="text-red-500">
                                    {preview.items.filter(i => i.status !== 'MATCHED').length} Errores
                                </span>
                            </div>
                        </div>
                    </CardHeader>

                    <div className="max-h-96 overflow-y-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700/50 dark:text-gray-400">
                                <tr>
                                    <th className="px-6 py-3">Fila</th>
                                    <th className="px-6 py-3">Item (Excel)</th>
                                    <th className="px-6 py-3">Link Sistema</th>
                                    <th className="px-6 py-3">Cantidad</th>
                                    <th className="px-6 py-3">Unidad</th>
                                    <th className="px-6 py-3">Estado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {preview.items.map((item, idx) => (
                                    <tr key={idx} className={item.status !== 'MATCHED' ? 'bg-red-50 dark:bg-red-900/10' : ''}>
                                        <td className="px-6 py-3 text-gray-500">{item.row}</td>
                                        <td className="px-6 py-3 font-medium text-gray-900 dark:text-white">
                                            {item.itemName}
                                        </td>
                                        <td className="px-6 py-3">
                                            <div className="flex flex-col gap-1">
                                                <select
                                                    className="w-48 rounded border border-gray-300 px-2 py-1 text-xs dark:bg-gray-700"
                                                    value={item.matchedItemId || ''}
                                                    onChange={(e) => handleMatchChange(idx, e.target.value)}
                                                >
                                                    <option value="">-- Seleccionar --</option>
                                                    {preview.allItems?.map(opt => (
                                                        <option key={opt.id} value={opt.id}>{opt.name}</option>
                                                    ))}
                                                </select>

                                                {item.matchedItemId && (
                                                    <label className="flex items-center gap-2 text-xs text-gray-500">
                                                        <input
                                                            type="checkbox"
                                                            checked={!!item.shouldRename}
                                                            onChange={() => handleRenameToggle(idx)}
                                                            className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                                                        />
                                                        Renombrar en Sistema
                                                    </label>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-3">
                                            <input
                                                type="number"
                                                step="any"
                                                value={item.quantity}
                                                onChange={(e) => handleQuantityChange(idx, e.target.value)}
                                                className="w-24 rounded border border-gray-300 px-2 py-1 text-sm focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                            />
                                        </td>
                                        <td className="px-6 py-3">
                                            <select
                                                value={item.unit || 'KG'}
                                                onChange={(e) => handleUnitChange(idx, e.target.value)}
                                                className="rounded border border-gray-300 px-2 py-1 text-sm focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                            >
                                                <option value="KG">KG</option>
                                                <option value="UNI">UND</option>
                                                <option value="LTS">LTS</option>
                                                <option value="GR">GR</option>
                                                <option value="ML">ML</option>
                                            </select>
                                        </td>
                                        <td className="px-6 py-3">
                                            {item.status === 'MATCHED' ? (
                                                item.isFuzzyMatch ? (
                                                    <span className="inline-flex rounded-full bg-amber-100 px-2 text-xs font-semibold leading-5 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                                                        Coincidencia 80%
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex rounded-full bg-green-100 px-2 text-xs font-semibold leading-5 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                                        Exacta
                                                    </span>
                                                )
                                            ) : item.status === 'NOT_FOUND' ? (
                                                importType === 'INVENTARIO_INICIAL' ? (
                                                    <span className="inline-flex rounded-full bg-blue-100 px-2 text-xs font-semibold leading-5 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                                                        ✨ SE CREARÁ
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex rounded-full bg-red-100 px-2 text-xs font-semibold leading-5 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                                                        No encontrado
                                                    </span>
                                                )
                                            ) : (
                                                <span className="inline-flex rounded-full bg-yellow-100 px-2 text-xs font-semibold leading-5 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                                                    Cant. Inválida
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex items-center justify-between bg-gray-50 px-6 py-4 dark:bg-gray-800/50 rounded-b-xl">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={isDraft}
                                onChange={(e) => setIsDraft(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                            />
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Cargar como Borrador (Auditoría)
                            </span>
                        </label>

                        <div className="flex items-center gap-3">
                            <Button
                                variant="outline"
                                onClick={() => { setFile(null); setPreview(null); }}
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleImport}
                                disabled={isProcessing || preview.items.filter(i => i.status === 'MATCHED').length === 0}
                                className="bg-green-600 hover:bg-green-700 text-white"
                                isLoading={isProcessing}
                            >
                                {isProcessing ? 'Importando...' : 'Confirmar Importación'}
                            </Button>
                        </div>
                    </div>
                </Card>
            )}
        </div>
    );
}
