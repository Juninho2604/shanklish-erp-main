// @ts-nocheck
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🧀 Configurando Modificadores de Tablas...');

    // 1. Encontrar productos que sean "Tablas"
    const tablas = await prisma.menuItem.findMany({
        where: {
            name: { contains: 'Tabla', mode: 'insensitive' }
        }
    });

    if (tablas.length === 0) {
        console.log('⚠️ No se encontraron productos "Tabla". Asegúrate de que existan en el menú.');
        return;
    }

    console.log(`✅ Encontradas ${tablas.length} tablas. Configurando opciones...`);

    // 2. Definir Opciones Disponibles (Quesos y Cremas)
    // Estas son las opciones que el cliente elegirá dentro de su tabla
    // El precio es 0 porque ya está incluido en el precio de la tabla
    const quesoOptions = [
        { name: 'Queso Shanklish', price: 0 },
        { name: 'Queso Feta', price: 0 },
        { name: 'Queso de Mano', price: 0 },
        { name: 'Labneh (Crema)', price: 0 },
        { name: 'Aceitunas Negras', price: 0 },
        { name: 'Zatar con Aceite', price: 0 },
        { name: 'Babaganoush', price: 0 },
        { name: 'Hummus', price: 0 }
    ];

    for (const tabla of tablas) {
        console.log(`🔧 Configurando: ${tabla.name}`);

        // Determinar límites según el nombre/tamaño
        let minSelect = 1;
        let maxSelect = 2; // Por defecto Pequeña

        if (tabla.name.toLowerCase().includes('mediana') || tabla.name.toLowerCase().includes('median')) {
            maxSelect = 3;
        } else if (tabla.name.toLowerCase().includes('grande') || tabla.name.toLowerCase().includes('full')) {
            maxSelect = 5;
        } else if (tabla.name.toLowerCase().includes('pequeña') || tabla.name.toLowerCase().includes('mini')) {
            maxSelect = 2;
        }

        // Crear Grupo de Modificadores: "Selección de Quesos"
        // Verificar si ya existe para no duplicar
        const existingGroup = await prisma.menuModifierGroup.findFirst({
            where: {
                menuItemId: tabla.id,
                name: 'Selección de Contenido'
            }
        });

        if (existingGroup) {
            console.log('  -> Grupo ya existe, saltando...');
            continue;
        }

        const group = await prisma.menuModifierGroup.create({
            data: {
                name: 'Selección de Contenido',
                menuItemId: tabla.id,
                minSelection: minSelect,
                maxSelection: maxSelect,
                isRequired: true,
                modifiers: {
                    create: quesoOptions.map(opt => ({
                        name: opt.name,
                        priceAdjustment: opt.price
                    }))
                }
            }
        });

        console.log(`  -> Grupo creado con ${maxSelect} opciones máximas.`);
    }

    console.log('🏁 Configuración de Tablas terminada.');
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
