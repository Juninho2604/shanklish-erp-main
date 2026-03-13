import { getModifierGroupsWithItemsAction, getMenuItemsForModifierLinkAction } from '@/app/actions/modifier.actions';
import ModifierManagerClient from './ModifierManagerClient';

export const dynamic = 'force-dynamic';

export default async function ModificadoresPage() {
    const [groupsRes, itemsRes] = await Promise.all([
        getModifierGroupsWithItemsAction(),
        getMenuItemsForModifierLinkAction()
    ]);

    const groups = groupsRes.success ? (groupsRes.data ?? []) : [];
    const menuItems = itemsRes.success ? (itemsRes.data ?? []) : [];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Gestión de Modificadores
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                    Vincula cada opción de modificador a un plato del menú para que al vender se descarguen automáticamente los ingredientes correctos del inventario.
                    <br />
                    <span className="text-amber-500 font-medium">
                        Ej: Tabla con &quot;Tabule&quot; → al vender, descarga ingredientes de la receta de Tabule.
                    </span>
                </p>
            </div>

            <ModifierManagerClient groups={groups as any} menuItems={menuItems as any} />
        </div>
    );
}
