import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getExpensesAction, getExpenseCategoriesAction } from '@/app/actions/expense.actions';
import { GastosView } from './gastos-view';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Gastos | CAPSULA ERP',
  description: 'Registro y control de gastos operativos',
};

export default async function GastosPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER', 'AUDITOR'].includes(session.role)) {
    redirect('/dashboard');
  }

  const now = new Date();
  const [expensesResult, categoriesResult] = await Promise.all([
    getExpensesAction({ month: now.getMonth() + 1, year: now.getFullYear() }),
    getExpenseCategoriesAction(),
  ]);

  return (
    <GastosView
      initialExpenses={expensesResult.data ?? []}
      initialSummary={expensesResult.summary ?? { totalUsd: 0, countByCategory: [], countByPaymentMethod: [] }}
      categories={categoriesResult.data ?? []}
      currentUserRole={session.role}
      currentMonth={now.getMonth() + 1}
      currentYear={now.getFullYear()}
    />
  );
}
