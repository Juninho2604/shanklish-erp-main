/**
 * Rellena la plantilla Excel de arqueo con los datos de ventas.
 * Preserva el formato, colores y estructura original de la plantilla.
 * La plantilla debe estar en: public/templates/arqueo-plantilla.xlsx
 */
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import type { ArqueoSaleRow } from '@/app/actions/sales.actions';

const DATA_START_ROW = 16;
const COLS = {
    item: 1,           // A
    descripcion: 2,    // B
    correlativo: 3,    // C
    totalIngreso: 4,   // D
    totalGasto: 5,     // E
    cashUsdIngreso: 6, // F
    cashUsdEgreso: 7,  // G
    zelle: 12,         // L
    pdvShanklishUsd: 20,   // T
    pdvSuperferroUsd: 22,  // V
    pmShanklishUsd: 16,   // P
    pmNourUsd: 18,        // R
    servicio10: 23,       // W
    propinaExtra: 24,     // X
};

function getTemplatePath(): string {
    return path.join(process.cwd(), 'public', 'templates', 'arqueo-plantilla.xlsx');
}

export async function buildArqueoWorkbookFromTemplate(sales: ArqueoSaleRow[]): Promise<ExcelJS.Buffer> {
    const templatePath = getTemplatePath();
    if (!fs.existsSync(templatePath)) {
        throw new Error('No se encontró la plantilla de arqueo. Coloque el archivo en public/templates/arqueo-plantilla.xlsx');
    }
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);

    const sheet = workbook.getWorksheet('Restaurante');
    if (!sheet) {
        throw new Error('La plantilla no contiene la hoja "Restaurante"');
    }

    sales.forEach((sale, idx) => {
        const rowNum = DATA_START_ROW + idx;
        const row = sheet.getRow(rowNum);

        row.getCell(COLS.item).value = idx + 1;
        row.getCell(COLS.descripcion).value = sale.description;
        row.getCell(COLS.correlativo).value = sale.correlativo;
        row.getCell(COLS.totalIngreso).value = sale.total;
        row.getCell(COLS.cashUsdIngreso).value = sale.paymentBreakdown.cashUsd || null;
        row.getCell(COLS.zelle).value = sale.paymentBreakdown.zelle || null;
        row.getCell(COLS.pdvShanklishUsd).value = sale.paymentBreakdown.cardPdVShanklish || null;
        row.getCell(COLS.pdvSuperferroUsd).value = sale.paymentBreakdown.cardPdVSuperferro || null;
        row.getCell(COLS.pmShanklishUsd).value = sale.paymentBreakdown.mobileShanklish || null;
        row.getCell(COLS.pmNourUsd).value = sale.paymentBreakdown.mobileNour || null;
        row.getCell(COLS.servicio10).value = sale.serviceFee > 0 ? sale.serviceFee : null;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as ExcelJS.Buffer;
}

export function getArqueoFileName(dateStr: string): string {
    return `Arqueo_Caja_Shanklish_${dateStr.replace(/\//g, '-')}.xlsx`;
}
