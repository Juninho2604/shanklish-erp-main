import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getExchangeRateHistory } from '@/app/actions/exchange.actions';
import { TasaCambioView } from './tasa-cambio-view';

export const metadata = {
    title: 'Tasa de Cambio | CAPSULA ERP',
    description: 'Actualizar la tasa de cambio BCV',
};

export default async function TasaCambioPage() {
    const session = await getSession();
    if (!session) redirect('/login');

    const allowed = ['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER', 'CASHIER_RESTAURANT', 'CASHIER_DELIVERY'];
    if (!allowed.includes(session.role)) redirect('/dashboard');

    const history = await getExchangeRateHistory(15);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    💱 Tasa de Cambio
                </h1>
                <p className="text-gray-500 dark:text-gray-400">
                    Actualiza la tasa BCV diaria. Se aplica en todos los POS de manera inmediata.
                </p>
            </div>
            <TasaCambioView history={history} />
        </div>
    );
}
