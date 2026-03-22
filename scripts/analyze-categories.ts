
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const folderPath = path.join(process.env.USERPROFILE || 'C:\\Users\\Shanklish Laptop 1', 'Desktop', 'GERENCIA OPERATIVA PLANILLAS');
const filename = "ORDEN DE COMPRA NO TOCAR.xlsx";

function analyzeFile() {
    const fullPath = path.join(folderPath, filename);
    if (!fs.existsSync(fullPath)) {
        console.log(`❌ Archivo no encontrado: ${filename}`);
        return;
    }

    try {
        const workbook = XLSX.readFile(fullPath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Use a larger range to capture multiple categories
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: 0, defval: '' });

        console.log(`\n--- ANALIZANDO ESTRUCTURA DE CATEGORÍAS ---`);
        let currentCategory = 'NINGUNA';

        // Scan first 100 rows to detect patterns
        data.slice(0, 100).forEach((row: any, index) => {
            // Heuristic: If row has "CATEGORIA" in first column, maybe the second column is the category name?
            // Or maybe it's a section header?

            // Check if it's a category header row
            if (row[0] && row[0].toString().toUpperCase().includes('CATEGORIA')) {
                console.log(`Row ${index} [HEADER]:`, JSON.stringify(row));
            } else if (row[0] && !row[1] && !row[2]) {
                // Possible Section Title?
                console.log(`Row ${index} [POSSIBLE TITLE]:`, JSON.stringify(row));
            } else if (row[0]) {
                console.log(`Row ${index} [ITEM?]: ${row[0]} | Stock: ${row[1]}`);
            }
        });

    } catch (error) {
        console.error(`Error leyendo ${filename}:`, error);
    }
}

analyzeFile();
