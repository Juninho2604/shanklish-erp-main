'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { printKitchenCommand } from '@/lib/print-command';

interface OrderItem {
    name: string;
    quantity: number;
    modifiers: { name: string }[];
    notes?: string;
}

interface KitchenOrder {
    id: string;
    orderNumber: string;
    orderType: string;
    customerName: string | null;
    tableName: string | null;
    status: string;
    items: OrderItem[];
    createdAt: string;
}

function playNotificationSound() {
    try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const playTone = (frequency: number, startTime: number, duration: number) => {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            oscillator.frequency.value = frequency;
            oscillator.type = 'sine';
            gainNode.gain.setValueAtTime(0, audioContext.currentTime + startTime);
            gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + startTime + 0.05);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + startTime + duration);
            oscillator.start(audioContext.currentTime + startTime);
            oscillator.stop(audioContext.currentTime + startTime + duration);
        };
        // Melodía barra: tono más agudo y corto
        playTone(1046, 0, 0.15);
        playTone(1318, 0.15, 0.15);
        playTone(1046, 0.3, 0.2);
    } catch (error) {
        console.warn('No se pudo reproducir sonido:', error);
    }
}

const ROLES_CAN_MUTE = ['OWNER', 'AUDITOR', 'ADMIN_MANAGER', 'OPS_MANAGER'];

export default function BarraDisplayPage() {
    const [orders, setOrders] = useState<KitchenOrder[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [userRole, setUserRole] = useState<string>('');
    const [currentTime, setCurrentTime] = useState(new Date());
    const previousOrdersRef = useRef<string[]>([]);
    const printedOrdersRef = useRef<Set<string>>(new Set());
    const isFirstLoadRef = useRef(true);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        async function fetchUserRole() {
            try {
                const res = await fetch('/api/auth/session');
                if (res.ok) {
                    const data = await res.json();
                    setUserRole(data.user?.role || '');
                }
            } catch { /* ignorar */ }
        }
        fetchUserRole();
    }, []);

    const canMuteSound = ROLES_CAN_MUTE.includes(userRole);

    const fetchOrders = useCallback(async () => {
        try {
            const response = await fetch('/api/kitchen/orders?station=bar');
            if (response.ok) {
                const data = await response.json();
                const newOrders: KitchenOrder[] = data.orders || [];

                if (!isFirstLoadRef.current && soundEnabled) {
                    const currentOrderIds = newOrders.map(o => o.id);
                    const newOrderIds = currentOrderIds.filter(
                        id => !previousOrdersRef.current.includes(id)
                    );

                    if (newOrderIds.length > 0) {
                        playNotificationSound();

                        // Imprimir comanda de barra automáticamente (solo una vez por orden)
                        const ordersToprint = newOrders.filter(
                            o => newOrderIds.includes(o.id) && !printedOrdersRef.current.has(o.id)
                        );
                        for (const order of ordersToprint) {
                            printedOrdersRef.current.add(order.id);
                            printKitchenCommand({
                                orderNumber: order.orderNumber,
                                orderType: order.orderType,
                                createdAt: order.createdAt,
                                customerName: order.customerName,
                                tableName: order.tableName,
                                items: order.items.map(item => ({
                                    quantity: item.quantity,
                                    name: item.name,
                                    modifiers: item.modifiers.map(m => m.name),
                                    notes: item.notes,
                                })),
                            }, 'bar');
                        }

                        if (Notification.permission === 'granted') {
                            new Notification('🥤 Nueva Bebida', {
                                body: `${newOrderIds.length} orden(es) de barra recibida(s)`,
                                icon: '/favicon.ico'
                            });
                        }
                    }

                    previousOrdersRef.current = currentOrderIds;
                } else {
                    previousOrdersRef.current = newOrders.map(o => o.id);
                    isFirstLoadRef.current = false;
                }

                setOrders(newOrders);
            }
        } catch (error) {
            console.error('Error fetching bar orders:', error);
        } finally {
            setIsLoading(false);
        }
    }, [soundEnabled]);

    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, []);

    useEffect(() => {
        fetchOrders();
        const interval = setInterval(fetchOrders, 5000);
        return () => clearInterval(interval);
    }, [fetchOrders]);

    const markAsReady = async (orderId: string) => {
        try {
            await fetch('/api/kitchen/orders', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId, status: 'READY' }),
            });
            fetchOrders();
        } catch (error) {
            console.error('Error updating order:', error);
        }
    };

    const startPreparing = async (orderId: string) => {
        try {
            await fetch('/api/kitchen/orders', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId, status: 'PREPARING' }),
            });
            fetchOrders();
        } catch (error) {
            console.error('Error updating order:', error);
        }
    };

    const formatTime = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
    };

    const getTimeSince = (dateString: string) => {
        const then = new Date(dateString);
        const diffMs = currentTime.getTime() - then.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffSecs = Math.floor((diffMs % 60000) / 1000);
        if (diffMins < 1) return `${diffSecs}s`;
        return `${diffMins}:${String(diffSecs).padStart(2, '0')}`;
    };

    const getTimerColor = (dateString: string) => {
        const then = new Date(dateString);
        const diffMs = currentTime.getTime() - then.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins >= 10) return 'text-red-500 animate-pulse font-bold';
        if (diffMins >= 7) return 'text-orange-400 animate-pulse font-bold';
        if (diffMins >= 5) return 'text-yellow-400 font-bold';
        return 'text-cyan-400';
    };

    const getCardBorderColor = (dateString: string, status: string) => {
        if (status === 'READY') return 'border-green-500';
        const then = new Date(dateString);
        const diffMs = currentTime.getTime() - then.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins >= 10) return 'border-red-500 animate-pulse';
        if (diffMins >= 7) return 'border-orange-400 animate-pulse';
        if (diffMins >= 5) return 'border-yellow-500';
        if (status === 'PREPARING') return 'border-cyan-500';
        return 'border-gray-700';
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">
                <div className="text-center">
                    <div className="text-6xl mb-4 animate-pulse">🥤</div>
                    <p className="text-xl">Cargando comandera de barra...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-900 text-white">
            {/* Header — azul para distinguir de cocina */}
            <div className="bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-3 sticky top-0 z-10">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-3xl">🥤</span>
                        <div>
                            <h1 className="text-xl font-bold">COMANDERA - BARRA</h1>
                            <p className="text-blue-100 text-xs">Solo bebidas · Órdenes pendientes</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        {canMuteSound ? (
                            <button
                                onClick={() => {
                                    setSoundEnabled(!soundEnabled);
                                    if (!soundEnabled) playNotificationSound();
                                }}
                                className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                                    soundEnabled ? 'bg-white/20 text-white' : 'bg-gray-800 text-gray-400'
                                }`}
                            >
                                {soundEnabled ? '🔔' : '🔕'}
                                <span className="hidden sm:inline">{soundEnabled ? 'ON' : 'OFF'}</span>
                            </button>
                        ) : (
                            <div className="px-4 py-2 bg-white/20 rounded-lg flex items-center gap-2 text-sm">
                                🔔 Sonido activo
                            </div>
                        )}

                        <button
                            onClick={() => playNotificationSound()}
                            className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm"
                            title="Probar sonido"
                        >
                            🔊
                        </button>

                        <div className="text-right">
                            <p className="text-lg font-mono font-bold">
                                {currentTime.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </p>
                            <p className="text-xs text-blue-100">
                                {currentTime.toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric', month: 'short' })}
                            </p>
                        </div>

                        <div className="bg-white/20 rounded-full px-4 py-2 text-lg font-bold">
                            {orders.filter(o => ['PENDING', 'CONFIRMED', 'PREPARING'].includes(o.status)).length} pendientes
                        </div>
                    </div>
                </div>
            </div>

            {/* Leyenda */}
            <div className="bg-gray-800 px-6 py-2 flex items-center gap-6 text-sm border-b border-gray-700">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-cyan-400"></span> &lt;5 min</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-400"></span> 5-7 min</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-400"></span> 7-10 min</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></span> &gt;10 min (¡URGENTE!)</span>
            </div>

            {/* Grid */}
            <div className="p-4">
                {orders.length === 0 ? (
                    <div className="text-center py-20 text-gray-500">
                        <span className="text-8xl block mb-4">✅</span>
                        <p className="text-2xl">No hay bebidas pendientes</p>
                        <p className="text-lg">Las nuevas órdenes de barra aparecerán aquí</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {orders.map(order => (
                            <div
                                key={order.id}
                                className={`bg-gray-800 rounded-xl overflow-hidden border-2 ${getCardBorderColor(order.createdAt, order.status)}`}
                            >
                                {/* Header orden */}
                                <div className="bg-blue-600 px-4 py-2 flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono font-bold text-lg">{order.orderNumber}</span>
                                        <span className="text-sm opacity-80">
                                            {order.orderType === 'RESTAURANT' ? '🍽️ REST' : '🛵 DELIV'}
                                        </span>
                                    </div>
                                    <div className="text-sm">{formatTime(order.createdAt)}</div>
                                </div>

                                {/* Timer */}
                                <div className={`text-center py-2 bg-gray-900 ${getTimerColor(order.createdAt)}`}>
                                    <span className="text-3xl font-mono">⏱️ {getTimeSince(order.createdAt)}</span>
                                </div>

                                {/* Mesa */}
                                {order.tableName && (
                                    <div className="px-4 py-2 bg-amber-600/80 text-white font-bold text-lg text-center tracking-wide">
                                        🪑 {order.tableName}
                                    </div>
                                )}

                                {/* Cliente */}
                                {order.customerName && (
                                    <div className="px-4 py-2 bg-gray-700/50 text-sm">
                                        👤 {order.customerName}
                                    </div>
                                )}

                                {/* Items (solo bebidas) */}
                                <div className="p-4 space-y-3 max-h-60 overflow-y-auto">
                                    {order.items.map((item, idx) => (
                                        <div key={idx} className="border-b border-gray-700 pb-2 last:border-0">
                                            <div className="flex items-start gap-2">
                                                <span className="bg-cyan-500 text-gray-900 font-bold text-lg px-2 rounded">
                                                    {item.quantity}
                                                </span>
                                                <div className="flex-1">
                                                    <div className="font-semibold text-lg">{item.name}</div>
                                                    {item.modifiers.length > 0 && (
                                                        <div className="text-sm text-cyan-400 mt-1">
                                                            {item.modifiers.map(m => m.name).join(' • ')}
                                                        </div>
                                                    )}
                                                    {item.notes && (
                                                        <div className="text-sm text-yellow-300 mt-1 italic">
                                                            📝 {item.notes}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Botones */}
                                <div className="p-3 border-t border-gray-700 space-y-2">
                                    {order.status === 'CONFIRMED' || order.status === 'PENDING' ? (
                                        <button
                                            onClick={() => startPreparing(order.id)}
                                            className="w-full py-3 rounded-xl font-bold text-lg bg-cyan-500 hover:bg-cyan-600 text-gray-900 transition-all"
                                        >
                                            🥤 PREPARANDO
                                        </button>
                                    ) : order.status === 'PREPARING' ? (
                                        <button
                                            onClick={() => markAsReady(order.id)}
                                            className="w-full py-3 rounded-xl font-bold text-lg bg-green-500 hover:bg-green-600 text-white transition-all"
                                        >
                                            ✅ LISTO
                                        </button>
                                    ) : (
                                        <div className="text-center py-3 text-green-400 font-bold">
                                            ✅ ENTREGADO
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
