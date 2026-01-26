'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { ROLE_INFO } from '@/lib/constants/roles';
import { UserRole } from '@/types';

interface NavItem {
    label: string;
    href: string;
    icon: string;
    roles?: UserRole[]; // Si no se especifica, todos pueden ver
}

const navigation: NavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: '📊' },
    { label: 'Inventario', href: '/dashboard/inventario', icon: '📦' },
    { label: 'Recetas', href: '/dashboard/recetas', icon: '📋' },
    { label: 'Producción', href: '/dashboard/produccion', icon: '🏭' },
    {
        label: 'Costos',
        href: '/dashboard/costos',
        icon: '💰',
        roles: ['OWNER', 'AUDITOR', 'ADMIN_MANAGER', 'OPS_MANAGER'], // Solo niveles 1-4
    },
];

const secondaryNavigation: NavItem[] = [
    {
        label: 'Usuarios',
        href: '/dashboard/usuarios',
        icon: '👥',
        roles: ['OWNER', 'ADMIN_MANAGER'],
    },
    { label: 'Configuración', href: '/dashboard/config', icon: '⚙️', roles: ['OWNER', 'ADMIN_MANAGER'] },
];

export function Sidebar() {
    const pathname = usePathname();
    const { user, setRole } = useAuthStore();

    // Filtrar navegación según rol del usuario
    const filteredNav = navigation.filter(
        item => !item.roles || (user && item.roles.includes(user.role))
    );
    const filteredSecondaryNav = secondaryNavigation.filter(
        item => !item.roles || (user && item.roles.includes(user.role))
    );

    const roleInfo = user ? ROLE_INFO[user.role] : null;

    return (
        <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
            {/* Logo */}
            <div className="flex h-16 items-center gap-3 border-b border-gray-200 px-6 dark:border-gray-700">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/25">
                    <span className="text-xl">🧀</span>
                </div>
                <div>
                    <h1 className="font-bold text-gray-900 dark:text-white">Shanklish</h1>
                    <p className="text-xs text-gray-500">ERP v0.1.0</p>
                </div>
            </div>

            {/* Main Navigation */}
            <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
                <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Operaciones
                </p>
                {filteredNav.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                                isActive
                                    ? 'bg-gradient-to-r from-amber-500/10 to-orange-500/10 text-amber-700 dark:text-amber-400'
                                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                            )}
                        >
                            <span className="text-lg">{item.icon}</span>
                            {item.label}
                            {isActive && (
                                <div className="ml-auto h-2 w-2 rounded-full bg-amber-500" />
                            )}
                        </Link>
                    );
                })}

                {filteredSecondaryNav.length > 0 && (
                    <>
                        <div className="my-4 border-t border-gray-200 dark:border-gray-700" />
                        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                            Administración
                        </p>
                        {filteredSecondaryNav.map((item) => {
                            const isActive = pathname === item.href;
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                                        isActive
                                            ? 'bg-gradient-to-r from-amber-500/10 to-orange-500/10 text-amber-700 dark:text-amber-400'
                                            : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                                    )}
                                >
                                    <span className="text-lg">{item.icon}</span>
                                    {item.label}
                                </Link>
                            );
                        })}
                    </>
                )}
            </nav>

            {/* Role Switcher (Solo desarrollo) */}
            <div className="border-t border-gray-200 p-3 dark:border-gray-700">
                <p className="mb-2 px-2 text-xs text-gray-400">🔧 Debug: Cambiar Rol</p>
                <select
                    value={user?.role || 'OWNER'}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs dark:border-gray-600 dark:bg-gray-800"
                >
                    <option value="OWNER">👑 Dueño (Nivel 1)</option>
                    <option value="AUDITOR">🔍 Auditor (Nivel 2)</option>
                    <option value="ADMIN_MANAGER">💼 Gerente Admin (Nivel 3)</option>
                    <option value="OPS_MANAGER">🏭 Gerente Ops (Nivel 4)</option>
                    <option value="HR_MANAGER">👥 RRHH (Nivel 5)</option>
                    <option value="CHEF">👨‍🍳 Chef (Nivel 6)</option>
                    <option value="AREA_LEAD">📍 Jefe Área (Nivel 7)</option>
                </select>
            </div>

            {/* User Info */}
            <div className="border-t border-gray-200 p-4 dark:border-gray-700">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-gray-200 to-gray-300 text-lg dark:from-gray-600 dark:to-gray-700">
                        👤
                    </div>
                    <div className="flex-1 overflow-hidden">
                        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                            {user?.firstName} {user?.lastName}
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
                </div>
            </div>
        </aside>
    );
}
