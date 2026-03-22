'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatNumber, formatCurrency, cn } from '@/lib/utils';
import {
    getMenuItemsForSalesAction,
    getMenuCategoriesAction,
    createSalesEntryAction,
    getTodaySalesAction,
    getSalesAreasAction,
    voidSalesOrderAction
} from '@/app/actions/sales-entry.actions';
import WhatsAppOrderParser from '@/components/whatsapp-order-parser';

interface CartItem {
    menuItemId: string;
    menuItemName: string;
    quantity: number;
    unitPrice: number;
    notes?: string;
}

export default function SalesEntryView() {
    const [menuItems, setMenuItems] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [areas, setAreas] = useState<any[]>([]);
    const [todaySales, setTodaySales] = useState<any>({ sales: [], summary: { totalSales: 0, totalRevenue: 0, byType: {} } });
    const [isLoading, setIsLoading] = useState(true);

    // Estado del carrito
    const [cart, setCart] = useState<CartItem[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState('');

    // Estado del formulario
    const [orderType, setOrderType] = useState<'RESTAURANT' | 'DELIVERY' | 'TAKEOUT'>('RESTAURANT');
    const [areaId, setAreaId] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('EFECTIVO');
    const [discountType, setDiscountType] = useState('');
    const [discountAmount, setDiscountAmount] = useState(0);
    const [notes, setNotes] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [deliveryAddress, setDeliveryAddress] = useState('');

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [viewMode, setViewMode] = useState<'entry' | 'history' | 'whatsapp'>('entry');

    // Cargar datos iniciales
    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setIsLoading(true);
        const [itemsData, catsData, areasData, salesData] = await Promise.all([
            getMenuItemsForSalesAction(),
            getMenuCategoriesAction(),
            getSalesAreasAction(),
            getTodaySalesAction()
        ]);
        setMenuItems(itemsData);
        setCategories(catsData);
        setAreas(areasData);
        setTodaySales(salesData);

        if (areasData.length > 0) {
            setAreaId(areasData[0].id);
        }

        setIsLoading(false);
    }

    // Filtrar items
    const filteredItems = menuItems.filter(item => {
        if (selectedCategory && item.categoryId !== selectedCategory) return false;
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            return item.name.toLowerCase().includes(query) || item.sku?.toLowerCase().includes(query);
        }
        return true;
    });

    // Agregar al carrito
    function addToCart(item: any) {
        const existing = cart.find(c => c.menuItemId === item.id);
        if (existing) {
            setCart(cart.map(c =>
                c.menuItemId === item.id
                    ? { ...c, quantity: c.quantity + 1 }
                    : c
            ));
        } else {
            setCart([...cart, {
                menuItemId: item.id,
                menuItemName: item.name,
                quantity: 1,
                unitPrice: item.price
            }]);
        }
    }

    // Actualizar cantidad
    function updateQuantity(itemId: string, quantity: number) {
        if (quantity <= 0) {
            setCart(cart.filter(c => c.menuItemId !== itemId));
        } else {
            setCart(cart.map(c =>
                c.menuItemId === itemId ? { ...c, quantity } : c
            ));
        }
    }

    // Eliminar del carrito
    function removeFromCart(itemId: string) {
        setCart(cart.filter(c => c.menuItemId !== itemId));
    }

    // Calcular totales
    const subtotal = cart.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    const total = Math.max(0, subtotal - discountAmount);

    // Registrar venta
    async function handleSubmit() {
        if (cart.length === 0) {
            alert('Agrega items a la venta');
            return;
        }
        if (!areaId) {
            alert('Selecciona un área');
            return;
        }

        setIsSubmitting(true);
        const result = await createSalesEntryAction({
            orderType,
            areaId,
            items: cart,
            paymentMethod,
            discountType: discountType || undefined,
            discountAmount: discountAmount > 0 ? discountAmount : undefined,
            notes: notes || undefined,
            customerName: customerName || undefined,
            customerPhone: customerPhone || undefined,
            customerAddress: deliveryAddress || undefined
        });

        if (result.success) {
            alert(`✅ ${result.message}`);
            // Limpiar formulario
            setCart([]);
            setDiscountType('');
            setDiscountAmount(0);
            setNotes('');
            setCustomerName('');
            setCustomerPhone('');
            setDeliveryAddress('');
            // Recargar ventas del día
            const salesData = await getTodaySalesAction();
            setTodaySales(salesData);
        } else {
            alert(`❌ ${result.message}`);
        }
        setIsSubmitting(false);
    }

    // Anular venta
    async function handleVoidSale(orderId: string) {
        const reason = prompt('Motivo de la anulación:');
        if (!reason) return;

        const result = await voidSalesOrderAction(orderId, reason);
        alert(result.message);
        if (result.success) {
            const salesData = await getTodaySalesAction();
            setTodaySales(salesData);
        }
    }

    // Tipos de descuento
    const discountTypes = [
        { id: '', label: 'Sin descuento', percent: 0 },
        { id: 'DIVISAS_33', label: 'Divisas (33%)', percent: 33 },
        { id: 'EMPLEADO_50', label: 'Empleado (50%)', percent: 50 },
        { id: 'CORTESIA_100', label: 'Cortesía (100%)', percent: 100 }
    ];

    // Métodos de pago
    const paymentMethods = [
        { id: 'EFECTIVO', label: '💵 Efectivo' },
        { id: 'TARJETA', label: '💳 Tarjeta' },
        { id: 'TRANSFERENCIA', label: '📱 Transferencia' },
        { id: 'PAGO_MOVIL', label: '📲 Pago Móvil' },
        { id: 'ZELLE', label: '💲 Zelle' },
        { id: 'MIXTO', label: '🔀 Mixto' }
    ];

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto"></div>
                    <p className="mt-4 text-gray-500">Cargando...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        💰 Cargar Ventas
                    </h1>
                    <p className="text-gray-500">
                        Registra las comandas de WhatsApp
                    </p>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => setViewMode('entry')}
                        className={cn(
                            'px-4 py-2.5 rounded-lg text-sm font-medium transition-all',
                            viewMode === 'entry'
                                ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg'
                                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                        )}
                    >
                        ➕ Nueva Venta
                    </button>
                    <button
                        onClick={() => setViewMode('history')}
                        className={cn(
                            'px-4 py-2.5 rounded-lg text-sm font-medium transition-all',
                            viewMode === 'history'
                                ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg'
                                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                        )}
                    >
                        📋 Ventas Hoy ({todaySales.summary.totalSales})
                    </button>
                    <button
                        onClick={() => setViewMode('whatsapp')}
                        className={cn(
                            'px-4 py-2.5 rounded-lg text-sm font-medium transition-all',
                            viewMode === 'whatsapp'
                                ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg'
                                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                        )}
                    >
                        💬 WhatsApp
                    </button>
                    <Link
                        href="/dashboard/ventas"
                        className="px-4 py-2.5 rounded-lg text-sm font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                    >
                        📊 Reportes
                    </Link>
                </div>
            </div>

            {/* Resumen rápido */}
            <div className="grid gap-4 sm:grid-cols-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                    <p className="text-sm text-gray-500">Ventas Hoy</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{todaySales.summary.totalSales}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                    <p className="text-sm text-gray-500">Ingresos Hoy</p>
                    <p className="text-2xl font-bold text-emerald-600">{formatCurrency(todaySales.summary.totalRevenue)}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                    <p className="text-sm text-gray-500">🍽️ Restaurante</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{todaySales.summary.byType?.RESTAURANT || 0}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                    <p className="text-sm text-gray-500">🛵 Delivery</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{todaySales.summary.byType?.DELIVERY || 0}</p>
                </div>
            </div>

            {/* Vista: Nueva Venta */}
            {viewMode === 'entry' && (
                <div className="grid gap-6 lg:grid-cols-3">
                    {/* Catálogo de productos */}
                    <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <h2 className="font-semibold text-gray-900 dark:text-white">
                                    📋 Menú
                                </h2>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Buscar producto..."
                                    className="w-full sm:w-64 rounded-lg border border-gray-200 px-4 py-2 text-sm focus:border-amber-500 focus:outline-none"
                                />
                            </div>

                            {/* Categorías */}
                            <div className="flex gap-2 mt-3 flex-wrap">
                                <button
                                    onClick={() => setSelectedCategory('')}
                                    className={cn(
                                        'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                                        selectedCategory === ''
                                            ? 'bg-amber-100 text-amber-700'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    )}
                                >
                                    Todos
                                </button>
                                {categories.map(cat => (
                                    <button
                                        key={cat.id}
                                        onClick={() => setSelectedCategory(cat.id)}
                                        className={cn(
                                            'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                                            selectedCategory === cat.id
                                                ? 'bg-amber-100 text-amber-700'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        )}
                                    >
                                        {cat.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="p-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 max-h-[50vh] overflow-y-auto">
                            {filteredItems.length === 0 ? (
                                <p className="col-span-full text-center text-gray-500 py-8">
                                    No se encontraron productos
                                </p>
                            ) : (
                                filteredItems.map(item => (
                                    <button
                                        key={item.id}
                                        onClick={() => addToCart(item)}
                                        className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-amber-300 hover:bg-amber-50 transition-all text-left"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-gray-900 truncate">{item.name}</p>
                                            <p className="text-xs text-gray-500">{item.categoryName}</p>
                                        </div>
                                        <span className="ml-2 font-semibold text-amber-600">
                                            {formatCurrency(item.price)}
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Carrito y checkout */}
                    <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                            <h2 className="font-semibold text-gray-900 dark:text-white">
                                🛒 Comanda ({cart.length})
                            </h2>
                        </div>

                        <div className="p-4 space-y-4 max-h-[30vh] overflow-y-auto">
                            {cart.length === 0 ? (
                                <p className="text-center text-gray-500 py-4">
                                    Agrega productos del menú
                                </p>
                            ) : (
                                cart.map(item => (
                                    <div key={item.menuItemId} className="flex items-center gap-2">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">{item.menuItemName}</p>
                                            <p className="text-xs text-gray-500">{formatCurrency(item.unitPrice)}</p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => updateQuantity(item.menuItemId, item.quantity - 1)}
                                                className="w-6 h-6 rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
                                            >
                                                -
                                            </button>
                                            <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                                            <button
                                                onClick={() => updateQuantity(item.menuItemId, item.quantity + 1)}
                                                className="w-6 h-6 rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
                                            >
                                                +
                                            </button>
                                        </div>
                                        <button
                                            onClick={() => removeFromCart(item.menuItemId)}
                                            className="text-red-500 hover:text-red-700"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="border-t border-gray-200 p-4 space-y-3 dark:border-gray-700">
                            {/* Tipo de orden */}
                            <div className="grid grid-cols-3 gap-2">
                                {(['RESTAURANT', 'DELIVERY', 'TAKEOUT'] as const).map(type => (
                                    <button
                                        key={type}
                                        onClick={() => setOrderType(type)}
                                        className={cn(
                                            'py-2 rounded-lg text-xs font-medium transition-all',
                                            orderType === type
                                                ? 'bg-amber-500 text-white'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        )}
                                    >
                                        {type === 'RESTAURANT' ? '🍽️ Mesa' : type === 'DELIVERY' ? '🛵 Delivery' : '📦 Para llevar'}
                                    </button>
                                ))}
                            </div>

                            {/* Cliente (para delivery) */}
                            {orderType === 'DELIVERY' && (
                                <div className="space-y-2">
                                    <input
                                        type="text"
                                        value={customerName}
                                        onChange={(e) => setCustomerName(e.target.value)}
                                        placeholder="Nombre del cliente"
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    />
                                    <input
                                        type="text"
                                        value={customerPhone}
                                        onChange={(e) => setCustomerPhone(e.target.value)}
                                        placeholder="Teléfono"
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    />
                                    <input
                                        type="text"
                                        value={deliveryAddress}
                                        onChange={(e) => setDeliveryAddress(e.target.value)}
                                        placeholder="Dirección de entrega"
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    />
                                </div>
                            )}

                            {/* Área */}
                            <select
                                value={areaId}
                                onChange={(e) => setAreaId(e.target.value)}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            >
                                {areas.map(area => (
                                    <option key={area.id} value={area.id}>{area.name}</option>
                                ))}
                            </select>

                            {/* Método de pago */}
                            <select
                                value={paymentMethod}
                                onChange={(e) => setPaymentMethod(e.target.value)}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            >
                                {paymentMethods.map(pm => (
                                    <option key={pm.id} value={pm.id}>{pm.label}</option>
                                ))}
                            </select>

                            {/* Descuento */}
                            <select
                                value={discountType}
                                onChange={(e) => {
                                    setDiscountType(e.target.value);
                                    const dt = discountTypes.find(d => d.id === e.target.value);
                                    if (dt) {
                                        setDiscountAmount(subtotal * (dt.percent / 100));
                                    }
                                }}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            >
                                {discountTypes.map(dt => (
                                    <option key={dt.id} value={dt.id}>{dt.label}</option>
                                ))}
                            </select>

                            {/* Totales */}
                            <div className="border-t pt-3 space-y-1">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Subtotal:</span>
                                    <span>{formatCurrency(subtotal)}</span>
                                </div>
                                {discountAmount > 0 && (
                                    <div className="flex justify-between text-sm text-red-600">
                                        <span>Descuento:</span>
                                        <span>-{formatCurrency(discountAmount)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-lg font-bold">
                                    <span>Total:</span>
                                    <span className="text-emerald-600">{formatCurrency(total)}</span>
                                </div>
                            </div>

                            {/* Botón registrar */}
                            <button
                                onClick={handleSubmit}
                                disabled={cart.length === 0 || isSubmitting}
                                className="w-full py-3 rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transition-all"
                            >
                                {isSubmitting ? 'Registrando...' : '✅ Registrar Venta'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Vista: WhatsApp Parser */}
            {viewMode === 'whatsapp' && (
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 p-6">
                    {/* Opción de cargar archivo .txt */}
                    <div className="mb-6 rounded-lg border-2 border-dashed border-green-200 bg-green-50/50 p-4 dark:border-green-900/50 dark:bg-green-900/10">
                        <p className="text-sm font-medium text-green-700 dark:text-green-400 mb-2">
                            📂 Cargar archivo de chat exportado (.txt)
                        </p>
                        <input
                            type="file"
                            accept=".txt,.text"
                            onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const text = await file.text();
                                // Strip WhatsApp metadata (timestamps/sender) from each line
                                const cleaned = text.split('\n').map(line => {
                                    // Pattern: "[DD/MM/YYYY, HH:MM:SS] Sender: message" or "DD/MM/YYYY, HH:MM - Sender: message"
                                    const stripped = line
                                        .replace(/^\[?\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]\.?\s*m\.?)?\]?\s*[-–]?\s*/i, '')
                                        .replace(/^[^:]+:\s*/, '');
                                    return stripped;
                                }).filter(l => l.trim()).join('\n');
                                // Set the text in the parser - we need a ref or state approach
                                // For simplicity, we populate a hidden textarea and trigger parse
                                const textarea = document.querySelector('#whatsapp-chat-input') as HTMLTextAreaElement;
                                if (textarea) {
                                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
                                    nativeInputValueSetter?.call(textarea, cleaned);
                                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                                    textarea.dispatchEvent(new Event('change', { bubbles: true }));
                                }
                            }}
                            className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-green-100 file:text-green-700 hover:file:bg-green-200 cursor-pointer"
                        />
                    </div>

                    <WhatsAppOrderParser
                        onOrderReady={(items, name, phone, address) => {
                            // Convert CartItem format from parser to sales-entry format
                            const cartItems: CartItem[] = items.map(i => ({
                                menuItemId: i.menuItemId,
                                menuItemName: i.name,
                                quantity: i.quantity,
                                unitPrice: i.unitPrice,
                                notes: i.notes,
                            }));
                            setCart(cartItems);
                            if (name) setCustomerName(name);
                            if (phone) setCustomerPhone(phone);
                            if (address) {
                                setDeliveryAddress(address);
                                setOrderType('DELIVERY');
                            }
                            setViewMode('entry');
                        }}
                    />
                </div>
            )}

            {/* Vista: Historial del día */}
            {viewMode === 'history' && (
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="border-b border-gray-200 bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-500">Orden</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-500">Tipo</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-500">Cliente</th>
                                    <th className="px-6 py-3 text-center text-xs font-semibold uppercase text-gray-500">Items</th>
                                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-gray-500">Total</th>
                                    <th className="px-6 py-3 text-center text-xs font-semibold uppercase text-gray-500">Hora</th>
                                    <th className="px-6 py-3 text-center text-xs font-semibold uppercase text-gray-500">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {todaySales.sales.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                                            <span className="text-4xl">📭</span>
                                            <p className="mt-2">No hay ventas registradas hoy</p>
                                        </td>
                                    </tr>
                                ) : (
                                    todaySales.sales.map((sale: any) => (
                                        <tr key={sale.id} className={cn(
                                            'hover:bg-gray-50',
                                            sale.status === 'VOIDED' && 'opacity-50 bg-red-50'
                                        )}>
                                            <td className="px-6 py-4">
                                                <p className="font-medium text-gray-900">{sale.orderNumber}</p>
                                                <p className="text-xs text-gray-500">{sale.createdBy}</p>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={cn(
                                                    'px-2.5 py-1 rounded-full text-xs font-medium',
                                                    sale.orderType === 'RESTAURANT' && 'bg-blue-100 text-blue-700',
                                                    sale.orderType === 'DELIVERY' && 'bg-purple-100 text-purple-700',
                                                    sale.orderType === 'TAKEOUT' && 'bg-amber-100 text-amber-700'
                                                )}>
                                                    {sale.orderType === 'RESTAURANT' ? '🍽️' : sale.orderType === 'DELIVERY' ? '🛵' : '📦'} {sale.orderType}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-700">
                                                {sale.customerName || '-'}
                                            </td>
                                            <td className="px-6 py-4 text-center font-mono">
                                                {sale.itemCount}
                                            </td>
                                            <td className="px-6 py-4 text-right font-semibold text-emerald-600">
                                                {formatCurrency(sale.total)}
                                            </td>
                                            <td className="px-6 py-4 text-center text-sm text-gray-500">
                                                {new Date(sale.createdAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {sale.status !== 'VOIDED' && (
                                                    <button
                                                        onClick={() => handleVoidSale(sale.id)}
                                                        className="text-red-500 hover:text-red-700 text-sm"
                                                        title="Anular venta"
                                                    >
                                                        🗑️ Anular
                                                    </button>
                                                )}
                                                {sale.status === 'VOIDED' && (
                                                    <span className="text-red-500 text-xs">ANULADA</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
