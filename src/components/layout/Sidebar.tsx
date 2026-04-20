'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { useUIStore } from '@/stores/ui.store';
import { ROLE_INFO } from '@/lib/constants/roles';
import { UserRole } from '@/types';
import { logoutAction } from '@/app/actions/auth.actions';
import { ChangePasswordDialog } from '@/components/users/ChangePasswordDialog';
import { getVisibleModules, type ModuleDefinition } from '@/lib/constants/modules-registry';
import { CapsulaNavbarLogo } from '@/components/ui/CapsulaLogo';

// ── Props ──────────────────────────────────────────────────────────────────────

interface SidebarProps {
    initialUser?: any; // SessionPayload
    enabledModuleIds?: string[]; // Viene de la BD vía DashboardLayout
    userAllowedModules?: string[] | null; // Permisos individuales del usuario (null = sin restricción)
}

// ── Tree types ─────────────────────────────────────────────────────────────────

type TreeLink     = { kind: 'link';     moduleId: string };
type TreeSubGroup = { kind: 'subgroup'; id: string; label: string; icon: string; items: string[] };
type TreeItem     = TreeLink | TreeSubGroup;
type ColorScheme  = 'coral' | 'green' | 'purple' | 'navy' | 'blue';

interface SectionDef {
    id:     string;
    label:  string;
    scheme: ColorScheme;
    items:  TreeItem[];
}

// ── SIDEBAR_TREE ───────────────────────────────────────────────────────────────
// Árbol visual. El campo `section` del registry es informativo: la ubicación
// real del módulo en el sidebar la manda este tree (ver D4).

const SIDEBAR_TREE: SectionDef[] = [
    {
        id: 'operations', label: 'Operaciones', scheme: 'coral',
        items: [
            { kind: 'link', moduleId: 'dashboard' },
            { kind: 'link', moduleId: 'estadisticas' },
            {
                kind: 'subgroup', id: 'sg-inventario', label: 'Inventario', icon: '📦',
                items: ['inventory', 'inventory_daily', 'inventory_count', 'audits', 'transfers', 'inventory_history'],
            },
            {
                kind: 'subgroup', id: 'sg-produccion', label: 'Producción', icon: '🏭',
                items: ['recipes', 'production', 'proteins', 'loans'],
            },
            {
                kind: 'subgroup', id: 'sg-costos', label: 'Costos', icon: '💰',
                items: ['costs', 'margen'],
            },
            {
                kind: 'subgroup', id: 'sg-catalogo', label: 'Catálogo', icon: '🗂️',
                items: ['menu', 'modifiers', 'sku_studio'],
            },
            { kind: 'link', moduleId: 'purchases' },
        ],
    },
    {
        id: 'sales', label: 'Ventas & POS', scheme: 'green',
        items: [
            { kind: 'link', moduleId: 'pos_restaurant' },
            { kind: 'link', moduleId: 'pos_waiter' },
            { kind: 'link', moduleId: 'pos_delivery' },
            { kind: 'link', moduleId: 'pedidosya' },
            { kind: 'link', moduleId: 'sales_entry' },
            { kind: 'link', moduleId: 'sales_history' },
            { kind: 'link', moduleId: 'kitchen_display' },
            { kind: 'link', moduleId: 'barra_display' },
            { kind: 'link', moduleId: 'pos_config' },
        ],
    },
    {
        id: 'entertainment', label: 'Entretenimiento', scheme: 'purple',
        items: [
            { kind: 'link', moduleId: 'games' },
            { kind: 'link', moduleId: 'reservations' },
            { kind: 'link', moduleId: 'wristbands' },
            { kind: 'link', moduleId: 'queue' },
        ],
    },
    // D4: Finanzas es sección propia, no anidada bajo admin
    {
        id: 'finanzas', label: 'Finanzas', scheme: 'navy',
        items: [
            { kind: 'link', moduleId: 'finanzas' },
            { kind: 'link', moduleId: 'gastos' },
            { kind: 'link', moduleId: 'caja' },
            { kind: 'link', moduleId: 'cuentas_pagar' },
            { kind: 'link', moduleId: 'purchases' },
            { kind: 'link', moduleId: 'tasa_cambio' },
            { kind: 'link', moduleId: 'intercompany' },
        ],
    },
    {
        id: 'admin', label: 'Administración', scheme: 'blue',
        items: [
            { kind: 'link', moduleId: 'users' },
            { kind: 'link', moduleId: 'mesoneros' },
            { kind: 'link', moduleId: 'roles_config' },
            // D3: en capsula figuraba 'modulos' (typo); corregido a 'module_config'
            { kind: 'link', moduleId: 'module_config' },
            // D3: agregados explícitamente para que no dependan de la red de seguridad
            { kind: 'link', moduleId: 'modulos_usuario' },
            { kind: 'link', moduleId: 'asistente' },
            { kind: 'link', moduleId: 'almacenes' },
            { kind: 'link', moduleId: 'metas' },
            { kind: 'link', moduleId: 'anuncios' },
        ],
    },
];

const ORPHAN_SECTION_ID = 'otros';

// ── Color scheme classes ───────────────────────────────────────────────────────

const SCHEMES: Record<ColorScheme, {
    sectionText:  string;
    sectionHover: string;
    activeLink:   string;
    dot:          string;
    sgHover:      string;
    linkHover:    string;
    chevron:      string;
}> = {
    coral: {
        sectionText:  'text-capsula-coral',
        sectionHover: 'hover:bg-capsula-coral-subtle',
        activeLink:   'bg-capsula-coral-subtle text-capsula-coral font-medium',
        dot:          'bg-capsula-coral',
        sgHover:      'hover:bg-capsula-coral-subtle',
        linkHover:    'hover:bg-capsula-coral-subtle hover:text-capsula-coral',
        chevron:      'text-capsula-coral',
    },
    green: {
        sectionText:  'text-emerald-700 dark:text-emerald-400',
        sectionHover: 'hover:bg-emerald-50 dark:hover:bg-emerald-950/30',
        activeLink:   'bg-emerald-50 text-emerald-700 font-medium dark:bg-emerald-950/40 dark:text-emerald-400',
        dot:          'bg-emerald-500',
        sgHover:      'hover:bg-emerald-50 dark:hover:bg-emerald-950/30',
        linkHover:    'hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/30',
        chevron:      'text-emerald-600 dark:text-emerald-400',
    },
    purple: {
        sectionText:  'text-purple-700 dark:text-purple-400',
        sectionHover: 'hover:bg-purple-50 dark:hover:bg-purple-950/30',
        activeLink:   'bg-purple-50 text-purple-700 font-medium dark:bg-purple-950/40 dark:text-purple-400',
        dot:          'bg-purple-500',
        sgHover:      'hover:bg-purple-50 dark:hover:bg-purple-950/30',
        linkHover:    'hover:bg-purple-50 hover:text-purple-700 dark:hover:bg-purple-950/30',
        chevron:      'text-purple-600 dark:text-purple-400',
    },
    navy: {
        sectionText:  'text-capsula-navy dark:text-blue-300',
        sectionHover: 'hover:bg-capsula-navy-subtle dark:hover:bg-blue-950/30',
        activeLink:   'bg-capsula-navy-subtle text-capsula-navy font-medium dark:bg-blue-950/40 dark:text-blue-300',
        dot:          'bg-capsula-navy',
        sgHover:      'hover:bg-capsula-navy-subtle dark:hover:bg-blue-950/30',
        linkHover:    'hover:bg-capsula-navy-subtle hover:text-capsula-navy dark:hover:bg-blue-950/30 dark:hover:text-blue-300',
        chevron:      'text-capsula-navy dark:text-blue-300',
    },
    blue: {
        sectionText:  'text-blue-700 dark:text-blue-400',
        sectionHover: 'hover:bg-blue-50 dark:hover:bg-blue-950/30',
        activeLink:   'bg-blue-50 text-blue-700 font-medium dark:bg-blue-950/40 dark:text-blue-400',
        dot:          'bg-blue-500',
        sgHover:      'hover:bg-blue-50 dark:hover:bg-blue-950/30',
        linkHover:    'hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/30',
        chevron:      'text-blue-600 dark:text-blue-400',
    },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function modIsActive(mod: ModuleDefinition, pathname: string): boolean {
    return (
        pathname === mod.href ||
        pathname.startsWith(mod.href + '/') ||
        (mod.subRoutes?.some(s => pathname === s || pathname.startsWith(s + '/')) ?? false)
    );
}

// Conjunto de moduleIds presentes en SIDEBAR_TREE (incluyendo dentro de subgrupos).
// Se usa como filtro inverso para detectar huérfanos (red de seguridad D2).
const TREE_MODULE_IDS: Set<string> = (() => {
    const s = new Set<string>();
    for (const section of SIDEBAR_TREE) {
        for (const item of section.items) {
            if (item.kind === 'link') s.add(item.moduleId);
            else item.items.forEach(id => s.add(id));
        }
    }
    return s;
})();

function defaultSectionsState(): Record<string, boolean> {
    const base: Record<string, boolean> = Object.fromEntries(
        SIDEBAR_TREE.map(s => [s.id, true]),
    );
    base[ORPHAN_SECTION_ID] = true;
    return base;
}

function defaultSubGroupsState(): Record<string, boolean> {
    const acc: Record<string, boolean> = {};
    SIDEBAR_TREE.forEach(s =>
        s.items.forEach(item => { if (item.kind === 'subgroup') acc[item.id] = true; })
    );
    return acc;
}

// ── localStorage ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'capsula-sidebar-v1';

function loadState(): { sections: Record<string, boolean>; subgroups: Record<string, boolean> } | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function persistState(
    sections: Record<string, boolean>,
    subgroups: Record<string, boolean>,
) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ sections, subgroups })); } catch {}
}

// ── Chevron icon ───────────────────────────────────────────────────────────────

function Chevron({ open, className }: { open: boolean; className?: string }) {
    return (
        <svg
            aria-hidden="true"
            className={cn(
                'h-3.5 w-3.5 shrink-0 transition-transform duration-200',
                open && 'rotate-90',
                className,
            )}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M6 3l5 5-5 5" />
        </svg>
    );
}

// ── Collapsible wrapper ────────────────────────────────────────────────────────

function Collapsible({ open, children }: { open: boolean; children: React.ReactNode }) {
    return (
        <div
            className="grid transition-[grid-template-rows] duration-200 ease-in-out"
            style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
        >
            <div className="overflow-hidden">
                {children}
            </div>
        </div>
    );
}

// ── Individual module link ─────────────────────────────────────────────────────

function ModuleLink({
    mod,
    pathname,
    scheme,
    indent,
    closeSidebar,
}: {
    mod: ModuleDefinition;
    pathname: string;
    scheme: ColorScheme;
    indent: boolean;
    closeSidebar: () => void;
}) {
    const c = SCHEMES[scheme];
    const active = modIsActive(mod, pathname);

    return (
        <Link
            href={mod.href}
            onClick={closeSidebar}
            className={cn(
                'flex items-center gap-2.5 rounded-lg py-2 text-sm transition-colors duration-150',
                indent ? 'pl-9 pr-3' : 'px-3',
                active
                    ? c.activeLink
                    : cn('text-gray-600 dark:text-gray-400', c.linkHover),
            )}
        >
            <span className="text-base leading-none">{mod.icon}</span>
            <span className="flex-1 leading-snug">{mod.label}</span>
            {active && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', c.dot)} />}
        </Link>
    );
}

// ── Sub-group (collapsible group inside a section) ─────────────────────────────

function SubGroup({
    def,
    visibleMap,
    pathname,
    scheme,
    isOpen,
    onToggle,
    closeSidebar,
}: {
    def: TreeSubGroup;
    visibleMap: Map<string, ModuleDefinition>;
    pathname: string;
    scheme: ColorScheme;
    isOpen: boolean;
    onToggle: () => void;
    closeSidebar: () => void;
}) {
    const c = SCHEMES[scheme];
    const visibleItems = def.items
        .map(id => visibleMap.get(id))
        .filter((m): m is ModuleDefinition => !!m);

    if (visibleItems.length === 0) return null;

    const hasActive = visibleItems.some(m => modIsActive(m, pathname));

    return (
        <div>
            <button
                onClick={onToggle}
                className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-150',
                    hasActive && !isOpen
                        ? c.activeLink
                        : cn('text-gray-500 dark:text-gray-400', c.sgHover),
                )}
            >
                <span className="text-base leading-none">{def.icon}</span>
                <span className="flex-1 text-left font-medium leading-snug">{def.label}</span>
                <Chevron open={isOpen} className={cn(c.chevron, 'opacity-70')} />
            </button>

            <Collapsible open={isOpen}>
                <div className="pb-1 pt-0.5">
                    {visibleItems.map(mod => (
                        <ModuleLink
                            key={mod.id}
                            mod={mod}
                            pathname={pathname}
                            scheme={scheme}
                            indent
                            closeSidebar={closeSidebar}
                        />
                    ))}
                </div>
            </Collapsible>
        </div>
    );
}

// ── Top-level section (collapsible) ────────────────────────────────────────────

function Section({
    def,
    visibleMap,
    pathname,
    isOpen,
    openSubGroups,
    onToggle,
    onToggleSubGroup,
    closeSidebar,
}: {
    def: SectionDef;
    visibleMap: Map<string, ModuleDefinition>;
    pathname: string;
    isOpen: boolean;
    openSubGroups: Set<string>;
    onToggle: () => void;
    onToggleSubGroup: (id: string) => void;
    closeSidebar: () => void;
}) {
    const c = SCHEMES[def.scheme];

    // Oculta toda la sección si no tiene nada visible para este usuario
    const hasVisible = def.items.some(item =>
        item.kind === 'link'
            ? visibleMap.has(item.moduleId)
            : item.items.some(id => visibleMap.has(id))
    );
    if (!hasVisible) return null;

    return (
        <div className="mb-1">
            <button
                onClick={onToggle}
                className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-3 py-2 transition-colors duration-150',
                    c.sectionHover,
                )}
            >
                <span className={cn('flex-1 text-left text-[11px] font-bold uppercase tracking-widest', c.sectionText)}>
                    {def.label}
                </span>
                <Chevron open={isOpen} className={c.chevron} />
            </button>

            <Collapsible open={isOpen}>
                <div className="space-y-0.5 pb-1">
                    {def.items.map((item, idx) => {
                        if (item.kind === 'link') {
                            const mod = visibleMap.get(item.moduleId);
                            if (!mod) return null;
                            return (
                                <ModuleLink
                                    key={`${def.id}-${item.moduleId}-${idx}`}
                                    mod={mod}
                                    pathname={pathname}
                                    scheme={def.scheme}
                                    indent={false}
                                    closeSidebar={closeSidebar}
                                />
                            );
                        }
                        return (
                            <SubGroup
                                key={item.id}
                                def={item}
                                visibleMap={visibleMap}
                                pathname={pathname}
                                scheme={def.scheme}
                                isOpen={openSubGroups.has(item.id)}
                                onToggle={() => onToggleSubGroup(item.id)}
                                closeSidebar={closeSidebar}
                            />
                        );
                    })}
                </div>
            </Collapsible>
        </div>
    );
}

// ── Main Sidebar ───────────────────────────────────────────────────────────────

export function Sidebar({ initialUser, enabledModuleIds, userAllowedModules }: SidebarProps) {
    const pathname = usePathname();
    const { user, login } = useAuthStore();
    const setPermissions = useAuthStore(s => s.setPermissions);
    const { sidebarOpen, closeSidebar } = useUIStore();

    // D1 — Sincroniza sesión + permisos 4-capa en el store.
    // setPermissions es INTOCABLE: alimenta a usePermission() (Capas 2/3/4 client-side).
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
        if (initialUser) {
            setPermissions({
                allowedModules: initialUser.allowedModules ?? null,
                grantedPerms: initialUser.grantedPerms ?? null,
                revokedPerms: initialUser.revokedPerms ?? null,
            });
        }
    }, [initialUser, login, user, setPermissions]);

    // Cerrar sidebar al cambiar de ruta (mobile)
    useEffect(() => {
        closeSidebar();
    }, [pathname, closeSidebar]);

    const activeUser = user || (initialUser as any);
    const userRole = (activeUser?.role as string) || 'CHEF';

    // Mapa de módulos visibles (filtrados por rol + módulos habilitados + allowedModules)
    const visibleMap = useMemo(() => {
        const mods = getVisibleModules(userRole, enabledModuleIds, userAllowedModules);
        return new Map(mods.map(m => [m.id, m]));
    }, [userRole, enabledModuleIds, userAllowedModules]);

    // D2 — Red de seguridad: cualquier módulo visible que NO esté en SIDEBAR_TREE
    // cae en una sección "Otros" al final.
    const orphanSection = useMemo<SectionDef | null>(() => {
        const orphans: TreeItem[] = [];
        for (const id of Array.from(visibleMap.keys())) {
            if (!TREE_MODULE_IDS.has(id)) orphans.push({ kind: 'link', moduleId: id });
        }
        if (orphans.length === 0) return null;
        return { id: ORPHAN_SECTION_ID, label: 'Otros', scheme: 'blue', items: orphans };
    }, [visibleMap]);

    // Estado de colapso — todo abierto por default (SSR-safe, localStorage se carga después)
    const [sectionsState, setSectionsState]   = useState<Record<string, boolean>>(defaultSectionsState);
    const [subGroupsState, setSubGroupsState] = useState<Record<string, boolean>>(defaultSubGroupsState);

    // Guard: no persistir a localStorage antes de haberlo leído
    const storedLoaded = useRef(false);

    useEffect(() => {
        const stored = loadState();
        if (stored) {
            setSectionsState(prev => ({ ...prev, ...stored.sections }));
            setSubGroupsState(prev => ({ ...prev, ...stored.subgroups }));
        }
        storedLoaded.current = true;
    }, []);

    useEffect(() => {
        if (!storedLoaded.current) return;
        persistState(sectionsState, subGroupsState);
    }, [sectionsState, subGroupsState]);

    // Auto-expandir sección + subgrupo que contenga la ruta activa
    useEffect(() => {
        const openSecs: string[] = [];
        const openSGs:  string[] = [];

        const visitModule = (modId: string, sectionId: string, subGroupId?: string) => {
            const mod = visibleMap.get(modId);
            if (mod && modIsActive(mod, pathname)) {
                openSecs.push(sectionId);
                if (subGroupId) openSGs.push(subGroupId);
            }
        };

        for (const section of SIDEBAR_TREE) {
            for (const item of section.items) {
                if (item.kind === 'link') visitModule(item.moduleId, section.id);
                else item.items.forEach(id => visitModule(id, section.id, item.id));
            }
        }
        if (orphanSection) {
            for (const item of orphanSection.items) {
                if (item.kind === 'link') visitModule(item.moduleId, orphanSection.id);
            }
        }

        if (openSecs.length > 0) {
            setSectionsState(prev => {
                const next = { ...prev };
                openSecs.forEach(id => { next[id] = true; });
                return next;
            });
        }
        if (openSGs.length > 0) {
            setSubGroupsState(prev => {
                const next = { ...prev };
                openSGs.forEach(id => { next[id] = true; });
                return next;
            });
        }
    }, [pathname, visibleMap, orphanSection]);

    const toggleSection  = (id: string) =>
        setSectionsState(prev => ({ ...prev, [id]: !prev[id] }));

    const toggleSubGroup = (id: string) =>
        setSubGroupsState(prev => ({ ...prev, [id]: !prev[id] }));

    const openSubGroupsSet = useMemo(
        () => new Set(Object.entries(subGroupsState).filter(([, v]) => v).map(([k]) => k)),
        [subGroupsState],
    );

    const roleInfo = userRole ? ROLE_INFO[userRole as UserRole] : null;

    const sectionsToRender: SectionDef[] = orphanSection
        ? [...SIDEBAR_TREE, orphanSection]
        : SIDEBAR_TREE;

    return (
        <>
            {/* Overlay mobile */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/50 md:hidden"
                    onClick={closeSidebar}
                />
            )}

            {/* Sidebar panel */}
            <aside
                className={cn(
                    'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-gray-200 bg-white transition-transform duration-300 dark:border-gray-700 dark:bg-gray-900',
                    sidebarOpen ? 'translate-x-0' : '-translate-x-full',
                    'md:translate-x-0',
                )}
            >
                {/* D5 — Header con CapsulaNavbarLogo, sin fallback 🧀 */}
                <div className="flex h-16 shrink-0 items-center border-b border-gray-200 px-4 dark:border-gray-700">
                    <div className="flex min-w-0 flex-1 flex-col justify-center">
                        <CapsulaNavbarLogo />
                        {process.env.NEXT_PUBLIC_BUSINESS_NAME && (
                            <p className="ml-0.5 mt-0.5 truncate text-[10px] font-medium leading-none text-gray-400 dark:text-gray-500">
                                {process.env.NEXT_PUBLIC_BUSINESS_NAME}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={closeSidebar}
                        className="ml-2 shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-100 md:hidden dark:hover:bg-gray-800"
                        aria-label="Cerrar menú"
                    >
                        ✕
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto px-2 py-3">
                    {sectionsToRender.map(section => (
                        <Section
                            key={section.id}
                            def={section}
                            visibleMap={visibleMap}
                            pathname={pathname}
                            isOpen={sectionsState[section.id] ?? true}
                            openSubGroups={openSubGroupsSet}
                            onToggle={() => toggleSection(section.id)}
                            onToggleSubGroup={toggleSubGroup}
                            closeSidebar={closeSidebar}
                        />
                    ))}
                </nav>

                {/* User footer — preservado de shanklish (ChangePasswordDialog + logout) */}
                <div className="shrink-0 border-t border-gray-200 p-4 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gray-200 to-gray-300 text-lg dark:from-gray-600 dark:to-gray-700">
                            👤
                        </div>
                        <div className="min-w-0 flex-1">
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
