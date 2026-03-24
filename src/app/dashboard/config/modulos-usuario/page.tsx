import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getUsers } from '@/app/actions/user.actions';
import { getEnabledModulesFromDB } from '@/app/actions/system-config.actions';
import ModulosUsuarioView from './modulos-usuario-view';

export const dynamic = 'force-dynamic';

export default async function ModulosUsuarioPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!['OWNER', 'ADMIN_MANAGER'].includes(session.role)) {
    redirect('/dashboard');
  }

  const [users, enabledIds] = await Promise.all([
    getUsers(),
    getEnabledModulesFromDB(),
  ]);

  return <ModulosUsuarioView users={users} enabledModuleIds={enabledIds} currentUserId={session.id} />;
}
