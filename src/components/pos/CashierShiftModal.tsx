'use client';

import { useRef, useState, useEffect } from 'react';

const STORAGE_KEY = 'shanklish_cashier_shift';

function getTodayStr() {
    return new Date().toISOString().slice(0, 10);
}

function loadStoredShift(): { date: string; cashierName: string } | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as { date: string; cashierName: string };
    } catch {
        return null;
    }
}

function saveShift(cashierName: string) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: getTodayStr(), cashierName }));
}

interface CashierShiftModalProps {
    onShiftOpen: (name: string) => void;
    /** Si true, fuerza mostrar el modal (ej. al hacer "Cambiar cajera") */
    forceOpen?: boolean;
}

export function CashierShiftModal({ onShiftOpen, forceOpen = false }: CashierShiftModalProps) {
    const [name, setName] = useState('');
    const [isVisible, setIsVisible] = useState(false);
    const onShiftOpenRef = useRef(onShiftOpen);
    onShiftOpenRef.current = onShiftOpen;

    useEffect(() => {
        if (forceOpen) {
            setIsVisible(true);
            return;
        }
        const stored = loadStoredShift();
        const today = getTodayStr();
        if (stored && stored.date === today && stored.cashierName) {
            onShiftOpenRef.current(stored.cashierName);
        } else {
            setIsVisible(true);
        }
    }, [forceOpen]);

    const handleOpen = () => {
        if (!name.trim()) return;
        saveShift(name.trim());
        setIsVisible(false);
        onShiftOpenRef.current(name.trim());
    };

    if (!isVisible) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl shadow-2xl w-full max-w-sm text-white">
                <div className="text-center mb-6">
                    <div className="text-4xl mb-2">👩🏻‍💻</div>
                    <h2 className="text-xl font-black">Apertura de Caja</h2>
                    <p className="text-sm text-slate-400">
                        {forceOpen ? 'Cambio de cajera' : 'Ingresa tu nombre para iniciar el turno (una vez al día)'}
                    </p>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">Nombre de Cajera</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleOpen()}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-lg font-bold text-white focus:outline-none focus:border-amber-500 transition"
                            placeholder="Ej: María Pérez"
                            autoFocus
                        />
                    </div>

                    <button
                        onClick={handleOpen}
                        disabled={!name.trim()}
                        className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 py-3 rounded-xl font-black text-lg transition disabled:opacity-50"
                    >
                        {forceOpen ? 'Cambiar Cajera →' : 'Abrir Turno →'}
                    </button>
                </div>
            </div>
        </div>
    );
}
