'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { updateInventoryItemAction } from '@/app/actions/inventory.actions';
import { toast } from 'react-hot-toast';

interface Props {
    item: any;
    isOpen: boolean;
    onClose: () => void;
}

export function ItemEditDialog({ item, isOpen, onClose }: Props) {
    const [formData, setFormData] = useState({
        name: item.name,
        sku: item.sku,
        category: item.category || '',
        baseUnit: item.baseUnit || 'UNI',
        minimumStock: item.minimumStock,
        reorderPoint: item.reorderPoint || 0,
    });
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const res = await updateInventoryItemAction(item.id, {
                ...formData,
                minimumStock: Number(formData.minimumStock),
                reorderPoint: Number(formData.reorderPoint),
                baseUnit: formData.baseUnit
            });

            if (res.success) {
                toast.success('Ítem actualizado correctamente');
                onClose();
            } else {
                toast.error(res.message);
            }
        } catch (error) {
            toast.error('Error al guardar cambios');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog.Root open={isOpen} onOpenChange={onClose}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
                <Dialog.Content className="fixed left-[50%] top-[50%] z-50 max-h-[85vh] w-[90vw] max-w-[500px] translate-x-[-50%] translate-y-[-50%] rounded-[6px] bg-white p-[25px] shadow-[hsl(206_22%_7%_/_35%)_0px_10px_38px_-10px,_hsl(206_22%_7%_/_20%)_0px_10px_20px_-15px] focus:outline-none dark:bg-gray-900">
                    <Dialog.Title className="text-xl font-medium text-gray-900 dark:text-gray-100">
                        Editar {item.name}
                    </Dialog.Title>
                    <Dialog.Description className="mt-[10px] mb-5 text-[15px] leading-normal text-gray-500">
                        Modifica los detalles principales del ítem de inventario.
                    </Dialog.Description>

                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <fieldset className="flex flex-col gap-1">
                            <label className="text-[13px] font-medium text-gray-700 dark:text-gray-300">
                                Nombre
                            </label>
                            <input
                                className="w-full rounded-md border border-gray-300 px-3 py-2 text-[15px] leading-none text-gray-900 outline-none focus:ring-2 focus:ring-amber-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                            />
                        </fieldset>

                        <div className="grid grid-cols-2 gap-4">
                            <fieldset className="flex flex-col gap-1">
                                <label className="text-[13px] font-medium text-gray-700 dark:text-gray-300">
                                    SKU
                                </label>
                                <input
                                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-[15px] leading-none text-gray-900 outline-none focus:ring-2 focus:ring-amber-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                                    value={formData.sku}
                                    onChange={e => setFormData({ ...formData, sku: e.target.value })}
                                />
                            </fieldset>
                            <fieldset className="flex flex-col gap-1">
                                <label className="text-[13px] font-medium text-gray-700 dark:text-gray-300">
                                    Categoría
                                </label>
                                <input
                                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-[15px] leading-none text-gray-900 outline-none focus:ring-2 focus:ring-amber-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                                    value={formData.category}
                                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                                />
                            </fieldset>
                        </div>

                        <fieldset className="flex flex-col gap-1">
                            <label className="text-[13px] font-medium text-gray-700 dark:text-gray-300">
                                Unidad de Medida
                            </label>
                            <select
                                className="w-full rounded-md border border-gray-300 px-3 py-2 text-[15px] leading-none text-gray-900 outline-none focus:ring-2 focus:ring-amber-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                                value={formData.baseUnit}
                                onChange={e => setFormData({ ...formData, baseUnit: e.target.value })}
                            >
                                <option value="KG">KG - Kilogramos</option>
                                <option value="UNI">UNI - Unidades</option>
                                <option value="LT">LT - Litros</option>
                                <option value="GR">GR - Gramos</option>
                                <option value="ML">ML - Mililitros</option>
                                <option value="PAQUETE">PAQUETE</option>
                                <option value="CAJA">CAJA</option>
                                <option value="BOLSA">BOLSA</option>
                                <option value="BOTELLA">BOTELLA</option>
                                <option value="GALON">GALON</option>
                            </select>
                        </fieldset>

                        <div className="grid grid-cols-2 gap-4">
                            <fieldset className="flex flex-col gap-1">
                                <label className="text-[13px] font-medium text-gray-700 dark:text-gray-300">
                                    Stock Mínimo
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-[15px] leading-none text-gray-900 outline-none focus:ring-2 focus:ring-amber-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                                    value={formData.minimumStock}
                                    onChange={e => setFormData({ ...formData, minimumStock: Number(e.target.value) })}
                                />
                            </fieldset>
                            <fieldset className="flex flex-col gap-1">
                                <label className="text-[13px] font-medium text-gray-700 dark:text-gray-300">
                                    Punto de Reorden
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-[15px] leading-none text-gray-900 outline-none focus:ring-2 focus:ring-amber-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                                    value={formData.reorderPoint}
                                    onChange={e => setFormData({ ...formData, reorderPoint: Number(e.target.value) })}
                                />
                            </fieldset>
                        </div>

                        <div className="mt-[25px] flex justify-end gap-[10px]">
                            <button
                                type="button"
                                onClick={onClose}
                                className="inline-flex items-center justify-center rounded-[4px] px-[15px] py-[10px] text-[15px] font-medium leading-none text-gray-700 bg-gray-100 hover:bg-gray-200 outline-none focus:shadow-[0_0_0_2px] focus:shadow-gray-400"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="inline-flex items-center justify-center rounded-[4px] px-[15px] py-[10px] text-[15px] font-medium leading-none text-white bg-amber-600 hover:bg-amber-700 outline-none focus:shadow-[0_0_0_2px] focus:shadow-amber-600 disabled:opacity-70"
                            >
                                {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                            </button>
                        </div>
                    </form>
                    <Dialog.Close asChild>
                        <button
                            className="absolute top-[10px] right-[10px] inline-flex h-[25px] w-[25px] appearance-none items-center justify-center rounded-full focus:shadow-[0_0_0_2px] focus:shadow-amber-500 focus:outline-none"
                            aria-label="Close"
                        >
                            ✕
                        </button>
                    </Dialog.Close>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
