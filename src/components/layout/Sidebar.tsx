'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { useUIStore } from '@/stores/ui.store';
import { ROLE_INFO } from '@/lib/constants/roles';
import { UserRole } from '@/types';
import { logoutAction } from '@/app/actions/auth.actions';
import { ChangePasswordDialog } from '@/components/users/ChangePasswordDialog';
import { getModulesBySection, type ModuleDefinition } from '@/lib/constants/modules-registry';

interface SidebarProps {
    initialUser?: any; // SessionPayload
    enabledModuleIds?: string[]; // Viene de la BD vía DashboardLayout
    userAllowedModules?: string[] | null; // Permisos individuales del usuario (null = sin restricción)
}

/**
 * Sección del sidebar con título y módulos
 */
function SidebarSection({
    title,
    modules,
    pathname,
    closeSidebar,
    colorScheme = 'amber',
}: {
    title: string;
    modules: ModuleDefinition[];
    pathname: string;
    closeSidebar: () => void;
    colorScheme?: 'amber' | 'green' | 'purple' | 'blue';
}) {
    if (modules.length === 0) return null;

    const activeGradients = {
        amber: 'bg-gradient-to-r from-amber-500/10 to-orange-500/10 text-amber-700 dark:text-amber-400',
        green: 'bg-gradient-to-r from-green-500/10 to-emerald-500/10 text-green-700 dark:text-green-400',
        purple: 'bg-gradient-to-r from-purple-500/10 to-violet-500/10 text-purple-700 dark:text-purple-400',
        blue: 'bg-gradient-to-r from-blue-500/10 to-cyan-500/10 text-blue-700 dark:text-blue-400',
    };

    const dotColors = {
        amber: 'bg-amber-500',
        green: 'bg-green-500',
        purple: 'bg-purple-500',
        blue: 'bg-blue-500',
    };

    return (
        <>
            <div className="my-4 border-t border-gray-200 dark:border-gray-700" />
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                {title}
            </p>
            {modules.map((mod) => {
                const isActive = pathname === mod.href
                    || pathname.startsWith(mod.href + '/')
                    || mod.subRoutes?.some(sub => pathname === sub || pathname.startsWith(sub + '/'));

                return (
                    <Link
                        key={mod.id}
                        href={mod.href}
                        onClick={closeSidebar}
                        className={cn(
                            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                            isActive
                                ? activeGradients[colorScheme]
                                : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                        )}
                    >
                        <span className="text-lg">{mod.icon}</span>
                        {mod.label}
                        {isActive && (
                            <div className={cn('ml-auto h-2 w-2 rounded-full', dotColors[colorScheme])} />
                        )}
                    </Link>
                );
            })}
        </>
    );
}

export function Sidebar({ initialUser, enabledModuleIds, userAllowedModules }: SidebarProps) {
    const pathname = usePathname();
    const { user, login } = useAuthStore();
    const { sidebarOpen, closeSidebar } = useUIStore();

    // Sincronizar usuario real con el store al montar
    useEffect(() => {
        if (initialUser && (!user || initialUser.id !== user.id)) {
            login({
                id: initialUser.id,
                email: initialUser.email,
                firstName: initialUser.firstName,
                lastName: initialUser.lastName,
                role: initialUser.role as UserRole,
            });
        }
    }, [initialUser, login, user]);

    // Cerrar sidebar al cambiar de ruta (para móvil)
    useEffect(() => {
        closeSidebar();
    }, [pathname, closeSidebar]);

    // Usar el usuario del store (que ahora está sincronizado)
    const activeUser = user || (initialUser as any);
    const userRole = (activeUser?.role as string) || 'CHEF';

    // Obtener módulos visibles según habilitación (BD) + rol
    // enabledModuleIds viene del servidor (DashboardLayout → BD), nunca del env var
    const sections = getModulesBySection(userRole, enabledModuleIds, userAllowedModules);

    const roleInfo = userRole ? ROLE_INFO[userRole as UserRole] : null;

    return (
        <>
            {/* Overlay for mobile */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/50 md:hidden"
                    onClick={closeSidebar}
                />
            )}

            {/* Sidebar */}
            <aside
                className={cn(
                    "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-gray-200 bg-white transition-transform duration-300 dark:border-gray-700 dark:bg-gray-900",
                    // Mobile: hidden by default, show when open
                    sidebarOpen ? "translate-x-0" : "-translate-x-full",
                    // Desktop: always visible
                    "md:translate-x-0"
                )}
            >
                {/* Logo */}
                <div className="flex h-16 items-center gap-3 border-b border-gray-200 px-6 dark:border-gray-700">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/25">
                        <span className="text-xl">🧀</span>
                    </div>
                    <div>
                        <h1 className="font-bold text-gray-900 dark:text-white">CAPSULA</h1>
                        <p className="text-xs text-gray-500">
                            {process.env.NEXT_PUBLIC_BUSINESS_NAME || 'ERP System'}
                        </p>
                    </div>
                    {/* Close button for mobile */}
                    <button
                        onClick={closeSidebar}
                        className="ml-auto rounded-lg p-1 text-gray-400 hover:bg-gray-100 md:hidden dark:hover:bg-gray-800"
                        aria-label="Cerrar menú"
                    >
                        ✕
                    </button>
                </div>

                {/* Main Navigation — driven by Module Registry */}
                <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">

                    {/* Operaciones */}
                    <SidebarSection
                        title="Operaciones"
                        modules={sections.operations}
                        pathname={pathname}
                        closeSidebar={closeSidebar}
                        colorScheme="amber"
                    />

                    {/* Ventas */}
                    <SidebarSection
                        title="Ventas"
                        modules={sections.sales}
                        pathname={pathname}
                        closeSidebar={closeSidebar}
                        colorScheme="green"
                    />

                    {/* Juegos (solo si hay módulos de juego habilitados) */}
                    <SidebarSection
                        title="Entretenimiento"
                        modules={sections.games}
                        pathname={pathname}
                        closeSidebar={closeSidebar}
                        colorScheme="purple"
                    />

                    {/* Administración */}
                    <SidebarSection
                        title="Administración"
                        modules={sections.admin}
                        pathname={pathname}
                        closeSidebar={closeSidebar}
                        colorScheme="blue"
                    />
                </nav>

                {/* User Info */}
                <div className="border-t border-gray-200 p-4 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-gray-200 to-gray-300 text-lg dark:from-gray-600 dark:to-gray-700">
                            👤
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                                {activeUser?.firstName} {activeUser?.lastName}
                            </p>
                            {roleInfo && (
                                <span
                                    className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                                    style={{
                                        backgroundColor: `${roleInfo.color}20`,
                                        color: roleInfo.color,
                                    }}
                                >
                                    {roleInfo.labelEs}
                                </span>
                            )}
                        </div>

                        <ChangePasswordDialog />

                        {/* Botón Logout */}
                        <form action={logoutAction}>
                            <button
                                type="submit"
                                title="Cerrar Sesión"
                                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-500 dark:hover:bg-gray-800"
                            >
                                🚪
                            </button>
                        </form>
                    </div>
                </div>
            </aside>
        </>
    );
}
