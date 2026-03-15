'use client';

import { usdToBs, formatBs, formatUsd } from '@/lib/currency';

interface PriceDisplayProps {
    usd: number;
    rate: number | null;
    size?: 'sm' | 'md' | 'lg';
    showBsOnly?: boolean;
    showBs?: boolean; // false = solo USD (para nota de entrega)
}

export function PriceDisplay({ usd, rate, size = 'md', showBsOnly, showBs = true }: PriceDisplayProps) {
    const sizeClass = {
        sm: 'text-xs',
        md: 'text-sm',
        lg: 'text-2xl',
    }[size];

    if (rate == null || rate <= 0) {
        return <span className={sizeClass}>${usd.toFixed(2)}</span>;
    }

    const bs = usdToBs(usd, rate);

    if (showBsOnly) {
        return <span className={sizeClass}>{formatBs(bs)}</span>;
    }

    if (!showBs) {
        return <span className={sizeClass}>${usd.toFixed(2)}</span>;
    }

    return (
        <span className={`${sizeClass} inline-flex flex-col leading-tight`}>
            <span>${usd.toFixed(2)}</span>
            <span className="text-slate-400 text-[0.6em] font-normal">{formatBs(bs)}</span>
        </span>
    );
}
