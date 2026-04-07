'use server';

import { getSession } from '@/lib/auth';
import prisma from '@/server/db';

async function getActiveBranch() {
    return prisma.branch.findFirst({ where: { isActive: true } });
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
        return { success: true, message: 'OK', data: waiters };
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
        return { success: true, message: 'OK', data: waiters };
    } catch {
        return { success: false, message: 'Error cargando mesoneros', data: [] };
    }
}

export async function createWaiterAction(data: { firstName: string; lastName: string }) {
    try {
        const session = await getSession();
        if (!session) return { success: false, message: 'No autorizado' };
        const branch = await getActiveBranch();
        if (!branch) return { success: false, message: 'Sin sucursal activa' };
        const waiter = await prisma.waiter.create({
            data: {
                branchId: branch.id,
                firstName: data.firstName.trim(),
                lastName: data.lastName.trim(),
            },
        });
        return { success: true, message: 'Mesonero creado', data: waiter };
    } catch {
        return { success: false, message: 'Error creando mesonero' };
    }
}

export async function updateWaiterAction(id: string, data: { firstName: string; lastName: string }) {
    try {
        const session = await getSession();
        if (!session) return { success: false, message: 'No autorizado' };
        const waiter = await prisma.waiter.update({
            where: { id },
            data: { firstName: data.firstName.trim(), lastName: data.lastName.trim() },
        });
        return { success: true, message: 'Mesonero actualizado', data: waiter };
    } catch {
        return { success: false, message: 'Error actualizando mesonero' };
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
