import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('es-VE', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

export function formatNumber(value: number, decimals: number = 2): string {
    return new Intl.NumberFormat('es-VE', {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals,
    }).format(value);
}

export function formatDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('es-VE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    }).format(d);
}

export function formatDateTime(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('es-VE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(d);
}

export function getStockStatus(current: number, minimum: number, reorderPoint?: number): {
    status: 'critical' | 'warning' | 'ok';
    label: string;
    percentage: number;
} {
    const percentage = minimum > 0 ? (current / minimum) * 100 : 100;

    if (current <= 0) {
        return { status: 'critical', label: 'Sin stock', percentage: 0 };
    }

    if (current < minimum) {
        return { status: 'critical', label: 'Stock crítico', percentage };
    }

    if (reorderPoint && current <= reorderPoint) {
        return { status: 'warning', label: 'Reabastecer', percentage };
    }

    return { status: 'ok', label: 'OK', percentage: Math.min(percentage, 100) };
}
