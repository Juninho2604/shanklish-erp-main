'use client';

import { useState, useEffect, useMemo } from 'react';
import { formatNumber, cn } from '@/lib/utils';
import {
    getLowStockItemsAction, getAllItemsForPurchaseAction, getAllItemsWithStockConfigAction,
    createPurchaseOrderAction, getPurchaseOrdersAction, getSuppliersAction, getAreasForReceivingAction,
    sendPurchaseOrderAction, cancelPurchaseOrderAction, exportPurchaseOrderTextAction,
    receivePurchaseOrderItemsAction, updateStockLevelsAction, createReorderBroadcastsAction,
    LowStockItem, StockConfigItem
} from '@/app/actions/purchase.actions';
import WhatsAppPurchaseOrderParser from '@/components/whatsapp-purchase-order-parser';

type ViewMode = 'orders' | 'create' | 'auto' | 'config' | 'receive' | 'whatsapp';

interface OrderItem {
    rowId: string; // ID único por fila (permite duplicados del mismo producto)
    inventoryItemId: string;
    name: string;
    category: string;
    quantity: number;
    unit: string;
    unitPrice: number;
}

function genRowId() {
    return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function PurchaseOrderView() {
    const [viewMode, setViewMode] = useState<ViewMode>('orders');
    const [orders, setOrders] = useState<any[]>([]);
    const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([]);
    const [allItems, setAllItems] = useState<any[]>([]);
    const [configItems, setConfigItems] = useState<any[]>([]);
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [areas, setAreas] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [orderName, setOrderName] = useState('');
    const [selectedSupplier, setSelectedSupplier] = useState('');
    const [expectedDate, setExpectedDate] = useState('');
    const [notes, setNotes] = useState('');
    const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Receive state
    const [selectedOrderId, setSelectedOrderId] = useState('');
    const [selectedAreaId, setSelectedAreaId] = useState('');
    const [receiveQuantities, setReceiveQuantities] = useState<Record<string, number>>({});

    // Config state
    const [configEdits, setConfigEdits] = useState<Record<string, { min: number; reorder: number }>>({});
    const [configFilter, setConfigFilter] = useState('');

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        setIsLoading(true);
        const [ordersData, suppliersData, areasData] = await Promise.all([
            getPurchaseOrdersAction(), getSuppliersAction(), getAreasForReceivingAction()
        ]);
        setOrders(ordersData);
        setSuppliers(suppliersData);
        setAreas(areasData);
        if (areasData.length > 0) setSelectedAreaId(areasData[0].id);
        setIsLoading(false);
    }

    useEffect(() => {
        if (viewMode === 'auto') getLowStockItemsAction().then(setLowStockItems);
        else if (viewMode === 'create') getAllItemsForPurchaseAction().then(setAllItems);
        else if (viewMode === 'config') {
            getAllItemsWithStockConfigAction().then(items => {
                setConfigItems(items);
                const edits: Record<string, { min: number; reorder: number }> = {};
                items.forEach((i: any) => { edits[i.id] = { min: i.minimumStock, reorder: i.reorderPoint }; });
                setConfigEdits(edits);
            });
        }
    }, [viewMode]);

    function addFromSuggestion(item: LowStockItem) {
        if (orderItems.some(oi => oi.inventoryItemId === item.id)) return;
        setOrderItems([...orderItems, { rowId: genRowId(), inventoryItemId: item.id, name: item.name, category: item.category || 'Sin Categoría', quantity: item.suggestedQuantity, unit: item.baseUnit, unitPrice: 0 }]);
    }

    function addAllSuggestions() {
        const newItems = lowStockItems.filter(item => !orderItems.some(oi => oi.inventoryItemId === item.id))
            .map(item => ({ rowId: genRowId(), inventoryItemId: item.id, name: item.name, category: item.category || 'Sin Categoría', quantity: item.suggestedQuantity, unit: item.baseUnit, unitPrice: 0 }));
        setOrderItems([...orderItems, ...newItems]);
    }

    function addManualItem(item: any) {
        if (orderItems.some(oi => oi.inventoryItemId === item.id)) return;
        setOrderItems([...orderItems, { rowId: genRowId(), inventoryItemId: item.id, name: item.name, category: item.category || 'Sin Categoría', quantity: 1, unit: item.baseUnit, unitPrice: 0 }]);
        setSearchQuery('');
    }

    function handleWhatsAppOrderReady(items: { inventoryItemId: string; name: string; category: string; quantity: number; unit: string }[], supplierName?: string, extractedNotes?: string) {
        const newOrderItems: OrderItem[] = items.map(i => ({
            rowId: genRowId(),
            inventoryItemId: i.inventoryItemId,
            name: i.name,
            category: i.category,
            quantity: i.quantity,
            unit: i.unit,
            unitPrice: 0,
        }));
        setOrderItems(newOrderItems);
        let finalNotes = extractedNotes || '';
        if (supplierName) {
            const matched = suppliers.find(s => s.name.toLowerCase().includes(supplierName.toLowerCase()) || supplierName.toLowerCase().includes(s.name.toLowerCase()));
            setSelectedSupplier(matched?.id || '');
            if (!matched) finalNotes = (finalNotes ? `Proveedor: ${supplierName}\n` : `Proveedor: ${supplierName}`) + finalNotes;
        }
        setNotes(finalNotes);
        setViewMode('create');
    }

    function updateItemQuantity(rowId: string, quantity: number) {
        setOrderItems(prev => prev.map(item => item.rowId === rowId ? { ...item, quantity } : item));
    }

    function removeItem(rowId: string) {
        setOrderItems(prev => prev.filter(item => item.rowId !== rowId));
    }

    async function handleCreateOrder() {
        if (orderItems.length === 0) return;
        setIsSubmitting(true);
        const result = await createPurchaseOrderAction({
            orderName: orderName?.trim() || undefined,
            supplierId: selectedSupplier || undefined, expectedDate: expectedDate ? new Date(expectedDate) : undefined,
            notes: notes || undefined, items: orderItems.map(item => ({ inventoryItemId: item.inventoryItemId, quantityOrdered: item.quantity, unit: item.unit, unitPrice: item.unitPrice }))
        });
        if (result.success) { alert(`✅ ${result.message}`); setOrderItems([]); setOrderName(''); setSelectedSupplier(''); setExpectedDate(''); setNotes(''); setViewMode('orders'); loadData(); }
        else alert(`❌ ${result.message}`);
        setIsSubmitting(false);
    }

    async function handleSendOrder(orderId: string) { const r = await sendPurchaseOrderAction(orderId); if (r.success) loadData(); alert(r.message); }
    async function handleCancelOrder(orderId: string) { if (!confirm('¿Cancelar esta orden?')) return; const r = await cancelPurchaseOrderAction(orderId); if (r.success) loadData(); alert(r.message); }
    async function handleExportWhatsApp(orderId: string) { const text = await exportPurchaseOrderTextAction(orderId); if (text) { navigator.clipboard.writeText(text); alert('📋 Orden copiada al portapapeles'); } }

    async function handleReceiveItems() {
        if (!selectedOrderId || !selectedAreaId) return;
        const items = Object.entries(receiveQuantities).filter(([, qty]) => qty > 0).map(([id, qty]) => ({ purchaseOrderItemId: id, quantityReceived: qty }));
        if (items.length === 0) { alert('Ingresa cantidades a recibir'); return; }
        setIsSubmitting(true);
        const r = await receivePurchaseOrderItemsAction(selectedOrderId, items, selectedAreaId);
        alert(r.success ? `✅ ${r.message}` : `❌ ${r.message}`);
        if (r.success) { setReceiveQuantities({}); setSelectedOrderId(''); loadData(); setViewMode('orders'); }
        setIsSubmitting(false);
    }

    async function handleCreateReorderAlerts() {
        setIsSubmitting(true);
        const r = await createReorderBroadcastsAction();
        if (r.created > 0) alert(`✅ ${r.created} alerta(s) de reorden enviadas a la campana 🔔`);
        else if (r.skipped > 0) alert(`ℹ️ Todas las alertas ya existen (${r.skipped} en curso). Revisa la campana 🔔`);
        else alert('ℹ️ No hay items bajo punto de reorden en este momento');
        setIsSubmitting(false);
    }

    async function handleSaveConfig() {
        const items: StockConfigItem[] = Object.entries(configEdits).map(([id, vals]) => ({ id, minimumStock: vals.min, reorderPoint: vals.reorder }));
        setIsSubmitting(true);
        const r = await updateStockLevelsAction(items);
        alert(r.success ? `✅ ${r.message}` : `❌ ${r.message}`);
        setIsSubmitting(false);
    }

    const filteredItems = allItems.filter(item => searchQuery && (item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.sku.toLowerCase().includes(searchQuery.toLowerCase()))).slice(0, 10);

    // Group order items by category
    const orderItemsByCategory = useMemo(() => {
        const groups: Record<string, OrderItem[]> = {};
        orderItems.forEach(item => { const cat = item.category || 'Sin Categoría'; if (!groups[cat]) groups[cat] = []; groups[cat].push(item); });
        return groups;
    }, [orderItems]);

    const selectedOrder = orders.find(o => o.id === selectedOrderId);

    // Group selected order items by category
    const selectedOrderItemsByCategory = useMemo(() => {
        if (!selectedOrder) return {};
        const groups: Record<string, any[]> = {};
        selectedOrder.items.forEach((item: any) => { const cat = item.category || 'Sin Categoría'; if (!groups[cat]) groups[cat] = []; groups[cat].push(item); });
        return groups;
    }, [selectedOrder]);

    const filteredConfigItems = configItems.filter(i => !configFilter || i.name.toLowerCase().includes(configFilter.toLowerCase()) || i.category.toLowerCase().includes(configFilter.toLowerCase()));

    const configByCategory = useMemo(() => {
        const groups: Record<string, any[]> = {};
        filteredConfigItems.forEach(i => { if (!groups[i.category]) groups[i.category] = []; groups[i.category].push(i); });
        return groups;
    }, [filteredConfigItems]);

    const getStatusBadge = (status: string) => {
        const s: Record<string, string> = { 'DRAFT': 'bg-gray-100 text-gray-700', 'SENT': 'bg-blue-100 text-blue-700', 'PARTIAL': 'bg-amber-100 text-amber-700', 'RECEIVED': 'bg-green-100 text-green-700', 'CANCELLED': 'bg-red-100 text-red-700' };
        const l: Record<string, string> = { 'DRAFT': '📝 Borrador', 'SENT': '📤 Enviada', 'PARTIAL': '📦 Parcial', 'RECEIVED': '✅ Recibida', 'CANCELLED': '❌ Cancelada' };
        return <span className={cn('px-2.5 py-1 rounded-full text-xs font-medium', s[status] || s['DRAFT'])}>{l[status] || status}</span>;
    };

    const lowStockByCategory = useMemo(() => {
        const groups: Record<string, LowStockItem[]> = {};
        lowStockItems.forEach(i => { const cat = i.category || 'Sin Categoría'; if (!groups[cat]) groups[cat] = []; groups[cat].push(i); });
        return groups;
    }, [lowStockItems]);

    if (isLoading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="text-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto"></div><p className="mt-4 text-gray-500">Cargando...</p></div></div>;

    return (
        <div className="space-y-6 animate-in">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">🛒 Módulo de Compras</h1>
                    <p className="text-gray-500">Gestiona órdenes de compra, stock mínimo y recepción de mercancía</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {(['orders', 'auto', 'create', 'whatsapp', 'config', 'receive'] as ViewMode[]).map(mode => {
                        const labels: Record<ViewMode, string> = { orders: '📋 Órdenes', auto: '✨ Auto-Generar', create: '➕ Manual', whatsapp: '💬 WhatsApp', config: '⚙️ Stock Mín.', receive: '📥 Recibir' };
                        return <button key={mode} onClick={() => { setViewMode(mode); if (mode === 'orders') loadData(); if (mode === 'create' || mode === 'whatsapp') getAllItemsForPurchaseAction().then(setAllItems); }}
                            className={cn('px-3 py-2 rounded-lg text-xs font-medium transition-all', viewMode === mode ? (mode === 'whatsapp' ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg' : 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg') : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300')}>{labels[mode]}</button>;
                    })}
                </div>
            </div>

            {/* ===== CONFIG: Stock Mínimo ===== */}
            {viewMode === 'config' && (
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                    <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                            <h2 className="font-semibold text-gray-900 dark:text-white">⚙️ Configurar Stock Mínimo y Punto de Reorden</h2>
                            <p className="text-sm text-gray-500 mt-1">Define las cantidades mínimas para que el sistema detecte productos con stock bajo</p>
                        </div>
                        <div className="flex gap-2">
                            <input type="text" value={configFilter} onChange={e => setConfigFilter(e.target.value)} placeholder="Filtrar..." className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
                            <button onClick={handleSaveConfig} disabled={isSubmitting} className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 text-white text-sm font-medium disabled:opacity-50 hover:shadow-lg transition-all">
                                {isSubmitting ? '⏳...' : '💾 Guardar Todo'}
                            </button>
                        </div>
                    </div>
                    <div className="max-h-[65vh] overflow-y-auto">
                        {Object.entries(configByCategory).map(([category, items]) => (
                            <div key={category}>
                                <div className="sticky top-0 bg-amber-50 dark:bg-amber-900/20 px-6 py-2 border-b border-amber-200 dark:border-amber-800">
                                    <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">📂 {category}</span>
                                </div>
                                {items.map((item: any) => (
                                    <div key={item.id} className="grid grid-cols-[1fr_100px_100px_100px] gap-3 items-center px-6 py-2.5 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <div>
                                            <p className="text-sm font-medium text-gray-900 dark:text-white">{item.name}</p>
                                            <p className="text-xs text-gray-400">{item.sku} · {item.baseUnit}</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-xs text-gray-400 mb-0.5">Stock</p>
                                            <p className={cn('text-sm font-mono font-medium', item.currentStock <= (configEdits[item.id]?.min || 0) ? 'text-red-600' : 'text-gray-700 dark:text-gray-300')}>{formatNumber(item.currentStock)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-400 mb-0.5 text-center">Mínimo</p>
                                            <input type="number" min="0" step="0.5" value={configEdits[item.id]?.min ?? 0}
                                                onChange={e => setConfigEdits({ ...configEdits, [item.id]: { ...configEdits[item.id], min: parseFloat(e.target.value) || 0 } })}
                                                className="w-full rounded border border-gray-200 px-2 py-1 text-sm text-center dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-400 mb-0.5 text-center">Reorden</p>
                                            <input type="number" min="0" step="0.5" value={configEdits[item.id]?.reorder ?? 0}
                                                onChange={e => setConfigEdits({ ...configEdits, [item.id]: { ...configEdits[item.id], reorder: parseFloat(e.target.value) || 0 } })}
                                                className="w-full rounded border border-gray-200 px-2 py-1 text-sm text-center dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))}
                        {filteredConfigItems.length === 0 && <div className="p-8 text-center text-gray-500">No hay items que configurar</div>}
                    </div>
                </div>
            )}

            {/* ===== AUTO: Generar Automática ===== */}
            {viewMode === 'auto' && (
                <div className="grid gap-6 lg:grid-cols-2">
                    <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700 flex items-center justify-between gap-3 flex-wrap">
                            <h2 className="font-semibold text-gray-900 dark:text-white">⚠️ Items con Stock Bajo</h2>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleCreateReorderAlerts}
                                    disabled={isSubmitting}
                                    className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-600 border border-amber-500/30 hover:bg-amber-500/20 font-medium transition-colors disabled:opacity-50"
                                >
                                    🔔 Enviar alertas
                                </button>
                                <button onClick={addAllSuggestions} className="text-sm text-amber-600 hover:text-amber-700 font-medium">Agregar todos →</button>
                            </div>
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto">
                            {lowStockItems.length === 0 ? (
                                <div className="p-8 text-center text-gray-500">
                                    <span className="text-4xl">🎉</span>
                                    <p className="mt-2">¡No hay items con stock bajo!</p>
                                    <p className="text-sm mt-1">¿Ya configuraste los mínimos? Ve a <button onClick={() => setViewMode('config')} className="text-amber-600 underline">⚙️ Stock Mín.</button></p>
                                </div>
                            ) : (
                                Object.entries(lowStockByCategory).map(([cat, items]) => (
                                    <div key={cat}>
                                        <div className="sticky top-0 bg-red-50 dark:bg-red-900/20 px-6 py-1.5 border-b border-red-200 dark:border-red-800">
                                            <span className="text-xs font-semibold text-red-700 dark:text-red-400">📂 {cat} ({items.length})</span>
                                        </div>
                                        {items.map(item => (
                                            <div key={item.id} className={cn("flex items-center justify-between px-6 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700", item.isCritical && 'bg-red-50/50 dark:bg-red-900/10')}>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{item.isCritical && '🔴 '}{item.name}</p>
                                                    <p className="text-xs text-gray-500">Stock: <span className="text-red-600 font-medium">{formatNumber(item.currentStock)}</span> / Mín: {formatNumber(item.minimumStock)} {item.baseUnit}</p>
                                                </div>
                                                <div className="flex items-center gap-2 ml-4">
                                                    <span className="text-sm font-mono text-amber-600">+{formatNumber(item.suggestedQuantity)}</span>
                                                    <button onClick={() => addFromSuggestion(item)} disabled={orderItems.some(oi => oi.inventoryItemId === item.id)}
                                                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50 disabled:cursor-not-allowed">
                                                        {orderItems.some(oi => oi.inventoryItemId === item.id) ? '✓' : 'Agregar'}
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                    {/* Order form panel */}
                    {renderOrderForm()}
                </div>
            )}

            {/* ===== WHATSAPP: Cargar orden desde chat ===== */}
            {viewMode === 'whatsapp' && (
                <div className="grid gap-6 lg:grid-cols-3">
                    <div className="lg:col-span-2">
                        <WhatsAppPurchaseOrderParser onOrderReady={handleWhatsAppOrderReady} />
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-amber-50/50 dark:bg-gray-800 dark:border-gray-700 p-6">
                        <h3 className="font-semibold text-amber-800 dark:text-amber-200 mb-2">💡 Cómo usar</h3>
                        <ol className="text-sm text-amber-900 dark:text-amber-100 space-y-2 list-decimal list-inside">
                            <li>Exporta o copia el chat de WhatsApp con tu proveedor</li>
                            <li>Pega el texto en el área de la izquierda</li>
                            <li>Haz clic en &quot;Analizar Orden&quot;</li>
                            <li>Revisa y corrige los items reconocidos</li>
                            <li>Haz clic en &quot;Cargar items a la orden&quot;</li>
                            <li>Completa proveedor, fecha y crea la orden</li>
                        </ol>
                        <p className="mt-4 text-xs text-amber-700 dark:text-amber-300">
                            Formatos soportados: 2 kg Arroz, 5x Aceite, 10 unidades Harina, etc.
                        </p>
                    </div>
                </div>
            )}

            {/* ===== CREATE: Manual ===== */}
            {viewMode === 'create' && (
                <div className="grid gap-6 lg:grid-cols-2">
                    <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700"><h2 className="font-semibold text-gray-900 dark:text-white">🔍 Buscar Items</h2></div>
                        <div className="p-6">
                            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Escriba para buscar..." className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
                            {filteredItems.length > 0 && (
                                <div className="mt-3 border rounded-lg divide-y divide-gray-100 dark:divide-gray-700">
                                    {filteredItems.map(item => (
                                        <div key={item.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                            <div><p className="font-medium text-gray-900 dark:text-white">{item.name}</p><p className="text-xs text-gray-500">Stock: {formatNumber(item.currentStock)} {item.baseUnit} · {item.category || 'Sin cat.'}</p></div>
                                            <button onClick={() => addManualItem(item)} disabled={orderItems.some(oi => oi.inventoryItemId === item.id)} className="px-3 py-1 text-xs font-medium rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50">
                                                {orderItems.some(oi => oi.inventoryItemId === item.id) ? '✓' : 'Agregar'}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    {renderOrderForm()}
                </div>
            )}

            {/* ===== RECEIVE: Recibir Mercancía ===== */}
            {viewMode === 'receive' && (
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                    <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                        <h2 className="font-semibold text-gray-900 dark:text-white">📥 Recibir Mercancía desde Orden de Compra</h2>
                        <p className="text-sm text-gray-500 mt-1">Selecciona una orden activa y registra lo que va llegando de los proveedores</p>
                    </div>
                    <div className="p-6 space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Orden de Compra</label>
                                <select value={selectedOrderId} onChange={e => { setSelectedOrderId(e.target.value); setReceiveQuantities({}); }}
                                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                                    <option value="">Seleccionar orden...</option>
                                    {orders.filter(o => ['DRAFT', 'SENT', 'PARTIAL'].includes(o.status)).map(o => (
                                        <option key={o.id} value={o.id}>{o.orderNumber}{o.orderName ? ` (${o.orderName})` : ''} - {o.supplierName} ({o.itemCount} items) {getStatusLabel(o.status)}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Área de Almacenamiento</label>
                                <select value={selectedAreaId} onChange={e => setSelectedAreaId(e.target.value)}
                                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                                    {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                            </div>
                        </div>
                        {selectedOrder && (
                            <div className="border rounded-lg overflow-hidden">
                                {Object.entries(selectedOrderItemsByCategory).map(([cat, items]) => (
                                    <div key={cat}>
                                        <div className="bg-amber-50 dark:bg-amber-900/20 px-4 py-2 border-b border-amber-200 dark:border-amber-800">
                                            <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">📂 {cat}</span>
                                        </div>
                                        {(items as any[]).map((item: any) => {
                                            const remaining = item.quantityOrdered - item.quantityReceived;
                                            const isComplete = remaining <= 0;
                                            return (
                                                <div key={item.id} className={cn("grid grid-cols-[1fr_80px_80px_80px_100px] gap-2 items-center px-4 py-2.5 border-b border-gray-100 dark:border-gray-700", isComplete && 'bg-green-50/50 dark:bg-green-900/10')}>
                                                    <div><p className="text-sm font-medium text-gray-900 dark:text-white">{item.itemName}</p></div>
                                                    <div className="text-center"><p className="text-xs text-gray-400">Pedido</p><p className="text-sm font-mono">{formatNumber(item.quantityOrdered)}</p></div>
                                                    <div className="text-center"><p className="text-xs text-gray-400">Recibido</p><p className="text-sm font-mono text-green-600">{formatNumber(item.quantityReceived)}</p></div>
                                                    <div className="text-center"><p className="text-xs text-gray-400">Falta</p><p className={cn("text-sm font-mono", remaining > 0 ? 'text-red-600' : 'text-green-600')}>{formatNumber(remaining)}</p></div>
                                                    <div>{!isComplete && (
                                                        <input type="number" min="0" max={remaining} step="0.1" placeholder="0" value={receiveQuantities[item.id] || ''}
                                                            onChange={e => setReceiveQuantities({ ...receiveQuantities, [item.id]: parseFloat(e.target.value) || 0 })}
                                                            className="w-full rounded border border-gray-200 px-2 py-1 text-sm text-center dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
                                                    )}{isComplete && <span className="text-xs text-green-600 font-medium">✅ Completo</span>}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                                <div className="p-4 bg-gray-50 dark:bg-gray-800 flex justify-end">
                                    <button onClick={handleReceiveItems} disabled={isSubmitting || Object.values(receiveQuantities).every(v => !v)}
                                        className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium disabled:opacity-50 hover:shadow-lg transition-all">
                                        {isSubmitting ? '⏳ Procesando...' : '📥 Dar Entrada a Mercancía'}
                                    </button>
                                </div>
                            </div>
                        )}
                        {!selectedOrderId && <div className="text-center py-8 text-gray-500"><span className="text-4xl">📦</span><p className="mt-2">Selecciona una orden de compra para comenzar a recibir mercancía</p></div>}
                    </div>
                </div>
            )}

            {/* ===== ORDERS: Lista de Órdenes ===== */}
            {viewMode === 'orders' && renderOrdersList()}
        </div>
    );

    function getStatusLabel(status: string) { return { DRAFT: 'Borrador', SENT: 'Enviada', PARTIAL: 'Parcial', RECEIVED: 'Recibida', CANCELLED: 'Cancelada' }[status] || status; }

    function renderOrderForm() {
        return (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700"><h2 className="font-semibold text-gray-900 dark:text-white">📋 Nueva Orden de Compra</h2></div>
                <div className="p-6 space-y-4">
                    <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre de orden (opcional)</label>
                        <input type="text" value={orderName} onChange={e => setOrderName(e.target.value)} placeholder="Ej: VEGETALES, COCHE, PROVEEDOR X..." className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Proveedor (opcional)</label>
                        <select value={selectedSupplier} onChange={e => setSelectedSupplier(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                            <option value="">Sin proveedor específico</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select></div>
                    <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha de entrega esperada</label>
                        <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Items a comprar ({orderItems.length})</label>
                        {orderItems.length === 0 ? <p className="text-sm text-gray-500 italic">Agrega items desde el panel izquierdo</p> : (
                            <div className="border rounded-lg max-h-72 overflow-y-auto">
                                {Object.entries(orderItemsByCategory).map(([cat, items]) => (
                                    <div key={cat}>
                                        <div className="bg-amber-50 dark:bg-amber-900/20 px-3 py-1 border-b border-amber-200 dark:border-amber-800"><span className="text-xs font-semibold text-amber-700">{cat}</span></div>
                                        {items.map(item => (
                                            <div key={item.rowId} className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-100 dark:border-gray-700">
                                                <span className="flex-1 text-sm truncate">{item.name}</span>
                                                <input type="number" value={item.quantity} onChange={e => updateItemQuantity(item.rowId, parseFloat(e.target.value) || 0)} className="w-16 px-1.5 py-1 text-sm rounded border border-gray-200 text-center" min="0" step="0.1" />
                                                <span className="text-xs text-gray-500 w-8">{item.unit}</span>
                                                <button type="button" onClick={() => removeItem(item.rowId)} className="text-red-500 hover:text-red-700 text-sm flex-shrink-0">✕</button>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        )}</div>
                    <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notas (opcional)</label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Instrucciones especiales..." className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white" /></div>
                    <button onClick={handleCreateOrder} disabled={orderItems.length === 0 || isSubmitting} className="w-full py-3 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transition-all">
                        {isSubmitting ? 'Creando...' : `📝 Crear Orden (${orderItems.length} items)`}
                    </button>
                </div>
            </div>
        );
    }

    function renderOrdersList() {
        return (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-500">Orden</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-500">Proveedor</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-500">Fecha</th>
                                <th className="px-6 py-3 text-center text-xs font-semibold uppercase text-gray-500">Items</th>
                                <th className="px-6 py-3 text-center text-xs font-semibold uppercase text-gray-500">Estado</th>
                                <th className="px-6 py-3 text-center text-xs font-semibold uppercase text-gray-500">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {orders.length === 0 ? (
                                <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500"><span className="text-4xl">📭</span><p className="mt-2">No hay órdenes de compra</p></td></tr>
                            ) : orders.map(order => (
                                <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                    <td className="px-6 py-4">
                                        <p className="font-medium text-gray-900 dark:text-white">{order.orderNumber}</p>
                                        {order.orderName && <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">{order.orderName}</p>}
                                        <p className="text-xs text-gray-500">{order.createdBy}</p>
                                    </td>
                                    <td className="px-6 py-4 text-gray-700 dark:text-gray-300">{order.supplierName}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{new Date(order.orderDate).toLocaleDateString('es-VE')}</td>
                                    <td className="px-6 py-4 text-center"><span className="font-mono">{order.itemCount}</span></td>
                                    <td className="px-6 py-4 text-center">{getStatusBadge(order.status)}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center justify-center gap-1">
                                            <button onClick={() => handleExportWhatsApp(order.id)} className="p-1.5 text-gray-400 hover:text-green-600 rounded-lg hover:bg-green-50 min-h-[44px] min-w-[44px]" title="Copiar para WhatsApp">📱</button>
                                            {['SENT', 'PARTIAL'].includes(order.status) && (
                                                <button
                                                    onClick={() => { setSelectedOrderId(order.id); setReceiveQuantities({}); setViewMode('receive'); }}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg shadow-sm transition-colors min-h-[44px]"
                                                    title="Recibir mercancía"
                                                >
                                                    📦 Recibir
                                                </button>
                                            )}
                                            {order.status === 'DRAFT' && (<>
                                                <button onClick={() => { setSelectedOrderId(order.id); setReceiveQuantities({}); setViewMode('receive'); }} className="p-1.5 text-gray-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 min-h-[44px] min-w-[44px]" title="Recibir mercancía">📥</button>
                                                <button onClick={() => handleSendOrder(order.id)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 min-h-[44px] min-w-[44px]" title="Marcar como enviada">📤</button>
                                                <button onClick={() => handleCancelOrder(order.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 min-h-[44px] min-w-[44px]" title="Cancelar">🗑️</button>
                                            </>)}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }
}
