/**
 * Guard para Server Actions y API routes.
 *
 * Adaptado al auth custom con `jose` de `src/lib/auth.ts` (getSession()).
 * La sesión NO incluye allowedModules — lo leemos de la BD en cada request
 * para garantizar consistencia tras cambios en el panel admin.
 *
 * Uso en Server Action:
 *   export async function anularOrdenAction(orderId: string) {
 *     const guard = await requirePermission(PERM.VOID_ORDER);
 *     if (!guard.ok) return { success: false, message: guard.message };
 *     // ... lógica con guard.user
 *   }
 *
 * Uso en API route (app/api):
 *   export async function POST(req: Request) {
 *     const guard = await requirePermission(PERM.VOID_ORDER);
 *     if (!guard.ok) return new Response(guard.message, { status: guard.status });
 *     // ...
 *   }
 */

import { getSession } from '@/lib/auth';
import prisma from '@/server/db';
import type { PermKey } from '@/lib/constants/permissions-registry';
import { hasPermission, type PermUser } from './has-permission';

export type GuardResult =
    | { ok: true; user: PermUser & { id: string; email: string } }
    | { ok: false; status: 401 | 403; message: string };

/**
 * Valida sesión + permiso. No lanza — devuelve un resultado discriminado.
 *
 * Devuelve 401 si no hay sesión, 403 si la sesión no tiene el permiso solicitado.
 */
export async function requirePermission(permission: PermKey): Promise<GuardResult> {
    const session = await getSession();
    if (!session?.id) {
        return { ok: false, status: 401, message: 'No autorizado' };
    }

    // allowedModules no viaja en el JWT (podría quedar stale); leerlo de la BD.
    const dbUser = await prisma.user.findUnique({
        where: { id: session.id },
        select: { id: true, email: true, role: true, allowedModules: true, isActive: true },
    });

    if (!dbUser || !dbUser.isActive) {
        return { ok: false, status: 401, message: 'Usuario no válido' };
    }

    const permUser: PermUser = {
        role: dbUser.role,
        allowedModules: dbUser.allowedModules,
        grantedPerms: session.grantedPerms ?? null,
        revokedPerms: session.revokedPerms ?? null,
    };

    if (!hasPermission(permUser, permission)) {
        return { ok: false, status: 403, message: `Sin permiso: ${permission}` };
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

/**
 * Variante que requiere CUALQUIERA de varios permisos. Útil cuando una
 * acción puede autorizarse por más de un perm (p.ej. VOID_ORDER o APPROVE_DISCOUNT).
 */
export async function requireAnyPermission(permissions: PermKey[]): Promise<GuardResult> {
    for (const p of permissions) {
        const r = await requirePermission(p);
        if (r.ok) return r;
        // Si la primera falla por 401, propagar — no tiene sentido seguir probando
        if (r.status === 401) return r;
    }
    return { ok: false, status: 403, message: `Sin ninguno de los permisos: ${permissions.join(', ')}` };
}
