'use client';

import { useAuthStore } from '@/stores/auth.store';
import { useUIStore } from '@/stores/ui.store';
import { HelpPanel } from './HelpPanel';
import { NotificationBell } from './NotificationBell';
import { ThemeToggle } from './ThemeToggle';

export function Navbar() {
    const { user } = useAuthStore();
    const { toggleSidebar } = useUIStore();

    return (
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-gray-200 bg-white/80 px-6 backdrop-blur-md dark:border-gray-700 dark:bg-gray-900/80">
            {/* Left side - Hamburger + Breadcrumb */}
            <div className="flex items-center gap-4">
                {/* Mobile hamburger */}
                <button
                    onClick={toggleSidebar}
                    className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 md:hidden"
                    aria-label="Toggle Sidebar"
                >
                    <span className="text-xl">☰</span>
                </button>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {user?.firstName ? `${user.firstName}` : 'CAPSULA ERP'}
                </h2>
            </div>

            {/* Right side - Actions */}
            <div className="flex items-center gap-2">
                {/* Toggle Dark/Light mode */}
                <ThemeToggle />
                {/* Notificaciones del sistema */}
                <NotificationBell />
                {/* Help Panel con guía por módulo */}
                <HelpPanel />

                {/* Date/Time */}
                <div className="hidden text-sm text-gray-500 lg:block px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg font-medium">
                    {new Date().toLocaleDateString('es-VE', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        timeZone: 'America/Caracas',
                    })}
                </div>
            </div>
        </header>
    );
}
