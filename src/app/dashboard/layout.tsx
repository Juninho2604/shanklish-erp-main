import { Sidebar } from '@/components/layout/Sidebar';
import { Navbar } from '@/components/layout/Navbar';
import { getSession } from '@/lib/auth';
import { getEnabledModulesFromDB } from '@/app/actions/system-config.actions';

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSession();

    // Leer módulos habilitados desde BD (una sola vez por request, en el servidor)
    const enabledModuleIds = await getEnabledModulesFromDB();

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            {/* Sidebar recibe los módulos ya resueltos desde el servidor */}
            <Sidebar initialUser={session} enabledModuleIds={enabledModuleIds} />

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
