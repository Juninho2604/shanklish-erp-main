'use client';

import * as XLSX from 'xlsx';
import type { ZReportData } from '@/app/actions/sales.actions';

function formatMoney(amount: number) {
    return `$${amount.toFixed(2)}`;
}

/**
 * Exporta el Reporte Z (cierre de caja) a Excel para arqueo manual.
 * Formato: Concepto | Monto USD
 */
export function exportZReportToExcel(zReport: ZReportData) {
    const rows: [string, string][] = [
        ['SHANKLISH CARACAS - CIERRE DE CAJA', ''],
        ['Fecha', zReport.period],
        ['', ''],
        ['RESUMEN DE VENTAS', ''],
        ['Ventas brutas', formatMoney(zReport.grossTotal)],
        ['(-) Descuentos', `-${formatMoney(zReport.totalDiscounts)}`],
        ['  Divisas (33%)', zReport.discountBreakdown.divisas > 0 ? `-${formatMoney(zReport.discountBreakdown.divisas)}` : '-'],
        ['  Cortesías', zReport.discountBreakdown.cortesias > 0 ? `-${formatMoney(zReport.discountBreakdown.cortesias)}` : '-'],
        ['  Otros', zReport.discountBreakdown.other > 0 ? `-${formatMoney(zReport.discountBreakdown.other)}` : '-'],
        ['VENTA NETA', formatMoney(zReport.netTotal)],
        ['', ''],
        ['ARQUEO DE CAJA', ''],
        ['PUNTO (Bs)', formatMoney(zReport.paymentBreakdown.card)],
        ['ZELLE', formatMoney(zReport.paymentBreakdown.zelle)],
        ['EFECTIVO USD', formatMoney(zReport.paymentBreakdown.cash)],
        ['PAGO MÓVIL', formatMoney(zReport.paymentBreakdown.mobile)],
        ['TRANSFERENCIA', formatMoney(zReport.paymentBreakdown.transfer)],
        ['Otros', formatMoney(zReport.paymentBreakdown.other)],
        ['', ''],
        ['TOTAL PEDIDOS', String(zReport.totalOrders)],
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 25 }, { wch: 15 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cierre de Caja');

    const fileName = `Cierre_Caja_${zReport.period.replace(/\//g, '-')}.xlsx`;
    XLSX.writeFile(wb, fileName);
}
