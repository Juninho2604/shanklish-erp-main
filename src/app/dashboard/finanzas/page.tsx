import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getFinancialSummaryAction, getMonthlyTrendAction } from '@/app/actions/finance.actions';
import { FinanzasView } from './finanzas-view';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Finanzas | CAPSULA ERP',
  description: 'Dashboard financiero — P&L, flujo de caja y análisis',
};

export default async function FinanzasPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!['OWNER', 'ADMIN_MANAGER', 'AUDITOR'].includes(session.role)) {
    redirect('/dashboard');
  }

  const now = new Date();
  const [summaryResult, trendResult] = await Promise.all([
    getFinancialSummaryAction(now.getMonth() + 1, now.getFullYear()),
    getMonthlyTrendAction(6),
  ]);

  return (
    <FinanzasView
      initialSummary={summaryResult.data ?? null}
      initialTrend={trendResult.data ?? []}
      currentMonth={now.getMonth() + 1}
      currentYear={now.getFullYear()}
    />
  );
}
