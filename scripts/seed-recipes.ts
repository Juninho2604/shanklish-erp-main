
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const folderPath = path.join(process.env.USERPROFILE || 'C:\\Users\\Shanklish Laptop 1', 'Desktop');
const filename = "RECETAS SHANKLISH .xlsx";

// Helper for Fuzzy Matching
function normalize(str: string): string {
    return str.toLowerCase().trim().replace(/\s+/g, ' ').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function levenshteinDistance(a: string, b: string): number {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) == a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

async function findItem(name: string, allItems: { id: string, name: string, normalizedName: string }[]) {
    const target = normalize(name);
    // 1. Exact match (normalized)
    const exact = allItems.find(i => i.normalizedName === target);
    if (exact) return exact;

    // 2. Contains match
    // const contains = allItems.find(i => i.normalizedName.includes(target) || target.includes(i.normalizedName));
    // if (contains) return contains;

    // 3. Fuzzy
    let bestDist = Infinity;
    let bestItem = null;
    const maxDist = 4; // Tolerance

    for (const item of allItems) {
        const dist = levenshteinDistance(target, item.normalizedName);
        if (dist < bestDist && dist <= maxDist) {
            bestDist = dist;
            bestItem = item;
        }
    }
    return bestItem;
}

function parseQuantity(raw: any): { qty: number, unit: string } {
    if (!raw) return { qty: 0, unit: 'UND' };
    const str = raw.toString().toLowerCase().trim();

    // Extract numbers
    const numMatch = str.match(/[\d\.]+/);
    const qty = numMatch ? parseFloat(numMatch[0]) : 0;

    // Extract unit
    let unit = 'UND';
    if (str.includes('kg') || str.includes('kilo')) unit = 'KG';
    else if (str.includes('gr') || str.includes('gramo')) unit = 'GR';
    else if (str.includes('lts') || str.includes('litro')) unit = 'LTS';
    else if (str.includes('ml')) unit = 'ML';
    else if (str.includes('oz')) unit = 'OZ';
    else if (str.includes('lb')) unit = 'LB';

    return { qty, unit };
}

async function main() {
    const fullPath = path.join(folderPath, filename);
    if (!fs.existsSync(fullPath)) {
        console.error(`❌ Archivo no encontrado: ${filename}`);
        return;
    }

    console.log('🔄 Cargando inventario para comparar...');
    const dbItems = await prisma.inventoryItem.findMany({
        select: { id: true, name: true }
    });
    const allItems = dbItems.map(i => ({ ...i, normalizedName: normalize(i.name) }));
    console.log(`✅ ${allItems.length} items en memoria.`);

    const owner = await prisma.user.findFirst();
    if (!owner) {
        console.error('❌ No se encontró ningún usuario en la base de datos. Crea uno primero.');
        return;
    }
    const userId = owner.id;

    const workbook = XLSX.readFile(fullPath);

    // Sheets to process (Standard format)
    // We try to process ALL sheets, but skip if format doesn't match
    for (const sheetName of workbook.SheetNames) {
        console.log(`\n📄 Procesando hoja: ${sheetName}`);

        // Skip "ARMADO" for now if it's too complex, or try to parse?
        if (sheetName.toUpperCase().includes('ARMADO')) {
            console.log('⚠️ Saltando hoja ARMADO (Formato complejo matriz).');
            continue;
        }

        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });

        let currentRecipeName = '';
        let currentIngredients: any[] = [];
        let processingIngredients = false;

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const col0 = row[0]?.toString().trim();

            // 1. Detect Recipe Start
            if (col0 === 'NOMBRE DE LA RECETA') {
                // If we were building one, save it first
                if (currentRecipeName && currentIngredients.length > 0) {
                    await saveRecipe(currentRecipeName, sheetName, currentIngredients, allItems, userId);
                }

                // Start new
                currentRecipeName = row[1]?.toString().trim();
                currentIngredients = [];
                processingIngredients = false;
                // console.log(`   🔸 Detectada Receta: ${currentRecipeName}`);
                continue;
            }

            // 2. Detect Ingredient Block Start
            if (col0 === 'INGREDIENTES') {
                processingIngredients = true;
                continue;
            }

            // 3. Process Ingredients
            if (processingIngredients && currentRecipeName && col0) {
                // Heuristic: Stop if we hit a known non-ingredient row (like "PREPARACION" in col0 if it shifts?)
                // Or if col1 is empty? 
                // In logs: Row 2: ["BOLA SHANKLISH ","250 GR ",...]
                // So valid ingredient has Name (0) and Qty (1)

                const rawQty = row[1];
                if (!rawQty && rawQty !== 0) continue; // Skip header repetition or empty lines

                const { qty, unit } = parseQuantity(rawQty);
                if (qty > 0) {
                    currentIngredients.push({
                        name: col0,
                        qty,
                        unit,
                        original: rawQty
                    });
                }
            }
        }

        // Save last one
        if (currentRecipeName && currentIngredients.length > 0) {
            await saveRecipe(currentRecipeName, sheetName, currentIngredients, allItems, userId);
        }
    }
}

async function saveRecipe(name: string, category: string, ingredients: any[], allItems: any[], userId: string) {
    if (!name) return;

    // console.log(`💾 Guardando Receta: ${name} (${ingredients.length} ings)`);

    try {
        // 1. Create/Update Output Item (The Recipe Product)
        // Check if exists
        let outputItem = await findItem(name, allItems);

        if (!outputItem) {
            // Create new Item
            // console.log(`   ✨ Creando Item para Receta: ${name}`);
            const sku = `REC-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
            const newItem = await prisma.inventoryItem.create({
                data: {
                    name: name,
                    sku: sku,
                    category: category,
                    type: 'PRODUCT', // Assume Product
                    baseUnit: 'UND',
                    isActive: true
                }
            });
            outputItem = { ...newItem, normalizedName: normalize(newItem.name) };
            allItems.push(outputItem); // Add to cache
        }

        // 2. Create Recipe
        // First delete existing recipe for this item if any (to update)
        const existingRecipe = await prisma.recipe.findFirst({ where: { outputItemId: outputItem.id } });

        let recipeId = existingRecipe?.id;

        if (existingRecipe) {
            // Update
            await prisma.recipe.update({
                where: { id: recipeId },
                data: {
                    name: name,
                    description: `Importado de Excel hoja ${category}`,
                    isActive: true
                }
            });
            // Clear ingredients to reload
            await prisma.recipeIngredient.deleteMany({ where: { recipeId } });
        } else {
            // Create
            const newRecipe = await prisma.recipe.create({
                data: {
                    name: name,
                    outputItemId: outputItem.id,
                    description: `Importado de Excel hoja ${category}`,
                    outputQuantity: 1,
                    outputUnit: 'UND'
                }
            });
            recipeId = newRecipe.id;
        }

        // 3. Add Ingredients (Consolidated)
        const ingredientMap = new Map<string, { qty: number, unit: string }>();

        for (const ing of ingredients) {
            const itemMatch = await findItem(ing.name, allItems);
            if (itemMatch) {
                const existing = ingredientMap.get(itemMatch.id);
                if (existing) {
                    existing.qty += ing.qty; // Sum quantity
                } else {
                    ingredientMap.set(itemMatch.id, { qty: ing.qty, unit: ing.unit });
                }
            } else {
                console.log(`   ⚠️ Ingrediente NO encontrado en BD: ${ing.name} (para receta ${name})`);
            }
        }

        for (const [itemId, data] of ingredientMap.entries()) {
            await prisma.recipeIngredient.create({
                data: {
                    recipeId: recipeId!,
                    ingredientItemId: itemId,
                    quantity: data.qty,
                    unit: data.unit
                }
            });
        }

        console.log(`   ✅ Receta Procesada: ${name}`);

    } catch (e: any) {
        console.error(`   ❌ Error guardando receta ${name}:`, e.message);
    }
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
