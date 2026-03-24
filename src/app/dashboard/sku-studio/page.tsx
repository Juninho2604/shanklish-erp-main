import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getProductFamilies, getSkuTemplates } from '@/app/actions/sku-studio.actions';
import SkuStudioView from './sku-studio-view';

export const dynamic = 'force-dynamic';

export default async function SkuStudioPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER', 'CHEF'].includes(session.role)) {
    redirect('/dashboard');
  }

  const [families, templates] = await Promise.all([
    getProductFamilies(),
    getSkuTemplates(),
  ]);

  return <SkuStudioView families={families} templates={templates} />;
}
