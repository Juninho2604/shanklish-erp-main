"use client";

import { useEffect, useState } from "react";
import {
    getActiveWaitersAction,
    validateWaiterPinAction,
} from "@/app/actions/waiter.actions";

export interface ActiveWaiter {
    id: string;
    firstName: string;
    lastName: string;
    isCaptain: boolean;
}

interface WaiterSummary {
    id: string;
    firstName: string;
    lastName: string;
    hasPin: boolean;
}

const AVATAR_PALETTE = [
    "bg-emerald-500/20 text-emerald-300",
    "bg-amber-500/20 text-amber-300",
    "bg-sky-500/20 text-sky-300",
    "bg-rose-500/20 text-rose-300",
    "bg-violet-500/20 text-violet-300",
    "bg-teal-500/20 text-teal-300",
    "bg-orange-500/20 text-orange-300",
    "bg-fuchsia-500/20 text-fuchsia-300",
];

function paletteFor(id: string) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
    return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function initialsOf(first: string, last: string) {
    return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

export function WaiterIdentification({
    onIdentified,
}: {
    onIdentified: (waiter: ActiveWaiter) => void;
}) {
    const [waiters, setWaiters] = useState<WaiterSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [pin, setPin] = useState("");
    const [error, setError] = useState("");
    const [isValidating, setIsValidating] = useState(false);

    useEffect(() => {
        (async () => {
            const res = await getActiveWaitersAction();
            if (res.success) setWaiters(res.data as WaiterSummary[]);
            setIsLoading(false);
        })();
    }, []);

    const handleDigit = (d: string) => {
        if (pin.length >= 6 || isValidating) return;
        setError("");
        setPin((p) => p + d);
    };
    const handleDelete = () => {
        if (isValidating) return;
        setError("");
        setPin((p) => p.slice(0, -1));
    };
    const handleClear = () => {
        if (isValidating) return;
        setError("");
        setPin("");
    };

    const handleValidate = async () => {
        if (pin.length < 4) {
            setError("El PIN debe tener al menos 4 dígitos");
            return;
        }
        setIsValidating(true);
        setError("");
        try {
            const res = await validateWaiterPinAction(pin);
            if (res.success && res.data) {
                onIdentified({
                    id: res.data.waiterId,
                    firstName: res.data.firstName,
                    lastName: res.data.lastName,
                    isCaptain: res.data.isCaptain,
                });
            } else {
                setError(res.message || "PIN incorrecto");
                setPin("");
            }
        } finally {
            setIsValidating(false);
        }
    };

    // Teclado: Enter valida cuando el PIN tiene ≥ 4 dígitos
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key >= "0" && e.key <= "9") handleDigit(e.key);
            else if (e.key === "Backspace") handleDelete();
            else if (e.key === "Enter") handleValidate();
            else if (e.key === "Escape") handleClear();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pin, isValidating]);

    const waitersWithPin = waiters.filter((w) => w.hasPin);

    return (
        <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center px-4 py-6 overflow-y-auto">
            <div className="w-full max-w-4xl mx-auto flex flex-col items-center gap-6">
                {/* Header */}
                <div className="text-center">
                    <div className="text-5xl mb-3">🧑‍🍳</div>
                    <h1 className="text-3xl md:text-4xl font-black tracking-tight text-foreground">
                        ¿Quién eres?
                    </h1>
                    <p className="text-xs md:text-sm font-bold text-muted-foreground uppercase tracking-widest mt-2">
                        Introduce tu PIN para identificarte
                    </p>
                </div>

                {/* Avatares de mesoneros activos */}
                {isLoading ? (
                    <div className="text-muted-foreground text-sm">Cargando mesoneros…</div>
                ) : waitersWithPin.length === 0 ? (
                    <div className="bg-amber-900/20 border border-amber-500/30 rounded-2xl px-6 py-4 text-center max-w-md">
                        <p className="text-amber-400 text-sm font-bold">
                            Ningún mesonero tiene PIN configurado.
                        </p>
                        <p className="text-muted-foreground text-xs mt-1">
                            Solicita al administrador que asigne PINs desde el módulo Mesoneros.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3 max-w-2xl">
                        {waitersWithPin.map((w) => (
                            <div
                                key={w.id}
                                className="flex flex-col items-center gap-1.5 opacity-70"
                            >
                                <div
                                    className={`h-14 w-14 md:h-16 md:w-16 rounded-full flex items-center justify-center font-black text-lg md:text-xl ${paletteFor(
                                        w.id,
                                    )}`}
                                >
                                    {initialsOf(w.firstName, w.lastName)}
                                </div>
                                <p className="text-[10px] md:text-xs font-bold text-foreground/80 text-center leading-tight">
                                    {w.firstName}
                                </p>
                            </div>
                        ))}
                    </div>
                )}

                {/* PIN display */}
                <div className="flex gap-3 items-center justify-center mt-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div
                            key={i}
                            className={`h-4 w-4 md:h-5 md:w-5 rounded-full border-2 transition-all ${
                                pin.length > i
                                    ? "bg-emerald-400 border-emerald-400 scale-110"
                                    : "border-muted-foreground/40"
                            }`}
                        />
                    ))}
                </div>
                {error && (
                    <p className="text-red-400 text-sm font-bold -mt-2">{error}</p>
                )}

                {/* Numeric keypad */}
                <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                        <button
                            key={d}
                            onClick={() => handleDigit(d)}
                            disabled={isValidating}
                            className="h-16 rounded-2xl bg-secondary hover:bg-muted border border-border text-2xl font-black text-foreground transition active:scale-90 disabled:opacity-40"
                        >
                            {d}
                        </button>
                    ))}
                    <button
                        onClick={handleClear}
                        disabled={isValidating}
                        className="h-16 rounded-2xl bg-secondary/50 hover:bg-red-500/10 border border-border text-sm font-black text-red-400 transition active:scale-90 disabled:opacity-40"
                    >
                        Limpiar
                    </button>
                    <button
                        onClick={() => handleDigit("0")}
                        disabled={isValidating}
                        className="h-16 rounded-2xl bg-secondary hover:bg-muted border border-border text-2xl font-black text-foreground transition active:scale-90 disabled:opacity-40"
                    >
                        0
                    </button>
                    <button
                        onClick={handleDelete}
                        disabled={isValidating}
                        className="h-16 rounded-2xl bg-secondary/50 hover:bg-muted border border-border text-sm font-black text-muted-foreground transition active:scale-90 disabled:opacity-40"
                    >
                        ⌫
                    </button>
                </div>

                {/* Validate button */}
                <button
                    onClick={handleValidate}
                    disabled={pin.length < 4 || isValidating}
                    className="w-full max-w-xs py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-base tracking-wider uppercase transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/20"
                >
                    {isValidating ? "Validando…" : "Entrar"}
                </button>
            </div>
        </div>
    );
}
