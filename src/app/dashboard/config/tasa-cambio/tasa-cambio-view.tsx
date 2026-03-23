'use client';

import { useState, useTransition } from 'react';
import { setExchangeRateAction } from '@/app/actions/exchange.actions';
import { toast } from 'react-hot-toast';

interface ExchangeRate {
    id: string;
    rate: number;
    effectiveDate: Date;
    source: string;
}

interface Props {
    history: ExchangeRate[];
}

export function TasaCambioView({ history }: Props) {
    const [rate, setRate] = useState('');
    const [isPending, startTransition] = useTransition();
    const latest = history[0];

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const parsed = parseFloat(rate.replace(',', '.'));
        if (isNaN(parsed) || parsed <= 0) {
            toast.error('Ingresa una tasa válida mayor a 0');
            return;
        }

        startTransition(async () => {
            const res = await setExchangeRateAction(parsed, new Date());
            if (res.success) {
                toast.success(res.message);
                setRate('');
            } else {
                toast.error(res.message);
            }
        });
    }

    return (
        <div className="grid gap-6 md:grid-cols-2">
            {/* ── Tasa actual ── */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Tasa actual</p>
                {latest ? (
                    <>
                        <p className="mt-1 text-4xl font-bold text-amber-600 dark:text-amber-400">
                            {latest.rate.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                        </p>
                        <p className="mt-1 text-sm text-gray-500">Bs por 1 USD</p>
                        <p className="mt-3 text-xs text-gray-400">
                            Actualizada el{' '}
                            {new Date(latest.effectiveDate).toLocaleDateString('es-VE', {
                                day: '2-digit',
                                month: 'long',
                                year: 'numeric',
                            })}
                        </p>
                    </>
                ) : (
                    <p className="mt-2 text-gray-400">Sin tasa registrada</p>
                )}
            </div>

            {/* ── Formulario ── */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
                <p className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Nueva tasa de hoy
                </p>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                            Tasa BCV (Bs por USD)
                        </label>
                        <input
                            type="text"
                            inputMode="decimal"
                            placeholder="Ej: 91.50"
                            value={rate}
                            onChange={e => setRate(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-lg font-mono focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                            disabled={isPending}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isPending || !rate.trim()}
                        className="w-full rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-white transition-all hover:bg-amber-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isPending ? 'Guardando…' : 'Guardar tasa de hoy'}
                    </button>
                </form>
            </div>

            {/* ── Historial ── */}
            {history.length > 0 && (
                <div className="md:col-span-2 overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                    <div className="border-b border-gray-200 bg-gray-50 px-5 py-3 dark:border-gray-700 dark:bg-gray-800/50">
                        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                            Historial reciente
                        </h2>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {history.map((r) => (
                            <div key={r.id} className="flex items-center justify-between px-5 py-3">
                                <span className="text-sm text-gray-500 dark:text-gray-400">
                                    {new Date(r.effectiveDate).toLocaleDateString('es-VE', {
                                        day: '2-digit',
                                        month: 'short',
                                        year: 'numeric',
                                    })}
                                </span>
                                <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white">
                                    {r.rate.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
