'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

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
    status: string;
    items: OrderItem[];
    createdAt: string;
}

// Función para generar sonido de notificación (nueva orden)
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

        // Melodía de nueva orden (campana)
        playTone(830, 0, 0.3);
        playTone(659, 0.15, 0.3);
        playTone(830, 0.3, 0.3);
        playTone(659, 0.45, 0.4);

    } catch (error) {
        console.warn('No se pudo reproducir sonido:', error);
    }
}

// Función para sonido de alerta urgente (pedido cerca de 20 min)
function playUrgentAlertSound() {
    try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

        const playTone = (frequency: number, startTime: number, duration: number, volume: number = 0.5) => {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = frequency;
            oscillator.type = 'square'; // Sonido más agresivo

            gainNode.gain.setValueAtTime(0, audioContext.currentTime + startTime);
            gainNode.gain.linearRampToValueAtTime(volume, audioContext.currentTime + startTime + 0.02);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + startTime + duration);

            oscillator.start(audioContext.currentTime + startTime);
            oscillator.stop(audioContext.currentTime + startTime + duration);
        };

        // Sonido de alerta urgente (más fuerte y agresivo)
        playTone(880, 0, 0.15, 0.6);
        playTone(440, 0.15, 0.15, 0.6);
        playTone(880, 0.3, 0.15, 0.6);
        playTone(440, 0.45, 0.15, 0.6);
        playTone(880, 0.6, 0.2, 0.7);

    } catch (error) {
        console.warn('No se pudo reproducir alerta:', error);
    }
}

// Roles que pueden silenciar el sonido
const ROLES_CAN_MUTE = ['OWNER', 'AUDITOR', 'ADMIN_MANAGER', 'OPS_MANAGER'];

export default function KitchenDisplayPage() {
    const [orders, setOrders] = useState<KitchenOrder[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState(new Date());
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [userRole, setUserRole] = useState<string>('');
    const [currentTime, setCurrentTime] = useState(new Date());
    const previousOrdersRef = useRef<string[]>([]);
    const isFirstLoadRef = useRef(true);
    const urgentAlertIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Actualizar tiempo cada segundo para el timer
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Obtener rol del usuario
    useEffect(() => {
        async function fetchUserRole() {
            try {
                const response = await fetch('/api/auth/session');
                if (response.ok) {
                    const data = await response.json();
                    setUserRole(data.user?.role || '');
                }
            } catch (error) {
                console.error('Error fetching user role:', error);
            }
        }
        fetchUserRole();
    }, []);

    // Verificar pedidos urgentes (>= 18 min) y reproducir alerta
    useEffect(() => {
        if (!soundEnabled) return;

        const checkUrgentOrders = () => {
            const urgentOrders = orders.filter(order => {
                const orderTime = new Date(order.createdAt);
                const diffMs = currentTime.getTime() - orderTime.getTime();
                const diffMins = Math.floor(diffMs / 60000);
                return diffMins >= 18 && (order.status === 'PENDING' || order.status === 'CONFIRMED' || order.status === 'PREPARING');
            });

            if (urgentOrders.length > 0) {
                playUrgentAlertSound();
            }
        };

        // Alerta cada 10 segundos si hay pedidos urgentes
        urgentAlertIntervalRef.current = setInterval(checkUrgentOrders, 10000);

        return () => {
            if (urgentAlertIntervalRef.current) {
                clearInterval(urgentAlertIntervalRef.current);
            }
        };
    }, [orders, soundEnabled, currentTime]);

    const canMuteSound = ROLES_CAN_MUTE.includes(userRole);

    const fetchOrders = useCallback(async () => {
        try {
            const response = await fetch('/api/kitchen/orders');
            if (response.ok) {
                const data = await response.json();
                const newOrders: KitchenOrder[] = data.orders || [];

                // Detectar nuevas órdenes
                if (!isFirstLoadRef.current && soundEnabled) {
                    const currentOrderIds = newOrders.map(o => o.id);
                    const newOrderIds = currentOrderIds.filter(
                        id => !previousOrdersRef.current.includes(id)
                    );

                    if (newOrderIds.length > 0) {
                        playNotificationSound();

                        if (Notification.permission === 'granted') {
                            new Notification('🍽️ Nueva Orden', {
                                body: `${newOrderIds.length} nueva(s) orden(es) recibida(s)`,
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
            console.error('Error fetching orders:', error);
        } finally {
            setIsLoading(false);
            setLastUpdate(new Date());
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

    const getOrderTypeColor = (type: string) => {
        switch (type) {
            case 'RESTAURANT': return 'bg-amber-500';
            case 'DELIVERY': return 'bg-blue-500';
            default: return 'bg-gray-500';
        }
    };

    const getOrderTypeLabel = (type: string) => {
        switch (type) {
            case 'RESTAURANT': return '🍽️ REST';
            case 'DELIVERY': return '🛵 DELIV';
            default: return type;
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

        if (diffMins >= 20) return 'text-red-500 animate-pulse font-bold';
        if (diffMins >= 18) return 'text-orange-500 animate-pulse font-bold';
        if (diffMins >= 15) return 'text-yellow-400 font-bold';
        if (diffMins >= 10) return 'text-yellow-300';
        return 'text-green-400';
    };

    const getCardBorderColor = (dateString: string, status: string) => {
        if (status === 'READY') return 'border-green-500';

        const then = new Date(dateString);
        const diffMs = currentTime.getTime() - then.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins >= 20) return 'border-red-500 animate-pulse';
        if (diffMins >= 18) return 'border-orange-500 animate-pulse';
        if (diffMins >= 15) return 'border-yellow-500';
        if (status === 'PREPARING') return 'border-yellow-500';
        return 'border-gray-700';
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">
                <div className="text-center">
                    <div className="text-6xl mb-4 animate-pulse">👨‍🍳</div>
                    <p className="text-xl">Cargando comandera...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-900 text-white">
            {/* Header */}
            <div className="bg-gradient-to-r from-red-600 to-orange-600 px-6 py-3 sticky top-0 z-10">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-3xl">👨‍🍳</span>
                        <div>
                            <h1 className="text-xl font-bold">COMANDERA - COCINA</h1>
                            <p className="text-red-100 text-xs">Órdenes pendientes</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* Botón de sonido - Solo para gerentes */}
                        {canMuteSound ? (
                            <button
                                onClick={() => {
                                    setSoundEnabled(!soundEnabled);
                                    if (!soundEnabled) {
                                        playNotificationSound();
                                    }
                                }}
                                className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${soundEnabled
                                        ? 'bg-white/20 text-white'
                                        : 'bg-gray-800 text-gray-400'
                                    }`}
                                title={soundEnabled ? 'Sonido activado' : 'Sonido desactivado'}
                            >
                                {soundEnabled ? '🔔' : '🔕'}
                                <span className="hidden sm:inline">{soundEnabled ? 'ON' : 'OFF'}</span>
                            </button>
                        ) : (
                            <div className="px-4 py-2 bg-white/20 rounded-lg flex items-center gap-2 text-sm">
                                🔔 Sonido activo
                            </div>
                        )}

                        {/* Botón probar sonido */}
                        <button
                            onClick={() => playNotificationSound()}
                            className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm"
                            title="Probar sonido"
                        >
                            🔊
                        </button>

                        {/* Reloj en tiempo real */}
                        <div className="text-right">
                            <p className="text-lg font-mono font-bold">
                                {currentTime.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </p>
                            <p className="text-xs text-red-100">
                                {currentTime.toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric', month: 'short' })}
                            </p>
                        </div>

                        <div className="bg-white/20 rounded-full px-4 py-2 text-lg font-bold">
                            {orders.filter(o => ['PENDING', 'CONFIRMED', 'PREPARING'].includes(o.status)).length} pendientes
                        </div>
                    </div>
                </div>
            </div>

            {/* Leyenda de colores */}
            <div className="bg-gray-800 px-6 py-2 flex items-center gap-6 text-sm border-b border-gray-700">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500"></span> &lt;10 min</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-400"></span> 10-15 min</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-500"></span> 15-18 min</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></span> &gt;18 min (¡URGENTE!)</span>
            </div>

            {/* Grid de Órdenes */}
            <div className="p-4">
                {orders.length === 0 ? (
                    <div className="text-center py-20 text-gray-500">
                        <span className="text-8xl block mb-4">✅</span>
                        <p className="text-2xl">No hay órdenes pendientes</p>
                        <p className="text-lg">Las nuevas órdenes aparecerán aquí automáticamente</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {orders.map(order => (
                            <div
                                key={order.id}
                                className={`bg-gray-800 rounded-xl overflow-hidden border-2 ${getCardBorderColor(order.createdAt, order.status)}`}
                            >
                                {/* Header de la orden */}
                                <div className={`${getOrderTypeColor(order.orderType)} px-4 py-2 flex justify-between items-center`}>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono font-bold text-lg">{order.orderNumber}</span>
                                        <span className="text-sm opacity-80">{getOrderTypeLabel(order.orderType)}</span>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm">{formatTime(order.createdAt)}</div>
                                    </div>
                                </div>

                                {/* Timer grande */}
                                <div className={`text-center py-2 bg-gray-900 ${getTimerColor(order.createdAt)}`}>
                                    <span className="text-3xl font-mono">⏱️ {getTimeSince(order.createdAt)}</span>
                                </div>

                                {/* Cliente */}
                                {order.customerName && (
                                    <div className="px-4 py-2 bg-gray-700/50 text-sm">
                                        👤 {order.customerName}
                                    </div>
                                )}

                                {/* Items */}
                                <div className="p-4 space-y-3 max-h-60 overflow-y-auto">
                                    {order.items.map((item, idx) => (
                                        <div key={idx} className="border-b border-gray-700 pb-2 last:border-0">
                                            <div className="flex items-start gap-2">
                                                <span className="bg-white text-gray-900 font-bold text-lg px-2 rounded">
                                                    {item.quantity}
                                                </span>
                                                <div className="flex-1">
                                                    <div className="font-semibold text-lg">{item.name}</div>
                                                    {item.modifiers.length > 0 && (
                                                        <div className="text-sm text-amber-400 mt-1">
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

                                {/* Botones de acción */}
                                <div className="p-3 border-t border-gray-700 space-y-2">
                                    {order.status === 'CONFIRMED' || order.status === 'PENDING' ? (
                                        <button
                                            onClick={() => startPreparing(order.id)}
                                            className="w-full py-3 rounded-xl font-bold text-lg bg-yellow-500 hover:bg-yellow-600 text-gray-900 transition-all"
                                        >
                                            👨‍🍳 EMPEZAR A PREPARAR
                                        </button>
                                    ) : order.status === 'PREPARING' ? (
                                        <button
                                            onClick={() => markAsReady(order.id)}
                                            className="w-full py-3 rounded-xl font-bold text-lg bg-green-500 hover:bg-green-600 text-white transition-all"
                                        >
                                            ✅ LISTO PARA ENTREGAR
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
