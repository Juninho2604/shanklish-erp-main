'use client';

import { useState, useTransition } from 'react';
import { UserRole } from '@/types';
import { ROLE_INFO } from '@/lib/constants/roles';
import { updateUserRole, toggleUserStatus, updateUserModules } from '@/app/actions/user.actions';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { PERMISSIONS, hasPermission } from '@/lib/permissions';
import { MODULE_REGISTRY, MODULE_ROLE_ACCESS } from '@/lib/constants/modules-registry';

interface User {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    isActive: boolean;
    allowedModules: string | null;
}

interface UsersViewProps {
    initialUsers: User[];
    enabledModuleIds: string[];
}

export default function UsersView({ initialUsers, enabledModuleIds }: UsersViewProps) {
    const { user: currentUser } = useAuthStore();
    const canManageUsers = hasPermission(currentUser?.role, PERMISSIONS.MANAGE_USERS);
    const isOwner = currentUser?.role === 'OWNER';

    const [users, setUsers] = useState(initialUsers);
    const [editingUser, setEditingUser] = useState<string | null>(null);
    const [modulesPanelUser, setModulesPanelUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleRoleChange = async (userId: string, newRole: string) => {
        if (!confirm(`¿Estás seguro de cambiar el rol a ${newRole}?`)) return;
        setIsLoading(true);
        try {
            const res = await updateUserRole(userId, newRole);
            if (res.success) {
                toast.success(res.message);
                setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
                setEditingUser(null);
            } else {
                toast.error(res.message);
            }
        } catch {
            toast.error('Error al actualizar rol');
        } finally {
            setIsLoading(false);
        }
    };

    const handleStatusToggle = async (userId: string, currentStatus: boolean) => {
        if (!confirm(`¿Estás seguro de ${currentStatus ? 'desactivar' : 'activar'} este usuario?`)) return;
        setIsLoading(true);
        try {
            const res = await toggleUserStatus(userId, !currentStatus);
            if (res.success) {
                toast.success(res.message);
                setUsers(users.map(u => u.id === userId ? { ...u, isActive: !currentStatus } : u));
            } else {
                toast.error(res.message);
            }
        } catch {
            toast.error('Error al cambiar estado');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6 animate-in">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        Gestión de Usuarios
                    </h1>
                    <p className="text-gray-500">
                        {users.length} usuarios registrados
                    </p>
                </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Usuario</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Rol</th>
                                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Estado</th>
                                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Módulos</th>
                                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {users.map((u) => {
                                const roleInfo = ROLE_INFO[u.role as UserRole] || { labelEs: u.role, color: '#6b7280' };
                                const isSelf = u.id === currentUser?.id;
                                const isTargetOwner = u.role === 'OWNER';
                                const canEdit = canManageUsers && !isSelf && (isOwner || !isTargetOwner);

                                let userModules: string[] | null = null;
                                try {
                                    userModules = u.allowedModules ? JSON.parse(u.allowedModules) : null;
                                } catch { /* noop */ }

                                return (
                                    <tr key={u.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-lg dark:bg-gray-700">👤</div>
                                                <div>
                                                    <p className="font-medium text-gray-900 dark:text-white">{u.firstName} {u.lastName}</p>
                                                    <p className="text-xs text-gray-500">{u.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {editingUser === u.id ? (
                                                <select
                                                    className="rounded border border-gray-300 text-sm p-1"
                                                    value={u.role}
                                                    onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                                    disabled={isLoading}
                                                    onBlur={() => setEditingUser(null)}
                                                    autoFocus
                                                >
                                                    {Object.keys(ROLE_INFO).map((role) => (
                                                        <option key={role} value={role}>{ROLE_INFO[role as UserRole].labelEs}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <span
                                                    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                                                    style={{ backgroundColor: `${roleInfo.color}20`, color: roleInfo.color }}
                                                >
                                                    {roleInfo.labelEs}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={cn(
                                                "inline-flex rounded-full px-2 py-1 text-xs font-semibold",
                                                u.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                                            )}>
                                                {u.isActive ? 'Activo' : 'Inactivo'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {canEdit ? (
                                                <button
                                                    onClick={() => setModulesPanelUser(u)}
                                                    className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400"
                                                >
                                                    🧩 {userModules ? `${userModules.length} custom` : 'Por rol'}
                                                </button>
                                            ) : (
                                                <span className="text-xs text-gray-400">
                                                    {userModules ? `${userModules.length} custom` : 'Por rol'}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right space-x-2">
                                            {canEdit && (
                                                <>
                                                    <button
                                                        onClick={() => setEditingUser(u.id)}
                                                        className="text-amber-600 hover:text-amber-900 text-sm font-medium"
                                                        disabled={isLoading}
                                                    >
                                                        Cambiar Rol
                                                    </button>
                                                    <button
                                                        onClick={() => handleStatusToggle(u.id, u.isActive)}
                                                        className={cn(
                                                            "text-sm font-medium ml-3",
                                                            u.isActive ? "text-red-600 hover:text-red-900" : "text-green-600 hover:text-green-900"
                                                        )}
                                                        disabled={isLoading}
                                                    >
                                                        {u.isActive ? 'Desactivar' : 'Activar'}
                                                    </button>
                                                </>
                                            )}
                                            {!canEdit && (
                                                <span className="text-xs text-gray-400 italic">Sólo lectura</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Module Picker Panel ── */}
            {modulesPanelUser && (
                <ModulesPanel
                    user={modulesPanelUser}
                    enabledModuleIds={enabledModuleIds}
                    onClose={() => setModulesPanelUser(null)}
                    onSaved={(userId, newModules) => {
                        setUsers(users.map(u =>
                            u.id === userId
                                ? { ...u, allowedModules: newModules ? JSON.stringify(newModules) : null }
                                : u
                        ));
                        setModulesPanelUser(null);
                    }}
                />
            )}
        </div>
    );
}

// ─── Module Picker Panel ──────────────────────────────────────────────────────

interface ModulesPanelProps {
    user: User;
    enabledModuleIds: string[];
    onClose: () => void;
    onSaved: (userId: string, modules: string[] | null) => void;
}

function ModulesPanel({ user, enabledModuleIds, onClose, onSaved }: ModulesPanelProps) {
    const [isPending, startTransition] = useTransition();

    // Modules accessible by this user's role from enabled modules
    const accessibleModules = MODULE_REGISTRY
        .filter(m => enabledModuleIds.includes(m.id))
        .filter(m => {
            const allowed = MODULE_ROLE_ACCESS[m.id];
            return !allowed || allowed.includes(user.role);
        })
        .sort((a, b) => a.sortOrder - b.sortOrder);

    // Parse current allowedModules (null = all accessible modules)
    let initialSelected: Set<string>;
    try {
        const parsed: string[] | null = user.allowedModules ? JSON.parse(user.allowedModules) : null;
        initialSelected = parsed ? new Set(parsed) : new Set(accessibleModules.map(m => m.id));
    } catch {
        initialSelected = new Set(accessibleModules.map(m => m.id));
    }

    const [selected, setSelected] = useState<Set<string>>(initialSelected);
    const isCustom = user.allowedModules !== null;

    // Check if selection equals "all accessible" (which means no restriction)
    const allAccessibleIds = new Set(accessibleModules.map(m => m.id));
    const isAllSelected = accessibleModules.every(m => selected.has(m.id));

    function toggle(id: string) {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }

    function handleSave() {
        startTransition(async () => {
            // If all accessible modules are selected → save as null (no restriction)
            const toSave = isAllSelected ? null : Array.from(selected);
            const res = await updateUserModules(user.id, toSave);
            if (res.success) {
                toast.success(res.message);
                onSaved(user.id, toSave);
            } else {
                toast.error(res.message);
            }
        });
    }

    function handleReset() {
        startTransition(async () => {
            const res = await updateUserModules(user.id, null);
            if (res.success) {
                toast.success('Permisos restablecidos al rol');
                onSaved(user.id, null);
            } else {
                toast.error(res.message);
            }
        });
    }

    const sections = [
        { key: 'operations', label: 'Operaciones', icon: '⚙️' },
        { key: 'sales',      label: 'Ventas',       icon: '💳' },
        { key: 'games',      label: 'Entretenimiento', icon: '🎮' },
        { key: 'admin',      label: 'Administración', icon: '🔐' },
    ] as const;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/40" onClick={onClose}>
            <div
                className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl dark:bg-gray-900"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                    <div>
                        <p className="font-semibold text-gray-900 dark:text-white">
                            🧩 Módulos de {user.firstName} {user.lastName}
                        </p>
                        <p className="text-xs text-gray-500">
                            {isCustom ? 'Permisos personalizados' : 'Acceso por rol (sin restricción extra)'}
                        </p>
                    </div>
                    <button onClick={onClose} className="ml-auto rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">✕</button>
                </div>

                {/* Module list */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                    {sections.map(section => {
                        const mods = accessibleModules.filter(m => m.section === section.key);
                        if (mods.length === 0) return null;
                        return (
                            <div key={section.key}>
                                <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                                    <span>{section.icon}</span> {section.label}
                                </p>
                                <div className="space-y-1">
                                    {mods.map(mod => (
                                        <label
                                            key={mod.id}
                                            className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selected.has(mod.id)}
                                                onChange={() => toggle(mod.id)}
                                                className="h-4 w-4 rounded border-gray-300 accent-amber-500"
                                                disabled={isPending}
                                            />
                                            <span className="text-lg">{mod.icon}</span>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium text-gray-900 dark:text-white">{mod.label}</p>
                                                <p className="truncate text-xs text-gray-500">{mod.description}</p>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        );
                    })}

                    {accessibleModules.length === 0 && (
                        <p className="text-center text-sm text-gray-400">
                            Este rol no tiene módulos habilitados disponibles.
                        </p>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center gap-3 border-t border-gray-200 px-5 py-4 dark:border-gray-700">
                    {isCustom && (
                        <button
                            onClick={handleReset}
                            disabled={isPending}
                            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300"
                        >
                            Restablecer al rol
                        </button>
                    )}
                    <button
                        onClick={handleSave}
                        disabled={isPending}
                        className="ml-auto rounded-lg bg-amber-500 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-600 active:scale-95 disabled:opacity-50"
                    >
                        {isPending ? 'Guardando…' : `Guardar (${selected.size} módulos)`}
                    </button>
                </div>
            </div>
        </div>
    );
}
