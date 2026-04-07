import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getCashRegistersAction } from '@/app/actions/cash-register.actions';
import { CajaView } from './caja-view';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Caja | CAPSULA ERP',
  description: 'Apertura y cierre de caja diaria',
};

export default async function CajaPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER', 'AUDITOR', 'CASHIER_RESTAURANT', 'CASHIER_DELIVERY'].includes(session.role)) {
    redirect('/dashboard');
  }

  const now = new Date();
  const result = await getCashRegistersAction({ month: now.getMonth() + 1, year: now.getFullYear() });

  return (
    <CajaView
      initialRegisters={result.data ?? []}
      currentUserRole={session.role}
      currentMonth={now.getMonth() + 1}
      currentYear={now.getFullYear()}
    />
  );
}
