'use server';

import { prisma } from '@/server/db'; // Correct path from previous files
import { getSession, hasPermission, PERMISSIONS } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

// ============================================================================
// HELPERS DE HASHING DE PIN  (movidos desde pos.actions.ts)
// Usa Web Crypto API — disponible en Node 18+ y en el browser.
// Formato almacenado: "saltHex:hashHex"  (PBKDF2-SHA256, 100 000 iteraciones)
// ============================================================================

function hexToUint8Array(hex: string): Uint8Array {
    const pairs = hex.match(/.{2}/g) ?? [];
    return new Uint8Array(pairs.map((b) => parseInt(b, 16)));
}

function uint8ArrayToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

export async function pbkdf2Hex(pin: string, saltHex: string): Promise<string> {
    const salt = hexToUint8Array(saltHex);
    const keyMaterial = await globalThis.crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(pin),
        'PBKDF2',
        false,
        ['deriveBits'],
    );
    const hashBuf = await globalThis.crypto.subtle.deriveBits(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { name: 'PBKDF2', salt: salt as any, iterations: 100_000, hash: 'SHA-256' },
        keyMaterial,
        256,
    );
    return uint8ArrayToHex(new Uint8Array(hashBuf));
}

export async function hashPin(pin: string): Promise<string> {
    const saltBytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const saltHex = uint8ArrayToHex(saltBytes);
    const hashHex = await pbkdf2Hex(pin, saltHex);
    return `${saltHex}:${hashHex}`;
}

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

/**
 * Asigna o cambia el PIN de un usuario (solo Admin/Dueño/roles con MANAGE_USERS).
 * El PIN se hashea automáticamente con PBKDF2-SHA256 antes de guardarse.
 */
export async function updateUserPin(userId: string, rawPin: string) {
    const session = await getSession();

    if (!session) {
        return { success: false, message: 'No autenticado' };
    }

    if (!hasPermission(session.role, PERMISSIONS.MANAGE_USERS)) {
        return { success: false, message: 'No tienes permisos para asignar PINs' };
    }

    if (session.id === userId) {
        return { success: false, message: 'No puedes modificar tu propio PIN desde aquí' };
    }

    const trimmed = rawPin.trim();
    if (!/^\d{4,6}$/.test(trimmed)) {
        return { success: false, message: 'El PIN debe ser numérico y tener entre 4 y 6 dígitos' };
    }

    try {
        const hashed = await hashPin(trimmed);
        await prisma.user.update({
            where: { id: userId },
            data: { pin: hashed },
        });

        revalidatePath('/dashboard/usuarios');
        return { success: true, message: 'PIN actualizado correctamente' };
    } catch (error) {
        console.error('Error updating user PIN:', error);
        return { success: false, message: 'Error al actualizar el PIN' };
    }
}
