/**
 * Utilidades de conversión USD <-> Bolívares
 * Fuente: BCV - https://www.bcv.org.ve/
 * Los fines de semana se usa la tasa oficial del lunes anterior
 */

export function usdToBs(usd: number, rate: number): number {
    const roundedRate = Math.round(rate * 100) / 100;
    return Math.round(usd * roundedRate * 100) / 100;
}

export function formatBs(value: number): string {
    return new Intl.NumberFormat('es-VE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value) + ' Bs';
}

export function formatUsd(value: number): string {
    return '$' + value.toFixed(2);
}

export function formatDualCurrency(usd: number, rate: number): string {
    const bs = usdToBs(usd, rate);
    return `${formatUsd(usd)} (${formatBs(bs)})`;
}
