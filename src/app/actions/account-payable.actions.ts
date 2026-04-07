'use server';

import { prisma } from '@/server/db';
import { getSession } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit-log';

export interface AccountPayableData {
  id: string;
  description: string;
  invoiceNumber: string | null;
  supplierId: string | null;
  supplierName: string | null;
  creditorName: string | null;
  totalAmountUsd: number;
  paidAmountUsd: number;
  remainingUsd: number;
  invoiceDate: Date;
  dueDate: Date | null;
  fullyPaidAt: Date | null;
  status: string;
  purchaseOrderId: string | null;
  purchaseOrderNumber: string | null;
  createdByName: string;
  createdAt: Date;
  payments: {
    id: string;
    amountUsd: number;
    paymentMethod: string;
    paymentRef: string | null;
    paidAt: Date;
    notes: string | null;
    createdByName: string;
  }[];
}

export async function getAccountsPayableAction(filters?: {
  status?: string;
  supplierId?: string;
}): Promise<{ success: boolean; data?: AccountPayableData[]; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: 'No autorizado' };
  if (!['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER', 'AUDITOR'].includes(session.role)) {
    return { success: false, error: 'Sin permisos para ver cuentas por pagar' };
  }

  try {
    const accounts = await prisma.accountPayable.findMany({
      where: {
        ...(filters?.status && { status: filters.status }),
        ...(filters?.supplierId && { supplierId: filters.supplierId }),
      },
      include: {
        supplier: { select: { name: true } },
        purchaseOrder: { select: { orderNumber: true } },
        createdBy: { select: { firstName: true, lastName: true } },
        payments: {
          include: { createdBy: { select: { firstName: true, lastName: true } } },
          orderBy: { paidAt: 'asc' },
        },
      },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    });

    // Mark overdue automatically
    const now = new Date();
    const data: AccountPayableData[] = accounts.map(a => {
      const isOverdue = a.status === 'PENDING' || a.status === 'PARTIAL';
      const overdue = isOverdue && a.dueDate && a.dueDate < now;
      return {
        id: a.id,
        description: a.description,
        invoiceNumber: a.invoiceNumber,
        supplierId: a.supplierId,
        supplierName: a.supplier?.name ?? null,
        creditorName: a.creditorName,
        totalAmountUsd: a.totalAmountUsd,
        paidAmountUsd: a.paidAmountUsd,
        remainingUsd: a.remainingUsd,
        invoiceDate: a.invoiceDate,
        dueDate: a.dueDate,
        fullyPaidAt: a.fullyPaidAt,
        status: overdue ? 'OVERDUE' : a.status,
        purchaseOrderId: a.purchaseOrderId,
        purchaseOrderNumber: a.purchaseOrder?.orderNumber ?? null,
        createdByName: `${a.createdBy.firstName} ${a.createdBy.lastName}`,
        createdAt: a.createdAt,
        payments: a.payments.map(p => ({
          id: p.id,
          amountUsd: p.amountUsd,
          paymentMethod: p.paymentMethod,
          paymentRef: p.paymentRef,
          paidAt: p.paidAt,
          notes: p.notes,
          createdByName: `${p.createdBy.firstName} ${p.createdBy.lastName}`,
        })),
      };
    });

    return { success: true, data };
  } catch (e) {
    return { success: false, error: 'Error al obtener cuentas por pagar' };
  }
}

export async function createAccountPayableAction(input: {
  description: string;
  invoiceNumber?: string;
  supplierId?: string;
  creditorName?: string;
  totalAmountUsd: number;
  invoiceDate: string;
  dueDate?: string;
  purchaseOrderId?: string;
}): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: 'No autorizado' };
  if (!['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER'].includes(session.role)) {
    return { success: false, error: 'Sin permisos para crear cuentas por pagar' };
  }

  if (!input.description.trim()) return { success: false, error: 'La descripción es requerida' };
  if (!input.totalAmountUsd || input.totalAmountUsd <= 0) return { success: false, error: 'El monto debe ser mayor a 0' };
  if (!input.supplierId && !input.creditorName?.trim()) return { success: false, error: 'Debe especificar proveedor o nombre del acreedor' };

  const invoiceDate = new Date(input.invoiceDate);
  if (isNaN(invoiceDate.getTime())) return { success: false, error: 'Fecha de factura inválida' };
  const dueDate = input.dueDate ? new Date(input.dueDate) : null;

  try {
    const account = await prisma.accountPayable.create({
      data: {
        description: input.description.trim(),
        invoiceNumber: input.invoiceNumber?.trim() || null,
        supplierId: input.supplierId || null,
        creditorName: input.creditorName?.trim() || null,
        totalAmountUsd: input.totalAmountUsd,
        paidAmountUsd: 0,
        remainingUsd: input.totalAmountUsd,
        invoiceDate,
        dueDate,
        status: 'PENDING',
        purchaseOrderId: input.purchaseOrderId || null,
        createdById: session.id,
      },
    });

    await logAudit({
      userId: session.id, userName: `${session.firstName} ${session.lastName}`,
      userRole: session.role, action: 'CREATE', entityType: 'AccountPayable',
      entityId: account.id,
      description: `Registró cuenta por pagar: ${account.description} — $${account.totalAmountUsd.toFixed(2)}`,
      module: 'CONFIG',
    });

    revalidatePath('/dashboard/cuentas-pagar');
    revalidatePath('/dashboard/finanzas');
    return { success: true };
  } catch (e) {
    return { success: false, error: 'Error al crear cuenta por pagar' };
  }
}

export async function registerPaymentAction(
  accountPayableId: string,
  input: {
    amountUsd: number;
    amountBs?: number;
    exchangeRate?: number;
    paymentMethod: string;
    paymentRef?: string;
    paidAt: string;
    notes?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: 'No autorizado' };
  if (!['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER'].includes(session.role)) {
    return { success: false, error: 'Sin permisos para registrar pagos' };
  }

  if (!input.amountUsd || input.amountUsd <= 0) return { success: false, error: 'El monto debe ser mayor a 0' };
  const paidAt = new Date(input.paidAt);
  if (isNaN(paidAt.getTime())) return { success: false, error: 'Fecha inválida' };

  try {
    const account = await prisma.accountPayable.findUnique({ where: { id: accountPayableId } });
    if (!account) return { success: false, error: 'Cuenta por pagar no encontrada' };
    if (account.status === 'PAID' || account.status === 'VOID') {
      return { success: false, error: 'Esta cuenta ya está saldada o anulada' };
    }
    if (input.amountUsd > account.remainingUsd + 0.01) {
      return { success: false, error: `El pago ($${input.amountUsd}) supera el saldo pendiente ($${account.remainingUsd.toFixed(2)})` };
    }

    const newPaid = account.paidAmountUsd + input.amountUsd;
    const newRemaining = account.totalAmountUsd - newPaid;
    const isPaid = newRemaining <= 0.01;

    await prisma.$transaction([
      prisma.accountPayment.create({
        data: {
          accountPayableId,
          amountUsd: input.amountUsd,
          amountBs: input.amountBs ?? null,
          exchangeRate: input.exchangeRate ?? null,
          paymentMethod: input.paymentMethod,
          paymentRef: input.paymentRef?.trim() || null,
          paidAt,
          notes: input.notes?.trim() || null,
          createdById: session.id,
        },
      }),
      prisma.accountPayable.update({
        where: { id: accountPayableId },
        data: {
          paidAmountUsd: newPaid,
          remainingUsd: Math.max(0, newRemaining),
          status: isPaid ? 'PAID' : 'PARTIAL',
          ...(isPaid && { fullyPaidAt: new Date() }),
        },
      }),
    ]);

    await logAudit({
      userId: session.id, userName: `${session.firstName} ${session.lastName}`,
      userRole: session.role, action: 'PAYMENT', entityType: 'AccountPayable',
      entityId: accountPayableId,
      description: `Registró pago $${input.amountUsd.toFixed(2)} a: ${account.description}`,
      module: 'CONFIG',
      metadata: { newPaid, newRemaining, isPaid },
    });

    revalidatePath('/dashboard/cuentas-pagar');
    revalidatePath('/dashboard/finanzas');
    return { success: true };
  } catch (e) {
    console.error('[registerPaymentAction]', e);
    return { success: false, error: 'Error al registrar pago' };
  }
}
