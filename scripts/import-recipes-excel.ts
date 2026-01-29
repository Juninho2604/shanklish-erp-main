/**
 * IMPORTACIÓN DE RECETAS DESDE EXCEL
 * 
 * Parsea el archivo de recetas y las inserta en la base de datos.
 * Vincula ingredientes con items de inventario existentes.
 * 
 * Ejecutar: npx tsx scripts/import-recipes-excel.ts
 */

import * as XLSX from 'xlsx';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EXCEL_PATH = path.join('C:', 'Users', 'Shanklish Laptop 1', 'Desktop', 'RECETAS SHANKLISH .xlsx');

// Mapa de normalización de nombres de ingredientes a SKUs del inventario
const INGREDIENT_MAP: Record<string, string> = {
    'GARBANZO SANCOCHADO': 'GARBANZO',
    'GARBANZO': 'GARBANZO',
    'ZUMO DE LIMON': 'LIMON',
    'LIMON': 'LIMON',
    'SAL DE LIMON': 'SAL-LIMON',
    'SAL': 'SAL',
    'AJO GRANDE': 'AJO',
    'AJO': 'AJO',
    'ACEITE VEG': 'ACEITE-VEG',
    'AC NORMAL': 'ACEITE-VEG',
    'TAHINI': 'TAHINI',
    'BERENJENA ASADA': 'BERENJENA',
    'BERENJENA': 'BERENJENA',
    'AC OLIVA': 'ACEITE-OLIVA',
    'ACEITE OLIVA': 'ACEITE-OLIVA',
    'PIMENTON LIQUIDO': 'PIMENTON',
    'AZUCAR': 'AZUCAR',
    'PAN RALLADO': 'PAN-RALLADO',
    'COMINO': 'COMINO',
    'BOLA SHANKLISH': 'SHANKLISH-BOLA',
    'BOLA DE SHANKLISH': 'SHANKLISH-BOLA',
    'TOMATE': 'TOMATE',
    'CEBOLLA BLANCA': 'CEBOLLA',
    'CEBOLLA MORADA': 'CEBOLLA-MORADA',
    'PICANTE EN POLVO': 'PICANTE-POLVO',
    'TOMATE SECO': 'TOMATE-SECO',
    'PEREJIL': 'PEREJIL',
    'PESTO': 'PESTO',
    'MEREY FRITO': 'MEREY',
    'MIEL': 'MIEL',
    'PAN': 'PAN-ARABE',
    'CREMA AJO': 'CREMA-AJO',
    'TABULE': 'TABULE',
    'VEGETALES SALTEADOS': 'VEGETALES-SALTEADOS',
    'FALAFEL': 'FALAFEL',
    'KIBBE FRITO': 'KIBBE-FRITO',
    'POLLO': 'POLLO-SHAWARMA',
    'CARNE': 'CARNE-SHAWARMA',
    'BICARBONATO': 'BICARBONATO',
    'AGUA': 'AGUA',
    'AGUA POTABLE': 'AGUA',
    'LECHE EN POLVO': 'LECHE-POLVO',
    'YOGURT MADRE': 'YOGURT',
    'ZAATAR': 'ZAATAR',
    'CREMA AJONJOLI': 'TAHINI',
};

interface ParsedRecipe {
    name: string;
    category: string;
    ingredients: {
        name: string;
        quantity: number;
        unit: string;
        detail?: string;
    }[];
    preparation?: string;
    outputQuantity?: number;
    outputUnit?: string;
}

function parseQuantity(raw: string | number | undefined): { quantity: number; unit: string } {
    if (!raw) return { quantity: 0, unit: 'UNIT' };

    const str = String(raw).toUpperCase().trim();

    // Patrones comunes: "4 KG", "20 GR", "600 ML", "1,5 KG", "1 CUCH GRANDE"
    const match = str.match(/^([\d.,]+)\s*(.*)$/);
    if (match) {
        const qty = parseFloat(match[1].replace(',', '.'));
        let unit = match[2].trim() || 'UNIT';

        // Normalizar unidades
        if (unit.includes('KG')) unit = 'KG';
        else if (unit.includes('GR') || unit.includes('G')) unit = 'G';
        else if (unit.includes('ML')) unit = 'ML';
        else if (unit.includes('L')) unit = 'L';
        else if (unit.includes('CUCH')) unit = 'CUCH'; // Cucharada
        else if (unit.includes('UND') || unit.includes('UN')) unit = 'UNIT';

        return { quantity: qty, unit };
    }

    return { quantity: 1, unit: 'UNIT' };
}

function parseRecipeSheet(worksheet: XLSX.WorkSheet, category: string): ParsedRecipe[] {
    const recipes: ParsedRecipe[] = [];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

    let currentRecipe: ParsedRecipe | null = null;

    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.length === 0) continue;

        const firstCell = String(row[0] || '').toUpperCase().trim();
        const secondCell = String(row[1] || '').trim();

        // Detectar inicio de nueva receta
        if (firstCell.includes('NOMBRE DE LA RECETA') || firstCell.includes('NOMBRE DE LA SUBRECETA')) {
            // Guardar receta anterior si existe
            if (currentRecipe && currentRecipe.ingredients.length > 0) {
                recipes.push(currentRecipe);
            }

            // Iniciar nueva receta
            currentRecipe = {
                name: secondCell,
                category,
                ingredients: [],
                preparation: ''
            };
            continue;
        }

        // Detectar fila de encabezados (INGREDIENTES | CANTIDAD | ...)
        if (firstCell === 'INGREDIENTES') {
            continue;
        }

        // Si hay una receta activa, agregar ingrediente
        if (currentRecipe && firstCell && !firstCell.includes('NOMBRE')) {
            const { quantity, unit } = parseQuantity(row[1]);

            if (quantity > 0 || firstCell.length > 2) {
                currentRecipe.ingredients.push({
                    name: firstCell,
                    quantity: quantity || 1,
                    unit: unit || 'UNIT',
                    detail: String(row[2] || '').trim()
                });
            }

            // Capturar preparación si existe
            if (row[3]) {
                currentRecipe.preparation = (currentRecipe.preparation || '') + ' ' + String(row[3]).trim();
            }
        }
    }

    // Guardar última receta
    if (currentRecipe && currentRecipe.ingredients.length > 0) {
        recipes.push(currentRecipe);
    }

    return recipes;
}

async function findOrCreateInventoryItem(ingredientName: string): Promise<string | null> {
    // Normalizar nombre
    const normalized = ingredientName.toUpperCase().trim();
    const mappedSku = INGREDIENT_MAP[normalized];

    // Buscar por SKU mapeado o por nombre similar
    let item = await prisma.inventoryItem.findFirst({
        where: {
            OR: [
                { sku: { contains: mappedSku || normalized, mode: 'insensitive' } },
                { name: { contains: normalized.split(' ')[0], mode: 'insensitive' } }
            ]
        }
    });

    if (item) {
        return item.id;
    }

    // Si no existe, crear uno nuevo como materia prima
    console.log(`   ⚠️  Creando nuevo item: ${ingredientName}`);
    const newItem = await prisma.inventoryItem.create({
        data: {
            sku: `ING-${normalized.replace(/\s+/g, '-').substring(0, 20)}`,
            name: ingredientName,
            type: 'RAW_MATERIAL',
            category: 'Ingredientes',
            baseUnit: 'KG',
            isActive: true
        }
    });

    return newItem.id;
}

async function main() {
    console.log('🍳 IMPORTACIÓN DE RECETAS - Shanklish ERP');
    console.log('='.repeat(60));

    const workbook = XLSX.readFile(EXCEL_PATH);
    let totalRecipes = 0;
    let totalIngredients = 0;

    // Primero, crear items de salida para las recetas si no existen
    // (Los productos finales que resultan de las recetas)

    for (const sheetName of workbook.SheetNames) {
        console.log(`\n📋 Procesando hoja: "${sheetName}"`);

        const worksheet = workbook.Sheets[sheetName];
        const recipes = parseRecipeSheet(worksheet, sheetName);

        console.log(`   Recetas encontradas: ${recipes.length}`);

        for (const recipe of recipes) {
            console.log(`\n   🥘 ${recipe.name}`);

            // 1. Crear o encontrar el item de salida (producto final)
            let outputItem = await prisma.inventoryItem.findFirst({
                where: {
                    name: { contains: recipe.name.split('(')[0].trim(), mode: 'insensitive' }
                }
            });

            if (!outputItem) {
                // Crear el producto final
                const sku = `REC-${recipe.name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 15).toUpperCase()}`;
                outputItem = await prisma.inventoryItem.create({
                    data: {
                        sku,
                        name: recipe.name,
                        type: 'SUB_RECIPE',
                        category: recipe.category,
                        baseUnit: 'PORTION',
                        isActive: true
                    }
                });
                console.log(`      ✅ Producto creado: ${outputItem.sku}`);
            }

            // 2. Verificar si ya existe una receta para este item
            let existingRecipe = await prisma.recipe.findFirst({
                where: { outputItemId: outputItem.id }
            });

            if (existingRecipe) {
                console.log(`      ⏭️  Receta ya existe, saltando...`);
                continue;
            }

            // 3. Crear la receta
            const newRecipe = await prisma.recipe.create({
                data: {
                    name: recipe.name,
                    description: recipe.preparation?.substring(0, 500) || null,
                    outputItemId: outputItem.id,
                    outputQuantity: 1,
                    outputUnit: 'PORTION',
                    yieldPercentage: 100,
                    isApproved: true,
                    isActive: true
                }
            });

            totalRecipes++;

            // 4. Agregar ingredientes (usando un Set para evitar duplicados)
            const processedIngredients = new Set<string>();

            for (const ing of recipe.ingredients) {
                const ingredientItemId = await findOrCreateInventoryItem(ing.name);

                if (ingredientItemId && !processedIngredients.has(ingredientItemId)) {
                    processedIngredients.add(ingredientItemId);

                    await prisma.recipeIngredient.upsert({
                        where: {
                            recipeId_ingredientItemId: {
                                recipeId: newRecipe.id,
                                ingredientItemId
                            }
                        },
                        update: {
                            quantity: { increment: ing.quantity }
                        },
                        create: {
                            recipeId: newRecipe.id,
                            ingredientItemId,
                            quantity: ing.quantity,
                            unit: ing.unit,
                            notes: ing.detail || null,
                            sortOrder: totalIngredients
                        }
                    });
                    totalIngredients++;
                    console.log(`      + ${ing.quantity} ${ing.unit} ${ing.name}`);
                }
            }
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ IMPORTACIÓN COMPLETADA');
    console.log(`   📊 Recetas creadas: ${totalRecipes}`);
    console.log(`   🥕 Ingredientes vinculados: ${totalIngredients}`);
}

main()
    .catch((e) => {
        console.error('❌ Error:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
