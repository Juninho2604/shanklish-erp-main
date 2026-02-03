import { Sidebar } from '@/components/layout/Sidebar';
import { Navbar } from '@/components/layout/Navbar';
import { getSession } from '@/lib/auth';

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSession();

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            {/* Sidebar con usuario real */}
            <Sidebar initialUser={session} />

            {/* Main content area */}
            <div className="md:pl-64">
                {/* Navbar */}
                <Navbar />

                {/* Page content */}
                <main className="min-h-[calc(100vh-4rem)] p-4 md:p-6">
                    {children}
                </main>
            </div>
        </div>
    );
}
