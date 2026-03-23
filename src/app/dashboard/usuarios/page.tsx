import { getUsers } from '@/app/actions/user.actions';
import { getEnabledModulesFromDB } from '@/app/actions/system-config.actions';
import UsersView from './users-view';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
    const [users, enabledModuleIds] = await Promise.all([
        getUsers(),
        getEnabledModulesFromDB(),
    ]);

    return <UsersView initialUsers={users} enabledModuleIds={enabledModuleIds} />;
}
