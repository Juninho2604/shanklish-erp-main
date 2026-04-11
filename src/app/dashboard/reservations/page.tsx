import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getReservations } from '@/app/actions/games.actions';

export const metadata = { title: 'Reservaciones | CAPSULA ERP' };

const STATUS_CONFIG = {
    PENDING:    { label: 'Pendiente',    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
    CONFIRMED:  { label: 'Confirmada',   cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
    CHECKED_IN: { label: 'Check-in',     cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
    NO_SHOW:    { label: 'No se presentó', cls: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400' },
    CANCELLED:  { label: 'Cancelada',    cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500' },
} as const;

export default async function ReservationsPage() {
    const session = await getSession();
    if (!session) redirect('/login');
    if (!['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER', 'CASHIER'].includes(session.role)) {
        redirect('/dashboard');
    }

    const today = new Date();
    const reservations = await getReservations({ date: today });

    const activeReservations = reservations.filter(r =>
        ['PENDING', 'CONFIRMED', 'CHECKED_IN'].includes(r.status)
    );
    const passedReservations = reservations.filter(r =>
        ['NO_SHOW', 'CANCELLED'].includes(r.status)
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">📅 Reservaciones</h1>
                    <p className="text-gray-500 dark:text-gray-400">
                        {activeReservations.length} activa{activeReservations.length !== 1 ? 's' : ''} para hoy ·{' '}
                        {new Date().toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                </div>
            </div>

            {/* Active reservations */}
            {activeReservations.length === 0 && passedReservations.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center dark:border-gray-700">
                    <p className="text-4xl">📅</p>
                    <p className="mt-2 font-medium text-gray-600 dark:text-gray-400">
                        Sin reservaciones para hoy
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {[...activeReservations, ...passedReservations].map(r => {
                        const cfg = STATUS_CONFIG[r.status as keyof typeof STATUS_CONFIG]
                            ?? STATUS_CONFIG.PENDING;

                        return (
                            <div
                                key={r.id}
                                className={`flex items-center gap-4 rounded-xl border px-5 py-3 transition-colors ${
                                    r.status === 'CHECKED_IN'
                                        ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/10'
                                        : r.status === 'CANCELLED' || r.status === 'NO_SHOW'
                                        ? 'border-gray-100 bg-gray-50 opacity-60 dark:border-gray-800 dark:bg-gray-900/50'
                                        : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'
                                }`}
                            >
                                {/* Game type icon */}
                                <span className="text-2xl">{r.station.gameType.icon ?? '🎮'}</span>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="font-medium text-gray-900 dark:text-white">{r.customerName}</p>
                                        {r.customerPhone && (
                                            <span className="text-xs text-gray-400">{r.customerPhone}</span>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        {r.station.name} · {r.guestCount} persona{r.guestCount !== 1 ? 's' : ''}
                                        {r.wristbandPlan && ` · ${r.wristbandPlan.name}`}
                                    </p>
                                </div>

                                {/* Time */}
                                <div className="text-right shrink-0">
                                    <p className="font-semibold text-gray-800 dark:text-gray-200">
                                        {new Date(r.scheduledStart).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                                        {' — '}
                                        {new Date(r.scheduledEnd).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                    {r.depositAmount > 0 && (
                                        <p className={`text-xs ${r.depositPaid ? 'text-green-500' : 'text-amber-500'}`}>
                                            Depósito ${r.depositAmount.toFixed(2)} {r.depositPaid ? '✓' : '(pendiente)'}
                                        </p>
                                    )}
                                </div>

                                {/* Status */}
                                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.cls}`}>
                                    {cfg.label}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
