'use server';

import { getSession } from '@/lib/auth';
import prisma from '@/server/db';
import { hashPin, pbkdf2Hex } from './user.actions';

async function getActiveBranch() {
    return prisma.branch.findFirst({ where: { isActive: true } });
}

const PIN_MANAGER_ROLES = new Set(['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER']);

async function verifyPin(pin: string, stored: string): Promise<boolean> {
    try {
        if (stored.includes(':')) {
            const colonIdx = stored.indexOf(':');
            const saltHex = stored.slice(0, colonIdx);
            const storedHash = stored.slice(colonIdx + 1);
            if (!saltHex || !storedHash) return false;
            const derived = await pbkdf2Hex(pin, saltHex);
            return derived === storedHash;
        }
        return pin === stored;
    } catch {
        return false;
    }
}

function sanitizePin(pin: string | undefined | null): string | null {
    if (!pin) return null;
    const trimmed = pin.trim();
    if (!trimmed) return null;
    if (!/^\d{4,6}$/.test(trimmed)) {
        throw new Error('El PIN debe ser numérico de 4 a 6 dígitos');
    }
    return trimmed;
}

// Expone si el mesonero tiene PIN configurado sin revelar el hash
function publicWaiter<T extends { pin?: string | null }>(w: T) {
    const { pin, ...rest } = w;
    return { ...rest, hasPin: !!pin };
}

export async function getWaitersAction() {
    try {
        const session = await getSession();
        if (!session) return { success: false, message: 'No autorizado', data: [] };
        const branch = await getActiveBranch();
        if (!branch) return { success: false, message: 'Sin sucursal activa', data: [] };
        const waiters = await prisma.waiter.findMany({
            where: { branchId: branch.id },
            orderBy: [{ isActive: 'desc' }, { firstName: 'asc' }],
        });
        return { success: true, message: 'OK', data: waiters.map(publicWaiter) };
    } catch {
        return { success: false, message: 'Error cargando mesoneros', data: [] };
    }
}

export async function getActiveWaitersAction() {
    try {
        const session = await getSession();
        if (!session) return { success: false, message: 'No autorizado', data: [] };
        const branch = await getActiveBranch();
        if (!branch) return { success: false, message: 'Sin sucursal activa', data: [] };
        const waiters = await prisma.waiter.findMany({
            where: { branchId: branch.id, isActive: true },
            orderBy: { firstName: 'asc' },
        });
        return { success: true, message: 'OK', data: waiters.map(publicWaiter) };
    } catch {
        return { success: false, message: 'Error cargando mesoneros', data: [] };
    }
}

export async function createWaiterAction(data: { firstName: string; lastName: string; pin?: string; isCaptain?: boolean }) {
    try {
        const session = await getSession();
        if (!session) return { success: false, message: 'No autorizado' };
        const branch = await getActiveBranch();
        if (!branch) return { success: false, message: 'Sin sucursal activa' };
        if (data.pin && !PIN_MANAGER_ROLES.has(session.role)) {
            return { success: false, message: 'No tienes permisos para asignar PIN' };
        }
        const pinClean = sanitizePin(data.pin);
        const pinHash = pinClean ? await hashPin(pinClean) : null;
        const waiter = await prisma.waiter.create({
            data: {
                branchId: branch.id,
                firstName: data.firstName.trim(),
                lastName: data.lastName.trim(),
                pin: pinHash,
                isCaptain: data.isCaptain ?? false,
            },
        });
        return { success: true, message: 'Mesonero creado', data: publicWaiter(waiter) };
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error creando mesonero';
        return { success: false, message: msg };
    }
}

export async function updateWaiterAction(id: string, data: { firstName: string; lastName: string; pin?: string | null; isCaptain?: boolean }) {
    try {
        const session = await getSession();
        if (!session) return { success: false, message: 'No autorizado' };
        if (data.pin !== undefined && !PIN_MANAGER_ROLES.has(session.role)) {
            return { success: false, message: 'No tienes permisos para cambiar el PIN' };
        }
        const updateData: { firstName: string; lastName: string; pin?: string | null; isCaptain?: boolean } = {
            firstName: data.firstName.trim(),
            lastName: data.lastName.trim(),
            ...(data.isCaptain !== undefined ? { isCaptain: data.isCaptain } : {}),
        };
        // Reglas:
        //  - pin === undefined → no tocar
        //  - pin === '' o null → borrar
        //  - pin string válido → hashear y guardar
        if (data.pin !== undefined) {
            if (data.pin === null || data.pin === '') {
                updateData.pin = null;
            } else {
                const pinClean = sanitizePin(data.pin);
                updateData.pin = pinClean ? await hashPin(pinClean) : null;
            }
        }
        const waiter = await prisma.waiter.update({ where: { id }, data: updateData });
        return { success: true, message: 'Mesonero actualizado', data: publicWaiter(waiter) };
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error actualizando mesonero';
        return { success: false, message: msg };
    }
}

export async function toggleWaiterActiveAction(id: string, isActive: boolean) {
    try {
        const session = await getSession();
        if (!session) return { success: false, message: 'No autorizado' };
        await prisma.waiter.update({ where: { id }, data: { isActive } });
        return { success: true, message: isActive ? 'Mesonero activado' : 'Mesonero desactivado' };
    } catch {
        return { success: false, message: 'Error actualizando estado' };
    }
}

export async function deleteWaiterAction(id: string) {
    try {
        const session = await getSession();
        if (!session) return { success: false, message: 'No autorizado' };
        await prisma.waiter.update({ where: { id }, data: { isActive: false } });
        return { success: true, message: 'Mesonero eliminado' };
    } catch {
        return { success: false, message: 'Error eliminando mesonero' };
    }
}

// ============================================================================
// VALIDACIÓN DE PIN DE MESONERO
// Identifica al mesonero activo en el POS Mesero sin requerir sesión de usuario.
// ============================================================================
export async function validateWaiterPinAction(pin: string): Promise<{
    success: boolean;
    message: string;
    data?: { waiterId: string; firstName: string; lastName: string; isCaptain: boolean };
}> {
    try {
        if (!pin || !/^\d{4,6}$/.test(pin.trim())) {
            return { success: false, message: 'PIN inválido' };
        }
        const branch = await getActiveBranch();
        if (!branch) return { success: false, message: 'Sin sucursal activa' };
        const candidates = await prisma.waiter.findMany({
            where: { branchId: branch.id, isActive: true, pin: { not: null } },
            select: { id: true, firstName: true, lastName: true, isCaptain: true, pin: true },
        });
        for (const w of candidates) {
            if (w.pin && await verifyPin(pin.trim(), w.pin)) {
                return {
                    success: true,
                    message: 'PIN válido',
                    data: { waiterId: w.id, firstName: w.firstName, lastName: w.lastName, isCaptain: w.isCaptain },
                };
            }
        }
        return { success: false, message: 'PIN incorrecto' };
    } catch {
        return { success: false, message: 'Error validando PIN' };
    }
}

// ============================================================================
// TRANSFERENCIA DE MESA
// Acepta PIN de un capitán (Waiter.isCaptain=true) O de un gerente
// (User con rol OWNER/ADMIN_MANAGER/OPS_MANAGER). Registra el historial,
// actualiza waiterProfileId del OpenTab y devuelve el registro creado.
// ============================================================================

type AuthResult =
    | { type: 'CAPTAIN'; name: string; waiterId: string }
    | { type: 'MANAGER'; name: string; userId: string };

async function resolveAuthPin(pin: string, branchId: string): Promise<AuthResult | null> {
    const trimmed = pin.trim();
    // Tipo 1: Waiter capitán activo en la sucursal
    const captains = await prisma.waiter.findMany({
        where: { branchId, isActive: true, isCaptain: true, pin: { not: null } },
        select: { id: true, firstName: true, lastName: true, pin: true },
    });
    for (const c of captains) {
        if (c.pin && await verifyPin(trimmed, c.pin)) {
            return { type: 'CAPTAIN', name: `${c.firstName} ${c.lastName}`, waiterId: c.id };
        }
    }
    // Tipo 2: User gerente/dueño activo (cualquier sucursal)
    const managers = await prisma.user.findMany({
        where: { role: { in: ['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER'] }, isActive: true, pin: { not: null } },
        select: { id: true, firstName: true, lastName: true, pin: true },
    });
    for (const m of managers) {
        if (m.pin && await verifyPin(trimmed, m.pin)) {
            return { type: 'MANAGER', name: `${m.firstName} ${m.lastName}`, userId: m.id };
        }
    }
    return null;
}

export async function transferTableAction({
    openTabId,
    fromWaiterId,
    toWaiterId,
    captainPin,
    reason,
}: {
    openTabId: string;
    fromWaiterId: string;
    toWaiterId: string;
    captainPin: string;
    reason?: string;
}): Promise<{
    success: boolean;
    message: string;
    data?: { transferId: string; toWaiter: { firstName: string; lastName: string } };
}> {
    try {
        if (!captainPin || !/^\d{4,6}$/.test(captainPin.trim())) {
            return { success: false, message: 'PIN inválido' };
        }
        if (fromWaiterId === toWaiterId) {
            return { success: false, message: 'El mesonero destino debe ser distinto al actual' };
        }

        const branch = await getActiveBranch();
        if (!branch) return { success: false, message: 'Sin sucursal activa' };

        // Verificar que el tab existe y está abierto
        const openTab = await prisma.openTab.findUnique({
            where: { id: openTabId },
            select: { id: true, status: true, waiterProfileId: true },
        });
        if (!openTab) return { success: false, message: 'Cuenta no encontrada' };
        if (!['OPEN', 'PARTIALLY_PAID'].includes(openTab.status)) {
            return { success: false, message: 'La cuenta ya está cerrada' };
        }

        // Verificar waiter destino existe y está activo
        const toWaiter = await prisma.waiter.findUnique({
            where: { id: toWaiterId },
            select: { id: true, firstName: true, lastName: true, isActive: true },
        });
        if (!toWaiter || !toWaiter.isActive) {
            return { success: false, message: 'Mesonero destino no encontrado o inactivo' };
        }

        // Validar PIN: capitán Waiter O gerente User
        const auth = await resolveAuthPin(captainPin, branch.id);
        if (!auth) {
            return { success: false, message: 'PIN de capitán o gerente incorrecto' };
        }

        // Transacción: crear registro + actualizar OpenTab
        const transfer = await prisma.$transaction(async (tx) => {
            const record = await tx.tableTransfer.create({
                data: {
                    openTabId,
                    fromWaiterId,
                    toWaiterId,
                    authorizedByWaiterId: auth.type === 'CAPTAIN' ? auth.waiterId : null,
                    authorizedByUserId:   auth.type === 'MANAGER' ? auth.userId   : null,
                    authorizedNote:       auth.type === 'CAPTAIN'
                        ? `Capitán: ${auth.name}`
                        : `Gerente: ${auth.name}`,
                    reason: reason?.trim() || null,
                },
            });
            await tx.openTab.update({
                where: { id: openTabId },
                data: { waiterProfileId: toWaiterId },
            });
            return record;
        });

        return {
            success: true,
            message: `Mesa cedida a ${toWaiter.firstName} ${toWaiter.lastName}`,
            data: {
                transferId: transfer.id,
                toWaiter: { firstName: toWaiter.firstName, lastName: toWaiter.lastName },
            },
        };
    } catch {
        return { success: false, message: 'Error realizando la transferencia' };
    }
}

// ============================================================================
// MOVER TAB ENTRE MESAS FÍSICAS
// Reasigna el tableOrStationId del OpenTab sin cerrar ni reabrir la cuenta.
// Actualiza currentStatus de ambas mesas y registra en TableTransfer.
// ============================================================================
export async function moveTabBetweenTablesAction({
    openTabId,
    toTableId,
    captainPin,
    reason,
}: {
    openTabId: string;
    toTableId: string;
    captainPin: string;
    reason?: string;
}): Promise<{
    success: boolean;
    message: string;
    data?: { transferId: string; toTableName: string };
}> {
    try {
        if (!captainPin || !/^\d{4,6}$/.test(captainPin.trim())) {
            return { success: false, message: 'PIN inválido' };
        }

        const branch = await getActiveBranch();
        if (!branch) return { success: false, message: 'Sin sucursal activa' };

        // Cargar el OpenTab con su mesa y mesonero actuales
        const openTab = await prisma.openTab.findUnique({
            where: { id: openTabId },
            select: {
                id: true,
                status: true,
                tableOrStationId: true,
                waiterProfileId: true,
            },
        });
        if (!openTab) return { success: false, message: 'Cuenta no encontrada' };
        if (!['OPEN', 'PARTIALLY_PAID'].includes(openTab.status)) {
            return { success: false, message: 'La cuenta ya está cerrada' };
        }

        const fromTableId = openTab.tableOrStationId;
        if (!fromTableId) return { success: false, message: 'La cuenta no tiene mesa asignada' };
        if (fromTableId === toTableId) return { success: false, message: 'La mesa destino es la misma que la actual' };

        // Validar que la mesa destino existe, pertenece a la sucursal y está AVAILABLE
        const toTable = await prisma.tableOrStation.findUnique({
            where: { id: toTableId },
            select: { id: true, name: true, currentStatus: true, branchId: true, isActive: true },
        });
        if (!toTable || !toTable.isActive) {
            return { success: false, message: 'Mesa destino no encontrada o inactiva' };
        }
        if (toTable.branchId !== branch.id) {
            return { success: false, message: 'Mesa destino no pertenece a esta sucursal' };
        }
        if (toTable.currentStatus !== 'AVAILABLE') {
            return { success: false, message: `La mesa "${toTable.name}" no está disponible (${toTable.currentStatus})` };
        }

        // Verificar que no haya otro OpenTab activo en la mesa destino
        const conflictTab = await prisma.openTab.findFirst({
            where: {
                tableOrStationId: toTableId,
                status: { in: ['OPEN', 'PARTIALLY_PAID'] },
                deletedAt: null,
            },
            select: { id: true },
        });
        if (conflictTab) {
            return { success: false, message: 'La mesa destino ya tiene una cuenta activa' };
        }

        // Validar PIN dual: capitán o gerente
        const auth = await resolveAuthPin(captainPin, branch.id);
        if (!auth) {
            return { success: false, message: 'PIN de capitán o gerente incorrecto' };
        }

        const waiterId = openTab.waiterProfileId;
        if (!waiterId) return { success: false, message: 'La cuenta no tiene mesonero asignado' };

        // Transacción atómica
        const transfer = await prisma.$transaction(async (tx) => {
            // 1. Reasignar mesa en el OpenTab
            await tx.openTab.update({
                where: { id: openTabId },
                data: { tableOrStationId: toTableId },
            });

            // 2. Mesa origen → AVAILABLE
            await tx.tableOrStation.update({
                where: { id: fromTableId },
                data: { currentStatus: 'AVAILABLE' },
            });

            // 3. Mesa destino → OCCUPIED
            await tx.tableOrStation.update({
                where: { id: toTableId },
                data: { currentStatus: 'OCCUPIED' },
            });

            // 4. Registrar en TableTransfer (waiter no cambia, solo cambia la mesa)
            const record = await tx.tableTransfer.create({
                data: {
                    openTabId,
                    fromWaiterId: waiterId,
                    toWaiterId:   waiterId,
                    fromTableId,
                    toTableId,
                    authorizedByWaiterId: auth.type === 'CAPTAIN' ? auth.waiterId : null,
                    authorizedByUserId:   auth.type === 'MANAGER' ? auth.userId   : null,
                    authorizedNote: auth.type === 'CAPTAIN'
                        ? `Capitán: ${auth.name}`
                        : `Gerente: ${auth.name}`,
                    reason: reason?.trim() || null,
                },
            });

            return record;
        });

        return {
            success: true,
            message: `Tab movido a mesa "${toTable.name}"`,
            data: { transferId: transfer.id, toTableName: toTable.name },
        };
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error moviendo la mesa';
        return { success: false, message: msg };
    }
}
