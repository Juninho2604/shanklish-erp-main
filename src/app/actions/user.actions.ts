'use server';

import { prisma } from '@/server/db'; // Correct path from previous files
import { getSession, hasPermission, PERMISSIONS } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

/**
 * Obtiene la lista de todos los usuarios
 */
export async function getUsers() {
    const session = await getSession();

    // Validar sesión
    if (!session) {
        throw new Error('No autorizado');
    }

    // Validar permisos (Solo Gerentes o superior pueden ver lista de usuarios para config)
    if (!hasPermission(session.role, PERMISSIONS.VIEW_USERS)) {
        throw new Error('No tienes permisos para ver la lista de usuarios');
    }

    const users = await prisma.user.findMany({
        orderBy: {
            lastName: 'asc',
        },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            isActive: true,
            allowedModules: true,
        },
    });

    return users;
}

/**
 * Actualiza el rol de un usuario
 */
export async function updateUserRole(userId: string, newRole: string) {
    const session = await getSession();

    if (!session) {
        return { success: false, message: 'No autenticado' };
    }

    if (!hasPermission(session.role, PERMISSIONS.CONFIGURE_ROLES)) {
        return { success: false, message: 'No tienes permisos para cambiar roles' };
    }

    // Evitar que se cambie su propio rol para no quedarse fuera inadvertidamente,
    // o al menos advertir (aquí lo permitimos pero el frontend podría validarlo)

    try {
        await prisma.user.update({
            where: { id: userId },
            data: { role: newRole as any }, // Cast as any or import UserRole enum if available
        });

        revalidatePath('/dashboard/config/roles');
        return { success: true, message: 'Rol actualizado correctamente' };
    } catch (error) {
        console.error('Error updating user role:', error);
        return { success: false, message: 'Error al actualizar el rol' };
    }
}

/**
 * Activar/Desactivar usuarios (Bonus)
 */
export async function toggleUserStatus(userId: string, isActive: boolean) {
    const session = await getSession();

    if (!session) {
        return { success: false, message: 'No autenticado' };
    }

    if (!hasPermission(session.role, PERMISSIONS.CONFIGURE_ROLES)) {
        return { success: false, message: 'No tienes permisos para gestionar usuarios' };
    }

    try {
        await prisma.user.update({
            where: { id: userId },
            data: { isActive },
        });

        revalidatePath('/dashboard/config/roles');
        return { success: true, message: `Usuario ${isActive ? 'activado' : 'desactivado'} correctamente` };
    } catch (error) {
        console.error('Error toggling user status:', error);
        return { success: false, message: 'Error al cambiar estado del usuario' };
    }
}

/**
 * Cambiar contraseña del usuario actual
 */
export async function changePasswordAction(currentPassword: string, newPassword: string) {
    const session = await getSession();

    if (!session?.id) {
        return { success: false, message: 'No autorizado' };
    }

    try {
        // 1. Obtener usuario actual
        const user = await prisma.user.findUnique({
            where: { id: session.id },
        });

        if (!user) {
            return { success: false, message: 'Usuario no encontrado' };
        }

        // 2. Verificar contraseña actual (Comparación simple por ahora, igual que login)
        if (user.passwordHash !== currentPassword) {
            return { success: false, message: 'La contraseña actual es incorrecta' };
        }

        // 3. Validar nueva contraseña (longitud mínima)
        if (newPassword.length < 6) {
            return { success: false, message: 'La nueva contraseña debe tener al menos 6 caracteres' };
        }

        // 4. Actualizar contraseña
        await prisma.user.update({
            where: { id: session.id },
            data: { passwordHash: newPassword },
        });

        return { success: true, message: 'Contraseña actualizada correctamente' };

    } catch (error) {
        console.error('Error changing password:', error);
        return { success: false, message: 'Error al cambiar la contraseña' };
    }
}

/**
 * Actualizar los módulos permitidos de un usuario específico.
 * null = sin restricción extra (acceso completo según su rol)
 * [] o [ids] = solo esos módulos (además de las restricciones de rol)
 */
export async function updateUserModules(userId: string, allowedModules: string[] | null) {
    const session = await getSession();

    if (!session) {
        return { success: false, message: 'No autenticado' };
    }

    if (!hasPermission(session.role, PERMISSIONS.MANAGE_USERS)) {
        return { success: false, message: 'No tienes permisos para gestionar módulos de usuario' };
    }

    try {
        await prisma.user.update({
            where: { id: userId },
            data: {
                allowedModules: allowedModules ? JSON.stringify(allowedModules) : null,
            },
        });

        revalidatePath('/dashboard/usuarios');
        return { success: true, message: 'Módulos actualizados correctamente' };
    } catch (error) {
        console.error('Error updating user modules:', error);
        return { success: false, message: 'Error al actualizar módulos' };
    }
}
