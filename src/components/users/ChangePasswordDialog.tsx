'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { changePasswordAction } from '@/app/actions/user.actions';

interface ChangePasswordDialogProps {
    children?: React.ReactNode;
}

interface PasswordFormData {
    current: string;
    new: string;
    confirm: string;
}

export function ChangePasswordDialog({ children }: ChangePasswordDialogProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<PasswordFormData>();

    const onSubmit = async (data: PasswordFormData) => {
        if (data.new !== data.confirm) {
            toast.error('Las contraseñas nuevas no coinciden');
            return;
        }

        if (data.new.length < 6) {
            toast.error('La contraseña debe tener al menos 6 caracteres');
            return;
        }

        setIsLoading(true);
        try {
            const result = await changePasswordAction(data.current, data.new);

            if (result.success) {
                toast.success('Contraseña actualizada correctamente');
                setIsOpen(false);
                reset();
            } else {
                toast.error(result.message || 'Error al cambiar la contraseña');
            }
        } catch (error) {
            toast.error('Ocurrió un error inesperado');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                {children || (
                    <button className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-amber-500 dark:hover:bg-gray-800" title="Cambiar Contraseña">
                        🔑
                    </button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold text-gray-900 dark:text-gray-100">Cambiar Contraseña</DialogTitle>
                    <DialogDescription className="text-gray-500 dark:text-gray-400">
                        Ingresa tu contraseña actual y la nueva contraseña para actualizar tu acceso.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Contraseña Actual
                        </label>
                        <input
                            type="password"
                            className={cn(
                                "flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950 dark:ring-offset-gray-950 dark:placeholder:text-gray-400",
                                errors.current && "border-red-500 focus-visible:ring-red-500"
                            )}
                            {...register('current', { required: 'Este campo es requerido' })}
                        />
                        {errors.current && <p className="text-xs text-red-500">{errors.current.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Nueva Contraseña
                        </label>
                        <input
                            type="password"
                            className={cn(
                                "flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950 dark:ring-offset-gray-950 dark:placeholder:text-gray-400",
                                errors.new && "border-red-500 focus-visible:ring-red-500"
                            )}
                            {...register('new', { required: 'Este campo es requerido', minLength: { value: 6, message: 'Mínimo 6 caracteres' } })}
                        />
                        {errors.new && <p className="text-xs text-red-500">{errors.new.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Confirmar Nueva Contraseña
                        </label>
                        <input
                            type="password"
                            className={cn(
                                "flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950 dark:ring-offset-gray-950 dark:placeholder:text-gray-400",
                                errors.confirm && "border-red-500 focus-visible:ring-red-500"
                            )}
                            {...register('confirm', { required: 'Este campo es requerido' })}
                        />
                        {watch('confirm') !== watch('new') && watch('confirm') && (
                            <p className="text-xs text-red-500">Las contraseñas no coinciden</p>
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="bg-amber-600 hover:bg-amber-700 text-white"
                        >
                            {isLoading ? 'Actualizando...' : 'Guardar Cambios'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
