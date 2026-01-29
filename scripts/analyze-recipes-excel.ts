/**
 * ANÁLISIS DE ARCHIVO DE RECETAS
 * 
 * Lee el archivo Excel de recetas y muestra su estructura
 * para entender cómo importarlo a la base de datos.
 * 
 * Ejecutar: npx tsx scripts/analyze-recipes-excel.ts
 */

import * as XLSX from 'xlsx';
import * as path from 'path';

const EXCEL_PATH = path.join('C:', 'Users', 'Shanklish Laptop 1', 'Desktop', 'RECETAS SHANKLISH .xlsx');

async function main() {
    console.log('📊 ANÁLISIS DE ARCHIVO DE RECETAS');
    console.log('='.repeat(60));
    console.log(`Archivo: ${EXCEL_PATH}\n`);

    // Leer el archivo
    const workbook = XLSX.readFile(EXCEL_PATH);

    console.log(`📑 Hojas encontradas: ${workbook.SheetNames.length}`);
    workbook.SheetNames.forEach((name, idx) => {
        console.log(`   ${idx + 1}. ${name}`);
    });
    console.log('');

    // Analizar cada hoja
    for (const sheetName of workbook.SheetNames) {
        console.log('='.repeat(60));
        console.log(`📋 HOJA: "${sheetName}"`);
        console.log('='.repeat(60));

        const worksheet = workbook.Sheets[sheetName];

        // Convertir a JSON para ver estructura
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        // Mostrar las primeras 30 filas
        const maxRows = Math.min(jsonData.length, 30);
        console.log(`Filas totales: ${jsonData.length}`);
        console.log(`\nPrimeras ${maxRows} filas:\n`);

        for (let i = 0; i < maxRows; i++) {
            const row = jsonData[i] as any[];
            if (row && row.length > 0) {
                // Formatear la fila para mejor visualización
                const formattedRow = row.map((cell, idx) => {
                    if (cell === undefined || cell === null) return '';
                    if (typeof cell === 'number') return cell.toFixed(2);
                    return String(cell).substring(0, 30); // Truncar strings largos
                });
                console.log(`[${i + 1}] ${formattedRow.join(' | ')}`);
            }
        }

        console.log('\n');
    }
}

main().catch(console.error);
