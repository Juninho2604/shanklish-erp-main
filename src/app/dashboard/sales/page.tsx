'use client';

import { useState, useEffect } from 'react';
import { getSalesHistoryAction, getDailyZReportAction, getEndOfDaySummaryAction, voidSalesOrderAction, type ZReportData, type EndOfDaySummary } from '@/app/actions/sales.actions';
import { validateCashierPinAction } from '@/app/actions/pos.actions';
import { printReceipt, printEndOfDaySummary } from '@/lib/print-command';
import { exportZReportToExcel } from '@/lib/export-z-report';

export default function SalesHistoryPage() {
    const [sales, setSales] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [zReport, setZReport] = useState<ZReportData | null>(null);
    const [showZReport, setShowZReport] = useState(false);
    const [daySummary, setDaySummary] = useState<EndOfDaySummary | null>(null);
    const [showDaySummary, setShowDaySummary] = useState(false);

    // --- EXPANSIÓN DE FILAS ---
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

    // --- ANULACIÓN ---
    const [voidTarget, setVoidTarget] = useState<any | null>(null);
    const [voidStep, setVoidStep] = useState<'reason' | 'pin'>('reason');
    const [voidReason, setVoidReason] = useState('');
    const [voidPin, setVoidPin] = useState('');
    const [voidPinError, setVoidPinError] = useState('');
    const [voidLoading, setVoidLoading] = useState(false);

    // --- FILTROS ---
    const [cancelledFilter, setCancelledFilter] = useState<'active' | 'all' | 'only'>('active');
    const [filterDate, setFilterDate] = useState(() => {
        // Default: today en Caracas
        return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
    });
    const [filterSearch, setFilterSearch] = useState('');
    const [filterPaymentMethod, setFilterPaymentMethod] = useState('ALL');
    const [filterOrderType, setFilterOrderType] = useState('ALL');
    const [filterHasDiscount, setFilterHasDiscount] = useState(false);

    // Recargar datos cada vez que cambia la fecha seleccionada
    useEffect(() => { loadData(filterDate); }, [filterDate]);

    const loadData = async (date?: string) => {
        setIsLoading(true);
        const result = await getSalesHistoryAction(date || undefined);
        if (result.success && result.data) setSales(result.data as any[]);
        setIsLoading(false);
    };

    const toggleRow = (id: string) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleGenerateZReport = async () => {
        const result = await getDailyZReportAction(filterDate || undefined);
        if (result.success && result.data) { setZReport(result.data); setShowZReport(true); }
        else alert('Error generando reporte Z');
    };

    const handleDaySummary = async () => {
        const result = await getEndOfDaySummaryAction(filterDate || undefined);
        if (result.success && result.data) { setDaySummary(result.data); setShowDaySummary(true); }
        else alert('Error generando resumen de cierre');
    };

    const handleExportArqueo = async () => {
        const date = filterDate ? new Date(filterDate + 'T12:00:00') : new Date();
        const dateParam = date.toISOString().slice(0, 10);
        try {
            const res = await fetch(`/api/arqueo?date=${dateParam}`);
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                alert(err.error || 'Error exportando arqueo');
                return;
            }
            const blob = await res.blob();
            const contentDisposition = res.headers.get('Content-Disposition');
            let fileName = `Arqueo_Caja_Shanklish_${dateParam}.xlsx`;
            if (contentDisposition) {
                const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;\s]+)/);
                if (utf8Match) fileName = decodeURIComponent(utf8Match[1]);
                else {
                    const simpleMatch = contentDisposition.match(/filename=["']?([^"';]+)/);
                    if (simpleMatch) fileName = simpleMatch[1].trim();
                }
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            alert('Error exportando arqueo');
        }
    };

    // ---- REIMPRESIÓN ----
    const handleReprint = (sale: any, e: React.MouseEvent) => {
        e.stopPropagation();
        const serviceFee = sale.orderType === 'RESTAURANT' && sale.serviceFeeIncluded ? (sale.total || 0) * 0.1 : 0;
        const itemsSubtotal = (sale.items || []).reduce((s: number, i: any) => s + (i.lineTotal || 0), 0);
        const deliveryFee = sale.orderType === 'DELIVERY' && sale.subtotal != null ? Math.max(0, sale.subtotal - itemsSubtotal) : undefined;
        const discountReason = (sale.discount || 0) > 0 ? 'Descuento aplicado' : undefined;
        printReceipt({
            orderNumber: sale.orderNumber,
            orderType: (sale.orderType || 'RESTAURANT') as 'RESTAURANT' | 'DELIVERY',
            date: sale.createdAt,
            cashierName: `${sale.createdBy?.firstName || 'Cajera'} ${sale.createdBy?.lastName || ''}`.trim(),
            customerName: sale.customerName || undefined,
            customerPhone: sale.customerPhone || undefined,
            customerAddress: sale.customerAddress || undefined,
            subtotal: sale.orderType === 'DELIVERY' && deliveryFee ? itemsSubtotal : (sale.subtotal ?? itemsSubtotal),
            discount: sale.discount ?? 0,
            discountReason,
            deliveryFee,
            total: sale.total,
            serviceFee,
            items: (sale.items || []).map((item: any) => ({
                name: item.itemName || item.name,
                quantity: item.quantity,
                unitPrice: item.unitPrice ?? (item.lineTotal / (item.quantity || 1)),
                total: item.lineTotal || item.total,
                modifiers: Array.isArray(item.modifiers) ? item.modifiers.map((m: any) => typeof m === 'string' ? m : m?.name) : []
            }))
        });
    };

    // ---- ANULACIÓN ----
    const openVoidModal = (sale: any, e: React.MouseEvent) => {
        e.stopPropagation();
        setVoidTarget(sale);
        setVoidStep('reason');
        setVoidReason('');
        setVoidPin('');
        setVoidPinError('');
    };

    const handleVoidPinConfirm = async () => {
        setVoidPinError('');
        setVoidLoading(true);
        const res = await validateCashierPinAction(voidPin);
        if (res.success && res.data) {
            await executeVoid(res.data.managerId, res.data.managerName);
        } else {
            setVoidPinError('PIN inválido o sin permisos suficientes');
            setVoidLoading(false);
        }
    };

    const executeVoid = async (managerId: string, managerName: string) => {
        if (!voidTarget) return;
        const orderIds = voidTarget._orderIds || [voidTarget.id];
        let lastError = '';
        for (const orderId of orderIds) {
            const res = await voidSalesOrderAction({
                orderId,
                voidReason,
                authorizedById: managerId,
                authorizedByName: managerName
            });
            if (!res.success) lastError = res.message || 'Error';
        }
        setVoidLoading(false);
        if (!lastError) {
            alert(`✅ ${orderIds.length > 1 ? 'Mesa anulada correctamente' : 'Orden anulada correctamente'}`);
            setVoidTarget(null);
            loadData();
        } else {
            alert(`❌ ${lastError}`);
        }
    };

    // ---- BADGES ----
    const getPaymentBadge = (method: string) => {
        switch (method?.toUpperCase()) {
            case 'CASH':
            case 'CASH_USD': return <span className="bg-green-900 text-green-300 px-2 py-0.5 rounded text-xs font-bold">Cash $</span>;
            case 'CASH_EUR': return <span className="bg-emerald-900 text-emerald-300 px-2 py-0.5 rounded text-xs font-bold">Cash €</span>;
            case 'CARD':
            case 'BS_POS':
            case 'PDV_SHANKLISH': return <span className="bg-blue-900 text-blue-300 px-2 py-0.5 rounded text-xs font-bold">PDV Shanklish</span>;
            case 'PDV_SUPERFERRO': return <span className="bg-sky-900 text-sky-300 px-2 py-0.5 rounded text-xs font-bold">PDV Superferro</span>;
            case 'ZELLE': return <span className="bg-indigo-900 text-indigo-300 px-2 py-0.5 rounded text-xs font-bold">ZELLE</span>;
            case 'MOBILE_PAY': return <span className="bg-purple-900 text-purple-300 px-2 py-0.5 rounded text-xs font-bold">PAGO MÓVIL</span>;
            case 'MOVIL_NG': return <span className="bg-violet-900 text-violet-300 px-2 py-0.5 rounded text-xs font-bold">MÓVIL NG</span>;
            case 'TRANSFER': return <span className="bg-cyan-900 text-cyan-300 px-2 py-0.5 rounded text-xs font-bold">TRANSFER</span>;
            case 'CASH_BS': return <span className="bg-yellow-900 text-yellow-300 px-2 py-0.5 rounded text-xs font-bold">Bs</span>;
            case 'CORTESIA': return <span className="bg-purple-900 text-purple-200 px-2 py-0.5 rounded text-xs font-bold">CORTESÍA</span>;
            default: return <span className="bg-gray-700 text-gray-300 px-2 py-0.5 rounded text-xs font-bold">{method || '-'}</span>;
        }
    };

    const formatMoney = (amount: number) => `$${(amount || 0).toFixed(2)}`;

    // ---- FILTRADO ----
    const clearAllFilters = () => {
        setFilterSearch('');
        setFilterPaymentMethod('ALL');
        setFilterOrderType('ALL');
        setFilterHasDiscount(false);
        setCancelledFilter('active');
    };

    const hasActiveFilters = filterSearch !== '' || filterPaymentMethod !== 'ALL' || filterOrderType !== 'ALL' || filterHasDiscount || cancelledFilter !== 'active';

    // La fecha ya se filtra en el servidor (getSalesHistoryAction). Aquí solo filtros adicionales.
    const allFilteredSales = sales.filter(s => {
        if (cancelledFilter === 'only') return s.status === 'CANCELLED';
        if (cancelledFilter === 'all') return true;
        return s.status !== 'CANCELLED'; // 'active' = hide cancelled
    });
    const filteredSales = allFilteredSales.filter(s => {
        // Búsqueda libre
        if (filterSearch.trim()) {
            const q = filterSearch.trim().toLowerCase();
            const matchesOrder = (s.orderNumber || '').toLowerCase().includes(q);
            const matchesCustomer = (s.customerName || '').toLowerCase().includes(q);
            const matchesPhone = (s.customerPhone || '').toLowerCase().includes(q);
            if (!matchesOrder && !matchesCustomer && !matchesPhone) return false;
        }
        // Método de pago
        if (filterPaymentMethod !== 'ALL') {
            const breakdown: { method: string }[] = s.paymentBreakdown || [];
            if (filterPaymentMethod === 'MIXED') {
                if (breakdown.length <= 1) return false;
            } else {
                const methodMatch =
                    breakdown.length > 0
                        ? breakdown.some(p => p.method?.toUpperCase() === filterPaymentMethod)
                        : (s.paymentMethod || '').toUpperCase() === filterPaymentMethod;
                if (!methodMatch) return false;
            }
        }
        // Tipo de orden
        if (filterOrderType !== 'ALL') {
            if ((s.orderType || '').toUpperCase() !== filterOrderType) return false;
        }
        // Con descuento
        if (filterHasDiscount && !(s.discount > 0)) return false;
        return true;
    });

    const shownCount = filteredSales.length;
    const totalCount = allFilteredSales.length;

    // Totales del filtro activo
    const filteredTotals = filteredSales.reduce(
        (acc, s) => {
            if (s.status === 'CANCELLED') return acc;
            acc.invoiced += s.totalFactura ?? s.total ?? 0;
            acc.collected += s.totalCobrado ?? s.total ?? 0;
            acc.discounts += s.discount ?? 0;
            return acc;
        },
        { invoiced: 0, collected: 0, discounts: 0 }
    );

    // Formatted date for display
    const displayDate = filterDate
        ? new Date(filterDate + 'T12:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: 'numeric', year: 'numeric' })
        : '';

    if (isLoading) return <div className="p-8 text-center text-white">Cargando historial...</div>;

    return (
        <div className="p-6 max-w-7xl mx-auto text-white">
            {/* HEADER */}
            <div className="flex flex-wrap justify-between items-start mb-5 gap-4">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
                        Historial de Ventas
                    </h1>
                    <p className="text-gray-400 text-sm mt-0.5">
                        Registro de transacciones y cierres
                        {' · '}
                        <span className="text-gray-300 font-medium">{shownCount} de {totalCount} órdenes</span>
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {/* Date filter - dark pill style */}
                    <div className="flex items-center gap-1.5 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2">
                        <span className="text-gray-400 text-sm">📅</span>
                        <input
                            type="date"
                            value={filterDate}
                            onChange={e => setFilterDate(e.target.value)}
                            className="bg-transparent text-white text-sm focus:outline-none cursor-pointer w-32"
                        />
                    </div>
                    <button
                        onClick={handleExportArqueo}
                        className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-5 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2 text-sm"
                    >
                        📥 EXPORTAR EXCEL
                    </button>
                    <button
                        onClick={handleGenerateZReport}
                        title={`Generar reporte Z para ${displayDate || 'hoy'}`}
                        className="bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white px-5 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2 text-sm"
                    >
                        🖨️ REPORTE &quot;Z&quot; {displayDate ? `· ${displayDate}` : '(HOY)'}
                    </button>
                    <button
                        onClick={handleDaySummary}
                        title={`Resumen de cierre del día para ${displayDate || 'hoy'}`}
                        className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white px-5 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2 text-sm"
                    >
                        📊 CIERRE DEL DÍA {displayDate ? `· ${displayDate}` : '(HOY)'}
                    </button>
                </div>
            </div>

            {/* ── BARRA DE FILTROS AVANZADOS ─────────────────────────────────── */}
            <div className="bg-gray-800/80 rounded-2xl border border-gray-700 p-4 mb-4 flex flex-wrap gap-3 items-end">
                {/* Búsqueda libre */}
                <div className="flex-1 min-w-[200px]">
                    <label className="text-xs text-gray-400 uppercase font-bold mb-1.5 block tracking-widest">🔍 Buscar</label>
                    <input
                        type="text"
                        value={filterSearch}
                        onChange={e => setFilterSearch(e.target.value)}
                        placeholder="Orden #, cliente, teléfono..."
                        className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none placeholder:text-gray-600"
                    />
                </div>
                {/* Método de pago */}
                <div>
                    <label className="text-xs text-gray-400 uppercase font-bold mb-1.5 block tracking-widest">💳 Método</label>
                    <select
                        value={filterPaymentMethod}
                        onChange={e => setFilterPaymentMethod(e.target.value)}
                        className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none cursor-pointer"
                    >
                        <option value="ALL">Todos</option>
                        <option value="CASH_USD">💵 Cash $</option>
                        <option value="CASH_EUR">€ Cash €</option>
                        <option value="ZELLE">⚡ Zelle</option>
                        <option value="PDV_SHANKLISH">💳 PDV Shanklish</option>
                        <option value="PDV_SUPERFERRO">💳 PDV Superferro</option>
                        <option value="MOBILE_PAY">📱 Pago Móvil</option>
                        <option value="MOVIL_NG">📱 Móvil NG</option>
                        <option value="TRANSFER">🏦 Transferencia</option>
                        <option value="CASH_BS">🇻🇪 Efectivo Bs</option>
                        <option value="CORTESIA">🎁 Cortesía</option>
                        <option value="MIXED">🔀 Pago Mixto</option>
                    </select>
                </div>
                {/* Tipo de orden */}
                <div>
                    <label className="text-xs text-gray-400 uppercase font-bold mb-1.5 block tracking-widest">📦 Tipo</label>
                    <select
                        value={filterOrderType}
                        onChange={e => setFilterOrderType(e.target.value)}
                        className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none cursor-pointer"
                    >
                        <option value="ALL">Todos</option>
                        <option value="DELIVERY">🛵 Delivery</option>
                        <option value="RESTAURANT">🍽️ Mesa / Pickup</option>
                        <option value="PEDIDOSYA">🟡 PedidosYA</option>
                    </select>
                </div>
                {/* Con descuento */}
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 hover:border-blue-500 transition-colors">
                    <input
                        type="checkbox"
                        checked={filterHasDiscount}
                        onChange={e => setFilterHasDiscount(e.target.checked)}
                        className="rounded accent-blue-500"
                    />
                    <span className="font-medium">Con descuento</span>
                </label>
                {/* Estado / Anuladas */}
                <div className="flex rounded-lg border border-gray-700 overflow-hidden text-sm font-medium">
                    {([
                        { value: 'active', label: 'Activas' },
                        { value: 'all',    label: 'Todas' },
                        { value: 'only',   label: '✕ Anuladas' },
                    ] as const).map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => setCancelledFilter(opt.value)}
                            className={`px-3 py-2 transition-colors ${
                                cancelledFilter === opt.value
                                    ? opt.value === 'only'
                                        ? 'bg-red-700 text-white'
                                        : 'bg-blue-700 text-white'
                                    : 'bg-gray-900 text-gray-400 hover:bg-gray-800'
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
                {/* Clear all */}
                {hasActiveFilters && (
                    <button
                        onClick={clearAllFilters}
                        className="bg-gray-700 hover:bg-red-900/60 hover:border-red-500 border border-gray-600 text-gray-300 hover:text-red-300 px-3 py-2 rounded-lg text-sm font-bold transition-colors"
                    >
                        ✕ Limpiar filtros
                    </button>
                )}
            </div>

            {/* ── RESUMEN DE RESULTADOS FILTRADOS ───────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="bg-gray-800 rounded-xl px-4 py-3 border border-gray-700">
                    <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-1">Órdenes</p>
                    <p className="text-2xl font-black text-white">{shownCount}</p>
                    {shownCount !== totalCount && <p className="text-xs text-gray-500">de {totalCount} total</p>}
                </div>
                <div className="bg-gray-800 rounded-xl px-4 py-3 border border-gray-700">
                    <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-1">Facturado</p>
                    <p className="text-2xl font-black text-blue-300">{formatMoney(filteredTotals.invoiced)}</p>
                </div>
                <div className="bg-gray-800 rounded-xl px-4 py-3 border border-gray-700">
                    <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-1">Cobrado</p>
                    <p className="text-2xl font-black text-emerald-400">{formatMoney(filteredTotals.collected)}</p>
                </div>
                <div className="bg-gray-800 rounded-xl px-4 py-3 border border-gray-700">
                    <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-1">Descuentos</p>
                    <p className={`text-2xl font-black ${filteredTotals.discounts > 0 ? 'text-red-400' : 'text-gray-600'}`}>
                        {filteredTotals.discounts > 0 ? `-${formatMoney(filteredTotals.discounts)}` : '$0.00'}
                    </p>
                </div>
            </div>

            {/* TABLA */}
            <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-x-auto shadow-xl">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-900/70 text-gray-400 uppercase text-xs font-bold tracking-wider">
                        <tr>
                            <th className="px-4 py-3">Orden #</th>
                            <th className="px-4 py-3">Fecha</th>
                            <th className="px-4 py-3">Hora</th>
                            <th className="px-4 py-3">Cliente</th>
                            <th className="px-4 py-3">Método</th>
                            <th className="px-4 py-3 text-right">Total Factura</th>
                            <th className="px-4 py-3 text-right">Cobrado</th>
                            <th className="px-4 py-3 text-center">10% Serv.</th>
                            <th className="px-4 py-3">Descuento / Auth</th>
                            <th className="px-4 py-3 text-center">Ítems</th>
                            <th className="px-4 py-3 text-center">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700 text-sm">
                        {filteredSales.length === 0 && (
                            <tr>
                                <td colSpan={11} className="p-10 text-center text-gray-500">
                                    No hay ventas en este período.
                                </td>
                            </tr>
                        )}
                        {filteredSales.map(sale => {
                            const isVoided = sale.status === 'CANCELLED';
                            const isExpanded = expandedRows.has(sale.id);
                            const itemCount = (sale.items || []).length;
                            const itemsSubtotal = (sale.items || []).reduce((s: number, i: any) => s + (i.lineTotal || 0), 0);
                            const servicioAmount = sale.servicioAmount ?? (sale.orderType === 'RESTAURANT' && sale.serviceFeeIncluded ? (sale.total || 0) * 0.1 : 0);
                            const totalFactura = sale.totalFactura ?? sale.total;
                            const totalCobrado = sale.totalCobrado ?? sale.total;
                            const propina = sale.propina ?? 0;
                            const saleDate = sale.createdAt
                                ? new Date(sale.createdAt).toLocaleDateString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: 'numeric', year: 'numeric' })
                                : '-';
                            const saleTime = sale.createdAt
                                ? new Date(sale.createdAt).toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit' })
                                : '-';

                            return (
                                <>
                                    <tr
                                        key={sale.id}
                                        onClick={() => itemCount > 0 && toggleRow(sale.id)}
                                        className={`transition-colors ${isVoided ? 'opacity-50 bg-red-900/10' : 'hover:bg-gray-700/40'} ${itemCount > 0 ? 'cursor-pointer' : ''}`}
                                    >
                                        {/* ORDEN # */}
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className={`font-bold font-mono text-xs ${isVoided ? 'text-red-400 line-through' : 'text-blue-300'}`}>
                                                    {sale.orderNumber}
                                                </span>
                                                {isVoided && (
                                                    <span className="bg-red-900 text-red-300 text-[10px] px-1.5 py-0.5 rounded font-bold">ANULADA</span>
                                                )}
                                            </div>
                                            {sale._consolidated && sale.orderNumbers?.length > 1 && (
                                                <div className="text-[10px] text-gray-500 font-mono mt-0.5" title={sale.orderNumbers.join(', ')}>
                                                    {sale.orderNumbers.length} tandas
                                                </div>
                                            )}
                                            {isVoided && sale.voidReason && (
                                                <div className="text-[10px] text-red-400/70 mt-0.5 max-w-[160px] truncate" title={sale.voidReason}>
                                                    {sale.voidReason}
                                                </div>
                                            )}
                                        </td>
                                        {/* FECHA */}
                                        <td className="px-4 py-3 text-gray-400 text-xs font-mono whitespace-nowrap">
                                            {saleDate}
                                            {isVoided && sale.voidedAt && (
                                                <div className="text-red-400/60 mt-0.5">
                                                    ✕ {new Date(sale.voidedAt).toLocaleDateString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: 'numeric' })}
                                                </div>
                                            )}
                                        </td>
                                        {/* HORA */}
                                        <td className="px-4 py-3 text-gray-400 text-xs font-mono whitespace-nowrap">
                                            {saleTime}
                                        </td>
                                        {/* CLIENTE */}
                                        <td className="px-4 py-3 text-gray-200 font-medium truncate max-w-[120px]">
                                            {sale.customerName || 'Gral.'}
                                        </td>
                                        {/* MÉTODO */}
                                        <td className="px-4 py-3">
                                            {(sale.paymentBreakdown || []).length > 1 ? (
                                                <div className="flex flex-wrap gap-1" title={(sale.paymentBreakdown || []).map((p: { method: string; amount: number }) => `${p.method}: $${p.amount.toFixed(2)}`).join(' | ')}>
                                                    {(sale.paymentBreakdown || []).map((p: { method: string; amount: number }, i: number) => (
                                                        <span key={i} className="flex items-center gap-0.5">
                                                            {getPaymentBadge(p.method)}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                getPaymentBadge(sale.paymentMethod)
                                            )}
                                        </td>
                                        {/* TOTAL FACTURA */}
                                        <td className="px-4 py-3 text-right text-gray-400 text-sm font-mono">
                                            {formatMoney(totalFactura)}
                                        </td>
                                        {/* COBRADO */}
                                        <td className="px-4 py-3 text-right font-bold text-white font-mono">
                                            {formatMoney(totalCobrado)}
                                            {propina > 0.01 && (
                                                <div className="text-[10px] text-amber-400 font-normal text-right">
                                                    +{formatMoney(propina)} propina
                                                </div>
                                            )}
                                        </td>
                                        {/* 10% SERV */}
                                        <td className="px-4 py-3 text-center">
                                            {sale.orderType === 'RESTAURANT' ? (
                                                sale.serviceFeeIncluded ? (
                                                    <span className="text-emerald-400 text-xs font-bold">✓ Sí</span>
                                                ) : (
                                                    <span className="text-gray-600 text-xs">No</span>
                                                )
                                            ) : (
                                                <span className="text-gray-700">-</span>
                                            )}
                                        </td>
                                        {/* DESCUENTO / AUTH */}
                                        <td className="px-4 py-3">
                                            {sale.discount > 0 ? (
                                                <div className="flex flex-col gap-0.5">
                                                    {sale.discountType === 'DIVISAS_33' && (
                                                        <span className="text-blue-400 text-xs">📉 -{formatMoney(sale.discount)}</span>
                                                    )}
                                                    {(sale.discountType === 'CORTESIA_100' || sale.discountType === 'CORTESIA') && (
                                                        <span className="text-purple-400 text-xs font-bold">🎁 -{formatMoney(sale.discount)}</span>
                                                    )}
                                                    {sale.discountType === 'CORTESIA_PERCENT' && (
                                                        <span className="text-purple-400 text-xs font-bold">🎁 -{formatMoney(sale.discount)}</span>
                                                    )}
                                                    {sale.authorizedById && (
                                                        <span className="text-green-500 text-[10px] bg-green-900/30 px-1 rounded w-fit">
                                                            ✓ {sale.authorizedBy?.firstName}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : <span className="text-gray-700">-</span>}
                                        </td>
                                        {/* ÍTEMS */}
                                        <td className="px-4 py-3 text-center">
                                            {itemCount > 0 ? (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); toggleRow(sale.id); }}
                                                    className="inline-flex items-center gap-1 bg-gray-700 hover:bg-gray-600 text-gray-200 px-2 py-1 rounded text-xs font-bold transition-colors"
                                                >
                                                    {itemCount}
                                                    <span className={`transition-transform text-[10px] ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                                                </button>
                                            ) : (
                                                <span className="text-gray-600">-</span>
                                            )}
                                        </td>
                                        {/* ACCIONES */}
                                        <td className="px-4 py-3 text-center">
                                            <div className="flex items-center justify-center gap-1.5">
                                                <button
                                                    onClick={(e) => handleReprint(sale, e)}
                                                    title="Reimprimir factura"
                                                    className="bg-gray-700 hover:bg-gray-600 text-gray-200 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors"
                                                >
                                                    🖨️ Imprimir
                                                </button>
                                                {!isVoided && (
                                                    <button
                                                        onClick={(e) => openVoidModal(sale, e)}
                                                        title="Anular venta"
                                                        className="bg-red-900/40 hover:bg-red-800 text-red-300 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors"
                                                    >
                                                        Anular
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                    {/* FILA EXPANDIDA - ÍTEMS */}
                                    {isExpanded && itemCount > 0 && (
                                        <tr key={`${sale.id}-expanded`} className="bg-gray-900/60">
                                            <td colSpan={11} className="px-6 py-4">
                                                {/* Tabla de productos */}
                                                <div className="rounded-lg overflow-hidden border border-gray-700 mb-3">
                                                    <table className="w-full text-xs">
                                                        <thead className="bg-gray-800 text-gray-400 uppercase text-[10px] font-bold">
                                                            <tr>
                                                                <th className="px-3 py-2 text-left">Producto</th>
                                                                <th className="px-3 py-2 text-center">Cant.</th>
                                                                <th className="px-3 py-2 text-right">P. Unit.</th>
                                                                <th className="px-3 py-2 text-right">Subtotal</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-gray-800">
                                                            {(sale.items || []).map((item: any, idx: number) => {
                                                                const unitPrice = item.unitPrice ?? (item.lineTotal / (item.quantity || 1));
                                                                const modifiers = Array.isArray(item.modifiers)
                                                                    ? item.modifiers.map((m: any) => typeof m === 'string' ? m : m?.name).filter(Boolean)
                                                                    : [];
                                                                return (
                                                                    <tr key={idx} className="hover:bg-gray-800/40">
                                                                        <td className="px-3 py-2 text-gray-200">
                                                                            {item.itemName || item.name}
                                                                            {modifiers.length > 0 && (
                                                                                <div className="text-gray-500 text-[10px]">+ {modifiers.join(', ')}</div>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-3 py-2 text-center text-gray-300">×{item.quantity}</td>
                                                                        <td className="px-3 py-2 text-right text-gray-400 font-mono">${unitPrice.toFixed(2)}</td>
                                                                        <td className="px-3 py-2 text-right text-white font-bold font-mono">${(item.lineTotal || 0).toFixed(2)}</td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>

                                                {/* Resumen de totales */}
                                                <div className="flex flex-wrap gap-3 text-xs font-mono text-gray-400">
                                                    <span>Productos: <span className="text-white">{formatMoney(itemsSubtotal)}</span></span>
                                                    {sale.orderType === 'RESTAURANT' && sale.serviceFeeIncluded && servicioAmount > 0 && (
                                                        <span>10% Servicio: <span className="text-emerald-400">+{formatMoney(servicioAmount)}</span></span>
                                                    )}
                                                    {(sale.discount || 0) > 0 && (
                                                        <span>Descuento: <span className="text-red-400">-{formatMoney(sale.discount)}</span></span>
                                                    )}
                                                    <span>Total factura: <span className="text-white">{formatMoney(totalFactura)}</span></span>
                                                    <span>Cobrado: <span className="text-white font-bold">{formatMoney(totalCobrado)}</span></span>
                                                    {propina > 0.01 && (
                                                        <span>Propina/excedente: <span className="text-amber-400">+{formatMoney(propina)}</span></span>
                                                    )}
                                                </div>

                                                {/* Desglose de pagos */}
                                                {(sale.paymentBreakdown || []).length > 0 && (
                                                    <div className="mt-2 text-xs text-gray-500">
                                                        <span className="font-bold uppercase text-gray-600">Desglose de pagos: </span>
                                                        {(sale.paymentBreakdown || []).map((p: { method: string; amount: number; amountBS?: number; exchangeRate?: number; label?: string }, i: number) => (
                                                            <span key={i} className="mr-3 inline-flex items-center gap-1">
                                                                {getPaymentBadge(p.method)}
                                                                {p.label && <span className="ml-1 text-gray-500">{p.label}</span>}
                                                                <span className="text-white font-bold font-mono">{formatMoney(p.amount)}</span>
                                                                {p.amountBS != null && p.amountBS > 0 && (
                                                                    <span className="text-yellow-400 font-mono text-[10px]">
                                                                        · Bs{p.amountBS.toLocaleString('es-VE', { maximumFractionDigits: 0 })}
                                                                        {p.exchangeRate ? ` @${p.exchangeRate.toFixed(0)}` : ''}
                                                                    </span>
                                                                )}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Detalle de anulación */}
                                                {isVoided && (sale.voidReason || sale.voidedBy || sale.voidedAt) && (
                                                    <div className="mt-3 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2 text-xs space-y-1">
                                                        <div className="font-bold text-red-400 uppercase tracking-wider text-[10px]">Detalle de Anulación</div>
                                                        {sale.voidedBy && (
                                                            <div className="flex gap-2 text-gray-300">
                                                                <span className="text-gray-500">Anulado por:</span>
                                                                <span className="font-bold text-red-300">{sale.voidedBy.firstName} {sale.voidedBy.lastName}</span>
                                                            </div>
                                                        )}
                                                        {sale.voidedAt && (
                                                            <div className="flex gap-2 text-gray-300">
                                                                <span className="text-gray-500">Fecha anulación:</span>
                                                                <span>{new Date(sale.voidedAt).toLocaleString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                                            </div>
                                                        )}
                                                        {sale.voidReason && (
                                                            <div className="flex gap-2 text-gray-300">
                                                                <span className="text-gray-500 shrink-0">Motivo:</span>
                                                                <span className="text-red-200">{sale.voidReason}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    )}
                                </>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* ================================================================ */}
            {/* MODAL REPORTE Z                                                    */}
            {/* ================================================================ */}
            {showZReport && zReport && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white text-black rounded-lg w-full max-w-sm p-8 font-mono shadow-2xl relative">
                        <button onClick={() => setShowZReport(false)} className="absolute top-2 right-2 text-gray-500 hover:text-red-500 text-2xl font-bold no-print">×</button>
                        <div className="text-center mb-6 border-b-2 border-dashed border-black pb-4">
                            <h2 className="text-2xl font-black">REPORTE Z</h2>
                            <p className="text-sm">SHANKLISH CARACAS</p>
                            <p className="text-sm">{new Date().toLocaleString()}</p>
                            <p className="text-sm mt-1 font-bold">CIERRE DE CAJA DIARIO</p>
                        </div>
                        {/* ── VENTAS ── */}
                        <div className="space-y-1 mb-4 border-b-2 border-dashed border-black pb-4">
                            <div className="flex justify-between"><span>VENTAS BRUTAS</span><span>{formatMoney(zReport.grossTotal)}</span></div>
                            {zReport.totalDiscounts > 0 && (<>
                                <div className="flex justify-between text-red-600"><span>(-) DESCUENTOS</span><span>-{formatMoney(zReport.totalDiscounts)}</span></div>
                                {zReport.discountBreakdown.divisas > 0 && (
                                    <div className="flex justify-between text-xs text-gray-500 pl-4"><span>Divisas (33%)</span><span>-{formatMoney(zReport.discountBreakdown.divisas)}</span></div>
                                )}
                                {zReport.discountBreakdown.cortesias > 0 && (
                                    <div className="flex justify-between text-xs text-gray-500 pl-4"><span>Cortesías</span><span>-{formatMoney(zReport.discountBreakdown.cortesias)}</span></div>
                                )}
                                {zReport.discountBreakdown.other > 0 && (
                                    <div className="flex justify-between text-xs text-gray-500 pl-4"><span>Otros</span><span>-{formatMoney(zReport.discountBreakdown.other)}</span></div>
                                )}
                            </>)}
                            <div className="flex justify-between font-bold text-base mt-1 pt-1 border-t border-gray-300"><span>VENTA NETA</span><span>{formatMoney(zReport.netTotal)}</span></div>
                            {zReport.totalServiceFee > 0 && (
                                <div className="flex justify-between text-blue-700"><span>(+) SERVICIO 10%</span><span>+{formatMoney(zReport.totalServiceFee)}</span></div>
                            )}
                            {zReport.totalTips > 0 && (
                                <div className="flex justify-between text-green-700"><span>(+) PROPINAS</span><span>+{formatMoney(zReport.totalTips)}</span></div>
                            )}
                            <div className="flex justify-between font-black text-xl mt-2 pt-2 border-t-2 border-black"><span>TOTAL COBRADO</span><span>{formatMoney(zReport.totalCollected)}</span></div>
                        </div>

                        {/* ── ARQUEO DE CAJA ── */}
                        <div className="mb-4 border-b-2 border-dashed border-black pb-4">
                            <h3 className="font-bold underline mb-2">ARQUEO DE CAJA</h3>
                            <div className="space-y-0.5 text-sm">
                                {zReport.paymentBreakdown.cash > 0 && <div className="flex justify-between"><span>Efectivo USD</span><span className="font-bold">{formatMoney(zReport.paymentBreakdown.cash)}</span></div>}
                                {zReport.paymentBreakdown.zelle > 0 && <div className="flex justify-between"><span>Zelle</span><span className="font-bold">{formatMoney(zReport.paymentBreakdown.zelle)}</span></div>}
                                {zReport.paymentBreakdown.card > 0 && <div className="flex justify-between"><span>Punto PDV</span><span className="font-bold">{formatMoney(zReport.paymentBreakdown.card)}</span></div>}
                                {zReport.paymentBreakdown.mobile > 0 && <div className="flex justify-between"><span>Pago Móvil</span><span className="font-bold">{formatMoney(zReport.paymentBreakdown.mobile)}</span></div>}
                                {zReport.paymentBreakdown.transfer > 0 && <div className="flex justify-between"><span>Transferencia</span><span className="font-bold">{formatMoney(zReport.paymentBreakdown.transfer)}</span></div>}
                                {zReport.paymentBreakdown.external > 0 && <div className="flex justify-between"><span>PedidosYA / Externo</span><span className="font-bold">{formatMoney(zReport.paymentBreakdown.external)}</span></div>}
                                {zReport.paymentBreakdown.other > 0 && <div className="flex justify-between text-gray-500"><span>Otros</span><span>{formatMoney(zReport.paymentBreakdown.other)}</span></div>}
                            </div>
                        </div>

                        {/* ── PEDIDOS POR CANAL ── */}
                        <div className="mb-4 text-sm border-b-2 border-dashed border-black pb-4">
                            <h3 className="font-bold underline mb-2">PEDIDOS POR CANAL</h3>
                            <div className="space-y-0.5">
                                {zReport.ordersByType.restaurant > 0 && <div className="flex justify-between"><span>Restaurante / Mesas</span><span>{zReport.ordersByType.restaurant}</span></div>}
                                {zReport.ordersByType.pickup > 0 && <div className="flex justify-between"><span>Pickup / Mostrador</span><span>{zReport.ordersByType.pickup}</span></div>}
                                {zReport.ordersByType.delivery > 0 && <div className="flex justify-between"><span>Delivery</span><span>{zReport.ordersByType.delivery}</span></div>}
                                {zReport.ordersByType.pedidosya > 0 && <div className="flex justify-between"><span>PedidosYA</span><span>{zReport.ordersByType.pedidosya}</span></div>}
                                {zReport.ordersByType.wink > 0 && <div className="flex justify-between"><span>Wink</span><span>{zReport.ordersByType.wink}</span></div>}
                                {zReport.ordersByType.evento > 0 && <div className="flex justify-between"><span>Evento</span><span>{zReport.ordersByType.evento}</span></div>}
                                {zReport.ordersByType.tablePong > 0 && <div className="flex justify-between"><span>Table Pong</span><span>{zReport.ordersByType.tablePong}</span></div>}
                            </div>
                        </div>

                        <div className="text-center text-xs text-gray-500 pt-2">
                            <p className="font-bold">Total transacciones: {zReport.totalOrders}</p>
                        </div>
                        <div className="flex gap-3 mt-6 no-print">
                            <button
                                onClick={() => exportZReportToExcel(zReport)}
                                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded font-bold transition flex items-center justify-center gap-2"
                            >
                                📥 Exportar a Excel
                            </button>
                            <button
                                onClick={() => window.print()}
                                className="flex-1 bg-black text-white py-3 rounded font-bold hover:bg-gray-800 transition"
                            >
                                🖨️ Imprimir
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ================================================================ */}
            {/* MODAL CIERRE DEL DÍA                                               */}
            {/* ================================================================ */}
            {showDaySummary && daySummary && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-gray-900 border border-amber-700/60 rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-xl font-bold text-amber-400">Resumen de Cierre del Día</h2>
                                <p className="text-sm text-gray-400 font-mono mt-0.5">{daySummary.date}</p>
                            </div>
                            <button onClick={() => setShowDaySummary(false)} className="text-gray-500 hover:text-white text-2xl font-bold">×</button>
                        </div>

                        {/* Ventas por canal */}
                        <div className="bg-gray-800 rounded-xl p-4 mb-4">
                            <h3 className="text-xs font-bold uppercase text-gray-400 tracking-widest mb-3">Ventas por Canal</h3>
                            <div className="space-y-1.5">
                                {([
                                    { key: 'restaurant', label: 'Restaurante / Mesas' },
                                    { key: 'delivery',   label: 'Delivery' },
                                    { key: 'pickup',     label: 'Pickup / Mostrador' },
                                    { key: 'pedidosya',  label: 'PedidosYA' },
                                    { key: 'wink',       label: 'Wink' },
                                    { key: 'evento',     label: 'Evento' },
                                    { key: 'tablePong',  label: 'Table Pong' },
                                ] as { key: keyof typeof daySummary.byChannel; label: string }[])
                                    .filter(r => daySummary.byChannel[r.key] > 0 || daySummary.countByChannel[r.key] > 0)
                                    .map(r => (
                                        <div key={r.key} className="flex justify-between items-center text-sm">
                                            <span className="text-gray-300">{r.label} <span className="text-gray-500 text-xs">({daySummary.countByChannel[r.key]})</span></span>
                                            <span className="font-bold font-mono text-white">${daySummary.byChannel[r.key].toFixed(2)}</span>
                                        </div>
                                    ))
                                }
                            </div>
                        </div>

                        {/* Totales */}
                        <div className="bg-gray-800 rounded-xl p-4 mb-4">
                            <h3 className="text-xs font-bold uppercase text-gray-400 tracking-widest mb-3">Totales</h3>
                            <div className="space-y-1.5 text-sm">
                                {daySummary.totalDiscounts > 0 && (
                                    <div className="flex justify-between"><span className="text-gray-400">Descuentos:</span><span className="text-red-400 font-mono">-${daySummary.totalDiscounts.toFixed(2)}</span></div>
                                )}
                                {daySummary.totalServiceFee > 0 && (
                                    <div className="flex justify-between"><span className="text-gray-400">10% Servicio:</span><span className="text-emerald-400 font-mono">+${daySummary.totalServiceFee.toFixed(2)}</span></div>
                                )}
                                {daySummary.propinas > 0 && (
                                    <div className="flex justify-between"><span className="text-gray-400">Propinas:</span><span className="text-amber-400 font-mono">+${daySummary.propinas.toFixed(2)}</span></div>
                                )}
                                <div className="flex justify-between pt-2 border-t border-gray-700">
                                    <span className="font-bold text-white">Total Cobrado:</span>
                                    <span className="font-black text-xl text-white font-mono">${daySummary.totalUSD.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Divisas vs Bs */}
                        <div className="bg-gray-800 rounded-xl p-4 mb-4">
                            <h3 className="text-xs font-bold uppercase text-gray-400 tracking-widest mb-3">Desglose por Moneda</h3>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-300">Divisas (Cash / Zelle)</span>
                                    <div className="text-right">
                                        <span className="font-bold font-mono text-blue-300">${daySummary.receivedInDivisas.toFixed(2)}</span>
                                        <span className="text-gray-500 text-xs ml-2">{daySummary.pctDivisas.toFixed(1)}%</span>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-300">Bolívares (PDV / Móvil)</span>
                                    <div className="text-right">
                                        <span className="font-bold font-mono text-purple-300">${daySummary.receivedInBs.toFixed(2)}</span>
                                        <span className="text-gray-500 text-xs ml-2">{daySummary.pctBs.toFixed(1)}%</span>
                                    </div>
                                </div>
                                {/* Progress bar */}
                                <div className="h-2 bg-gray-700 rounded-full overflow-hidden mt-1">
                                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${daySummary.pctDivisas}%` }} />
                                </div>
                                <div className="flex justify-between text-[10px] text-gray-500">
                                    <span>Divisas {daySummary.pctDivisas.toFixed(0)}%</span>
                                    <span>Bs {daySummary.pctBs.toFixed(0)}%</span>
                                </div>
                            </div>
                        </div>

                        {/* Facturas */}
                        <div className="bg-gray-800 rounded-xl p-4 mb-4">
                            <h3 className="text-xs font-bold uppercase text-gray-400 tracking-widest mb-2">Facturas</h3>
                            <div className="flex gap-6 text-sm">
                                <div><span className="text-gray-400">Procesadas: </span><span className="font-bold text-white">{daySummary.totalInvoices}</span></div>
                                {daySummary.invoicesCancelled > 0 && (
                                    <div><span className="text-gray-400">Anuladas: </span><span className="font-bold text-red-400">{daySummary.invoicesCancelled}</span></div>
                                )}
                            </div>
                        </div>

                        <button
                            onClick={() => printEndOfDaySummary(daySummary)}
                            className="w-full bg-amber-600 hover:bg-amber-500 text-white py-3 rounded-xl font-bold transition flex items-center justify-center gap-2"
                        >
                            🖨️ Imprimir Resumen
                        </button>
                    </div>
                </div>
            )}

            {/* ================================================================ */}
            {/* MODAL ANULACIÓN                                                    */}
            {/* ================================================================ */}
            {voidTarget && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-gray-900 border border-red-800/60 rounded-2xl w-full max-w-md p-6 shadow-2xl">
                        <div className="flex items-center justify-between mb-5">
                            <div>
                                <h2 className="text-xl font-bold text-red-400">Anular Venta</h2>
                                <p className="text-sm text-gray-400 font-mono mt-0.5">{voidTarget.orderNumber} — {formatMoney(voidTarget.totalCobrado ?? voidTarget.total)}</p>
                            </div>
                            <button onClick={() => setVoidTarget(null)} className="text-gray-500 hover:text-white text-2xl font-bold">×</button>
                        </div>

                        <div className="bg-gray-800 rounded-xl p-4 mb-5 text-sm space-y-1">
                            <div className="flex justify-between text-gray-300">
                                <span>Cliente:</span><span>{voidTarget.customerName || 'Cliente General'}</span>
                            </div>
                            <div className="flex justify-between text-gray-300">
                                <span>Cajera:</span><span>{voidTarget.createdBy?.firstName || '-'}</span>
                            </div>
                            <div className="flex justify-between text-gray-300">
                                <span>Items:</span><span>{(voidTarget.items || []).length} productos</span>
                            </div>
                            <div className="flex justify-between font-bold text-white pt-1 border-t border-gray-700">
                                <span>Total cobrado:</span><span>{formatMoney(voidTarget.totalCobrado ?? voidTarget.total)}</span>
                            </div>
                        </div>

                        {voidStep === 'reason' && (
                            <>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Motivo de la anulación <span className="text-red-400">*</span>
                                </label>
                                <textarea
                                    value={voidReason}
                                    onChange={e => setVoidReason(e.target.value)}
                                    placeholder="Ej: Error de facturación, cliente solicitó cambio de mesa..."
                                    rows={3}
                                    className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white text-sm focus:border-red-500 focus:outline-none resize-none mb-5"
                                />
                                <div className="flex gap-3">
                                    <button onClick={() => setVoidTarget(null)} className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-200 py-3 rounded-xl font-semibold transition-colors">
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={() => setVoidStep('pin')}
                                        disabled={!voidReason.trim()}
                                        className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white py-3 rounded-xl font-semibold transition-colors"
                                    >
                                        Continuar →
                                    </button>
                                </div>
                            </>
                        )}

                        {voidStep === 'pin' && (
                            <>
                                <div className="mb-4 p-3 bg-amber-900/30 border border-amber-700/40 rounded-xl text-xs text-amber-300 leading-relaxed">
                                    🔐 Requiere PIN de Gerente, Auditor o Dueño. El inventario se reintegrará automáticamente.
                                </div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">PIN de Autorización</label>
                                <input
                                    type="password"
                                    value={voidPin}
                                    onChange={e => { setVoidPin(e.target.value); setVoidPinError(''); }}
                                    onKeyDown={e => e.key === 'Enter' && voidPin && handleVoidPinConfirm()}
                                    placeholder="••••"
                                    maxLength={8}
                                    autoFocus
                                    className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white text-center text-2xl tracking-widest focus:border-red-500 focus:outline-none mb-1"
                                />
                                {voidPinError && <p className="text-red-400 text-xs mb-3 text-center">{voidPinError}</p>}
                                <div className="flex gap-3 mt-4">
                                    <button
                                        onClick={() => { setVoidStep('reason'); setVoidPin(''); setVoidPinError(''); }}
                                        className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-200 py-3 rounded-xl font-semibold transition-colors"
                                    >
                                        ← Volver
                                    </button>
                                    <button
                                        onClick={handleVoidPinConfirm}
                                        disabled={!voidPin || voidLoading}
                                        className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white py-3 rounded-xl font-bold transition-colors"
                                    >
                                        {voidLoading ? '⏳ Procesando...' : 'Autorizar Anulación'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
