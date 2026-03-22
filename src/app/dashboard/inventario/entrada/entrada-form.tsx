'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuthStore } from '@/stores/auth.store';
import { formatCurrency, formatNumber, cn } from '@/lib/utils';

import { registrarEntradaMercancia } from '@/app/actions/entrada.actions';
import { Plus } from 'lucide-react';
import { Combobox } from '@/components/ui/combobox';
import QuickItemModal from './QuickItemModal';

// Tipos
interface UploadedFile {
    fileName: string;
    url: string;
    size: number;
    type: string;
}

interface EntradaItem {
    id: string;
    itemId: string;
    itemName: string;
    quantity: number;
    unit: string;
    unitCost: number;
    totalCost: number;
}

interface Props {
    itemsList: any[];
    areasList: any[];
}

export default function EntradaMercanciaForm({ itemsList, areasList }: Props) {
    const { user, canViewCosts } = useAuthStore();
    const [showCosts, setShowCosts] = useState(false);
    useEffect(() => { setShowCosts(canViewCosts()); }, [canViewCosts]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Estado del formulario principal
    const [referenceNumber, setReferenceNumber] = useState('');
    const [areaId, setAreaId] = useState(areasList[0]?.id || '');
    const [notes, setNotes] = useState('');
    const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    // Estado para agregar items
    const [selectedItem, setSelectedItem] = useState('');
    const [quantity, setQuantity] = useState<number>(0);
    const [unit, setUnit] = useState('UNIT');
    const [unitCost, setUnitCost] = useState<number>(0);

    // Lista de items a registrar en esta entrada
    const [entradaItems, setEntradaItems] = useState<EntradaItem[]>([]);

    // Estado de UI
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
    const [showPreview, setShowPreview] = useState(false);

    // OCR State
    const [isProcessingOCR, setIsProcessingOCR] = useState(false);
    const [ocrSuggestions, setOcrSuggestions] = useState<any[]>([]);
    const [showOcrModal, setShowOcrModal] = useState(false);

    // Import OCR Action (dynamic import to avoid server-client issues if not used)
    // import { processHandwrittenNotesAction } from '@/app/actions/ocr.actions';



    const [isQuickItemModalOpen, setIsQuickItemModalOpen] = useState(false);

    // Lista local para actualizar cuando se crea uno nuevo sin recargar
    const [localItems, setLocalItems] = useState(itemsList);

    // Formatted date for display (avoid hydration mismatch)
    const [displayDate, setDisplayDate] = useState('');
    useEffect(() => {
        setDisplayDate(new Date().toLocaleDateString('es-VE', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit'
        }));
    }, []);

    // Obtener item seleccionado
    const selectedItemData = localItems.find(i => i.id === selectedItem);

    // Auto-llenar costo actual cuando se selecciona item
    useEffect(() => {
        if (selectedItemData) {
            setUnit(selectedItemData.baseUnit);
            setUnitCost(selectedItemData.currentCost || 0);
        }
    }, [selectedItemData]);

    // Manejar upload de archivo
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validar tipo
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
        if (!allowedTypes.includes(file.type)) {
            alert('Tipo de archivo no permitido. Use JPG, PNG, WebP o PDF.');
            return;
        }

        // Validar tamaño (5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert('El archivo excede el tamaño máximo de 5MB');
            return;
        }

        setIsUploading(true);

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('referenceNumber', referenceNumber || 'sin-ref');

            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (data.success) {
                setUploadedFile(data.data);
            } else {
                alert(data.error || 'Error al subir archivo');
            }
        } catch (error) {
            console.error('Error uploading file:', error);
            alert('Error al subir archivo');
        } finally {
            setIsUploading(false);
        }
    };

    const handleOCRProcess = async () => {
        if (!uploadedFile) {
            alert('Primero sube una imagen');
            return;
        }
        if (!uploadedFile.type.startsWith('image/')) {
            alert('Solo se pueden procesar imágenes (JPG, PNG) con IA, no PDFs.');
            return;
        }

        setIsProcessingOCR(true);
        try {
            // Fetch the image to get blob/base64
            const response = await fetch(uploadedFile.url);
            const blob = await response.blob();

            // Convert to base64
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = async () => {
                const base64data = reader.result as string;

                // Call Server Action
                const { processHandwrittenNotesAction } = await import('@/app/actions/ocr.actions');
                const result = await processHandwrittenNotesAction(base64data);

                if (result.success) {
                    setOcrSuggestions(result.suggestions ?? []);
                    setShowOcrModal(true);
                } else {
                    alert('Error OCR: ' + result.message);
                }
                setIsProcessingOCR(false);
            };

        } catch (error) {
            console.error('Error procesando OCR', error);
            alert('Error al procesar la imagen con IA');
            setIsProcessingOCR(false);
        }
    };

    const acceptOcrItem = (suggestion: any) => {
        if (!suggestion.match) return;

        const item = localItems.find(i => i.id === suggestion.match.item.id);
        if (!item) return;

        // Add to main list
        const newItem: EntradaItem = {
            id: `ocr-${Date.now()}-${Math.random()}`,
            itemId: item.id,
            itemName: item.name,
            quantity: suggestion.detectedQuantity || 1,
            unit: item.baseUnit,
            unitCost: item.currentCost || 0,
            totalCost: (suggestion.detectedQuantity || 1) * (item.currentCost || 0),
        };

        if (!entradaItems.some(e => e.itemId === newItem.itemId)) {
            setEntradaItems(prev => [...prev, newItem]);
        }
    };


    // Agregar item a la lista
    const addItem = () => {
        if (!selectedItem || quantity <= 0) return;

        const item = localItems.find(i => i.id === selectedItem);
        if (!item) return;

        // Verificar si ya existe
        if (entradaItems.some(e => e.itemId === selectedItem)) {
            alert('Este insumo ya está en la lista');
            return;
        }

        const newItem: EntradaItem = {
            id: `temp-${Date.now()}`,
            itemId: selectedItem,
            itemName: item.name,
            quantity,
            unit,
            unitCost,
            totalCost: quantity * unitCost,
        };

        setEntradaItems([...entradaItems, newItem]);

        // Limpiar formulario de item
        setSelectedItem('');
        setQuantity(0);
        setUnitCost(0);
    };

    // Eliminar item de la lista
    const removeItem = (id: string) => {
        setEntradaItems(entradaItems.filter(i => i.id !== id));
    };

    // Calcular total
    const totalEntrada = entradaItems.reduce((sum, item) => sum + item.totalCost, 0);

    // Enviar entrada
    const handleSubmit = async () => {
        if (entradaItems.length === 0) {
            alert('Agrega al menos un insumo');
            return;
        }

        setIsSubmitting(true);
        setResult(null);

        try {
            // Iterar y enviar cada item
            let successCount = 0;
            let lastError = '';

            for (const item of entradaItems) {
                const res = await registrarEntradaMercancia({
                    inventoryItemId: item.itemId,
                    quantity: item.quantity,
                    unit: item.unit,
                    unitCost: item.unitCost,
                    areaId: areaId,
                    referenceNumber: referenceNumber,
                    documentUrl: uploadedFile?.url,
                    notes: notes,
                    userId: user?.id || 'cmkvq94uo0000ua0ns6g844yr',
                });

                if (res.success) {
                    successCount++;
                } else {
                    console.error('Fallo en item:', item.itemName, res.message);
                    lastError = res.message;
                }
            }

            if (successCount > 0) {
                setResult({
                    success: true,
                    message: `Se registraron ${successCount} de ${entradaItems.length} items exitosamente.`,
                });

                if (successCount === entradaItems.length) {
                    setEntradaItems([]);
                    setReferenceNumber('');
                    setUploadedFile(null);
                    setNotes('');
                }
            } else {
                setResult({
                    success: false,
                    message: `Error al registrar: ${lastError}`,
                });
            }

        } catch (error) {
            setResult({
                success: false,
                message: 'Error de conexión al registrar entrada',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6 animate-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link
                        href="/dashboard/inventario"
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 dark:border-gray-700"
                    >
                        ←
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            Entrada de Mercancía
                        </h1>
                        <p className="text-gray-500">
                            Registro de llegada de insumos de proveedores
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                {/* Formulario Principal */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Información del Documento */}
                    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                        <div className="mb-6 flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-2xl text-white shadow-lg">
                                📄
                            </div>
                            <div>
                                <h2 className="font-semibold text-gray-900 dark:text-white">
                                    Datos de la Nota de Entrega
                                </h2>
                                <p className="text-sm text-gray-500">
                                    Información del documento de Profit
                                </p>
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            {/* Número de Referencia */}
                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    N° Nota de Entrega *
                                </label>
                                <input
                                    type="text"
                                    value={referenceNumber}
                                    onChange={(e) => setReferenceNumber(e.target.value)}
                                    placeholder="Ej: NE-2026-00123"
                                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                />
                            </div>

                            {/* Área de Almacenamiento */}
                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Área de Almacenamiento
                                </label>
                                <select
                                    value={areaId}
                                    onChange={(e) => setAreaId(e.target.value)}
                                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                >
                                    {areasList.map(area => (
                                        <option key={area.id} value={area.id}>
                                            {area.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Upload de Imagen */}
                            <div className="sm:col-span-2">
                                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    📷 Imagen de la Nota de Entrega
                                </label>

                                <div className="relative">
                                    {!uploadedFile ? (
                                        <div
                                            onClick={() => fileInputRef.current?.click()}
                                            className={cn(
                                                'cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors',
                                                isUploading
                                                    ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20'
                                                    : 'border-gray-300 hover:border-amber-400 hover:bg-amber-50/50 dark:border-gray-600 dark:hover:border-amber-600'
                                            )}
                                        >
                                            {isUploading ? (
                                                <div className="flex flex-col items-center">
                                                    <span className="animate-spin text-4xl">⏳</span>
                                                    <p className="mt-2 text-sm text-amber-600">Subiendo archivo...</p>
                                                </div>
                                            ) : (
                                                <>
                                                    <span className="text-4xl">📎</span>
                                                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                                                        Haz clic para subir o arrastra la imagen aquí
                                                    </p>
                                                    <p className="text-xs text-gray-400">
                                                        JPG, PNG, WebP o PDF (máx. 5MB)
                                                    </p>
                                                </>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-700 dark:bg-emerald-900/20">
                                            <div className="flex items-center gap-4">
                                                <div className="relative h-20 w-20 overflow-hidden rounded-lg border border-gray-200 bg-white">
                                                    {uploadedFile.type.startsWith('image/') ? (
                                                        <Image
                                                            src={uploadedFile.url}
                                                            alt="Nota de entrega"
                                                            fill
                                                            className="object-cover"
                                                        />
                                                    ) : (
                                                        <div className="flex h-full items-center justify-center text-3xl">
                                                            📄
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1">
                                                    <p className="font-medium text-emerald-800 dark:text-emerald-400">
                                                        ✓ Documento adjunto
                                                    </p>
                                                    <p className="text-sm text-emerald-600 dark:text-emerald-500">
                                                        {uploadedFile.fileName}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        {(uploadedFile.size / 1024).toFixed(1)} KB
                                                    </p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => setShowPreview(true)}
                                                        className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-800/50"
                                                        title="Ver documento"
                                                    >
                                                        👁️
                                                    </button>
                                                    <button
                                                        onClick={() => setUploadedFile(null)}
                                                        className="rounded-lg p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20"
                                                        title="Eliminar"
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*,.pdf"
                                        onChange={handleFileUpload}
                                        className="hidden"
                                    />
                                </div>
                            </div>

                            {/* Notas */}
                            <div className="sm:col-span-2">
                                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Notas (opcional)
                                </label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Observaciones sobre la entrega..."
                                    rows={2}
                                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Agregar Insumos */}
                    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                        <div className="mb-6 flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 text-2xl text-white shadow-lg">
                                📦
                            </div>
                            <div>
                                <h2 className="font-semibold text-gray-900 dark:text-white">
                                    Insumos Recibidos
                                </h2>
                                <p className="text-sm text-gray-500">
                                    Agrega los items de la nota de entrega
                                </p>
                            </div>
                        </div>

                        {/* Formulario para agregar item */}
                        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-700/50">
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                                <div className="lg:col-span-2">
                                    <label className="mb-1 block text-xs font-medium text-gray-500">
                                        Insumo
                                    </label>
                                    <div className="flex gap-2">
                                        <div className="flex-1">
                                            <Combobox
                                                items={localItems.map(item => ({ value: item.id, label: `${item.name} (${item.baseUnit})` }))}
                                                value={selectedItem}
                                                onChange={(val) => setSelectedItem(val === selectedItem ? '' : val)}
                                                placeholder="Seleccionar..."
                                                searchPlaceholder="Buscar insumo..."
                                                emptyMessage="No se encontró el insumo."
                                                allowCreate={true}
                                                onCreateNew={() => setIsQuickItemModalOpen(true)}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setIsQuickItemModalOpen(true)}
                                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-amber-300 bg-amber-50 text-amber-600 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
                                            title="Crear nuevo insumo"
                                        >
                                            <Plus className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="mb-1 block text-xs font-medium text-gray-500">
                                        Cantidad
                                    </label>
                                    <div className="flex gap-1">
                                        <input
                                            type="number"
                                            value={quantity || ''}
                                            onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
                                            min="0"
                                            step="0.1"
                                            placeholder="0"
                                            className="w-16 rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                                        />
                                        <select
                                            value={unit}
                                            onChange={(e) => setUnit(e.target.value)}
                                            className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                                        >
                                            <option value={selectedItemData?.baseUnit || 'UNIT'}>
                                                {selectedItemData?.baseUnit || 'UNIT'}
                                            </option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="mb-1 block text-xs font-medium text-gray-500">
                                        Costo Unit. (USD)
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                                        <input
                                            type="number"
                                            value={unitCost || ''}
                                            onChange={(e) => setUnitCost(parseFloat(e.target.value) || 0)}
                                            min="0"
                                            step="0.01"
                                            placeholder="0.00"
                                            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-6 pr-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                                        />
                                    </div>
                                </div>

                                <div className="flex items-end">
                                    <button
                                        onClick={addItem}
                                        disabled={!selectedItem || quantity <= 0}
                                        className="w-full rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        + Agregar
                                    </button>
                                </div>
                            </div>

                            {/* Indicador de cambio de costo */}
                            {selectedItemData && unitCost > 0 && selectedItemData.currentCost > 0 &&
                                Math.abs(unitCost - selectedItemData.currentCost) > 0.01 && (
                                    <p className={cn(
                                        'mt-2 text-xs',
                                        unitCost > selectedItemData.currentCost ? 'text-red-500' : 'text-emerald-500'
                                    )}>
                                        {unitCost > selectedItemData.currentCost ? '📈' : '📉'}
                                        Costo anterior: ${selectedItemData.currentCost.toFixed(2)} →
                                        Nuevo: ${unitCost.toFixed(2)}
                                    </p>
                                )}
                        </div>

                        {/* Lista de items agregados */}
                        {entradaItems.length > 0 ? (
                            <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
                                            <th className="px-4 py-2 text-left font-medium text-gray-500">Insumo</th>
                                            <th className="px-4 py-2 text-right font-medium text-gray-500">Cantidad</th>
                                            {showCosts && (
                                                <>
                                                    <th className="px-4 py-2 text-right font-medium text-gray-500">Costo Unit.</th>
                                                    <th className="px-4 py-2 text-right font-medium text-gray-500">Total</th>
                                                </>
                                            )}
                                            <th className="px-4 py-2 text-center font-medium text-gray-500"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                        {entradaItems.map(item => (
                                            <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                                                    {item.itemName}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    {formatNumber(item.quantity)} {item.unit}
                                                </td>
                                                {showCosts && (
                                                    <>
                                                        <td className="px-4 py-3 text-right font-mono">
                                                            {formatCurrency(item.unitCost)}
                                                        </td>
                                                        <td className="px-4 py-3 text-right font-mono font-semibold">
                                                            {formatCurrency(item.totalCost)}
                                                        </td>
                                                    </>
                                                )}
                                                <td className="px-4 py-3 text-center">
                                                    <button
                                                        onClick={() => removeItem(item.id)}
                                                        className="text-red-500 hover:text-red-700"
                                                    >
                                                        🗑️
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    {showCosts && (
                                        <tfoot>
                                            <tr className="border-t-2 border-gray-300 bg-gray-100 dark:border-gray-600 dark:bg-gray-800">
                                                <td colSpan={3} className="px-4 py-3 text-right font-semibold">
                                                    TOTAL:
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono text-lg font-bold text-amber-600">
                                                    {formatCurrency(totalEntrada)}
                                                </td>
                                                <td></td>
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>
                        ) : (
                            <div className="rounded-lg border-2 border-dashed border-gray-300 py-8 text-center dark:border-gray-600">
                                <span className="text-4xl">📋</span>
                                <p className="mt-2 text-gray-500">
                                    Agrega los insumos de la nota de entrega
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Resultado */}
                    {result && (
                        <div className={cn(
                            'rounded-xl p-4',
                            result.success
                                ? 'border border-emerald-200 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/20'
                                : 'border border-red-200 bg-red-50 dark:border-red-700 dark:bg-red-900/20'
                        )}>
                            <div className="flex items-center gap-2">
                                <span className="text-2xl">{result.success ? '✅' : '❌'}</span>
                                <p className={cn(
                                    'font-medium',
                                    result.success ? 'text-emerald-800 dark:text-emerald-400' : 'text-red-800 dark:text-red-400'
                                )}>
                                    {result.message}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Panel lateral */}
                <div className="space-y-4">
                    {/* Resumen y botón guardar */}
                    <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 dark:border-amber-800 dark:from-amber-900/20 dark:to-orange-900/20">
                        <h3 className="mb-4 flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                            <span>📋</span> Resumen de Entrada
                        </h3>

                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">N° Referencia:</span>
                                <span className="font-medium text-gray-900 dark:text-white">
                                    {referenceNumber || '-'}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">Items:</span>
                                <span className="font-medium text-gray-900 dark:text-white">
                                    {entradaItems.length}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">Documento:</span>
                                <span className={cn(
                                    'font-medium',
                                    uploadedFile ? 'text-emerald-600' : 'text-gray-400'
                                )}>
                                    {uploadedFile ? '✓ Adjunto' : 'Sin adjuntar'}
                                </span>
                            </div>
                            {showCosts && (
                                <div className="flex justify-between border-t border-amber-200 pt-3 dark:border-amber-700">
                                    <span className="font-semibold text-gray-900 dark:text-white">Total:</span>
                                    <span className="text-xl font-bold text-amber-600">
                                        {formatCurrency(totalEntrada)}
                                    </span>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting || entradaItems.length === 0}
                            className="mt-6 w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 py-3 font-semibold text-white shadow-lg shadow-amber-500/25 transition-all hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isSubmitting ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className="animate-spin">⏳</span>
                                    Guardando...
                                </span>
                            ) : (
                                '💾 Guardar Entrada'
                            )}
                        </button>
                    </div>

                    {/* Info de costo promedio */}
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                        <h4 className="mb-2 flex items-center gap-2 font-medium text-blue-800 dark:text-blue-400">
                            💡 Costo Promedio Ponderado
                        </h4>
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                            Si el precio de un insumo cambia, el sistema recalcula automáticamente
                            el costo promedio basado en el stock existente y la nueva entrada.
                        </p>
                    </div>

                    {/* Info del usuario */}
                    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                        <p className="text-xs text-gray-500">Registrado por:</p>
                        <p className="font-medium text-gray-900 dark:text-white">
                            {user?.firstName} {user?.lastName}
                        </p>
                        <p className="text-xs text-gray-400">
                            {displayDate}
                        </p>
                    </div>
                </div>
            </div>

            {/* Modal de preview de imagen */}
            {showPreview && uploadedFile && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
                    onClick={() => setShowPreview(false)}
                >
                    <div className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-xl bg-white shadow-2xl">
                        <button
                            onClick={() => setShowPreview(false)}
                            className="absolute right-2 top-2 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                        >
                            ✕
                        </button>
                        {uploadedFile.type.startsWith('image/') ? (
                            <Image
                                src={uploadedFile.url}
                                alt="Nota de entrega"
                                width={800}
                                height={600}
                                className="max-h-[85vh] w-auto object-contain"
                            />
                        ) : (
                            <iframe
                                src={uploadedFile.url}
                                className="h-[80vh] w-[60vw]"
                                title="Documento"
                            />
                        )}
                    </div>
                </div>
            )}

            {/* Modal de Resultados OCR */}
            {showOcrModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-800">
                        <div className="border-b border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                                🤖 Resultados del Análisis IA
                            </h3>
                            <p className="text-sm text-gray-500">
                                Revisa los items detectados. La IA puede equivocarse con la caligrafía difícil.
                            </p>
                        </div>

                        <div className="max-h-[60vh] overflow-y-auto p-4">
                            {ocrSuggestions.length === 0 ? (
                                <p className="text-center text-gray-500">No se detectaron items legibles.</p>
                            ) : (
                                <div className="space-y-3">
                                    {ocrSuggestions.map((sugg, idx) => (
                                        <div key={idx} className="flex items-center justify-between rounded-lg border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-700/50">
                                            <div>
                                                <p className="font-mono text-xs text-gray-400">
                                                    Detectado: "{sugg.originalText}"
                                                </p>
                                                <div className="flex items-center gap-2">
                                                    {sugg.match ? (
                                                        <>
                                                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                                                {sugg.match.item.name}
                                                            </span>
                                                            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-gray-800">
                                                                {sugg.detectedQuantity} {sugg.match.item.baseUnit}
                                                            </span>
                                                            {sugg.match.score > 0.3 && (
                                                                <span className="text-xs text-amber-500" title="Confianza baja">⚠️</span>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <span className="text-red-400">No encontrado en inventario</span>
                                                    )}
                                                </div>
                                            </div>

                                            {sugg.match && (
                                                <button
                                                    onClick={() => {
                                                        acceptOcrItem(sugg);
                                                        // Eliminar de la lista visual temporalmente o marcar como agregado
                                                        setOcrSuggestions(prev => prev.filter((_, i) => i !== idx));
                                                    }}
                                                    className="rounded-lg bg-emerald-100 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300"
                                                >
                                                    Agregar
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 border-t border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                            <button
                                onClick={() => setShowOcrModal(false)}
                                className="rounded-lg bg-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de creación rápida */}
            <QuickItemModal
                isOpen={isQuickItemModalOpen}
                onClose={() => setIsQuickItemModalOpen(false)}
                onSuccess={(newItem) => {
                    setLocalItems([...localItems, newItem]);
                    setSelectedItem(newItem.id);
                }}
            />
        </div>
    );
}

