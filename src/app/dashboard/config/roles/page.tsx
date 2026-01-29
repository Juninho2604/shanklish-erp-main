import { getUsers } from '@/app/actions/user.actions';
import { RolesView } from './roles-view';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';

export const metadata = {
    title: 'Configuración de Roles | Shanklish App',
    description: 'Gestión de roles y permisos de usuarios',
};

export default async function RolesConfigPage() {
    const session = await getSession();

    if (!session) {
        redirect('/login');
    }

    // Doble chequeo de seguridad en renderizado (las acciones tambien validan)
    // Usamos el rol "raw" string para validación simple aquí, o la utilidad hasPermission
    // pero por ahora dejamos que la acción maneje el error detallado o el componente renderice estado vacío

    let users: any[] = [];
    try {
        users = await getUsers();
    } catch (e) {
        // Si falla autorización, devuelve array vacío o redirige
        // console.error(e);
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Configuración de Roles y Permisos</h1>
                <p className="text-gray-500">Administra los accesos de los usuarios al sistema.</p>
            </div>

            <RolesView initialUsers={users} currentUserRole={session.role} />
        </div>
    );
}
