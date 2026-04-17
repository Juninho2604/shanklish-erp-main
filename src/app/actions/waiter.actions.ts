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
// Requiere PIN de un capitán (isCaptain=true). Registra el historial,
// actualiza waiterProfileId del OpenTab y devuelve el registro creado.
// ============================================================================
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

        // Validar PIN contra capitanes activos del branch
        const captains = await prisma.waiter.findMany({
            where: { branchId: branch.id, isActive: true, isCaptain: true, pin: { not: null } },
            select: { id: true, pin: true },
        });
        let authorizedCaptainId: string | null = null;
        for (const c of captains) {
            if (c.pin && await verifyPin(captainPin.trim(), c.pin)) {
                authorizedCaptainId = c.id;
                break;
            }
        }
        if (!authorizedCaptainId) {
            return { success: false, message: 'PIN de capitán incorrecto' };
        }

        // Transacción: crear registro + actualizar OpenTab
        const transfer = await prisma.$transaction(async (tx) => {
            const record = await tx.tableTransfer.create({
                data: {
                    openTabId,
                    fromWaiterId,
                    toWaiterId,
                    authorizedById: authorizedCaptainId!,
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
