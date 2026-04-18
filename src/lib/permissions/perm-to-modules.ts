/**
 * Mapeo de cada permiso (PERM) a los módulos donde aplica.
 *
 * Un permiso puede aplicar a VARIOS módulos — por ejemplo, VOID_ORDER es
 * relevante en POS Restaurante, POS Mesero, POS Delivery y Sales History.
 *
 * Reglas de uso:
 *  - Capa 2 del sistema de permisos (ver has-permission.ts) pasa si AL MENOS
 *    UNO de los módulos del permiso está en `user.allowedModules`.
 *  - Si `user.allowedModules` es null, no hay restricción por módulo (retrocompat).
 *  - Si un permiso mapea a lista vacía, se considera "global" y Capa 2 siempre pasa.
 *  - Capa 3 (grantedPerms) BYPASSEA Capa 2 — ver has-permission.ts.
 *
 * Los IDs de módulo son los definidos en `src/lib/constants/modules-registry.ts`.
 */

import { PERM, type PermKey } from '@/lib/constants/permissions-registry';

export const PERM_TO_MODULES: Record<PermKey, string[]> = {
    // ── POS — transversales entre canales ────────────────────────────────────
    [PERM.VOID_ORDER]:          ['pos_restaurant', 'pos_waiter', 'pos_delivery', 'pedidosya', 'sales_history'],
    [PERM.APPLY_DISCOUNT]:      ['pos_restaurant', 'pos_waiter', 'pos_delivery', 'pedidosya'],
    [PERM.APPROVE_DISCOUNT]:    ['pos_restaurant', 'pos_waiter', 'pos_delivery', 'pedidosya'],
    [PERM.VIEW_ALL_ORDERS]:     ['sales_history'],
    [PERM.REPRINT_COMANDA]:     ['pos_restaurant', 'pos_waiter', 'pos_delivery', 'pedidosya', 'sales_history'],

    // ── Inventario ───────────────────────────────────────────────────────────
    [PERM.ADJUST_STOCK]:        ['inventory', 'inventory_daily'],
    [PERM.APPROVE_TRANSFER]:    ['transfers'],
    [PERM.CLOSE_DAILY_INV]:     ['inventory_daily'],

    // ── Financiero / Caja ────────────────────────────────────────────────────
    [PERM.EXPORT_SALES]:        ['sales_history', 'caja'],
    [PERM.VIEW_COSTS]:          ['costs', 'margen', 'finanzas'],
    [PERM.OPEN_CASH_REGISTER]:  ['caja'],
    [PERM.CLOSE_CASH_REGISTER]: ['caja'],
    [PERM.VIEW_FINANCES]:       ['finanzas'],

    // ── Admin / Sistema ──────────────────────────────────────────────────────
    [PERM.MANAGE_USERS]:        ['users'],
    [PERM.MANAGE_PINS]:         ['users', 'mesoneros'],
    [PERM.CONFIGURE_SYSTEM]:    ['module_config'],
    [PERM.MANAGE_BROADCAST]:    ['anuncios'],
};

/** Devuelve el conjunto de módulos asociados a una lista de permisos. */
export function modulesOfPerms(perms: PermKey[]): Set<string> {
    const out = new Set<string>();
    for (const p of perms) {
        for (const m of PERM_TO_MODULES[p] ?? []) out.add(m);
    }
    return out;
}
