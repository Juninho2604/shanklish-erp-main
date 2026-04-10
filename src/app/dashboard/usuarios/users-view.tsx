'use client';

import { useState, useTransition } from 'react';
import { UserRole } from '@/types';
import { ROLE_INFO } from '@/lib/constants/roles';
import { updateUserRole, toggleUserStatus, updateUserModules, updateUserPin } from '@/app/actions/user.actions';
import { toast } from 'react-hot-toast';
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
    const [selectedUser, setSelectedUser] = useState<User | null>(null);

    const active = users.filter(u => u.isActive);
    const inactive = users.filter(u => !u.isActive);

    const handleRoleChange = async (userId: string, newRole: string) => {
        if (!confirm(`¿Cambiar el rol a ${newRole}?`)) return;
        const res = await updateUserRole(userId, newRole);
        if (res.success) {
            toast.success(res.message);
            const updated = users.map(u => u.id === userId ? { ...u, role: newRole } : u);
            setUsers(updated);
            if (selectedUser?.id === userId) setSelectedUser(prev => prev ? { ...prev, role: newRole } : null);
        } else {
            toast.error(res.message);
        }
    };

    const handleStatusToggle = async (userId: string, currentStatus: boolean) => {
        if (!confirm(`¿${currentStatus ? 'Desactivar' : 'Activar'} este usuario?`)) return;
        const res = await toggleUserStatus(userId, !currentStatus);
        if (res.success) {
            toast.success(res.message);
            setUsers(users.map(u => u.id === userId ? { ...u, isActive: !currentStatus } : u));
            if (selectedUser?.id === userId) setSelectedUser(prev => prev ? { ...prev, isActive: !currentStatus } : null);
        } else {
            toast.error(res.message);
        }
    };

    const handleModulesSaved = (userId: string, newModules: string[] | null) => {
        const updated = users.map(u =>
            u.id === userId
                ? { ...u, allowedModules: newModules ? JSON.stringify(newModules) : null }
                : u
        );
        setUsers(updated);
        if (selectedUser?.id === userId) {
            setSelectedUser(prev => prev ? { ...prev, allowedModules: newModules ? JSON.stringify(newModules) : null } : null);
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="mb-4">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Módulos por Usuario</h1>
                <p className="text-sm text-gray-500 mt-1">
                    Selecciona un usuario para configurar qué módulos del sistema puede ver en su menú.
                    Si usas <span className="font-semibold">acceso por rol</span>, el sistema aplica las reglas predeterminadas del rol.
                </p>
            </div>

            {/* Split panel */}
            <div className="flex gap-4 flex-1 min-h-0 h-[calc(100vh-180px)]">
                {/* ── Left: User list ── */}
                <div className="w-80 shrink-0 flex flex-col bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                    <div className="overflow-y-auto flex-1 p-3 space-y-1">
                        {/* Active users */}
                        <p className="px-2 py-1 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            Usuarios Activos ({active.length})
                        </p>
                        {active.map(u => (
                            <UserCard
                                key={u.id}
                                user={u}
                                isSelected={selectedUser?.id === u.id}
                                onClick={() => setSelectedUser(u)}
                            />
                        ))}

                        {/* Inactive users */}
                        {inactive.length > 0 && (
                            <>
                                <p className="px-2 pt-3 pb-1 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                    Inactivos
                                </p>
                                {inactive.map(u => (
                                    <UserCard
                                        key={u.id}
                                        user={u}
                                        isSelected={selectedUser?.id === u.id}
                                        onClick={() => setSelectedUser(u)}
                                        dimmed
                                    />
                                ))}
                            </>
                        )}
                    </div>
                </div>

                {/* ── Right: Module config panel ── */}
                <div className="flex-1 bg-card border border-border rounded-2xl overflow-hidden shadow-sm flex flex-col">
                    {selectedUser ? (
                        <ModulesPanel
                            key={selectedUser.id}
                            user={selectedUser}
                            enabledModuleIds={enabledModuleIds}
                            canManage={canManageUsers && selectedUser.id !== currentUser?.id && (isOwner || selectedUser.role !== 'OWNER')}
                            isOwner={isOwner}
                            onRoleChange={handleRoleChange}
                            onStatusToggle={handleStatusToggle}
                            onModulesSaved={handleModulesSaved}
                        />
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
                            <div className="text-5xl opacity-30">👤</div>
                            <p className="font-medium">Selecciona un usuario de la lista</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── User Card ────────────────────────────────────────────────────────────────

function UserCard({ user, isSelected, onClick, dimmed }: { user: User; isSelected: boolean; onClick: () => void; dimmed?: boolean }) {
    const roleInfo = ROLE_INFO[user.role as UserRole] || { labelEs: user.role, color: '#6b7280' };
    let isCustom = false;
    try { isCustom = user.allowedModules !== null; } catch { /* noop */ }

    return (
        <button
            onClick={onClick}
            className={`w-full text-left rounded-xl px-3 py-2.5 transition-all border ${
                isSelected
                    ? 'bg-amber-500/10 border-amber-500/40'
                    : 'border-transparent hover:bg-muted'
            } ${dimmed ? 'opacity-50' : ''}`}
        >
            <p className={`font-semibold text-sm ${isSelected ? 'text-amber-500' : 'text-foreground'}`}>
                {user.firstName} {user.lastName}
            </p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span
                    className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                    style={{ backgroundColor: `${roleInfo.color}25`, color: roleInfo.color }}
                >
                    {roleInfo.labelEs}
                </span>
                {isCustom && (
                    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold bg-indigo-500/10 text-indigo-400 uppercase">
                        personalizado
                    </span>
                )}
            </div>
        </button>
    );
}

// ─── Modules Panel ────────────────────────────────────────────────────────────

interface ModulesPanelProps {
    user: User;
    enabledModuleIds: string[];
    canManage: boolean;
    isOwner: boolean;
    onRoleChange: (userId: string, newRole: string) => void;
    onStatusToggle: (userId: string, currentStatus: boolean) => void;
    onModulesSaved: (userId: string, modules: string[] | null) => void;
}

const SECTIONS = [
    { key: 'operations', label: 'Operaciones', icon: '⚙️' },
    { key: 'sales',      label: 'Ventas',       icon: '💳' },
    { key: 'games',      label: 'Entretenimiento', icon: '🎮' },
    { key: 'admin',      label: 'Administración',  icon: '🔐' },
] as const;

function PinSection({ userId, canManage }: { userId: string; canManage: boolean }) {
    const [pin, setPin] = useState('');
    const [isPending, startTransition] = useTransition();

    if (!canManage) return null;

    function handleSavePin() {
        if (!pin.trim()) return;
        startTransition(async () => {
            const res = await updateUserPin(userId, pin.trim());
            if (res.success) {
                toast.success(res.message);
                setPin('');
            } else {
                toast.error(res.message);
            }
        });
    }

    return (
        <div className="border-t border-border px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">PIN de acceso (POS)</p>
            <div className="flex items-center gap-2">
                <input
                    type="password"
                    value={pin}
                    onChange={e => setPin(e.target.value)}
                    placeholder="4–6 dígitos"
                    maxLength={6}
                    inputMode="numeric"
                    pattern="\d*"
                    disabled={isPending}
                    className="w-36 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/40 disabled:opacity-50"
                />
                <button
                    onClick={handleSavePin}
                    disabled={isPending || pin.trim().length < 4}
                    className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-600 active:scale-95 disabled:opacity-50 transition"
                >
                    {isPending ? 'Guardando…' : 'Guardar PIN'}
                </button>
            </div>
        </div>
    );
}

function ModulesPanel({ user, enabledModuleIds, canManage, isOwner, onRoleChange, onStatusToggle, onModulesSaved }: ModulesPanelProps) {
    const [isPending, startTransition] = useTransition();
    const roleInfo = ROLE_INFO[user.role as UserRole] || { labelEs: user.role, color: '#6b7280' };

    const accessibleModules = MODULE_REGISTRY
        .filter(m => enabledModuleIds.includes(m.id))
        .filter(m => {
            const allowed = MODULE_ROLE_ACCESS[m.id];
            return !allowed || allowed.includes(user.role);
        })
        .sort((a, b) => a.sortOrder - b.sortOrder);

    let initialSelected: Set<string>;
    try {
        const parsed: string[] | null = user.allowedModules ? JSON.parse(user.allowedModules) : null;
        initialSelected = parsed ? new Set(parsed) : new Set(accessibleModules.map(m => m.id));
    } catch {
        initialSelected = new Set(accessibleModules.map(m => m.id));
    }

    const [selected, setSelected] = useState<Set<string>>(initialSelected);
    const isCustom = user.allowedModules !== null;
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
            const toSave = isAllSelected ? null : Array.from(selected);
            const res = await updateUserModules(user.id, toSave);
            if (res.success) {
                toast.success(res.message);
                onModulesSaved(user.id, toSave);
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
                onModulesSaved(user.id, null);
            } else {
                toast.error(res.message);
            }
        });
    }

    return (
        <>
            {/* User header */}
            <div className="px-5 py-4 border-b border-border flex items-center gap-3 shrink-0">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-xl shrink-0">👤</div>
                <div className="flex-1 min-w-0">
                    <p className="font-bold text-foreground">{user.firstName} {user.lastName}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <span
                        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase"
                        style={{ backgroundColor: `${roleInfo.color}20`, color: roleInfo.color }}
                    >
                        {roleInfo.labelEs}
                    </span>
                    {canManage && (
                        <select
                            className="text-xs border border-border rounded-lg px-2 py-1 bg-background text-foreground"
                            value={user.role}
                            onChange={e => onRoleChange(user.id, e.target.value)}
                        >
                            {Object.keys(ROLE_INFO).map(role => (
                                <option key={role} value={role}>{ROLE_INFO[role as UserRole].labelEs}</option>
                            ))}
                        </select>
                    )}
                    {canManage && (
                        <button
                            onClick={() => onStatusToggle(user.id, user.isActive)}
                            className={`text-xs font-semibold px-3 py-1 rounded-full border transition ${
                                user.isActive
                                    ? 'border-red-500/30 text-red-400 hover:bg-red-500/10'
                                    : 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
                            }`}
                        >
                            {user.isActive ? 'Desactivar' : 'Activar'}
                        </button>
                    )}
                </div>
            </div>

            {/* Modules list */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">
                        Módulos visibles — {isCustom ? <span className="text-indigo-400">personalizado</span> : <span className="text-muted-foreground">según rol</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{selected.size} de {accessibleModules.length} habilitados</p>
                </div>

                {SECTIONS.map(section => {
                    const mods = accessibleModules.filter(m => m.section === section.key);
                    if (mods.length === 0) return null;
                    return (
                        <div key={section.key}>
                            <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                <span>{section.icon}</span> {section.label}
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                                {mods.map(mod => {
                                    const checked = selected.has(mod.id);
                                    return (
                                        <label
                                            key={mod.id}
                                            className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 border transition-all ${
                                                checked
                                                    ? 'bg-amber-500/5 border-amber-500/20'
                                                    : 'border-border bg-background/50 opacity-50'
                                            } ${!canManage ? 'cursor-default' : ''}`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => canManage && toggle(mod.id)}
                                                className="h-4 w-4 rounded border-gray-300 accent-amber-500"
                                                disabled={isPending || !canManage}
                                            />
                                            <span className="text-base">{mod.icon}</span>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-semibold text-foreground leading-tight">{mod.label}</p>
                                                <p className="text-xs text-muted-foreground truncate">{mod.description}</p>
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}

                {accessibleModules.length === 0 && (
                    <p className="text-center text-sm text-muted-foreground py-8">
                        Este rol no tiene módulos habilitados disponibles.
                    </p>
                )}
            </div>

            {/* PIN section */}
            <PinSection userId={user.id} canManage={canManage} />

            {/* Footer actions */}
            {canManage && (
                <div className="flex items-center gap-3 border-t border-border px-5 py-3 shrink-0">
                    {isCustom && (
                        <button
                            onClick={handleReset}
                            disabled={isPending}
                            className="rounded-xl border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50 transition"
                        >
                            Restablecer al rol
                        </button>
                    )}
                    <button
                        onClick={handleSave}
                        disabled={isPending}
                        className="ml-auto rounded-xl bg-amber-500 px-5 py-2 text-sm font-bold text-white hover:bg-amber-600 active:scale-95 disabled:opacity-50 transition"
                    >
                        {isPending ? 'Guardando…' : `Guardar (${selected.size} módulos)`}
                    </button>
                </div>
            )}
        </>
    );
}
