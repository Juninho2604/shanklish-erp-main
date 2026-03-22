import { getLoanableItemsAction } from '@/app/actions/loan.actions';
import NewLoanForm from './NewLoanForm';
import prisma from '@/server/db';

export const dynamic = 'force-dynamic';

export default async function NewLoanPage() {
    // Parallel fetch
    const [items, areas] = await Promise.all([
        getLoanableItemsAction(),
        prisma.area.findMany({
            where: { isActive: true },
            select: { id: true, name: true },
            orderBy: { name: 'asc' }
        })
    ]);

    return <NewLoanForm items={items} areas={areas} />;
}
