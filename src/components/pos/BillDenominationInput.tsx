'use client';

import { useState, useEffect } from 'react';

const USD_BILLS = [100, 50, 20, 10, 5, 1] as const;

export interface DenominationMap {
    [key: number]: number; // bill value → count
    total: number;
}

interface Props {
    label?: string;
    onChange: (json: string, total: number) => void;
    initialJson?: string | null;
}

export function BillDenominationInput({ label = 'Desglose de Billetes', onChange, initialJson }: Props) {
    const initial = initialJson ? (() => {
        try { return JSON.parse(initialJson) as Record<string, number>; } catch { return {}; }
    })() : {};

    const [counts, setCounts] = useState<Record<number, string>>(() =>
        Object.fromEntries(USD_BILLS.map(b => [b, initial[b] != null ? String(initial[b]) : '']))
    );

    const total = USD_BILLS.reduce((sum, b) => sum + (parseInt(counts[b] || '0') || 0) * b, 0);

    useEffect(() => {
        const map: Record<string, number> = {};
        let hasAny = false;
        for (const b of USD_BILLS) {
            const n = parseInt(counts[b] || '0') || 0;
            if (n > 0) { map[b] = n; hasAny = true; }
        }
        if (hasAny) {
            map['total'] = total;
            onChange(JSON.stringify(map), total);
        } else {
            onChange('', 0);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [counts]);

    const update = (bill: number, value: string) => {
        setCounts(prev => ({ ...prev, [bill]: value }));
    };

    return (
        <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
            <div className="rounded-xl border border-border overflow-hidden bg-card">
                {USD_BILLS.map((bill, i) => {
                    const count = parseInt(counts[bill] || '0') || 0;
                    const subtotal = count * bill;
                    return (
                        <div
                            key={bill}
                            className={`flex items-center gap-3 px-3 py-2 text-sm ${i < USD_BILLS.length - 1 ? 'border-b border-border' : ''}`}
                        >
                            <span className="w-10 text-right font-bold text-foreground">${bill}</span>
                            <span className="text-muted-foreground text-xs">×</span>
                            <input
                                type="number"
                                min="0"
                                step="1"
                                value={counts[bill]}
                                onChange={e => update(bill, e.target.value)}
                                placeholder="0"
                                className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-center text-sm font-bold text-foreground focus:outline-none focus:border-primary"
                            />
                            <span className="text-muted-foreground text-xs flex-1">= </span>
                            <span className={`text-right font-mono text-sm ${subtotal > 0 ? 'text-foreground font-bold' : 'text-muted-foreground'}`}>
                                ${subtotal.toFixed(2)}
                            </span>
                        </div>
                    );
                })}
                <div className="flex items-center justify-between px-3 py-2 bg-primary/10 border-t-2 border-primary/30">
                    <span className="font-bold text-foreground text-sm uppercase tracking-wider">Total</span>
                    <span className="font-black text-lg text-primary font-mono">${total.toFixed(2)}</span>
                </div>
            </div>
        </div>
    );
}
