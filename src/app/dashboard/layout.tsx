import { Sidebar } from '@/components/layout/Sidebar';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { getSession } from '@/lib/auth';
import { getEnabledModulesFromDB } from '@/app/actions/system-config.actions';
import { visibleModules } from '@/lib/permissions/has-permission';
import prisma from '@/server/db';

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSession();

    // Leer módulos habilitados desde BD (una sola vez por request, en el servidor)
    const enabledModuleIds = await getEnabledModulesFromDB();

    // visibleModules aplica las 4 capas: allowedModules (JWT) ∪ módulos de grantedPerms.
    // Fallback defensivo: JWTs emitidos ANTES del Prompt 2 no tienen `allowedModules`
    // (campo undefined). En ese caso consultamos BD para evitar mostrar de más al
    // usuario hasta que cierre sesión y vuelva a entrar.
    let userAllowedModules: string[] | null = null;
    if (session) {
        let allowedModules = session.allowedModules;
        if (allowedModules === undefined && session.id) {
            const dbUser = await prisma.user.findUnique({
                where: { id: session.id },
                select: { allowedModules: true },
            });
            allowedModules = dbUser?.allowedModules ?? null;
        }
        userAllowedModules = visibleModules({
            role: session.role,
            allowedModules: allowedModules ?? null,
            grantedPerms: session.grantedPerms ?? null,
            revokedPerms: session.revokedPerms ?? null,
        });
    }

    const sidebar = (
        <Sidebar initialUser={session} enabledModuleIds={enabledModuleIds} userAllowedModules={userAllowedModules} />
    );

    return (
        <DashboardShell sidebar={sidebar}>
            {children}
        </DashboardShell>
    );
}
