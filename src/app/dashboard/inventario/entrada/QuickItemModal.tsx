'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { createQuickItem } from '@/app/actions/inventory.actions';
import { useAuthStore } from '@/stores/auth.store';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (newItem: any) => void;
}

export default function QuickItemModal({ isOpen, onClose, onSuccess }: Props) {
    const { user } = useAuthStore();
    const [name, setName] = useState('');
    const [unit, setUnit] = useState('KG');
    const [type, setType] = useState('RAW_MATERIAL');
    const [cost, setCost] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!name) return;

        setIsSubmitting(true);
        try {
            const result = await createQuickItem({
                name,
                unit,
                type,
                userId: user?.id || 'temp-id',
                cost: cost ? parseFloat(cost) : undefined
            });

            if (result.success) {
                onSuccess(result.item);
                onClose();
                // Reset form
                setName('');
                setUnit('KG');
                setCost('');
            } else {
                alert(result.message);
            }
        } catch (error) {
            console.error(error);
            alert('Error al crear item');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Registrar Nuevo Insumo</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label htmlFor="name" className="text-right text-sm font-medium">
                            Nombre
                        </label>
                        <input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="col-span-3 h-9 rounded-md border border-gray-300 px-3 text-sm focus:border-amber-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800"
                            placeholder="Ej: Tomates"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label htmlFor="unit" className="text-right text-sm font-medium">
                            Unidad
                        </label>
                        <select
                            id="unit"
                            value={unit}
                            onChange={(e) => setUnit(e.target.value)}
                            className="col-span-3 h-9 rounded-md border border-gray-300 px-3 text-sm focus:border-amber-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800"
                        >
                            <option value="KG">Kilogramos</option>
                            <option value="L">Litros</option>
                            <option value="UNIT">Unidad (Pza)</option>
                            <option value="G">Gramos</option>
                            <option value="ML">Mililitros</option>
                            <option value="PORTION">Porción</option>
                        </select>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label htmlFor="type" className="text-right text-sm font-medium">
                            Tipo
                        </label>
                        <select
                            id="type"
                            value={type}
                            onChange={(e) => setType(e.target.value)}
                            className="col-span-3 h-9 rounded-md border border-gray-300 px-3 text-sm focus:border-amber-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800"
                        >
                            <option value="RAW_MATERIAL">Materia Prima</option>
                            <option value="SUB_RECIPE">Sub-receta / Producción</option>
                            <option value="FINISHED_GOOD">Producto Terminado</option>
                        </select>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label htmlFor="cost" className="text-right text-sm font-medium">
                            Costo Inicial $
                        </label>
                        <input
                            id="cost"
                            type="number"
                            step="0.01"
                            value={cost}
                            onChange={(e) => setCost(e.target.value)}
                            className="col-span-3 h-9 rounded-md border border-gray-300 px-3 text-sm focus:border-amber-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800"
                            placeholder="0.00 (Opcional)"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !name}
                        className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                    >
                        {isSubmitting ? 'Guardando...' : 'Guardar Item'}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
