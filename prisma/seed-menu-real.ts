
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Definición de Categorías
const CATEGORIES = [
    { id: 'cat-quesos', name: 'Quesos Shanklish', description: 'Nuestros quesos tradicionales', sortOrder: 1 },
    { id: 'cat-platos', name: 'Platos Principales', description: 'Kibbes, pinchos y más', sortOrder: 2 },
    { id: 'cat-shawarmas', name: 'Shawarmas', description: 'Carne, pollo y mixtos', sortOrder: 3 },
    { id: 'cat-especiales', name: 'Platos Especiales', description: 'Hamburguesas y especialidades', sortOrder: 4 },
    { id: 'cat-ensaladas', name: 'Ensaladas', description: 'Tabulé, Fattoush y Fatule', sortOrder: 5 },
    { id: 'cat-cremas', name: 'Cremas', description: 'Hummus, Babaganoush y más', sortOrder: 6 },
]

// Definición de Productos
const ITEMS = [
    // === QUESOS SHANKLISH ===
    { categoryId: 'cat-quesos', sku: 'SHK-TRAD-250', name: 'Shanklish Tradicional 250gr', price: 12.00 },
    { categoryId: 'cat-quesos', sku: 'SHK-TRAD-125', name: 'Shanklish Tradicional 125gr', price: 7.50 },

    { categoryId: 'cat-quesos', sku: 'SHK-PIC-250', name: 'Shanklish Picante 250gr', price: 12.00 },
    { categoryId: 'cat-quesos', sku: 'SHK-PIC-125', name: 'Shanklish Picante 125gr', price: 7.50 },

    { categoryId: 'cat-quesos', sku: 'SHK-PEST-250', name: 'Shanklish Pesto 250gr', price: 12.00 },
    { categoryId: 'cat-quesos', sku: 'SHK-PEST-125', name: 'Shanklish Pesto 125gr', price: 7.50 },

    { categoryId: 'cat-quesos', sku: 'SHK-TOM-250', name: 'Shanklish Tomate Seco 250gr', price: 12.00 },
    { categoryId: 'cat-quesos', sku: 'SHK-TOM-125', name: 'Shanklish Tomate Seco 125gr', price: 7.50 },

    { categoryId: 'cat-quesos', sku: 'SHK-MER-250', name: 'Shanklish Merey y Miel 250gr', price: 12.00 },
    { categoryId: 'cat-quesos', sku: 'SHK-MER-125', name: 'Shanklish Merey y Miel 125gr', price: 7.50 },

    // === PLATOS PRINCIPALES ===
    { categoryId: 'cat-platos', sku: 'KIB-CRUD-500', name: 'Kibbe Crudo 500gr', price: 22.50 },
    { categoryId: 'cat-platos', sku: 'KIB-CRUD-250', name: 'Kibbe Crudo 250gr', price: 12.00 },

    { categoryId: 'cat-platos', sku: 'KIB-FRIT-10', name: 'Kibbe Frito (10 un)', price: 22.50 },
    { categoryId: 'cat-platos', sku: 'KIB-FRIT-05', name: 'Kibbe Frito (5 un)', price: 12.00 },

    { categoryId: 'cat-platos', sku: 'KIB-MINI-20', name: 'Mini Kibbe Frito (20 un)', price: 22.50 },
    { categoryId: 'cat-platos', sku: 'KIB-MINI-10', name: 'Mini Kibbe Frito (10 un)', price: 12.00 },

    { categoryId: 'cat-platos', sku: 'FALAFEL-EP-14', name: 'Falafel (14 un)', price: 19.50 },
    { categoryId: 'cat-platos', sku: 'FALAFEL-EP-07', name: 'Falafel (7 un)', price: 10.50 },

    { categoryId: 'cat-platos', sku: 'KIB-HORN-500', name: 'Kibbe Horneado 500gr', price: 22.50 },
    { categoryId: 'cat-platos', sku: 'KIB-HORN-250', name: 'Kibbe Horneado 250gr', price: 12.00 },

    { categoryId: 'cat-platos', sku: 'PINCHOS-03', name: 'Pinchos (3 un)', price: 15.00 }, // Pollo, Carne, Mixto o Kafta

    { categoryId: 'cat-platos', sku: 'TABAQ-14', name: 'Tabaquitos (14 un)', price: 16.50 },
    { categoryId: 'cat-platos', sku: 'TABAQ-07', name: 'Tabaquitos (7 un)', price: 9.00 },

    { categoryId: 'cat-platos', sku: 'ARROZ-500', name: 'Arroz con Pollo Libanés 500gr', price: 19.50 },
    { categoryId: 'cat-platos', sku: 'ARROZ-250', name: 'Arroz con Pollo Libanés 250gr', price: 10.50 },

    // === SHAWARMAS ===
    // Shanklish Caracas
    { categoryId: 'cat-shawarmas', sku: 'SHW-SPEC-500', name: 'Shanklish Caracas 500gr', price: 19.50 },
    { categoryId: 'cat-shawarmas', sku: 'SHW-SPEC-350', name: 'Shanklish Caracas 350gr', price: 15.00 },
    { categoryId: 'cat-shawarmas', sku: 'SHW-SPEC-250', name: 'Shanklish Caracas 250gr', price: 10.50 },

    // Shakifel
    { categoryId: 'cat-shawarmas', sku: 'SHW-SKE-500', name: 'Shakifel 500gr', price: 19.50 },
    { categoryId: 'cat-shawarmas', sku: 'SHW-SKE-350', name: 'Shakifel 350gr', price: 15.00 },
    { categoryId: 'cat-shawarmas', sku: 'SHW-SKE-250', name: 'Shakifel 250gr', price: 10.50 },

    // Pollo
    { categoryId: 'cat-shawarmas', sku: 'SHW-POLL-500', name: 'Shawarma Pollo 500gr', price: 18.00 },
    { categoryId: 'cat-shawarmas', sku: 'SHW-POLL-350', name: 'Shawarma Pollo 350gr', price: 13.50 },
    { categoryId: 'cat-shawarmas', sku: 'SHW-POLL-250', name: 'Shawarma Pollo 250gr', price: 9.00 },

    // Carne o Mixto
    { categoryId: 'cat-shawarmas', sku: 'SHW-CM-500', name: 'Shawarma Carne/Mixto 500gr', price: 19.50 },
    { categoryId: 'cat-shawarmas', sku: 'SHW-CM-350', name: 'Shawarma Carne/Mixto 350gr', price: 15.00 },
    { categoryId: 'cat-shawarmas', sku: 'SHW-CM-250', name: 'Shawarma Carne/Mixto 250gr', price: 10.50 },

    // Shakifel Mixto
    { categoryId: 'cat-shawarmas', sku: 'SHW-SKM-500', name: 'Shakifel Mixto 500gr', price: 19.50 },
    { categoryId: 'cat-shawarmas', sku: 'SHW-SKM-350', name: 'Shakifel Mixto 350gr', price: 15.00 },
    { categoryId: 'cat-shawarmas', sku: 'SHW-SKM-250', name: 'Shakifel Mixto 250gr', price: 10.50 },

    // Falafel Shawarma
    { categoryId: 'cat-shawarmas', sku: 'SHW-FAL-500', name: 'Shawarma Falafel 500gr', price: 19.50 },
    { categoryId: 'cat-shawarmas', sku: 'SHW-FAL-350', name: 'Shawarma Falafel 350gr', price: 15.00 },
    { categoryId: 'cat-shawarmas', sku: 'SHW-FAL-250', name: 'Shawarma Falafel 250gr', price: 10.50 },

    // === PLATOS ESPECIALES ===
    { categoryId: 'cat-especiales', sku: 'BURGER', name: 'Burger Árabe "Shanklish Caracas"', price: 15.00 },

    { categoryId: 'cat-especiales', sku: 'PIZZA-08', name: 'Mini Pizza Zaatar (8 un)', price: 7.50 },
    { categoryId: 'cat-especiales', sku: 'PIZZA-05', name: 'Mini Pizza Zaatar (5 un)', price: 4.50 },

    { categoryId: 'cat-especiales', sku: 'SAMB-05', name: 'Sambousek (5 un)', price: 12.00 },
    { categoryId: 'cat-especiales', sku: 'SAMB-03', name: 'Sambousek (3 un)', price: 7.50 },

    { categoryId: 'cat-especiales', sku: 'BAST-L', name: 'Basturma (Grande)', price: 15.00 },
    { categoryId: 'cat-especiales', sku: 'BAST-S', name: 'Basturma (Pequeña)', price: 9.00 },

    // === ENSALADAS ===
    { categoryId: 'cat-ensaladas', sku: 'FATT-250', name: 'Fattoush 250gr', price: 10.50 },
    { categoryId: 'cat-ensaladas', sku: 'FATT-125', name: 'Fattoush 125gr', price: 7.50 },

    { categoryId: 'cat-ensaladas', sku: 'TAB-250', name: 'Tabulé 250gr', price: 10.50 },
    { categoryId: 'cat-ensaladas', sku: 'TAB-125', name: 'Tabulé 125gr', price: 7.50 },

    { categoryId: 'cat-ensaladas', sku: 'FATULE-250', name: 'Fatule 250gr', price: 12.00 },

    // === CREMAS ===
    // Hummus Especial
    { categoryId: 'cat-cremas', sku: 'HUM-ESP-250', name: 'Hummus Especial 250gr', price: 15.00 },
    { categoryId: 'cat-cremas', sku: 'HUM-ESP-125', name: 'Hummus Especial 125gr', price: 9.00 },

    // Hummus Tradicional
    { categoryId: 'cat-cremas', sku: 'HUM-TRAD-250', name: 'Hummus Tradicional 250gr', price: 12.00 },
    { categoryId: 'cat-cremas', sku: 'HUM-TRAD-125', name: 'Hummus Tradicional 125gr', price: 7.50 },

    // Muhammara
    { categoryId: 'cat-cremas', sku: 'MUH-250', name: 'Muhammara 250gr', price: 12.00 },
    { categoryId: 'cat-cremas', sku: 'MUH-125', name: 'Muhammara 125gr', price: 7.50 },

    // Babaganoush
    { categoryId: 'cat-cremas', sku: 'BABA-250', name: 'Babaganoush 250gr', price: 12.00 },
    { categoryId: 'cat-cremas', sku: 'BABA-125', name: 'Babaganoush 125gr', price: 7.50 },

    // Toum
    { categoryId: 'cat-cremas', sku: 'TOUM-250', name: 'Toum 250gr', price: 12.00 },
    { categoryId: 'cat-cremas', sku: 'TOUM-125', name: 'Toum 125gr', price: 7.50 },

    // Tarator
    { categoryId: 'cat-cremas', sku: 'TARA-250', name: 'Tarator 250gr', price: 12.00 },
    { categoryId: 'cat-cremas', sku: 'TARA-125', name: 'Tarator 125gr', price: 7.50 },

    // Labneh
    { categoryId: 'cat-cremas', sku: 'LAB-250', name: 'Labneh 250gr', price: 12.00 },
    { categoryId: 'cat-cremas', sku: 'LAB-125', name: 'Labneh 125gr', price: 7.50 },

    // === BEBIDAS ===
    { categoryId: 'cat-bebidas', sku: 'BEB-350', name: 'Refresco/Té 350ml', price: 1.50 },
    { categoryId: 'cat-bebidas', sku: 'BEB-2L', name: 'Refresco 2 Litros', price: 4.50 },
    { categoryId: 'cat-bebidas', sku: 'BEB-ESP-1', name: 'Bebida Especial 1', price: 3.00 },
    { categoryId: 'cat-bebidas', sku: 'BEB-ESP-2', name: 'Bebida Especial 2', price: 4.50 },

    // === POSTRES Y OTROS ===
    // Dulces Árabes
    { categoryId: 'cat-postres', sku: 'DULCE-L', name: 'Dulces Árabes (Caja Grande)', price: 15.00 },
    { categoryId: 'cat-postres', sku: 'DULCE-5', name: 'Dulces Árabes (5 un)', price: 12.00 },
    { categoryId: 'cat-postres', sku: 'DULCE-1', name: 'Dulce Árabe (Unidad)', price: 3.00 },

    // Helados
    { categoryId: 'cat-postres', sku: 'HELADO-L', name: 'Tina de Helado Grande', price: 15.00 },
    { categoryId: 'cat-postres', sku: 'HELADO-M', name: 'Tina de Helado Mediana', price: 9.00 },
]

async function main() {
    console.log('🌱 Iniciando seed de Menú Real...')

    // Categorías adicionales si no existen
    const EXTRA_CATEGORIES = [
        { id: 'cat-bebidas', name: 'Bebidas', description: 'Refrescos y jugos', sortOrder: 7 },
        { id: 'cat-postres', name: 'Postres', description: 'Dulces árabes y helados', sortOrder: 8 },
    ];

    // 1. Crear Categorías (incluyendo las nuevas)
    for (const cat of [...CATEGORIES, ...EXTRA_CATEGORIES]) {
        await prisma.menuCategory.upsert({
            where: { id: cat.id },
            update: {
                name: cat.name,
                description: cat.description,
                sortOrder: cat.sortOrder
            },
            create: {
                id: cat.id,
                name: cat.name,
                description: cat.description,
                sortOrder: cat.sortOrder
            }
        })
    }

    // 2. Crear Items
    let createdCount = 0;
    for (const item of ITEMS) {
        await prisma.menuItem.upsert({
            where: { sku: item.sku },
            update: {
                name: item.name,
                price: item.price,
                categoryId: item.categoryId
            },
            create: {
                sku: item.sku,
                name: item.name,
                price: item.price,
                categoryId: item.categoryId
            }
        })
        createdCount++;
    }

    console.log(`✅ Menú cargado exitosamente: ${createdCount} productos`)
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
