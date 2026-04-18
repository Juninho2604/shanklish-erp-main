import { Sidebar } from '@/components/layout/Sidebar';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { getSession } from '@/lib/auth';
import { getEnabledModulesFromDB } from '@/app/actions/system-config.actions';
import { visibleModules } from '@/lib/permissions/has-permission';

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSession();

    // Leer módulos habilitados desde BD (una sola vez por request, en el servidor)
    const enabledModuleIds = await getEnabledModulesFromDB();

    // visibleModules aplica las 4 capas: allowedModules (JWT) ∪ módulos de grantedPerms.
    // allowedModules viaja en el JWT (set en login) — si el admin lo cambia, re-login es suficiente.
    const userAllowedModules = session
        ? visibleModules({
              role: session.role,
              allowedModules: session.allowedModules ?? null,
              grantedPerms: session.grantedPerms ?? null,
              revokedPerms: session.revokedPerms ?? null,
          })
        : null;

    const sidebar = (
        <Sidebar initialUser={session} enabledModuleIds={enabledModuleIds} userAllowedModules={userAllowedModules} />
    );

    return (
        <DashboardShell sidebar={sidebar}>
            {children}
        </DashboardShell>
    );
}
