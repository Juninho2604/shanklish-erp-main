'use client';

import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import {
    getWaitersAction,
    createWaiterAction,
    updateWaiterAction,
    toggleWaiterActiveAction,
    deleteWaiterAction,
} from '@/app/actions/waiter.actions';

interface Waiter {
    id: string;
    firstName: string;
    lastName: string;
    isActive: boolean;
    hasPin: boolean;
    isCaptain: boolean;
    createdAt: Date | string;
}

const PIN_MANAGER_ROLES = ['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER'];

export function MesonerosView({ currentUserRole }: { currentUserRole: string }) {
    const canManagePin = PIN_MANAGER_ROLES.includes(currentUserRole);
    const [waiters, setWaiters] = useState<Waiter[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [pin, setPin] = useState('');
    const [clearPin, setClearPin] = useState(false);
    const [isCaptain, setIsCaptain] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const load = async () => {
        setIsLoading(true);
        const res = await getWaitersAction();
        if (res.success) setWaiters(res.data as Waiter[]);
        setIsLoading(false);
    };

    useEffect(() => { load(); }, []);

    const openCreate = () => {
        setEditingId(null);
        setFirstName('');
        setLastName('');
        setPin('');
        setClearPin(false);
        setIsCaptain(false);
        setShowForm(true);
    };

    const openEdit = (w: Waiter) => {
        setEditingId(w.id);
        setFirstName(w.firstName);
        setLastName(w.lastName);
        setPin('');
        setClearPin(false);
        setIsCaptain(w.isCaptain);
        setShowForm(true);
    };

    const handleSave = async () => {
        if (!firstName.trim() || !lastName.trim()) {
            toast.error('Nombre y apellido son obligatorios');
            return;
        }
        const pinTrimmed = pin.trim();
        if (canManagePin && pinTrimmed && !/^\d{4,6}$/.test(pinTrimmed)) {
            toast.error('El PIN debe ser numérico de 4 a 6 dígitos');
            return;
        }
        setIsSaving(true);
        try {
            let res;
            if (editingId) {
                // pin: undefined → no tocar · '' → borrar (si clearPin) · string → hashear nuevo
                const pinPayload = !canManagePin
                    ? undefined
                    : clearPin
                        ? ''
                        : pinTrimmed
                            ? pinTrimmed
                            : undefined;
                res = await updateWaiterAction(editingId, {
                    firstName,
                    lastName,
                    isCaptain,
                    ...(pinPayload !== undefined ? { pin: pinPayload } : {}),
                });
            } else {
                res = await createWaiterAction({
                    firstName,
                    lastName,
                    isCaptain,
                    ...(canManagePin && pinTrimmed ? { pin: pinTrimmed } : {}),
                });
            }
            if (res.success) {
                toast.success(res.message);
                setShowForm(false);
                load();
            } else {
                toast.error(res.message);
            }
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggle = async (w: Waiter) => {
        const res = await toggleWaiterActiveAction(w.id, !w.isActive);
        if (res.success) {
            toast.success(res.message);
            setWaiters(prev => prev.map(x => x.id === w.id ? { ...x, isActive: !w.isActive } : x));
        } else {
            toast.error(res.message);
        }
    };

    const handleDelete = async (w: Waiter) => {
        if (!confirm(`¿Eliminar a ${w.firstName} ${w.lastName}? Esta acción no se puede deshacer.`)) return;
        const res = await deleteWaiterAction(w.id);
        if (res.success) {
            toast.success(res.message);
            setWaiters(prev => prev.filter(x => x.id !== w.id));
        } else {
            toast.error(res.message);
        }
    };

    const active = waiters.filter(w => w.isActive);
    const inactive = waiters.filter(w => !w.isActive);

    return (
        <div className="max-w-2xl mx-auto space-y-6 animate-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">🧑‍🍽️ Mesoneros</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        {active.length} activo{active.length !== 1 ? 's' : ''} · {inactive.length} inactivo{inactive.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <button
                    onClick={openCreate}
                    className="inline-flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-amber-500/20 transition active:scale-95"
                >
                    + Agregar mesonero
                </button>
            </div>

            {/* Waiter list */}
            {isLoading ? (
                <div className="text-center py-12 text-gray-400">Cargando…</div>
            ) : waiters.length === 0 ? (
                <div className="text-center py-16 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                    <div className="text-5xl mb-3">🧑‍🍽️</div>
                    <p className="text-gray-500 font-medium">No hay mesoneros registrados</p>
                    <p className="text-gray-400 text-sm mt-1">Agrega los mesoneros de tu restaurante</p>
                    <button onClick={openCreate} className="mt-4 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-amber-600 transition">
                        + Agregar primer mesonero
                    </button>
                </div>
            ) : (
                <div className="space-y-2">
                    {/* Active */}
                    {active.map(w => (
                        <div key={w.id} className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xl dark:bg-amber-900/30">
                                🧑‍🍽️
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-gray-900 dark:text-white">{w.firstName} {w.lastName}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                                        Activo
                                    </span>
                                    {w.hasPin ? (
                                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                                            🔒 PIN
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                                            Sin PIN
                                        </span>
                                    )}
                                    {w.isCaptain && (
                                        <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-900/30 dark:text-sky-400">
                                            ⭐ Capitán
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    onClick={() => openEdit(w)}
                                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition"
                                >
                                    Editar
                                </button>
                                <button
                                    onClick={() => handleToggle(w)}
                                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                                >
                                    Desactivar
                                </button>
                                <button
                                    onClick={() => handleDelete(w)}
                                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                                >
                                    Eliminar
                                </button>
                            </div>
                        </div>
                    ))}

                    {/* Inactive section */}
                    {inactive.length > 0 && (
                        <div className="mt-4">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Inactivos</p>
                            {inactive.map(w => (
                                <div key={w.id} className="flex items-center gap-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 opacity-60 dark:border-gray-700 dark:bg-gray-800/50">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xl dark:bg-gray-700">
                                        🧑‍🍽️
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-gray-600 dark:text-gray-400">{w.firstName} {w.lastName}</p>
                                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                                            Inactivo
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            onClick={() => handleToggle(w)}
                                            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition"
                                        >
                                            Activar
                                        </button>
                                        <button
                                            onClick={() => handleDelete(w)}
                                            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                                        >
                                            Eliminar
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Form Modal */}
            {showForm && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-sm rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
                        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                            <h3 className="font-bold text-gray-900 dark:text-white">
                                {editingId ? 'Editar mesonero' : 'Nuevo mesonero'}
                            </h3>
                            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Nombre <span className="text-red-400">*</span></label>
                                <input
                                    type="text"
                                    value={firstName}
                                    onChange={e => setFirstName(e.target.value)}
                                    placeholder="Ej: Carlos"
                                    autoFocus
                                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-gray-900 text-sm focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Apellido <span className="text-red-400">*</span></label>
                                <input
                                    type="text"
                                    value={lastName}
                                    onChange={e => setLastName(e.target.value)}
                                    placeholder="Ej: López"
                                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-gray-900 text-sm focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                                />
                            </div>
                            {/* Toggle Capitán — siempre visible para roles con acceso */}
                            <label className="flex items-center justify-between rounded-xl border border-gray-300 px-3 py-2.5 cursor-pointer hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800/50">
                                <div>
                                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300">⭐ Capitán</span>
                                    <p className="text-[11px] text-gray-400">Puede dividir cuentas y transferir mesas</p>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={isCaptain}
                                    onChange={e => setIsCaptain(e.target.checked)}
                                    className="h-4 w-4 rounded accent-sky-500"
                                />
                            </label>

                            {canManagePin && (
                            <div>
                                <label className="flex items-center justify-between text-xs font-bold text-gray-500 mb-1">
                                    <span>
                                        PIN <span className="text-gray-400 font-normal">(4-6 dígitos · opcional)</span>
                                    </span>
                                    {editingId && (
                                        <label className="flex items-center gap-1 text-[11px] font-medium text-red-500 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={clearPin}
                                                onChange={e => { setClearPin(e.target.checked); if (e.target.checked) setPin(''); }}
                                                className="h-3 w-3"
                                            />
                                            Borrar PIN
                                        </label>
                                    )}
                                </label>
                                <input
                                    type="password"
                                    inputMode="numeric"
                                    autoComplete="new-password"
                                    maxLength={6}
                                    value={pin}
                                    onChange={e => {
                                        const onlyDigits = e.target.value.replace(/\D/g, '');
                                        setPin(onlyDigits);
                                        if (onlyDigits) setClearPin(false);
                                    }}
                                    disabled={clearPin}
                                    placeholder={editingId ? '(dejar vacío para no cambiar)' : 'Ej: 1234'}
                                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-gray-900 text-sm tracking-[0.4em] focus:border-amber-500 focus:outline-none disabled:opacity-50 disabled:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:disabled:bg-gray-900"
                                />
                                <p className="mt-1 text-[11px] text-gray-400">
                                    El PIN permite al mesonero identificarse en el POS Mesero.
                                </p>
                            </div>
                            )}
                        </div>
                        <div className="flex gap-3 border-t border-gray-200 px-5 py-4 dark:border-gray-700">
                            <button
                                onClick={() => setShowForm(false)}
                                className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving || !firstName.trim() || !lastName.trim()}
                                className="flex-[2] rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50 transition active:scale-95"
                            >
                                {isSaving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear mesonero'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
