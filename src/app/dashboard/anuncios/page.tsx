import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getAllBroadcastsAdminAction } from '@/app/actions/notifications.actions';
import AnunciosView from './anuncios-view';

export const dynamic = 'force-dynamic';

export default async function AnunciosPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER'].includes(session.role)) {
    redirect('/dashboard');
  }

  const result = await getAllBroadcastsAdminAction();

  return <AnunciosView initialData={result.data ?? []} />;
}
