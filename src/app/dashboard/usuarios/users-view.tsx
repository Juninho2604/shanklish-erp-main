'use client';

import { useState, useTransition } from 'react';
import { UserRole } from '@/types';
import { ROLE_INFO } from '@/lib/constants/roles';
import { updateUserRole, toggleUserStatus, updateUserModules, updateUserPin, updateUserPerms, createUserAction, adminResetPasswordAction } from '@/app/actions/user.actions';
import { toast } from 'react-hot-toast';
import { useAuthStore } from '@/stores/auth.store';
import { PERMISSIONS, hasPermission } from '@/lib/permissions';
import { MODULE_REGISTRY, MODULE_ROLE_ACCESS } from '@/lib/constants/modules-registry';
import { PERM_GROUPS, PERM_LABELS, ROLE_BASE_PERMS, type PermKey } from '@/lib/constants/permissions-registry';

interface User {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    isActive: boolean;
    allowedModules: string | null;
    grantedPerms: string | null;
    revokedPerms: string | null;
    pinSet: boolean;
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
    const [showCreateModal, setShowCreateModal] = useState(false);

    const handleUserCreated = (newUser: User) => {
        setUsers(prev => [newUser, ...prev]);
        setSelectedUser(newUser);
        setShowCreateModal(false);
    };

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

    const handlePermsSaved = (userId: string, granted: string[] | null, revoked: string[] | null) => {
        const updated = users.map(u =>
            u.id === userId
                ? {
                    ...u,
                    grantedPerms: granted && granted.length > 0 ? JSON.stringify(granted) : null,
                    revokedPerms: revoked && revoked.length > 0 ? JSON.stringify(revoked) : null,
                }
                : u
        );
        setUsers(updated);
        if (selectedUser?.id === userId) {
            setSelectedUser(prev => prev ? {
                ...prev,
                grantedPerms: granted && granted.length > 0 ? JSON.stringify(granted) : null,
                revokedPerms: revoked && revoked.length > 0 ? JSON.stringify(revoked) : null,
            } : null);
        }
    };

    const handlePinSaved = (userId: string) => {
        setUsers(users.map(u => u.id === userId ? { ...u, pinSet: true } : u));
        if (selectedUser?.id === userId) {
            setSelectedUser(prev => prev ? { ...prev, pinSet: true } : null);
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Módulos por Usuario</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Selecciona un usuario para configurar qué módulos del sistema puede ver en su menú.
                        Si usas <span className="font-semibold">acceso por rol</span>, el sistema aplica las reglas predeterminadas del rol.
                    </p>
                </div>
                {canManageUsers && (
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="shrink-0 flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white shadow-lg hover:bg-amber-600 active:scale-95 transition-all"
                    >
                        <span className="text-base leading-none">➕</span>
                        Nuevo Usuario
                    </button>
                )}
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
                            canResetPassword={(isOwner || currentUser?.role === 'ADMIN_MANAGER') && selectedUser.id !== currentUser?.id}
                            isOwner={isOwner}
                            onRoleChange={handleRoleChange}
                            onStatusToggle={handleStatusToggle}
                            onModulesSaved={handleModulesSaved}
                            onPermsSaved={handlePermsSaved}
                            onPinSaved={handlePinSaved}
                        />
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
                            <div className="text-5xl opacity-30">👤</div>
                            <p className="font-medium">Selecciona un usuario de la lista</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal: Crear nuevo usuario */}
            {showCreateModal && (
                <CreateUserModal
                    onClose={() => setShowCreateModal(false)}
                    onCreated={handleUserCreated}
                />
            )}
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
    canResetPassword: boolean;
    isOwner: boolean;
    onRoleChange: (userId: string, newRole: string) => void;
    onStatusToggle: (userId: string, currentStatus: boolean) => void;
    onModulesSaved: (userId: string, modules: string[] | null) => void;
    onPermsSaved: (userId: string, granted: string[] | null, revoked: string[] | null) => void;
    onPinSaved: (userId: string) => void;
}

const SECTIONS = [
    { key: 'operations', label: 'Operaciones', icon: '⚙️' },
    { key: 'sales',      label: 'Ventas',       icon: '💳' },
    { key: 'games',      label: 'Entretenimiento', icon: '🎮' },
    { key: 'admin',      label: 'Administración',  icon: '🔐' },
] as const;

function PinSection({ userId, canManage, pinSet, onSaved }: { userId: string; canManage: boolean; pinSet: boolean; onSaved: () => void }) {
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
                onSaved();
            } else {
                toast.error(res.message);
            }
        });
    }

    return (
        <div className="border-t border-border px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">PIN de acceso (POS)</p>
                {pinSet ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Asignado
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        Sin PIN
                    </span>
                )}
            </div>
            <div className="flex items-center gap-2">
                <input
                    type="password"
                    value={pin}
                    onChange={e => setPin(e.target.value)}
                    placeholder={pinSet ? 'Nuevo PIN (4–6 dígitos)' : '4–6 dígitos'}
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
                    {isPending ? 'Guardando…' : pinSet ? 'Cambiar PIN' : 'Guardar PIN'}
                </button>
            </div>
        </div>
    );
}

// ─── Password Reset Section ───────────────────────────────────────────────────

function PasswordResetSection({ userId, canResetPassword }: { userId: string; canResetPassword: boolean }) {
    const [newPassword, setNewPassword] = useState('');
    const [isPending, startTransition] = useTransition();

    if (!canResetPassword) return null;

    function handleReset() {
        if (newPassword.trim().length < 6) return;
        startTransition(async () => {
            const res = await adminResetPasswordAction(userId, newPassword.trim());
            if (res.success) {
                toast.success(res.message);
                setNewPassword('');
            } else {
                toast.error(res.message);
            }
        });
    }

    return (
        <div className="border-t border-border px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                Resetear Contraseña
            </p>
            <div className="flex items-center gap-2">
                <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Nueva contraseña (mín. 6 caracteres)"
                    disabled={isPending}
                    className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/40 disabled:opacity-50"
                />
                <button
                    onClick={handleReset}
                    disabled={isPending || newPassword.trim().length < 6}
                    className="shrink-0 rounded-xl bg-red-600/80 px-4 py-2 text-sm font-bold text-white hover:bg-red-600 active:scale-95 disabled:opacity-50 transition"
                >
                    {isPending ? 'Guardando…' : 'Resetear'}
                </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
                ⚠️ El usuario deberá usar esta contraseña en su próximo inicio de sesión.
            </p>
        </div>
    );
}

// ─── Perms Section ────────────────────────────────────────────────────────────

interface PermsSectionProps {
    userId: string;
    role: string;
    grantedPerms: string | null;
    revokedPerms: string | null;
    canManage: boolean;
    onSaved: (granted: string[] | null, revoked: string[] | null) => void;
}

function PermsSection({ userId, role, grantedPerms, revokedPerms, canManage, onSaved }: PermsSectionProps) {
    const [isPending, startTransition] = useTransition();

    const basePerms = new Set<PermKey>(ROLE_BASE_PERMS[role] ?? []);

    let initialGranted: Set<PermKey>;
    let initialRevoked: Set<PermKey>;
    try {
        initialGranted = new Set((grantedPerms ? JSON.parse(grantedPerms) : []) as PermKey[]);
        initialRevoked = new Set((revokedPerms ? JSON.parse(revokedPerms) : []) as PermKey[]);
    } catch {
        initialGranted = new Set();
        initialRevoked = new Set();
    }

    const [granted, setGranted] = useState<Set<PermKey>>(initialGranted);
    const [revoked, setRevoked] = useState<Set<PermKey>>(initialRevoked);

    function togglePerm(perm: PermKey) {
        if (basePerms.has(perm)) {
            // Perm del rol base: togglear revocación
            setRevoked(prev => {
                const next = new Set(prev);
                next.has(perm) ? next.delete(perm) : next.add(perm);
                return next;
            });
        } else {
            // Perm adicional: togglear concesión
            setGranted(prev => {
                const next = new Set(prev);
                next.has(perm) ? next.delete(perm) : next.add(perm);
                return next;
            });
        }
    }

    function handleSave() {
        startTransition(async () => {
            const grantedArr = granted.size > 0 ? Array.from(granted) : null;
            const revokedArr = revoked.size > 0 ? Array.from(revoked) : null;
            const res = await updateUserPerms(userId, grantedArr, revokedArr);
            if (res.success) {
                toast.success(res.message);
                onSaved(grantedArr, revokedArr);
            } else {
                toast.error(res.message);
            }
        });
    }

    const hasChanges = granted.size > 0 || revoked.size > 0;

    return (
        <div className="border-t border-border px-5 py-4">
            <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Permisos granulares
                </p>
                {hasChanges && (
                    <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full uppercase">
                        {granted.size > 0 && `+${granted.size}`}
                        {granted.size > 0 && revoked.size > 0 && ' / '}
                        {revoked.size > 0 && `−${revoked.size}`}
                    </span>
                )}
            </div>

            <div className="space-y-4">
                {PERM_GROUPS.map(group => (
                    <div key={group.key}>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                            <span>{group.icon}</span> {group.label}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                            {group.perms.map(perm => {
                                const isBase = basePerms.has(perm);
                                const isGranted = granted.has(perm);
                                const isRevoked = revoked.has(perm);
                                // Effective check: base (not revoked) OR extra granted
                                const isChecked = isBase ? !isRevoked : isGranted;
                                const info = PERM_LABELS[perm];

                                return (
                                    <label
                                        key={perm}
                                        className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 border text-sm transition-all ${
                                            isChecked
                                                ? isBase
                                                    ? 'bg-blue-500/5 border-blue-500/20'
                                                    : 'bg-emerald-500/5 border-emerald-500/20'
                                                : 'border-border bg-background/50 opacity-50'
                                        } ${!canManage ? 'cursor-default' : ''}`}
                                        title={info.description}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() => canManage && togglePerm(perm)}
                                            disabled={isPending || !canManage}
                                            className="h-4 w-4 rounded border-gray-300 accent-amber-500 shrink-0"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <p className="font-semibold text-foreground leading-tight truncate">{info.label}</p>
                                            {isBase && !isRevoked && (
                                                <p className="text-[10px] text-blue-400/70 font-bold">del rol</p>
                                            )}
                                            {!isBase && isGranted && (
                                                <p className="text-[10px] text-emerald-400/70 font-bold">extra</p>
                                            )}
                                            {isRevoked && (
                                                <p className="text-[10px] text-red-400/70 font-bold">revocado</p>
                                            )}
                                        </div>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {canManage && (
                <button
                    onClick={handleSave}
                    disabled={isPending}
                    className="mt-4 w-full rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-600 active:scale-95 disabled:opacity-50 transition"
                >
                    {isPending ? 'Guardando…' : 'Guardar permisos'}
                </button>
            )}
        </div>
    );
}

function ModulesPanel({ user, enabledModuleIds, canManage, canResetPassword, isOwner, onRoleChange, onStatusToggle, onModulesSaved, onPermsSaved, onPinSaved }: ModulesPanelProps) {
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
            <PinSection userId={user.id} canManage={canManage} pinSet={user.pinSet} onSaved={() => onPinSaved(user.id)} />

            {/* Password Reset section */}
            <PasswordResetSection userId={user.id} canResetPassword={canResetPassword} />

            {/* Perms section */}
            <PermsSection
                userId={user.id}
                role={user.role}
                grantedPerms={user.grantedPerms}
                revokedPerms={user.revokedPerms}
                canManage={canManage}
                onSaved={(granted, revoked) => onPermsSaved(user.id, granted, revoked)}
            />

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

// ─── Create User Modal ────────────────────────────────────────────────────────

interface CreateUserModalProps {
    onClose: () => void;
    onCreated: (user: User) => void;
}

function CreateUserModal({ onClose, onCreated }: CreateUserModalProps) {
    const [form, setForm] = useState({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        role: 'CASHIER',
    });
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    function handleChange(field: keyof typeof form, value: string) {
        setForm(prev => ({ ...prev, [field]: value }));
        setError(null);
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
            const res = await createUserAction(form);
            if (res.success && res.user) {
                toast.success(res.message ?? 'Usuario creado');
                onCreated(res.user as User);
            } else {
                setError(res.message ?? 'Error al crear usuario');
            }
        });
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <div>
                        <h2 className="text-base font-bold text-foreground">Nuevo Usuario</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">Los datos se pueden modificar después</p>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isPending}
                        className="h-8 w-8 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition disabled:opacity-40"
                    >
                        ✕
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
                    {/* Nombre / Apellido */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                                Nombre
                            </label>
                            <input
                                type="text"
                                required
                                value={form.firstName}
                                onChange={e => handleChange('firstName', e.target.value)}
                                placeholder="Juan"
                                disabled={isPending}
                                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/40 disabled:opacity-50"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                                Apellido
                            </label>
                            <input
                                type="text"
                                required
                                value={form.lastName}
                                onChange={e => handleChange('lastName', e.target.value)}
                                placeholder="Pérez"
                                disabled={isPending}
                                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/40 disabled:opacity-50"
                            />
                        </div>
                    </div>

                    {/* Email */}
                    <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                            Correo electrónico
                        </label>
                        <input
                            type="email"
                            required
                            value={form.email}
                            onChange={e => handleChange('email', e.target.value)}
                            placeholder="usuario@shanklish.com"
                            disabled={isPending}
                            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/40 disabled:opacity-50"
                        />
                    </div>

                    {/* Contraseña */}
                    <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                            Contraseña inicial
                        </label>
                        <input
                            type="password"
                            required
                            minLength={6}
                            value={form.password}
                            onChange={e => handleChange('password', e.target.value)}
                            placeholder="Mínimo 6 caracteres"
                            disabled={isPending}
                            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/40 disabled:opacity-50"
                        />
                    </div>

                    {/* Rol */}
                    <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                            Rol
                        </label>
                        <select
                            required
                            value={form.role}
                            onChange={e => handleChange('role', e.target.value)}
                            disabled={isPending}
                            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/40 disabled:opacity-50 cursor-pointer"
                        >
                            {Object.entries(ROLE_INFO).map(([role, info]) => (
                                <option key={role} value={role}>
                                    {info.labelEs}
                                </option>
                            ))}
                        </select>
                        <p className="text-[11px] text-muted-foreground mt-1">
                            {ROLE_INFO[form.role as import('@/types').UserRole]?.description ?? ''}
                        </p>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                            ⚠️ {error}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isPending}
                            className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50 transition"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isPending}
                            className="flex-1 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-600 active:scale-95 disabled:opacity-50 transition"
                        >
                            {isPending ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                    Creando…
                                </span>
                            ) : 'Crear Usuario'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
