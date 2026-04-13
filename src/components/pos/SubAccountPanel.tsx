'use client';

/**
 * SubAccountPanel — Panel de división de cuenta por subcuentas (POS Restaurante / Mesero).
 * Renderiza la lista de subcuentas, el pool de ítems sin asignar,
 * la UI de asignación y el cobro individual por subcuenta.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
    assignItemToSubAccountAction,
    autoSplitEqualAction,
    createSubAccountsAction,
    deleteSubAccountAction,
    getOpenTabWithSubAccountsAction,
    paySubAccountAction,
    renameSubAccountAction,
    unassignItemFromSubAccountAction,
    type POSPaymentMethod,
} from '@/app/actions/pos.actions';

// ─── Tipos locales ────────────────────────────────────────────────────────────

interface SubModifier {
    name: string;
    priceAdjustment: number;
}
interface SubSalesOrderItem {
    id: string;
    itemName: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
    modifiers: SubModifier[];
    subAccountItems: { subAccountId: string; quantity: number }[];
}
interface SubAccountItemRow {
    id: string;
    quantity: number;
    lineTotal: number;
    salesOrderItem: SubSalesOrderItem;
}
interface SubAccount {
    id: string;
    label: string;
    sortOrder: number;
    status: string; // OPEN | PAID | VOID
    subtotal: number;
    serviceCharge: number;
    total: number;
    paidAmount: number;
    paymentMethod?: string | null;
    items: SubAccountItemRow[];
}
interface TabOrder {
    id: string;
    items: SubSalesOrderItem[];
}
interface TabWithSubs {
    id: string;
    balanceDue: number;
    runningTotal: number;
    subAccounts: SubAccount[];
    orders: TabOrder[];
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SubAccountPanelProps {
    openTabId: string;
    exchangeRate: number | null;
    onClose: () => void;
    onTabUpdated: (tab: any) => void; // Sync back to parent
}

// ─── Payment method labels ────────────────────────────────────────────────────

const PAY_METHODS: { id: POSPaymentMethod; label: string }[] = [
    { id: 'CASH_USD', label: '💵 Cash $' },
    { id: 'ZELLE', label: '⚡ Zelle' },
    { id: 'PDV_SHANKLISH', label: '💳 PDV Shan.' },
    { id: 'PDV_SUPERFERRO', label: '💳 PDV Super.' },
    { id: 'MOVIL_NG', label: '📱 Móvil NG' },
    { id: 'CASH_BS', label: '💴 Efectivo Bs' },
];

// ─── Helper ───────────────────────────────────────────────────────────────────

function assignedQtyForItem(item: SubSalesOrderItem, subAccountId: string): number {
    return item.subAccountItems
        .filter((s) => s.subAccountId === subAccountId)
        .reduce((a, s) => a + s.quantity, 0);
}

function totalAssignedQty(item: SubSalesOrderItem): number {
    return item.subAccountItems.reduce((a, s) => a + s.quantity, 0);
}

// ─── Sub-components (top-level per Vercel React rules) ───────────────────────

interface PoolItemRowProps {
    item: SubSalesOrderItem;
    subAccounts: SubAccount[];
    isProcessing: boolean;
    onAssign: (itemId: string, subId: string, qty: number) => void;
    onUnassign: (itemId: string, subId: string) => void;
}

function PoolItemRow({ item, subAccounts, isProcessing, onAssign, onUnassign }: PoolItemRowProps) {
    const [expanded, setExpanded] = useState(false);
    const [pickedSub, setPickedSub] = useState('');
    const [qty, setQty] = useState(1);

    const poolQty = item.quantity - totalAssignedQty(item);
    const alreadyAssigned = item.subAccountItems.filter((s) => s.quantity > 0);

    return (
        <div className="border border-border/50 rounded-xl bg-background/50 p-2.5 space-y-1.5">
            {/* Item header */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-foreground truncate">
                        {item.quantity}× {item.itemName}
                    </div>
                    {item.modifiers.length > 0 && (
                        <div className="text-[10px] text-muted-foreground truncate">
                            {item.modifiers.map((m) => m.name).join(', ')}
                        </div>
                    )}
                </div>
                <div className="shrink-0 text-right">
                    <div className="text-xs font-black text-amber-400">${item.lineTotal.toFixed(2)}</div>
                    {poolQty > 0 && (
                        <div className="text-[10px] text-muted-foreground">Pool: {poolQty}</div>
                    )}
                </div>
            </div>

            {/* Existing assignments */}
            {alreadyAssigned.map((a) => {
                const sub = subAccounts.find((s) => s.id === a.subAccountId);
                if (!sub) return null;
                return (
                    <div key={a.subAccountId}
                        className="flex items-center justify-between text-[10px] bg-amber-500/10 rounded-lg px-2 py-1">
                        <span className="text-amber-300 font-bold">
                            {a.quantity}× → {sub.label}
                        </span>
                        {sub.status === 'OPEN' && (
                            <button
                                disabled={isProcessing}
                                onClick={() => onUnassign(item.id, a.subAccountId)}
                                className="text-red-400 hover:text-red-300 font-bold disabled:opacity-40"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                );
            })}

            {/* Assign button */}
            {poolQty > 0 && subAccounts.filter((s) => s.status === 'OPEN').length > 0 && (
                <button
                    onClick={() => { setExpanded((p) => !p); setPickedSub(''); setQty(1); }}
                    className="w-full text-[10px] font-black uppercase text-primary bg-primary/10 hover:bg-primary/20 rounded-lg py-1.5 transition"
                >
                    {expanded ? 'Cancelar' : `Asignar (${poolQty} disponible${poolQty > 1 ? 's' : ''})`}
                </button>
            )}

            {/* Assign form */}
            {expanded && (
                <div className="space-y-1.5 pt-1 border-t border-border/50">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase">Mover a:</div>
                    <div className="flex flex-wrap gap-1">
                        {subAccounts.filter((s) => s.status === 'OPEN').map((s) => (
                            <button
                                key={s.id}
                                onClick={() => setPickedSub(s.id)}
                                className={`text-[10px] font-black px-2 py-1 rounded-lg transition ${pickedSub === s.id
                                    ? 'bg-amber-500 text-black'
                                    : 'bg-secondary text-foreground/70 hover:bg-muted'
                                    }`}
                            >
                                {s.label}
                            </button>
                        ))}
                    </div>
                    {pickedSub && poolQty > 1 && (
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground">Cantidad:</span>
                            <button onClick={() => setQty((q) => Math.max(1, q - 1))}
                                className="w-6 h-6 rounded-lg bg-secondary text-xs font-black">−</button>
                            <span className="text-sm font-black w-6 text-center">{qty}</span>
                            <button onClick={() => setQty((q) => Math.min(poolQty, q + 1))}
                                className="w-6 h-6 rounded-lg bg-secondary text-xs font-black">+</button>
                        </div>
                    )}
                    {pickedSub && (
                        <button
                            disabled={isProcessing}
                            onClick={() => { onAssign(item.id, pickedSub, qty); setExpanded(false); }}
                            className="w-full py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-[10px] font-black rounded-lg transition disabled:opacity-40"
                        >
                            Confirmar asignación
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

interface SubAccountCardProps {
    sub: SubAccount;
    isProcessing: boolean;
    onRename: (subId: string, label: string) => void;
    onDelete: (subId: string) => void;
    onPay: (subId: string, method: POSPaymentMethod, amount: number, serviceIncluded: boolean) => void;
    onUnassign: (itemId: string, subId: string) => void;
}

function SubAccountCard({ sub, isProcessing, onRename, onDelete, onPay, onUnassign }: SubAccountCardProps) {
    const [editing, setEditing] = useState(false);
    const [labelInput, setLabelInput] = useState(sub.label);
    const [showPayForm, setShowPayForm] = useState(false);
    const [payMethod, setPayMethod] = useState<POSPaymentMethod>('CASH_USD');
    const [serviceIncluded, setServiceIncluded] = useState(true);
    const [amountInput, setAmountInput] = useState('');

    const isPaid = sub.status === 'PAID';
    const totalWithService = sub.subtotal + (serviceIncluded ? sub.serviceCharge : 0);

    function handleRename() {
        if (labelInput.trim()) { onRename(sub.id, labelInput.trim()); }
        setEditing(false);
    }

    function handlePayConfirm() {
        const amt = parseFloat(amountInput);
        if (isNaN(amt) || amt <= 0) { toast.error('Monto inválido'); return; }
        onPay(sub.id, payMethod, amt, serviceIncluded);
        setShowPayForm(false);
    }

    return (
        <div className={`rounded-xl border ${isPaid
            ? 'border-emerald-500/30 bg-emerald-950/20'
            : 'border-border bg-card/60'
        } overflow-hidden`}>
            {/* Header */}
            <div className={`flex items-center justify-between px-3 py-2 ${isPaid ? 'bg-emerald-900/20' : 'bg-secondary/60'}`}>
                {editing ? (
                    <div className="flex items-center gap-1.5 flex-1">
                        <input
                            autoFocus
                            value={labelInput}
                            onChange={(e) => setLabelInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditing(false); }}
                            className="flex-1 bg-background border border-amber-500/50 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none"
                        />
                        <button onClick={handleRename} className="text-[10px] font-black text-amber-400 hover:text-amber-300">✓</button>
                        <button onClick={() => setEditing(false)} className="text-[10px] text-muted-foreground hover:text-foreground">✕</button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        {isPaid
                            ? <span className="text-xs font-black text-emerald-400">✓ {sub.label}</span>
                            : (
                                <button onClick={() => { setEditing(true); setLabelInput(sub.label); }}
                                    className="text-xs font-black text-foreground hover:text-amber-400 transition">
                                    ✏️ {sub.label}
                                </button>
                            )}
                    </div>
                )}
                {!isPaid && (
                    <button
                        disabled={isProcessing}
                        onClick={() => onDelete(sub.id)}
                        className="text-[10px] text-red-400/60 hover:text-red-400 transition disabled:opacity-40 ml-2"
                        title="Eliminar subcuenta"
                    >
                        🗑
                    </button>
                )}
                {isPaid && (
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-900/30 px-2 py-0.5 rounded-full">
                        PAGADA ${sub.paidAmount.toFixed(2)}
                    </span>
                )}
            </div>

            {/* Items */}
            <div className="px-3 py-2 space-y-1">
                {sub.items.length === 0 ? (
                    <div className="text-[10px] text-muted-foreground text-center py-1">Sin ítems asignados</div>
                ) : (
                    sub.items.map((si) => (
                        <div key={si.id} className="flex items-center justify-between text-[10px]">
                            <span className="text-foreground/80 flex-1 truncate">
                                {si.quantity}× {si.salesOrderItem.itemName}
                                {si.salesOrderItem.modifiers.length > 0 && (
                                    <span className="text-muted-foreground ml-1">
                                        ({si.salesOrderItem.modifiers.map((m) => m.name).join(', ')})
                                    </span>
                                )}
                            </span>
                            <span className="text-amber-400 font-bold ml-2">${si.lineTotal.toFixed(2)}</span>
                            {!isPaid && (
                                <button
                                    disabled={isProcessing}
                                    onClick={() => onUnassign(si.salesOrderItem.id, sub.id)}
                                    className="ml-1.5 text-red-400/60 hover:text-red-400 transition disabled:opacity-40"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Totals */}
            <div className="border-t border-border/50 px-3 py-2 text-[10px] space-y-0.5">
                <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span>${sub.subtotal.toFixed(2)}</span>
                </div>
                {sub.serviceCharge > 0 && (
                    <div className="flex justify-between text-emerald-400/80">
                        <span>+10% servicio</span>
                        <span>${sub.serviceCharge.toFixed(2)}</span>
                    </div>
                )}
                <div className="flex justify-between font-black text-foreground border-t border-border/50 pt-1">
                    <span>Total</span>
                    <span>${sub.total.toFixed(2)}</span>
                </div>
            </div>

            {/* Pay form */}
            {!isPaid && (
                <div className="px-3 pb-3">
                    {!showPayForm ? (
                        <button
                            disabled={isProcessing || sub.items.length === 0}
                            onClick={() => { setShowPayForm(true); setAmountInput(totalWithService.toFixed(2)); }}
                            className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-xs font-black rounded-xl transition"
                        >
                            💳 Cobrar {sub.label}
                        </button>
                    ) : (
                        <div className="space-y-2 pt-2 border-t border-border/50">
                            {/* Service fee toggle */}
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={serviceIncluded}
                                    onChange={(e) => {
                                        setServiceIncluded(e.target.checked);
                                        setAmountInput((sub.subtotal + (e.target.checked ? sub.serviceCharge : 0)).toFixed(2));
                                    }}
                                    className="rounded border-border text-amber-500 focus:ring-amber-500"
                                />
                                <span className="text-[10px] text-foreground/70">+10% servicio</span>
                                <span className="text-[10px] font-black text-emerald-400">
                                    Total: ${totalWithService.toFixed(2)}
                                </span>
                            </label>
                            {/* Method */}
                            <div className="grid grid-cols-3 gap-1">
                                {PAY_METHODS.map((m) => (
                                    <button key={m.id} onClick={() => setPayMethod(m.id)}
                                        className={`text-[10px] font-black px-1 py-1.5 rounded-lg transition ${payMethod === m.id
                                            ? 'bg-amber-500 text-black'
                                            : 'bg-secondary text-foreground/70 hover:bg-muted'
                                            }`}>
                                        {m.label}
                                    </button>
                                ))}
                            </div>
                            {/* Amount */}
                            <input
                                type="number" min="0" step="0.01"
                                value={amountInput}
                                onChange={(e) => setAmountInput(e.target.value)}
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-black focus:border-amber-500 focus:outline-none"
                                placeholder={`$${totalWithService.toFixed(2)}`}
                            />
                            <div className="flex gap-2">
                                <button onClick={() => setShowPayForm(false)}
                                    className="flex-1 py-2 bg-secondary text-xs font-bold rounded-xl">
                                    Cancelar
                                </button>
                                <button
                                    disabled={isProcessing}
                                    onClick={handlePayConfirm}
                                    className="flex-[2] py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl transition disabled:opacity-40"
                                >
                                    ✓ Confirmar
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Panel principal ──────────────────────────────────────────────────────────

export function SubAccountPanel({ openTabId, exchangeRate, onClose, onTabUpdated }: SubAccountPanelProps) {
    const [tab, setTab] = useState<TabWithSubs | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);

    // New subcuenta form
    const [newLabel, setNewLabel] = useState('');

    // ── Stable ref for onTabUpdated — prevents infinite loop from unstable parent fn ──
    // onTabUpdated changes identity on every parent render; putting it in a ref means
    // loadTab's useCallback deps only contains openTabId, breaking the re-render cycle.
    const onTabUpdatedRef = useRef(onTabUpdated);
    useEffect(() => { onTabUpdatedRef.current = onTabUpdated; }, [onTabUpdated]);

    // ── Helpers ───────────────────────────────────────────────────────────────

    const loadTab = useCallback(async () => {
        const res = await getOpenTabWithSubAccountsAction(openTabId);
        if (res.success && res.data) {
            setTab(res.data as TabWithSubs);
            onTabUpdatedRef.current(res.data);
        } else {
            toast.error('Error cargando subcuentas');
        }
    }, [openTabId]); // ← onTabUpdated intentionally omitted — accessed via ref

    useEffect(() => { setIsLoading(true); loadTab().finally(() => setIsLoading(false)); }, [loadTab]);

    // ── Pool items: items with remaining qty not fully assigned ───────────────

    const allItems: SubSalesOrderItem[] = tab?.orders.flatMap((o) => o.items) ?? [];

    const poolItems = allItems.filter((item) => totalAssignedQty(item) < item.quantity);

    // ── Handlers ──────────────────────────────────────────────────────────────

    async function handleAutoSplit(count: number) {
        setIsProcessing(true);
        const res = await autoSplitEqualAction({ openTabId, count });
        if (res.success) { toast.success(res.message); await loadTab(); }
        else toast.error(res.message);
        setIsProcessing(false);
    }

    async function handleCreateSub() {
        if (!newLabel.trim() && !tab) return;
        const label = newLabel.trim() || `Cuenta ${(tab?.subAccounts.length ?? 0) + 1}`;
        setIsProcessing(true);
        const res = await createSubAccountsAction({ openTabId, labels: [label] });
        if (res.success) { setNewLabel(''); toast.success('Subcuenta creada'); await loadTab(); }
        else toast.error(res.message);
        setIsProcessing(false);
    }

    async function handleRename(subId: string, label: string) {
        const res = await renameSubAccountAction(subId, label);
        if (res.success) await loadTab();
        else toast.error(res.message);
    }

    async function handleDelete(subId: string) {
        setIsProcessing(true);
        const res = await deleteSubAccountAction(subId);
        if (res.success) { toast.success(res.message); await loadTab(); }
        else toast.error(res.message);
        setIsProcessing(false);
    }

    async function handleAssign(itemId: string, subId: string, qty: number) {
        setIsProcessing(true);
        const res = await assignItemToSubAccountAction({ salesOrderItemId: itemId, subAccountId: subId, quantity: qty });
        if (res.success) { toast.success(res.message); await loadTab(); }
        else toast.error(res.message);
        setIsProcessing(false);
    }

    async function handleUnassign(itemId: string, subId: string) {
        setIsProcessing(true);
        const res = await unassignItemFromSubAccountAction({ salesOrderItemId: itemId, subAccountId: subId });
        if (res.success) { toast.success(res.message); await loadTab(); }
        else toast.error(res.message);
        setIsProcessing(false);
    }

    async function handlePay(subId: string, method: POSPaymentMethod, amount: number, serviceIncluded: boolean) {
        setIsProcessing(true);
        const res = await paySubAccountAction({
            subAccountId: subId,
            paymentMethod: method,
            amount,
            serviceFeeIncluded: serviceIncluded,
        });
        if (res.success) {
            toast.success(res.message);
            // Use the updated tab returned by the action — avoids an extra round-trip
            // and prevents triggering the loadTab → onTabUpdated cycle an extra time.
            if (res.data) {
                setTab(res.data as TabWithSubs);
                onTabUpdatedRef.current(res.data);
            } else {
                await loadTab(); // fallback if action didn't return data
            }
        } else {
            toast.error(res.message);
        }
        setIsProcessing(false);
    }

    // ── Render ────────────────────────────────────────────────────────────────

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                Cargando subcuentas…
            </div>
        );
    }

    if (!tab) return null;

    const openSubs = tab.subAccounts.filter((s) => s.status === 'OPEN');
    const paidSubs = tab.subAccounts.filter((s) => s.status === 'PAID');

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="px-3 py-2.5 border-b border-border bg-card/80 shrink-0 space-y-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-foreground">÷ Subcuentas</span>
                        <span className="text-[10px] font-bold bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">
                            {tab.subAccounts.length}/25
                        </span>
                    </div>
                    <button onClick={onClose}
                        className="text-xs text-muted-foreground hover:text-foreground transition px-2 py-1 rounded-lg hover:bg-secondary">
                        ← Volver
                    </button>
                </div>

                {/* Quick split */}
                <div className="space-y-1">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase">División rápida</div>
                    <div className="flex gap-1">
                        {[2, 3, 4, 5, 6].map((n) => (
                            <button key={n} disabled={isProcessing}
                                onClick={() => handleAutoSplit(n)}
                                className="flex-1 py-2 bg-secondary hover:bg-amber-500/20 hover:text-amber-400 text-xs font-black rounded-xl transition disabled:opacity-40">
                                {n}
                            </button>
                        ))}
                    </div>
                </div>

                {/* New subcuenta */}
                <div className="flex gap-1.5">
                    <input
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCreateSub()}
                        placeholder={`Cuenta ${tab.subAccounts.length + 1}`}
                        className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-xs focus:border-amber-500 focus:outline-none"
                    />
                    <button
                        disabled={isProcessing || tab.subAccounts.length >= 25}
                        onClick={handleCreateSub}
                        className="px-3 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-xs font-black rounded-xl transition"
                    >
                        + Nueva
                    </button>
                </div>
            </div>

            {/* ── Content ─────────────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {/* Open subcuentas */}
                {openSubs.length === 0 && paidSubs.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-6">
                        Crea subcuentas o usa División rápida
                    </div>
                )}

                {tab.subAccounts.map((sub) => (
                    <SubAccountCard
                        key={sub.id}
                        sub={sub}
                        isProcessing={isProcessing}
                        onRename={handleRename}
                        onDelete={handleDelete}
                        onPay={handlePay}
                        onUnassign={handleUnassign}
                    />
                ))}

                {/* Pool — items not fully assigned */}
                {poolItems.length > 0 && (
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                            <div className="h-px flex-1 bg-border/50" />
                            <span className="text-[10px] font-bold text-muted-foreground uppercase shrink-0">
                                Pool sin asignar ({poolItems.length})
                            </span>
                            <div className="h-px flex-1 bg-border/50" />
                        </div>
                        {poolItems.map((item) => (
                            <PoolItemRow
                                key={item.id}
                                item={item}
                                subAccounts={tab.subAccounts}
                                isProcessing={isProcessing}
                                onAssign={handleAssign}
                                onUnassign={handleUnassign}
                            />
                        ))}
                        <div className="text-[10px] text-muted-foreground text-center">
                            Los ítems del pool se cobran con el botón principal de la mesa
                        </div>
                    </div>
                )}

                {/* Summary row */}
                {tab.subAccounts.length > 0 && (
                    <div className="rounded-xl bg-secondary/50 border border-border/50 px-3 py-2 text-[10px] space-y-0.5">
                        <div className="flex justify-between text-muted-foreground">
                            <span>Subcuentas cobradas</span>
                            <span>{paidSubs.length} / {tab.subAccounts.length}</span>
                        </div>
                        <div className="flex justify-between font-black text-foreground">
                            <span>Saldo restante mesa</span>
                            <span className="text-amber-400">${tab.balanceDue.toFixed(2)}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
