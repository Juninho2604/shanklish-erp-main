import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getAreasAction } from '@/app/actions/areas.actions';
import AlmacenesView from './almacenes-view';

export const dynamic = 'force-dynamic';

export default async function AlmacenesPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER'].includes(session.role)) {
    redirect('/dashboard');
  }

  const result = await getAreasAction();

  return <AlmacenesView initialData={result.data ?? []} />;
}
