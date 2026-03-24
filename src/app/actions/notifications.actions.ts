'use server';

import prisma from '@/server/db';
import { getSession } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

// ============================================================================
// TIPOS
// ============================================================================

export interface SystemNotification {
  id: string;
  title: string;
  body: string;
  type: 'INFO' | 'WARNING' | 'ALERT' | 'SUCCESS';
  createdAt: string;
  expiresAt: string | null;
}

export interface StockAlert {
  id: string; // inventoryItemId — used as stable dismiss key
  name: string;
  sku: string;
  currentStock: number;
  minimumStock: number;
  unit: string;
  severity: 'critical' | 'warning'; // critical = 0 stock, warning = below minimum
}

export interface NotificationsResult {
  success: boolean;
  systemMessages: SystemNotification[];
  stockAlerts: StockAlert[];
  totalCount: number;
}

// ============================================================================
// LEER NOTIFICACIONES ACTIVAS
// ============================================================================

export async function getNotificationsAction(): Promise<NotificationsResult> {
  try {
    const session = await getSession();
    if (!session) return { success: false, systemMessages: [], stockAlerts: [], totalCount: 0 };

    const role = session.role;
    const now = new Date();

    const isOperational = ['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER', 'AREA_LEAD', 'CHEF', 'KITCHEN_CHEF', 'AUDITOR'].includes(role);

    // ── Mensajes del sistema desde BD ─────────────────────────────────────────
    const rawMessages = await prisma.broadcastMessage.findMany({
      where: {
        isActive: true,
        startsAt: { lte: now },
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Filtrar por targetRoles
    const systemMessages: SystemNotification[] = rawMessages
      .filter((m) => {
        if (!m.targetRoles) return true; // null = todos
        try {
          const roles = JSON.parse(m.targetRoles) as string[];
          return roles.includes(role);
        } catch {
          return true;
        }
      })
      .map((m) => ({
        id: m.id,
        title: m.title,
        body: m.body,
        type: (m.type as SystemNotification['type']) || 'INFO',
        createdAt: m.createdAt.toISOString(),
        expiresAt: m.expiresAt ? m.expiresAt.toISOString() : null,
      }));

    // ── Alertas de stock en tiempo real (solo roles operacionales) ─────────────
    let stockAlerts: StockAlert[] = [];

    if (isOperational) {
      const items = await prisma.inventoryItem.findMany({
        where: { isActive: true },
        include: { stockLevels: { select: { currentStock: true } } },
      });

      stockAlerts = items
        .map((item) => {
          const total = item.stockLevels.reduce((s, l) => s + Number(l.currentStock || 0), 0);
          const min = Number(item.minimumStock);
          return { item, total, min };
        })
        .filter(({ total, min }) => total <= min)
        .map(({ item, total, min }) => ({
          id: item.id,
          name: item.name,
          sku: item.sku,
          currentStock: total,
          minimumStock: min,
          unit: item.baseUnit,
          severity: (total <= 0 ? 'critical' : 'warning') as StockAlert['severity'],
        }))
        .sort((a, b) => {
          if (a.severity === 'critical' && b.severity !== 'critical') return -1;
          if (b.severity === 'critical' && a.severity !== 'critical') return 1;
          return a.currentStock - b.currentStock;
        })
        .slice(0, 15);
    }

    const totalCount = systemMessages.length + stockAlerts.length;
    return { success: true, systemMessages, stockAlerts, totalCount };
  } catch (error) {
    console.error('[notifications] getNotificationsAction error:', error);
    return { success: false, systemMessages: [], stockAlerts: [], totalCount: 0 };
  }
}

// ============================================================================
// CREAR MENSAJE DEL SISTEMA (solo admin)
// ============================================================================

export async function createBroadcastAction(input: {
  title: string;
  body: string;
  type: 'INFO' | 'WARNING' | 'ALERT' | 'SUCCESS';
  targetRoles?: string[];
  expiresInHours?: number;
}): Promise<{ success: boolean; message: string }> {
  try {
    const session = await getSession();
    if (!session) return { success: false, message: 'No autorizado' };
    if (!['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER'].includes(session.role)) {
      return { success: false, message: 'Sin permisos para crear notificaciones' };
    }

    if (!input.title?.trim()) return { success: false, message: 'El título es obligatorio' };
    if (!input.body?.trim()) return { success: false, message: 'El mensaje es obligatorio' };

    const expiresAt = input.expiresInHours
      ? new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000)
      : null;

    await prisma.broadcastMessage.create({
      data: {
        title: input.title.trim(),
        body: input.body.trim(),
        type: input.type,
        targetRoles: input.targetRoles?.length ? JSON.stringify(input.targetRoles) : null,
        expiresAt,
        createdById: session.id,
      },
    });

    revalidatePath('/dashboard', 'layout');
    return { success: true, message: 'Notificación creada' };
  } catch (error) {
    console.error('[notifications] createBroadcast error:', error);
    return { success: false, message: 'Error al crear la notificación' };
  }
}

// ============================================================================
// DESACTIVAR MENSAJE (solo admin)
// ============================================================================

// ============================================================================
// HISTORIAL COMPLETO PARA ADMIN (página Anuncios)
// ============================================================================

export interface BroadcastRecord {
  id: string;
  title: string;
  body: string;
  type: 'INFO' | 'WARNING' | 'ALERT' | 'SUCCESS';
  isActive: boolean;
  targetRoles: string[] | null;
  createdAt: string;
  expiresAt: string | null;
}

export async function getAllBroadcastsAdminAction(): Promise<{ success: boolean; data?: BroadcastRecord[] }> {
  try {
    const session = await getSession();
    if (!session) return { success: false };
    if (!['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER'].includes(session.role)) {
      return { success: false };
    }

    const rows = await prisma.broadcastMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return {
      success: true,
      data: rows.map(r => ({
        id: r.id,
        title: r.title,
        body: r.body,
        type: (r.type as BroadcastRecord['type']) || 'INFO',
        isActive: r.isActive,
        targetRoles: (() => { try { return r.targetRoles ? JSON.parse(r.targetRoles) : null; } catch { return null; } })(),
        createdAt: r.createdAt.toISOString(),
        expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
      })),
    };
  } catch (error) {
    console.error('[notifications] getAllBroadcastsAdminAction error:', error);
    return { success: false };
  }
}

export async function dismissBroadcastAction(id: string): Promise<{ success: boolean }> {
  try {
    const session = await getSession();
    if (!session) return { success: false };
    if (!['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER'].includes(session.role)) {
      return { success: false };
    }
    await prisma.broadcastMessage.update({
      where: { id },
      data: { isActive: false },
    });
    return { success: true };
  } catch {
    return { success: false };
  }
}
