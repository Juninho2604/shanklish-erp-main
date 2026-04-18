'use server';

import { prisma } from '@/server/db'; // Correct path from previous files
import { getSession } from '@/lib/auth';
import { hashPassword, verifyPassword } from '@/lib/password';
import { revalidatePath } from 'next/cache';
import { checkActionPermission } from '@/lib/permissions/action-guard';
import { PERM } from '@/lib/constants/permissions-registry';

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
    const guard = await checkActionPermission(PERM.MANAGE_USERS);
    if (!guard.ok) throw new Error(guard.message);

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
            grantedPerms: true,
            revokedPerms: true,
            pin: true,
        },
    });

    // Mapear: exponer si el PIN está asignado sin revelar el hash
    return users.map(({ pin, ...u }) => ({ ...u, pinSet: pin !== null }));
}

/**
 * Actualiza el rol de un usuario
 */
export async function updateUserRole(userId: string, newRole: string) {
    const guard = await checkActionPermission(PERM.MANAGE_USERS);
    if (!guard.ok) return { success: false, message: guard.message };

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
    const guard = await checkActionPermission(PERM.MANAGE_USERS);
    if (!guard.ok) return { success: false, message: guard.message };

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

        // 2. Verificar contraseña actual (retrocompatible: plain-text legacy o PBKDF2)
        const valid = await verifyPassword(currentPassword, user.passwordHash ?? '');
        if (!valid) {
            return { success: false, message: 'La contraseña actual es incorrecta' };
        }

        // 3. Validar nueva contraseña (longitud mínima)
        if (newPassword.length < 6) {
            return { success: false, message: 'La nueva contraseña debe tener al menos 6 caracteres' };
        }

        // 4. Actualizar contraseña con hash PBKDF2-SHA256
        const hashed = await hashPassword(newPassword);
        await prisma.user.update({
            where: { id: session.id },
            data: { passwordHash: hashed },
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
    const guard = await checkActionPermission(PERM.MANAGE_USERS);
    if (!guard.ok) return { success: false, message: guard.message };

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
    const guard = await checkActionPermission(PERM.MANAGE_PINS);
    if (!guard.ok) return { success: false, message: guard.message };

    if (guard.user.id === userId) {
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

/**
 * Actualiza los permisos granulares adicionales (granted) y revocados (revoked) de un usuario.
 * grantedPerms y revokedPerms son arrays de PERM keys; null = sin override.
 */
export async function updateUserPerms(
    userId: string,
    grantedPerms: string[] | null,
    revokedPerms: string[] | null,
) {
    const guard = await checkActionPermission(PERM.MANAGE_USERS);
    if (!guard.ok) return { success: false, message: guard.message };

    try {
        await prisma.user.update({
            where: { id: userId },
            data: {
                grantedPerms: grantedPerms && grantedPerms.length > 0 ? JSON.stringify(grantedPerms) : null,
                revokedPerms: revokedPerms && revokedPerms.length > 0 ? JSON.stringify(revokedPerms) : null,
            },
        });

        revalidatePath('/dashboard/usuarios');
        return { success: true, message: 'Permisos actualizados correctamente' };
    } catch (error) {
        console.error('Error updating user perms:', error);
        return { success: false, message: 'Error al actualizar permisos' };
    }
}

/**
 * Crea un nuevo usuario en el sistema.
 * Solo roles con MANAGE_USERS pueden crear usuarios.
 * La contraseña se hashea con PBKDF2-SHA256 antes de guardarse.
 */
export async function createUserAction(data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    role: string;
}) {
    const guard = await checkActionPermission(PERM.MANAGE_USERS);
    if (!guard.ok) return { success: false, message: guard.message };

    const email = data.email.trim().toLowerCase();
    const firstName = data.firstName.trim();
    const lastName = data.lastName.trim();

    if (!email || !data.password || !firstName || !lastName) {
        return { success: false, message: 'Todos los campos son requeridos' };
    }

    if (data.password.length < 6) {
        return { success: false, message: 'La contraseña debe tener al menos 6 caracteres' };
    }

    // Validar email básico
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { success: false, message: 'Correo electrónico inválido' };
    }

    try {
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            return { success: false, message: 'Ya existe un usuario con ese correo electrónico' };
        }

        const passwordHash = await hashPassword(data.password);

        const user = await prisma.user.create({
            data: {
                email,
                passwordHash,
                firstName,
                lastName,
                role: data.role || 'CHEF',
                isActive: true,
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                isActive: true,
                allowedModules: true,
                grantedPerms: true,
                revokedPerms: true,
                pin: true,
            },
        });

        revalidatePath('/dashboard/usuarios');

        const { pin, ...userWithoutPin } = user;
        return {
            success: true,
            message: `Usuario ${firstName} ${lastName} creado correctamente`,
            user: { ...userWithoutPin, pinSet: pin !== null },
        };
    } catch (error) {
        console.error('Error creating user:', error);
        return { success: false, message: 'Error al crear el usuario' };
    }
}

/**
 * Actualiza nombre, apellido y/o email de un usuario.
 * Requiere MANAGE_USERS. No puede editarse a sí mismo por esta vía.
 */
export async function updateUserNameAction(
    userId: string,
    data: { firstName: string; lastName: string; email: string },
) {
    const guard = await checkActionPermission(PERM.MANAGE_USERS);
    if (!guard.ok) return { success: false, message: guard.message };

    const firstName = data.firstName.trim();
    const lastName = data.lastName.trim();
    const email = data.email.trim().toLowerCase();

    if (!firstName || !lastName) return { success: false, message: 'Nombre y apellido son requeridos' };
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { success: false, message: 'Correo electrónico inválido' };
    }

    try {
        const conflict = await prisma.user.findUnique({ where: { email } });
        if (conflict && conflict.id !== userId) {
            return { success: false, message: 'Ese correo ya está en uso por otro usuario' };
        }
        await prisma.user.update({ where: { id: userId }, data: { firstName, lastName, email } });
        revalidatePath('/dashboard/usuarios');
        return { success: true, message: 'Datos actualizados correctamente' };
    } catch {
        return { success: false, message: 'Error al actualizar los datos' };
    }
}

/**
 * Permite a OWNER o ADMIN_MANAGER resetear la contraseña de otro usuario.
 * No puede resetear la propia contraseña por esta vía (usar changePasswordAction).
 */
export async function adminResetPasswordAction(userId: string, newPassword: string) {
    const guard = await checkActionPermission(PERM.MANAGE_USERS);
    if (!guard.ok) return { success: false, message: guard.message };

    if (guard.user.id === userId) {
        return { success: false, message: 'Para cambiar tu propia contraseña usa la sección de perfil' };
    }

    if (!newPassword || newPassword.length < 6) {
        return { success: false, message: 'La contraseña debe tener al menos 6 caracteres' };
    }

    try {
        const passwordHash = await hashPassword(newPassword);

        await prisma.user.update({
            where: { id: userId },
            data: { passwordHash },
        });

        revalidatePath('/dashboard/usuarios');
        return { success: true, message: 'Contraseña actualizada correctamente' };
    } catch (error) {
        console.error('Error resetting password:', error);
        return { success: false, message: 'Error al actualizar la contraseña' };
    }
}
