/**
 * Guard para API route handlers (src/app/api/[...]/route.ts).
 *
 * Devuelve { user, error: NextResponse | null } — el caller retorna `error`
 * directamente si no es null.
 *
 * Uso en API route:
 *   export async function POST(req: Request) {
 *     const { user, error } = await requirePermission(PERM.VOID_ORDER);
 *     if (error) return error;
 *     // ... lógica con user
 *   }
 *
 * Para Server Actions usar action-guard.ts (checkActionPermission).
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import prisma from '@/server/db';
import type { PermKey } from '@/lib/constants/permissions-registry';
import { hasPermission, type PermUser } from './has-permission';

type ApiUser = PermUser & { id: string; email: string };

export type ApiGuardResult =
    | { user: ApiUser; error: null }
    | { user: null; error: NextResponse };

export async function requirePermission(permission: PermKey): Promise<ApiGuardResult> {
    const session = await getSession();
    if (!session?.id) {
        return { user: null, error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
    }

    const dbUser = await prisma.user.findUnique({
        where: { id: session.id },
        select: { id: true, email: true, role: true, allowedModules: true, isActive: true },
    });

    if (!dbUser || !dbUser.isActive) {
        return { user: null, error: NextResponse.json({ error: 'Usuario no válido' }, { status: 401 }) };
    }

    const permUser: PermUser = {
        role: dbUser.role,
        allowedModules: dbUser.allowedModules,
        grantedPerms: session.grantedPerms ?? null,
        revokedPerms: session.revokedPerms ?? null,
    };

    if (!hasPermission(permUser, permission)) {
        return {
            user: null,
            error: NextResponse.json({ error: `Sin permiso: ${permission}` }, { status: 403 }),
        };
    }

    return {
        user: {
            id: dbUser.id,
            email: dbUser.email,
            role: dbUser.role,
            allowedModules: dbUser.allowedModules,
            grantedPerms: session.grantedPerms ?? null,
            revokedPerms: session.revokedPerms ?? null,
        },
        error: null,
    };
}

export async function requireAnyPermission(permissions: PermKey[]): Promise<ApiGuardResult> {
    let lastError: NextResponse | null = null;
    for (const p of permissions) {
        const r = await requirePermission(p);
        if (!r.error) return r;
        lastError = r.error;
        if (r.error.status === 401) return r;
    }
    return {
        user: null,
        error: lastError ?? NextResponse.json(
            { error: `Sin ninguno de los permisos: ${permissions.join(', ')}` },
            { status: 403 },
        ),
    };
}
