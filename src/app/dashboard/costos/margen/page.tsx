import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getDishMarginsAction } from '@/app/actions/cost.actions';
import { MargenView } from './margen-view';

export const dynamic = 'force-dynamic';

export default async function MargenPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const result = await getDishMarginsAction();

  if (!result.success) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p className="text-3xl mb-2">⚠️</p>
        <p className="font-bold">Error cargando márgenes</p>
        <p className="text-xs mt-1">{result.message}</p>
      </div>
    );
  }

  return <MargenView result={result} />;
}
