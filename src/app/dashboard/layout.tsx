import { Sidebar } from '@/components/layout/Sidebar';
import { Navbar } from '@/components/layout/Navbar';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            {/* Sidebar */}
            <Sidebar />

            {/* Main content area */}
            <div className="pl-64">
                {/* Navbar */}
                <Navbar />

                {/* Page content */}
                <main className="min-h-[calc(100vh-4rem)] p-6">
                    {children}
                </main>
            </div>
        </div>
    );
}
