/**
 * Guard para Server Actions y Server Components.
 *
 * Devuelve resultados planos (nunca NextResponse) — compatible con el patrón
 * { ok, message } que usan todos los Server Actions del proyecto.
 *
 * Uso:
 *   const guard = await checkActionPermission(PERM.VOID_ORDER);
 *   if (!guard.ok) return { success: false, message: guard.message };
 *   // ... lógica con guard.user
 *
 * Para variante que lanza en lugar de devolver, usar requireActionPermission().
 */

import 'server-only';
import { getSession } from '@/lib/auth';
import prisma from '@/server/db';
import type { PermKey } from '@/lib/constants/permissions-registry';
import { hasPermission, type PermUser } from './has-permission';

export type ActionGuardResult =
    | { ok: true; user: PermUser & { id: string; email: string } }
    | { ok: false; message: string };

export async function checkActionPermission(permission: PermKey): Promise<ActionGuardResult> {
    const session = await getSession();
    if (!session?.id) {
        return { ok: false, message: 'No autorizado' };
    }

    const dbUser = await prisma.user.findUnique({
        where: { id: session.id },
        select: { id: true, email: true, role: true, allowedModules: true, isActive: true },
    });

    if (!dbUser || !dbUser.isActive) {
        return { ok: false, message: 'Usuario no válido' };
    }

    const permUser: PermUser = {
        role: dbUser.role,
        allowedModules: dbUser.allowedModules,
        grantedPerms: session.grantedPerms ?? null,
        revokedPerms: session.revokedPerms ?? null,
    };

    if (!hasPermission(permUser, permission)) {
        return { ok: false, message: `Sin permiso: ${permission}` };
    }

    return {
        ok: true,
        user: {
            id: dbUser.id,
            email: dbUser.email,
            role: dbUser.role,
            allowedModules: dbUser.allowedModules,
            grantedPerms: session.grantedPerms ?? null,
            revokedPerms: session.revokedPerms ?? null,
        },
    };
}

export async function checkAnyActionPermission(permissions: PermKey[]): Promise<ActionGuardResult> {
    for (const p of permissions) {
        const r = await checkActionPermission(p);
        if (r.ok) return r;
        if (r.message === 'No autorizado' || r.message === 'Usuario no válido') return r;
    }
    return { ok: false, message: `Sin ninguno de los permisos: ${permissions.join(', ')}` };
}

// ─── Variante que lanza (útil en Server Components con error boundaries) ──────

export class UnauthorizedError extends Error {
    status = 401 as const;
    constructor() { super('Unauthorized'); this.name = 'UnauthorizedError'; }
}

export class ForbiddenError extends Error {
    status = 403 as const;
    constructor(permission: string) {
        super(`Forbidden: missing permission '${permission}'`);
        this.name = 'ForbiddenError';
    }
}

export async function requireActionPermission(
    permission: PermKey,
): Promise<PermUser & { id: string; email: string }> {
    const result = await checkActionPermission(permission);
    if (!result.ok) {
        if (result.message === 'No autorizado' || result.message === 'Usuario no válido') {
            throw new UnauthorizedError();
        }
        throw new ForbiddenError(permission);
    }
    return result.user;
}
