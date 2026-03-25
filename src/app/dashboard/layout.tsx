import { Sidebar } from '@/components/layout/Sidebar';
import { Navbar } from '@/components/layout/Navbar';
import { getSession } from '@/lib/auth';
import { getEnabledModulesFromDB } from '@/app/actions/system-config.actions';
import prisma from '@/server/db';

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSession();

    // Leer módulos habilitados desde BD (una sola vez por request, en el servidor)
    const enabledModuleIds = await getEnabledModulesFromDB();

    // Leer módulos permitidos del usuario actual (null = sin restricción extra)
    let userAllowedModules: string[] | null = null;
    if (session?.id) {
        const dbUser = await prisma.user.findUnique({
            where: { id: session.id },
            select: { allowedModules: true },
        });
        if (dbUser?.allowedModules) {
            try {
                userAllowedModules = JSON.parse(dbUser.allowedModules);
            } catch {
                userAllowedModules = null;
            }
        }
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Sidebar recibe los módulos ya resueltos desde el servidor */}
            <Sidebar initialUser={session} enabledModuleIds={enabledModuleIds} userAllowedModules={userAllowedModules} />

            {/* Main content area */}
            <div className="md:pl-64">
                <Navbar />
                <main className="min-h-[calc(100vh-4rem)] p-4 md:p-6">
                    {children}
                </main>
            </div>
        </div>
    );
}
