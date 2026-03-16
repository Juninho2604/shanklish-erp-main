'use client';

import * as XLSX from 'xlsx';
import type { ArqueoSaleRow } from '@/app/actions/sales.actions';

/**
 * Columnas del Excel de arqueo (0-based):
 * A=0: Item, B=1: Descripción, C=2: Correlativo, D=3: Total Ingreso $, E=4: Total Gasto $
 * F=5: Cash Dólares Ingreso, G=6: Cash Dólares Egreso
 * H=7: Cash Euros Ingreso $, I=8: Cash Euros Egreso $
 * J=9: Cash Bs Ingreso $, K=10: Cash Bs Egreso $
 * L=11: Zelle $, M=12: Vuelto PM Bs, N=13: Vuelto PM $
 * O=14: Pago Móvil Bs SHANKLISH, P=15: Pago Móvil $ SHANKLISH
 * Q=16: Pago Móvil Bs NOUR, R=17: Pago Móvil $ NOUR
 * S=18: PDV Shanklish Bs, T=19: PDV Shanklish $
 * U=20: PDV Superferro Bs, V=21: PDV Superferro $
 * W=22: SERVICIO 10%, X=23: PROPINA EXTRA
 */
const COLS = {
    item: 0,
    descripcion: 1,
    correlativo: 2,
    totalIngreso: 3,
    totalGasto: 4,
    cashUsdIngreso: 5,
    cashUsdEgreso: 6,
    cashEurIngreso: 7,
    cashEurEgreso: 8,
    cashBsIngreso: 9,
    cashBsEgreso: 10,
    zelle: 11,
    vueltoPmBs: 12,
    vueltoPmUsd: 13,
    pmShanklishBs: 14,
    pmShanklishUsd: 15,
    pmNourBs: 16,
    pmNourUsd: 17,
    pdvShanklishBs: 18,
    pdvShanklishUsd: 19,
    pdvSuperferroBs: 20,
    pdvSuperferroUsd: 21,
    servicio10: 22,
    propinaExtra: 23,
};

function emptyRow(): (string | number)[] {
    return Array(24).fill('');
}

function buildHeaderRows(dateStr: string): (string | number)[][] {
    return [
        ['ARQUEO RESTAURANTE, PICKUP Y DELIVERY SHANKLISH', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['TOTALES', '', '', '', '', 'CASH DÓLARES ($) CAJA FUERTE', '', '', 'CASH EUROS (€) CAJA FUERTE', '', '', 'CASH BOLÍVARES (BS) CAJA FUERTE', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['Capital Dólares ($) Inicio Cash', '', 'Cash Dólares ($) Ingreso ', 'Cash Dólares ($) Egreso', 'Capital Dólares ($) Cerrado Cash', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['Capital Euro Inicio', '', 'Cash Euros (€) Ingreso', 'Cash Euros (€) Egreso', 'Capital Euros (€) Cerrado Cash', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['Capital Bolívares (Bs) en $ Inicio', '', 'Cash Bolívares (Bs) Ingreso en $', 'Cash Bolívares (Bs) Egresos en $', 'Capital Bolívares (Bs) en $ Cerrado Cash ', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['Vuelto PM en Bs', '', 'Vuelto PM en $', 'Pago Movil (Bs) SHANKLISH ', 'Pago Móvil  ($) SHANKLISH', '', 'Total $', '', '', 'Total $', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', 'Cuadre:', '', '', 'Cuadre:', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['PDV Provincial Shanklish en Bs', '', 'PDV Provincial Shanklish (EN $)', 'PDV Provincial Superferro SC en Bs', 'PDV Provincial Superferro SC ($)', 'Zelle  (EN $)', '', 'PROPINA', 'EXTRA', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['', 'TOTAL INGRESO $', '', 'TOTAL GASTO', '', 'PM (Bs) NOUR', 'PM ($) NOUR', 'PEDIDOS YA', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['Item ', 'Descripción/Nombre', 'Correlativo', 'Total Ingreso $', 'Total Gasto $', 'Cash Dólares ($) Ingreso ', 'Cash Dólares ($) Egreso', 'Cash Euros (€) Ingreso (EN $)', 'Cash Euros (€) Egreso (EN $)', 'Cash Bolívares (Bs) Ingreso (EN $)', 'Cash Bolívares (Bs) Egresos (EN $)', 'Zelle (EN $)', 'Vuelto PM en Bs', 'Vuelto PM (EN $)', 'Pago Movil Bs SHANLISH ', 'Pago Móvil (EN $) SHANKLISH', 'Pago Movil Bs NOUR', 'Pago Móvil (EN $) NOUR', 'PDV Provincial Shanklish en Bs', 'PDV Provincial Shanklish (EN $)', 'PDV Provincial Superferro SC en Bs', 'PDV Provincial Superferro SC (EN $)', 'SERVICIO 10%', 'PROPINA EXTRA'],
    ];
}

export function exportArqueoToExcel(sales: ArqueoSaleRow[], dateStr: string) {
    const rows: (string | number)[][] = buildHeaderRows(dateStr);

    sales.forEach((sale, idx) => {
        const row = emptyRow();
        row[COLS.item] = idx + 1;
        row[COLS.descripcion] = sale.description;
        row[COLS.correlativo] = sale.correlativo;
        row[COLS.totalIngreso] = sale.total;
        row[COLS.cashUsdIngreso] = sale.paymentBreakdown.cashUsd || '';
        row[COLS.zelle] = sale.paymentBreakdown.zelle || '';
        row[COLS.pdvShanklishUsd] = sale.paymentBreakdown.cardPdVShanklish || '';
        row[COLS.pdvSuperferroUsd] = sale.paymentBreakdown.cardPdVSuperferro || '';
        row[COLS.pmShanklishUsd] = sale.paymentBreakdown.mobileShanklish || '';
        row[COLS.pmNourUsd] = sale.paymentBreakdown.mobileNour || '';
        row[COLS.servicio10] = sale.serviceFee > 0 ? sale.serviceFee : '';
        rows.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
        { wch: 5 }, { wch: 35 }, { wch: 18 }, { wch: 12 }, { wch: 12 },
        { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
        { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 10 }, { wch: 10 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Restaurante');
    const fileName = `Arqueo_Caja_Shanklish_${dateStr.replace(/\//g, '-')}.xlsx`;
    XLSX.writeFile(wb, fileName);
}
