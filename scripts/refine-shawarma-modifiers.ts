
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('🥙 Refinando Modificadores de Shawarma (V3)...');

    // 1. ELIMINAR "TIPO DE PAN" (Desvincular)
    const panGroup = await prisma.menuModifierGroup.findFirst({ where: { name: 'Tipo de Pan' } });
    if (panGroup) {
        // Eliminar vinculo con cualquier item
        const deleted = await prisma.menuItemModifierGroup.deleteMany({
            where: { modifierGroupId: panGroup.id }
        });
        console.log(`✅ "Tipo de Pan" desvinculado de ${deleted.count} productos.`);
        // Opcional: Borrar el grupo si ya no se usa
        // await prisma.menuModifierGroup.delete({ where: { id: panGroup.id } });
    }

    // 2. ACTUALIZAR "PREFERENCIAS"
    // Buscamos el grupo
    let prefGroup = await prisma.menuModifierGroup.findFirst({ where: { name: 'Preferencias' } });

    if (prefGroup) {
        console.log('🔄 Actualizando lista de Preferencias...');

        // Limpiar modificadores viejos (simplifica la logica de "cual borrar y cual dejar")
        await prisma.menuModifier.deleteMany({
            where: { groupId: prefGroup.id }
        });

        // Crear nueva lista exacta
        const newModifiers = [
            // "Sin"
            { name: 'Sin Vegetales salteados', price: 0 },
            { name: 'Sin Tabule', price: 0 },
            { name: 'Sin Cebolla', price: 0 },
            { name: 'Sin Perejil', price: 0 },
            { name: 'Sin Tomate', price: 0 },
            { name: 'Sin Salsa de Ajo', price: 0 },
            // "Agregar"
            { name: 'Agregar Hummus', price: 0 },
            { name: 'Agregar Muhamara', price: 0 },
            { name: 'Agregar Babaganoush', price: 0 },
            { name: 'Agregar Papas Fritas', price: 0 },
        ];

        await prisma.menuModifier.createMany({
            data: newModifiers.map(m => ({
                groupId: prefGroup.id,
                name: m.name,
                priceAdjustment: m.price,
                isAvailable: true,
                sortOrder: 0
            }))
        });
        console.log(`✅ Preferencias actualizadas con ${newModifiers.length} opciones.`);
    }

    // 3. VERIFICAR PRECIOS FULL PROTEINA (Solo para confirmar)
    // Ya se configuró en el paso anterior, pero mostramos log para tranquilidad del usuario
    console.log('\n--- Verificación de Precios Full Proteína ---');
    const styleGroups = await prisma.menuModifierGroup.findMany({
        where: { name: { contains: 'Estilo (Shawarma' } },
        include: { modifiers: true }
    });

    styleGroups.forEach(g => {
        const mod = g.modifiers[0];
        console.log(`Grupo "${g.name}": Opción "${mod.name}" -> $${mod.priceAdjustment}`);
    });

    // 4. VERIFICAR SUSTITUCIONES
    console.log('\n--- Verificación de Sustituciones (Gratis) ---');
    const substGroup = await prisma.menuModifierGroup.findFirst({
        where: { name: 'Sustitución de Proteína' },
        include: { modifiers: true }
    });
    if (substGroup) {
        substGroup.modifiers.forEach(m => {
            console.log(`- ${m.name} ($${m.priceAdjustment})`);
        });
    }

    console.log('\n✅ Ajustes finales completados.');
}

main().finally(() => prisma.$disconnect());
