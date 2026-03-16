'use client';

import { useState, useEffect } from 'react';
import { getExchangeRateValue, setExchangeRateAction } from '@/app/actions/exchange.actions';
import { usdToBs } from '@/lib/currency';

interface CurrencyCalculatorProps {
    className?: string;
    totalUsd?: number;
    hasServiceFee?: boolean; // Nuevo prop para incluir el 10% de servicio
    deliveryFee?: number; // Opcional para delivery
    onRateUpdated?: (rate: number) => void;
}

export function CurrencyCalculator({ className, totalUsd, hasServiceFee, deliveryFee, onRateUpdated }: CurrencyCalculatorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [rate, setRate] = useState<number | null>(null);
    const [editableRate, setEditableRate] = useState('');
    const [usdInput, setUsdInput] = useState('');
    const [isSavingRate, setIsSavingRate] = useState(false);

    useEffect(() => {
        getExchangeRateValue().then((value) => {
            setRate(value);
            if (value) setEditableRate(value.toFixed(2));
        });
    }, []);

    const usd = parseFloat(usdInput.replace(',', '.')) || 0;
    const parsedRate = parseFloat(editableRate.replace(',', '.')) || 0;
    const effectiveRate = parsedRate > 0 ? parsedRate : rate || 0;
    const bs = effectiveRate > 0 && usd > 0 ? usdToBs(usd, effectiveRate) : 0;
    const totalBs = effectiveRate > 0 && totalUsd && totalUsd > 0 ? usdToBs(totalUsd, effectiveRate) : 0;

    const handleUpdateRate = async () => {
        if (parsedRate <= 0) {
            alert('Ingrese una tasa válida');
            return;
        }
        setIsSavingRate(true);
        try {
            const result = await setExchangeRateAction(parsedRate, new Date());
            if (!result.success) {
                alert(result.message || 'No se pudo actualizar la tasa');
                return;
            }
            const rounded = Math.round(parsedRate * 100) / 100;
            setRate(rounded);
            setEditableRate(rounded.toFixed(2));
            onRateUpdated?.(rounded);
        } finally {
            setIsSavingRate(false);
        }
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                className={`flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700 transition ${className}`}
                title="Calculadora USD → Bs"
            >
                <span>💱</span>
                <span>USD → Bs</span>
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setIsOpen(false)}>
                    <div
                        className="rounded-2xl border border-slate-600 bg-slate-900 p-6 w-full max-w-sm shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-white">Calculadora USD → Bs</h3>
                            <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
                        </div>

                        <div className="mb-4 rounded-xl border border-slate-600 bg-slate-800/70 p-3">
                            <label className="block text-xs text-slate-400 mb-1">Tasa del día (1 USD = Bs)</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={editableRate}
                                    onChange={(e) => setEditableRate(e.target.value)}
                                    placeholder="0.00"
                                    className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-white outline-none focus:border-emerald-500"
                                />
                                <button
                                    type="button"
                                    onClick={handleUpdateRate}
                                    disabled={isSavingRate}
                                    className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                                >
                                    {isSavingRate ? '...' : 'Actualizar'}
                                </button>
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm text-slate-400 mb-1">Monto en USD</label>
                            <input
                                type="text"
                                inputMode="decimal"
                                value={usdInput}
                                onChange={(e) => setUsdInput(e.target.value)}
                                placeholder="0.00"
                                className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-xl font-bold text-white outline-none focus:border-emerald-500"
                            />
                        </div>
                        <div className="rounded-xl bg-emerald-900/30 border border-emerald-500/30 px-4 py-3 mb-3">
                            <p className="text-xs text-emerald-300/80 mb-1">Equivalente en Bolívares</p>
                            <p className="text-2xl font-black text-emerald-300">{bs > 0 ? bs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0,00'} Bs</p>
                        </div>

                        {typeof totalUsd === 'number' && totalUsd > 0 && (
                            <div className="rounded-xl bg-blue-900/30 border border-blue-500/30 px-4 py-3">
                                <p className="text-xs text-blue-200/80 mb-1">
                                    Total de la venta ({totalUsd.toFixed(2)} USD)
                                </p>
                                {hasServiceFee && (
                                    <p className="text-xs text-amber-200/80 mb-1 border-t border-blue-500/30 pt-1 mt-1">
                                        + 10% Servicio ({ (totalUsd * 0.1).toFixed(2) } USD)
                                    </p>
                                )}
                                {deliveryFee && (
                                    <p className="text-xs text-amber-200/80 mb-1 border-t border-blue-500/30 pt-1 mt-1">
                                        + Delivery ({deliveryFee.toFixed(2)} USD)
                                    </p>
                                )}
                                <p className="text-2xl font-black text-blue-300 mt-2">
                                    { (
                                        usdToBs(totalUsd + (hasServiceFee ? totalUsd * 0.1 : 0) + (deliveryFee || 0), effectiveRate)
                                    ).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) } Bs
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
