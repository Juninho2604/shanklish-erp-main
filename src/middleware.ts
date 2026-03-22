
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decrypt } from './lib/auth';

export async function middleware(request: NextRequest) {
    const sessionCookie = request.cookies.get('session')?.value;
    const session = await decrypt(sessionCookie || '');
    const path = request.nextUrl.pathname;

    // 1. Protección Base: Login requerido
    if (path.startsWith('/dashboard') && !session) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // 2. Redirección Login -> Dashboard
    if (path.startsWith('/login') && session) {
        return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    // 3. Control de Accesos (RBAC)
    if (session) {
        const userRole = session.role;

        // A. Gestión de Usuarios: Solo Dueños y Gerentes Admin
        if (path.startsWith('/dashboard/usuarios')) {
            const allowed = ['OWNER', 'ADMIN_MANAGER'];
            if (!allowed.includes(userRole)) {
                return NextResponse.redirect(new URL('/dashboard?error=unauthorized_users', request.url));
            }
        }

        // B. Auditorías e Importación: Dueños, Gerentes, Auditores
        if (path.startsWith('/dashboard/inventario/auditorias') || path.startsWith('/dashboard/inventario/importar')) {
            const allowed = ['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER', 'AUDITOR'];
            if (!allowed.includes(userRole)) {
                return NextResponse.redirect(new URL('/dashboard?error=unauthorized_audit', request.url));
            }
        }

        // C. Configuración Global
        if (path.startsWith('/dashboard/config')) {
            const allowed = ['OWNER'];
            if (!allowed.includes(userRole)) {
                return NextResponse.redirect(new URL('/dashboard?error=unauthorized_config', request.url));
            }
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/dashboard/:path*', '/login'],
};
