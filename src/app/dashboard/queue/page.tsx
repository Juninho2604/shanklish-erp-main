import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getQueueTickets } from '@/app/actions/games.actions';

export const metadata = { title: 'Cola de Espera | CAPSULA ERP' };

export default async function QueuePage() {
    const session = await getSession();
    if (!session) redirect('/login');
    if (!['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER', 'CASHIER'].includes(session.role)) {
        redirect('/dashboard');
    }

    const tickets = await getQueueTickets(['WAITING', 'CALLED']);

    const waiting = tickets.filter(t => t.status === 'WAITING');
    const called  = tickets.filter(t => t.status === 'CALLED');

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">🎫 Cola de Espera</h1>
                <p className="text-gray-500 dark:text-gray-400">
                    {waiting.length} en espera · {called.length} llamado{called.length !== 1 ? 's' : ''}
                </p>
            </div>

            {/* Called tickets */}
            {called.length > 0 && (
                <div>
                    <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                        Llamados — pasen a su estación
                    </h2>
                    <div className="space-y-2">
                        {called.map(t => (
                            <div
                                key={t.id}
                                className="flex items-center gap-4 rounded-xl border border-amber-300 bg-amber-50 px-5 py-3 dark:border-amber-700 dark:bg-amber-900/20"
                            >
                                <span className="text-2xl font-bold text-amber-600">#{t.ticketNumber}</span>
                                <div className="flex-1">
                                    <p className="font-medium text-gray-900 dark:text-white">{t.customerName}</p>
                                    <p className="text-sm text-gray-500">
                                        {t.guestCount} persona{t.guestCount !== 1 ? 's' : ''} ·{' '}
                                        {t.station?.name ?? 'Cualquier estación'}
                                    </p>
                                </div>
                                {t.calledAt && (
                                    <span className="text-xs text-amber-600 dark:text-amber-400">
                                        Llamado{' '}
                                        {new Date(t.calledAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                )}
                                <span className="rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-white animate-pulse">
                                    LLAMADO
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Waiting tickets */}
            <div>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    En Espera
                </h2>
                {waiting.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center dark:border-gray-700">
                        <p className="text-3xl">🎫</p>
                        <p className="mt-1 text-gray-500 dark:text-gray-400">Cola vacía — sin espera activa</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {waiting.map((t, idx) => (
                            <div
                                key={t.id}
                                className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white px-5 py-3 dark:border-gray-700 dark:bg-gray-900"
                            >
                                <span className="w-8 text-center text-lg font-bold text-gray-300 dark:text-gray-600">
                                    {idx + 1}
                                </span>
                                <span className="font-mono text-sm font-semibold text-gray-600 dark:text-gray-400">
                                    #{t.ticketNumber}
                                </span>
                                <div className="flex-1">
                                    <p className="font-medium text-gray-900 dark:text-white">{t.customerName}</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        {t.guestCount} persona{t.guestCount !== 1 ? 's' : ''}{' '}
                                        {t.station ? `· ${t.station.name}` : ''}
                                    </p>
                                </div>
                                {t.estimatedWaitMinutes != null && t.estimatedWaitMinutes > 0 && (
                                    <span className="text-sm text-gray-400 dark:text-gray-500">
                                        ~{t.estimatedWaitMinutes} min
                                    </span>
                                )}
                                <span className="text-xs text-gray-400">
                                    {new Date(t.createdAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
