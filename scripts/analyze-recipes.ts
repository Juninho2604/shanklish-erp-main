
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const folderPath = path.join(process.env.USERPROFILE || 'C:\\Users\\Shanklish Laptop 1', 'Desktop');
const filename = "RECETAS SHANKLISH .xlsx";

function analyzeRecipes() {
    const fullPath = path.join(folderPath, filename);
    if (!fs.existsSync(fullPath)) {
        console.log(`❌ Archivo no encontrado: ${filename}`);
        return;
    }

    try {
        const workbook = XLSX.readFile(fullPath);
        console.log(`📂 Archivo leído. Hojas encontradas: ${workbook.SheetNames.join(', ')}`);

        // Analyze first 3 sheets
        workbook.SheetNames.slice(0, 3).forEach(sheetName => {
            console.log(`\n--- HOJA: ${sheetName} ---`);
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

            // Print first 20 rows to see structure
            data.slice(0, 20).forEach((row: any, index) => {
                if (row.some((c: any) => c !== '')) { // Only print non-empty rows
                    console.log(`Row ${index}:`, JSON.stringify(row));
                }
            });
        });

    } catch (error) {
        console.error(`Error leyendo ${filename}:`, error);
    }
}

analyzeRecipes();
