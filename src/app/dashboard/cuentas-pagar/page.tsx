import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getAccountsPayableAction } from '@/app/actions/account-payable.actions';
import { getSuppliersAction } from '@/app/actions/purchase.actions';
import { CuentasPagarView } from './cuentas-pagar-view';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Cuentas por Pagar | CAPSULA ERP',
  description: 'Control de deudas y facturas pendientes de pago',
};

export default async function CuentasPagarPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER', 'AUDITOR'].includes(session.role)) {
    redirect('/dashboard');
  }

  const [accountsResult, suppliers] = await Promise.all([
    getAccountsPayableAction(),
    getSuppliersAction(),
  ]);

  return (
    <CuentasPagarView
      initialAccounts={accountsResult.data ?? []}
      suppliers={suppliers ?? []}
      currentUserRole={session.role}
    />
  );
}
