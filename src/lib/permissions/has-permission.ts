/**
 * Sistema de permisos de 4 capas — Cápsula ERP
 *
 *  ┌─────────────────────────────────────────────────────────────┐
 *  │  CAPA 4: revokedPerms  ← excepciones que RESTRINGEN (win)   │
 *  │  CAPA 3: grantedPerms  ← excepciones que AMPLÍAN (bypass 2) │
 *  │  CAPA 2: allowedModules ← gating por módulo (si definido)   │
 *  │  CAPA 1: ROLE_BASE_PERMS[role] ← defaults por rol           │
 *  └─────────────────────────────────────────────────────────────┘
 *
 * Orden de evaluación:
 *   1. Si el permiso está en revokedPerms  → DENY  (capa 4 siempre gana)
 *   2. Si el permiso está en grantedPerms  → ALLOW (capa 3 bypassea capa 2)
 *   3. Si el permiso NO está en ROLE_BASE  → DENY
 *   4. Si allowedModules está definido y NINGÚN módulo del perm está en él → DENY
 *   5. En caso contrario                   → ALLOW
 *
 * Retrocompatibilidad:
 *   - grantedPerms/revokedPerms = null → se comporta como el sistema viejo
 *     (solo rol base + allowedModules).
 *   - allowedModules = null → no hay restricción por módulo, solo capa 1.
 */

import {
    PERM,
    type PermKey,
    ROLE_BASE_PERMS,
} from '@/lib/constants/permissions-registry';
import { PERM_TO_MODULES } from './perm-to-modules';

// ─── Tipos ───────────────────────────────────────────────────────────────────

/** Forma mínima del usuario que necesitan las funciones de permisos. */
export interface PermUser {
    role: string;
    allowedModules?: string | null;  // JSON string o null
    grantedPerms?: string | null;    // JSON string o null
    revokedPerms?: string | null;    // JSON string o null
}

// ─── Parsers defensivos ──────────────────────────────────────────────────────

function isValidPerm(p: unknown): p is PermKey {
    return typeof p === 'string' && (Object.values(PERM) as string[]).includes(p);
}

function parsePermList(raw: string | null | undefined): PermKey[] {
    if (!raw || !raw.trim()) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(isValidPerm) : [];
    } catch {
        return [];
    }
}

/**
 * Devuelve los módulos explícitamente permitidos al usuario, o null si no hay
 * restricción (el campo es null/vacío en BD).
 */
function parseAllowedModules(raw: string | null | undefined): string[] | null {
    if (!raw || !raw.trim()) return null;
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return null;
        return parsed.filter((m): m is string => typeof m === 'string');
    } catch {
        return null;
    }
}

// ─── Función principal: hasPermission ────────────────────────────────────────

/** Evalúa las 4 capas en orden de prioridad. */
export function hasPermission(user: PermUser, permission: PermKey): boolean {
    // CAPA 4 — revocaciones ganan sobre todo
    if (parsePermList(user.revokedPerms).includes(permission)) return false;

    // CAPA 3 — concesiones bypassean Capa 1 y Capa 2
    if (parsePermList(user.grantedPerms).includes(permission)) return true;

    // CAPA 1 — el rol debe tener el permiso por defecto
    const base = ROLE_BASE_PERMS[user.role] ?? [];
    if (!base.includes(permission)) return false;

    // CAPA 2 — si allowedModules está definido, al menos un módulo del perm debe estar en él
    const userModules = parseAllowedModules(user.allowedModules);
    if (userModules === null) return true;  // sin restricción individual

    const permModules = PERM_TO_MODULES[permission] ?? [];
    if (permModules.length === 0) return true;  // perm global, siempre pasa capa 2

    return permModules.some(m => userModules.includes(m));
}

/** Cualquiera de los permisos alcanza. */
export function hasAnyPermission(user: PermUser, perms: PermKey[]): boolean {
    return perms.some(p => hasPermission(user, p));
}

/** Todos los permisos son requeridos. */
export function hasAllPermissions(user: PermUser, perms: PermKey[]): boolean {
    return perms.every(p => hasPermission(user, p));
}

/**
 * Lanza un Error con status=403 si no tiene el permiso.
 * Usar en Server Actions o API routes; el caller decide cómo manejarlo.
 */
export function assertPermission(user: PermUser, permission: PermKey): void {
    if (!hasPermission(user, permission)) {
        const err = new Error(`Forbidden: missing permission '${permission}'`);
        (err as Error & { status?: number }).status = 403;
        throw err;
    }
}

// ─── Módulos visibles (para sidebar) ─────────────────────────────────────────

/**
 * Módulos visibles para el usuario = allowedModules ∪ módulos derivados de grantedPerms,
 * MENOS módulos que quedarían sin permisos útiles por revokedPerms.
 *
 * Regla clave: Capa 3 puentea Capa 2. Si le concedes 'VOID_ORDER' a una cajera
 * cuyo allowedModules solo tiene 'pos_delivery', el sidebar le muestra también
 * 'pos_restaurant' (porque VOID_ORDER mapea a pos_restaurant) sin tener que
 * tocar allowedModules.
 *
 * Si allowedModules es null: devuelve null (el caller debe usar filtrado por rol).
 */
export function visibleModules(user: PermUser): string[] | null {
    const base = parseAllowedModules(user.allowedModules);
    if (base === null) return null;  // sin override → caller usa defaults del rol

    const modules = new Set<string>(base);
    const granted = parsePermList(user.grantedPerms);
    for (const p of granted) {
        for (const m of PERM_TO_MODULES[p] ?? []) modules.add(m);
    }
    return Array.from(modules);
}

// ─── Serialización para escribir en BD ───────────────────────────────────────

/** Serializa lista de perms a JSON ordenado y sin duplicados. Devuelve null si está vacía. */
export function serializePerms(perms: PermKey[]): string | null {
    const unique = Array.from(new Set(perms)).sort();
    return unique.length === 0 ? null : JSON.stringify(unique);
}
