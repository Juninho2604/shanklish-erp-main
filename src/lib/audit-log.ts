// ============================================================================
// AUDIT LOG HELPER
// ============================================================================
// Usar en TODA server action que modifique datos.
// La tabla AuditLog NUNCA se borra — solo se archiva.
// ============================================================================

import { prisma } from '@/lib/prisma';

type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'       // Soft delete
  | 'VOID'         // Anulación de venta
  | 'APPROVE'
  | 'REJECT'
  | 'COMPLETE'
  | 'CANCEL'
  | 'LOGIN'
  | 'LOGOUT'
  | 'TRANSFER'     // Requisición/transferencia
  | 'PAYMENT'      // Registro de pago
  | 'ADJUSTMENT';  // Ajuste de inventario

type AuditModule =
  | 'POS'
  | 'INVENTORY'
  | 'PRODUCTION'
  | 'RECIPE'
  | 'PURCHASE'
  | 'REQUISITION'
  | 'LOAN'
  | 'AUDIT'
  | 'PROTEIN'
  | 'MENU'
  | 'USER'
  | 'CONFIG'
  | 'AUTH'
  | 'DAILY_INVENTORY'
  | 'COST';

interface AuditLogParams {
  userId: string;
  userName: string;
  userRole: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  description?: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  metadata?: Record<string, unknown>;
  module?: AuditModule;
  ipAddress?: string;
  userAgent?: string;
  deviceId?: string;
}

/**
 * Registra una operación en el AuditLog.
 * Diseñado para no fallar silenciosamente — si falla el log,
 * se captura el error pero NO se interrumpe la operación principal.
 *
 * @example
 * await logAudit({
 *   userId: session.id,
 *   userName: `${session.firstName} ${session.lastName}`,
 *   userRole: session.role,
 *   action: 'CREATE',
 *   entityType: 'SalesOrder',
 *   entityId: newOrder.id,
 *   description: `Creó orden ${newOrder.orderNumber}`,
 *   module: 'POS',
 *   metadata: { orderType: 'RESTAURANT', total: newOrder.total },
 * });
 */
export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        userName: params.userName,
        userRole: params.userRole,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        description: params.description ?? null,
        changes: params.changes ? JSON.stringify(params.changes) : null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        module: params.module ?? null,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
        deviceId: params.deviceId ?? null,
      },
    });
  } catch (error) {
    // Log de auditoría no debe interrumpir la operación principal
    console.error('[AuditLog] Error al registrar:', error);
    console.error('[AuditLog] Params:', JSON.stringify(params, null, 2));
  }
}

/**
 * Helper para calcular cambios entre estado anterior y nuevo.
 * Útil para registrar exactamente qué cambió en un UPDATE.
 *
 * @example
 * const changes = diffChanges(
 *   { name: 'Viejo', price: 10 },
 *   { name: 'Nuevo', price: 15 }
 * );
 * // Resultado: { name: { from: 'Viejo', to: 'Nuevo' }, price: { from: 10, to: 15 } }
 */
export function diffChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Record<string, { from: unknown; to: unknown }> | null {
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  for (const key of Object.keys(after)) {
    if (before[key] !== after[key]) {
      changes[key] = { from: before[key], to: after[key] };
    }
  }

  return Object.keys(changes).length > 0 ? changes : null;
}

/**
 * Helper rápido para logear dentro de una transacción Prisma.
 * Usa el cliente transaccional en vez del global.
 *
 * @example
 * await prisma.$transaction(async (tx) => {
 *   const order = await tx.salesOrder.create({ ... });
 *   await logAuditTx(tx, { ... });
 * });
 */
export async function logAuditTx(
  tx: any, // Prisma TransactionClient
  params: AuditLogParams
): Promise<void> {
  try {
    await tx.auditLog.create({
      data: {
        userId: params.userId,
        userName: params.userName,
        userRole: params.userRole,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        description: params.description ?? null,
        changes: params.changes ? JSON.stringify(params.changes) : null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        module: params.module ?? null,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
        deviceId: params.deviceId ?? null,
      },
    });
  } catch (error) {
    console.error('[AuditLog TX] Error al registrar:', error);
  }
}
