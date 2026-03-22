'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { createLoanAction } from '@/app/actions/loan.actions';
import { toast } from 'react-hot-toast';
import { UNIT_INFO } from '@/lib/constants/units';
import { UnitOfMeasure } from '@/types';
import { formatNumber, formatCurrency } from '@/lib/utils';
import { Combobox } from '@/components/ui/combobox';

interface ItemOption {
    id: string;
    name: string;
    sku: string;
    unit: string;
    type: string;
    estimatedCost: number;
}

interface NewLoanFormProps {
    items: ItemOption[];
    areas: { id: string; name: string }[];
}

export default function NewLoanForm({ items, areas }: NewLoanFormProps) {
    const router = useRouter();
    const { user } = useAuthStore();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form State
    const [loaneeName, setLoaneeName] = useState('');
    const [selectedItemId, setSelectedItemId] = useState('');
    const [fromAreaId, setFromAreaId] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [unit, setUnit] = useState<UnitOfMeasure>('KG');
    const [type, setType] = useState<'REPLACEMENT' | 'PAYMENT'>('REPLACEMENT');
    const [agreedPrice, setAgreedPrice] = useState<number>(0);
    const [notes, setNotes] = useState('');

    const selectedItem = items.find(i => i.id === selectedItemId);

    // Initial Unit defaulting
    const handleItemChange = (itemId: string) => {
        const item = items.find(i => i.id === itemId);
        setSelectedItemId(itemId);
        if (item) {
            setUnit(item.unit as UnitOfMeasure || 'KG');
            setAgreedPrice(item.estimatedCost); // Default price suggestion
        }
    };

    const handleSubmit = async () => {
        if (!user || !selectedItemId || !loaneeName) return;

        try {
            setIsSubmitting(true);
            const result = await createLoanAction({
                inventoryItemId: selectedItemId,
                loaneeName,
                quantity,
                unit,
                type,
                agreedPrice: type === 'PAYMENT' ? agreedPrice : undefined,
                notes,
                userId: user.id,
                areaId: fromAreaId
            });

            if (result.success) {
                toast.success('Préstamo creado con éxito');
                router.push('/dashboard/prestamos');
                router.refresh();
            } else {
                toast.error(result.message);
            }
        } catch (error) {
            toast.error('Error al crear préstamo');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="mx-auto max-w-2xl space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link
                    href="/dashboard/prestamos"
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                >
                    ←
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        Registrar Préstamo
                    </h1>
                    <p className="text-gray-500">
                        Salida de insumos a terceros
                    </p>
                </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="grid gap-6">
                    {/* Prestado A */}
                    <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Prestado a (Restaurante/Persona) *
                        </label>
                        <input
                            type="text"
                            value={loaneeName}
                            onChange={(e) => setLoaneeName(e.target.value)}
                            placeholder="Ej: Restaurant Vecino A"
                            className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                        />
                    </div>

                    {/* Origen */}
                    <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Sale de (Almacén) *
                        </label>
                        <select
                            value={fromAreaId}
                            onChange={(e) => setFromAreaId(e.target.value)}
                            className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                        >
                            <option value="">Seleccionar Almacén...</option>
                            {areas.map(area => (
                                <option key={area.id} value={area.id}>{area.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Item Selection */}
                    <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Insumo / Producto *
                        </label>
                        <Combobox
                            items={items.map(item => ({
                                value: item.id,
                                label: `${item.name} (${item.unit})`
                            }))}
                            value={selectedItemId || ''}
                            onChange={(val) => handleItemChange(val)}
                            placeholder="Seleccionar producto..."
                            searchPlaceholder="Buscar producto..."
                            emptyMessage="No se encontró el producto."
                        />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        {/* Cantidad */}
                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Cantidad *
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    value={quantity}
                                    onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
                                    min="0"
                                    step="0.01"
                                    className="w-24 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                />
                                <select
                                    value={unit}
                                    onChange={(e) => setUnit(e.target.value as UnitOfMeasure)}
                                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                >
                                    {Object.entries(UNIT_INFO).map(([key, info]) => (
                                        <option key={key} value={key}>
                                            {info.symbol} ({info.labelEs})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Modalidad */}
                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Modalidad *
                            </label>
                            <select
                                value={type}
                                onChange={(e) => setType(e.target.value as any)}
                                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                            >
                                <option value="REPLACEMENT">📦 Reposición (Devuelven producto)</option>
                                <option value="PAYMENT">💰 Pago (Compran producto)</option>
                            </select>
                        </div>
                    </div>

                    {/* Price if Payment */}
                    {type === 'PAYMENT' && (
                        <div className="animate-in fade-in slide-in-from-top-2">
                            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Precio Acordado (por unidad)
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">$</div>
                                <input
                                    type="number"
                                    value={agreedPrice}
                                    onChange={(e) => setAgreedPrice(parseFloat(e.target.value) || 0)}
                                    min="0"
                                    step="0.01"
                                    className="w-full rounded-lg border border-gray-200 bg-white pl-8 pr-4 py-2.5 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                />
                            </div>
                            <p className="mt-1 text-xs text-gray-500">
                                Costo actual estimado: {formatCurrency(selectedItem?.estimatedCost || 0)}
                            </p>
                        </div>
                    )}

                    {/* Notes */}
                    <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Notas (Opcional)
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                            className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                        />
                    </div>

                    <div className="pt-4">
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting || !loaneeName || !selectedItemId || !fromAreaId || quantity <= 0}
                            className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3 font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isSubmitting ? 'Registrando...' : 'Registrar Préstamo'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
