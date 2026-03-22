'use client';

import { useState, useEffect } from 'react';
import { getSalesHistoryAction, getDailyZReportAction, voidSalesOrderAction, type ZReportData } from '@/app/actions/sales.actions';
import { validateManagerPinAction } from '@/app/actions/pos.actions';
import { printReceipt } from '@/lib/print-command';
import { exportZReportToExcel } from '@/lib/export-z-report';

export default function SalesHistoryPage() {
    const [sales, setSales] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [zReport, setZReport] = useState<ZReportData | null>(null);
    const [showZReport, setShowZReport] = useState(false);

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
    const [showCancelled, setShowCancelled] = useState(false);
    const [filterDate, setFilterDate] = useState(() => {
        // Default: today en Caracas
        return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
    });

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        setIsLoading(true);
        const result = await getSalesHistoryAction();
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
        const result = await getDailyZReportAction();
        if (result.success && result.data) { setZReport(result.data); setShowZReport(true); }
        else alert('Error generando reporte');
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
        const res = await validateManagerPinAction(voidPin);
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
            case 'CASH': return <span className="bg-green-900 text-green-300 px-2 py-0.5 rounded text-xs font-bold">EFECTIVO</span>;
            case 'CASH_USD': return <span className="bg-green-800 text-green-200 px-2 py-0.5 rounded text-xs font-bold">USD</span>;
            case 'CARD':
            case 'BS_POS': return <span className="bg-blue-900 text-blue-300 px-2 py-0.5 rounded text-xs font-bold">PUNTO</span>;
            case 'ZELLE': return <span className="bg-indigo-900 text-indigo-300 px-2 py-0.5 rounded text-xs font-bold">ZELLE</span>;
            case 'MOBILE_PAY': return <span className="bg-purple-900 text-purple-300 px-2 py-0.5 rounded text-xs font-bold">PAGO MÓVIL</span>;
            case 'TRANSFER': return <span className="bg-cyan-900 text-cyan-300 px-2 py-0.5 rounded text-xs font-bold">TRANSFER</span>;
            default: return <span className="bg-gray-700 text-gray-300 px-2 py-0.5 rounded text-xs font-bold">{method || '-'}</span>;
        }
    };

    const formatMoney = (amount: number) => `$${(amount || 0).toFixed(2)}`;

    // ---- FILTRADO ----
    const allFilteredSales = sales.filter(s => showCancelled || s.status !== 'CANCELLED');
    const filteredSales = allFilteredSales.filter(s => {
        if (filterDate) {
            const saleDate = new Date(s.createdAt).toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
            if (saleDate !== filterDate) return false;
        }
        return true;
    });

    const shownCount = filteredSales.length;
    const totalCount = allFilteredSales.length;

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
                    {filterDate && (
                        <button
                            onClick={() => setFilterDate('')}
                            className="bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                        >
                            × Todas
                        </button>
                    )}
                    <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer select-none bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
                        <input
                            type="checkbox"
                            checked={showCancelled}
                            onChange={e => setShowCancelled(e.target.checked)}
                            className="rounded"
                        />
                        Anuladas
                    </label>
                    <button
                        onClick={handleExportArqueo}
                        className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-5 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2 text-sm"
                    >
                        📥 EXPORTAR EXCEL
                    </button>
                    <button
                        onClick={handleGenerateZReport}
                        className="bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white px-5 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2 text-sm"
                    >
                        🖨️ REPORTE &quot;Z&quot; (CIERRE)
                    </button>
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
                                                        {(sale.paymentBreakdown || []).map((p: { method: string; amount: number; label?: string }, i: number) => (
                                                            <span key={i} className="mr-3">
                                                                {getPaymentBadge(p.method)}
                                                                {p.label && <span className="ml-1 text-gray-500">{p.label}</span>}
                                                                <span className="ml-1 text-white font-bold font-mono">{formatMoney(p.amount)}</span>
                                                            </span>
                                                        ))}
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
                        <div className="space-y-1 mb-4 border-b-2 border-dashed border-black pb-4">
                            <div className="flex justify-between"><span>VENTAS BRUTAS</span><span>{formatMoney(zReport.grossTotal)}</span></div>
                            <div className="flex justify-between text-red-600"><span>(-) DESCUENTOS</span><span>-{formatMoney(zReport.totalDiscounts)}</span></div>
                            {zReport.discountBreakdown.divisas > 0 && (
                                <div className="flex justify-between text-xs text-gray-500 pl-4"><span>Divisas (33%)</span><span>-{formatMoney(zReport.discountBreakdown.divisas)}</span></div>
                            )}
                            {zReport.discountBreakdown.cortesias > 0 && (
                                <div className="flex justify-between text-xs text-gray-500 pl-4"><span>Cortesías</span><span>-{formatMoney(zReport.discountBreakdown.cortesias)}</span></div>
                            )}
                            <div className="flex justify-between font-bold text-xl mt-2 pt-2 border-t border-gray-300"><span>VENTA NETA</span><span>{formatMoney(zReport.netTotal)}</span></div>
                        </div>
                        <div className="mb-6">
                            <h3 className="font-bold underline mb-2">ARQUEO DE CAJA</h3>
                            <div className="flex justify-between"><span>PUNTO (Bs)</span><span className="font-bold">{formatMoney(zReport.paymentBreakdown.card)}</span></div>
                            <div className="flex justify-between"><span>ZELLE</span><span>{formatMoney(zReport.paymentBreakdown.zelle)}</span></div>
                            <div className="flex justify-between"><span>EFECTIVO USD</span><span>{formatMoney(zReport.paymentBreakdown.cash)}</span></div>
                            <div className="flex justify-between"><span>PAGO MÓVIL</span><span>{formatMoney(zReport.paymentBreakdown.mobile)}</span></div>
                            <div className="flex justify-between text-gray-600"><span>TRANSFERENCIA</span><span>{formatMoney(zReport.paymentBreakdown.transfer)}</span></div>
                        </div>
                        <div className="text-center text-xs text-gray-500 pt-4 border-t border-gray-300">
                            <p>Fin del Reporte — Pedidos Totales: {zReport.totalOrders}</p>
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
