"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addItemsToOpenTabAction,
  getMenuForPOSAction,
  getRestaurantLayoutAction,
  openTabAction,
  removeItemFromOpenTabAction,
  type CartItem,
} from "@/app/actions/pos.actions";
import { getExchangeRateValue } from "@/app/actions/exchange.actions";
import { getActiveWaitersAction, transferTableAction } from "@/app/actions/waiter.actions";
import { printKitchenCommand } from "@/lib/print-command";
import { getPOSConfig } from "@/lib/pos-settings";
import toast from "react-hot-toast";
import { PriceDisplay } from "@/components/pos/PriceDisplay";
import { SubAccountPanel } from "@/components/pos/SubAccountPanel";
import {
  WaiterIdentification,
  type ActiveWaiter,
} from "@/components/pos/WaiterIdentification";

const ACTIVE_WAITER_KEY = "pos-mesero-active-waiter";

// ============================================================================
// TIPOS (igual que restaurante)
// ============================================================================

interface ModifierOption {
  id: string;
  name: string;
  priceAdjustment: number;
  isAvailable: boolean;
}
interface ModifierGroup {
  id: string;
  name: string;
  minSelections: number;
  maxSelections: number;
  isRequired: boolean;
  modifiers: ModifierOption[];
}
interface MenuItem {
  id: string;
  categoryId: string;
  sku: string;
  name: string;
  price: number;
  modifierGroups: { modifierGroup: ModifierGroup }[];
}
interface SelectedModifier {
  groupId: string;
  groupName: string;
  id: string;
  name: string;
  priceAdjustment: number;
  quantity: number;
}
interface OrderItemSummary {
  id: string;
  itemName: string;
  quantity: number;
  lineTotal: number;
  modifiers?: { name: string }[];
}
interface SalesOrderSummary {
  id: string;
  orderNumber: string;
  total: number;
  kitchenStatus: string;
  createdAt: string;
  items: OrderItemSummary[];
}
interface UserSummary {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}
interface OpenTabSummary {
  id: string;
  tabCode: string;
  customerLabel?: string;
  customerPhone?: string;
  guestCount: number;
  status: string;
  runningTotal: number;
  balanceDue: number;
  openedAt: string;
  openedBy: UserSummary;
  assignedWaiter?: UserSummary | null;
  orders: SalesOrderSummary[];
}
interface TableSummary {
  id: string;
  name: string;
  code: string;
  stationType: string;
  capacity: number;
  currentStatus: string;
  openTabs: OpenTabSummary[];
}
interface ZoneSummary {
  id: string;
  name: string;
  zoneType: string;
  tablesOrStations: TableSummary[];
}
interface SportBarLayout {
  id: string;
  name: string;
  serviceZones: ZoneSummary[];
}

function formatTime(d: string | Date) {
  return new Date(d).toLocaleTimeString("es-VE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Caracas",
  });
}

// ============================================================================
// COMPONENTE PRINCIPAL — POS MESERO (sin cobro)
// ============================================================================

export default function POSMeseroPage() {
  // ── Data ──────────────────────────────────────────────────────────────────
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [layout, setLayout] = useState<SportBarLayout | null>(null);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [productSearch, setProductSearch] = useState("");

  // ── Zone / Table selection ─────────────────────────────────────────────────
  const [selectedZoneId, setSelectedZoneId] = useState("");
  const [selectedTableId, setSelectedTableId] = useState("");

  // ── Open tab form ──────────────────────────────────────────────────────────
  const [showOpenTabModal, setShowOpenTabModal] = useState(false);
  const [openTabName, setOpenTabName] = useState("");
  const [openTabPhone, setOpenTabPhone] = useState("");
  const [openTabGuests, setOpenTabGuests] = useState(2);

  // ── Cart ──────────────────────────────────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>([]);

  // ── Modifier modal ─────────────────────────────────────────────────────────
  const [showModifierModal, setShowModifierModal] = useState(false);
  const [selectedItemForModifier, setSelectedItemForModifier] = useState<MenuItem | null>(null);
  const [currentModifiers, setCurrentModifiers] = useState<SelectedModifier[]>([]);
  const [itemQuantity, setItemQuantity] = useState(1);
  const [itemNotes, setItemNotes] = useState("");

  // ── Remove item (con PIN de supervisor) ───────────────────────────────────
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{
    orderId: string;
    itemId: string;
    itemName: string;
  } | null>(null);
  const [removePin, setRemovePin] = useState("");
  const [removeJustification, setRemoveJustification] = useState("");
  const [removeError, setRemoveError] = useState("");

  // ── State flags ───────────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [layoutError, setLayoutError] = useState("");
  const [sendSuccess, setSendSuccess] = useState(false);

  // ── Subcuentas ────────────────────────────────────────────────────────────
  const [subAccountMode, setSubAccountMode] = useState(false);

  // ── Mostrar cuenta al cliente ─────────────────────────────────────────────
  const [showBillModal, setShowBillModal] = useState(false);

  // ── Transferir mesa (solo capitanes) ──────────────────────────────────────
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferWaiters, setTransferWaiters] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [transferToWaiterId, setTransferToWaiterId] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [transferCaptainPin, setTransferCaptainPin] = useState("");
  const [transferError, setTransferError] = useState("");

  // ── Navegación móvil ──────────────────────────────────────────────────────
  const [mobileTab, setMobileTab] = useState<"tables" | "menu" | "account">("tables");

  // ── Identificación del mesonero ───────────────────────────────────────────
  const [activeWaiter, setActiveWaiter] = useState<ActiveWaiter | null>(null);
  const [waiterHydrated, setWaiterHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(ACTIVE_WAITER_KEY);
      if (raw) setActiveWaiter(JSON.parse(raw) as ActiveWaiter);
    } catch {
      // ignore
    }
    setWaiterHydrated(true);
  }, []);

  const handleWaiterIdentified = (w: ActiveWaiter) => {
    sessionStorage.setItem(ACTIVE_WAITER_KEY, JSON.stringify(w));
    setActiveWaiter(w);
  };

  const handleWaiterLogout = () => {
    sessionStorage.removeItem(ACTIVE_WAITER_KEY);
    setActiveWaiter(null);
    setCart([]);
    setSelectedTableId("");
  };

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  const loadData = async () => {
    setIsLoading(true);
    setLayoutError("");
    try {
      const [menuResult, layoutResult, rate] = await Promise.all([
        getMenuForPOSAction(),
        getRestaurantLayoutAction(),
        getExchangeRateValue(),
      ]);
      if (menuResult.success && menuResult.data) {
        setCategories(menuResult.data);
        setSelectedCategory((prev) => prev || menuResult.data[0]?.id || "");
      }
      if (layoutResult.success && layoutResult.data) {
        const nextLayout = layoutResult.data as SportBarLayout;
        setLayout(nextLayout);
        setSelectedZoneId((prev) => prev || nextLayout.serviceZones[0]?.id || "");
      } else if (!layoutResult.success) {
        setLayoutError(layoutResult.message || "Error cargando mesas");
      }
      setExchangeRate(rate);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (!selectedCategory || !categories.length) return;
    const cat = categories.find((c) => c.id === selectedCategory);
    setMenuItems(cat?.items || []);
  }, [selectedCategory, categories]);

  // ============================================================================
  // DERIVED STATE
  // ============================================================================

  const selectedZone = useMemo(
    () => layout?.serviceZones.find((z) => z.id === selectedZoneId) || null,
    [layout, selectedZoneId],
  );
  const selectedTable = useMemo(
    () => selectedZone?.tablesOrStations.find((t) => t.id === selectedTableId) || null,
    [selectedZone, selectedTableId],
  );
  const activeTab = useMemo(() => selectedTable?.openTabs[0] || null, [selectedTable]);

  const allMenuItems = useMemo(() => categories.flatMap((c) => c.items || []), [categories]);
  const filteredMenuItems = useMemo(() => {
    if (!productSearch.trim()) return menuItems;
    const q = productSearch.toLowerCase();
    return allMenuItems.filter((i) => i.name.toLowerCase().includes(q) || i.sku?.toLowerCase().includes(q));
  }, [menuItems, productSearch, allMenuItems]);

  const cartTotal = cart.reduce((s, i) => s + i.lineTotal, 0);
  const cartBadgeCount = cart.length;

  // ============================================================================
  // OPEN TAB
  // ============================================================================

  const handleOpenTab = async () => {
    if (!selectedTable) return;
    if (!activeWaiter) { toast.error("Identifícate con tu PIN antes de abrir una cuenta"); return; }
    if (!openTabName.trim()) { toast.error("El nombre del cliente es obligatorio"); return; }
    if (!openTabPhone.trim()) { toast.error("El teléfono del cliente es obligatorio"); return; }
    setIsProcessing(true);
    try {
      const result = await openTabAction({
        tableOrStationId: selectedTable.id,
        customerLabel: openTabName.trim(),
        customerPhone: openTabPhone.trim(),
        guestCount: openTabGuests,
        waiterLabel: `${activeWaiter.firstName} ${activeWaiter.lastName}`,
        waiterProfileId: activeWaiter.id,
      });
      if (!result.success) { toast.error(result.message); return; }
      setShowOpenTabModal(false);
      setOpenTabName(""); setOpenTabPhone(""); setOpenTabGuests(2);
      await loadData();
    } finally {
      setIsProcessing(false);
    }
  };

  // ============================================================================
  // CART & MODIFIERS
  // ============================================================================

  const handleAddToCart = (item: MenuItem) => {
    if (!activeTab) return;
    setSelectedItemForModifier(item);
    setCurrentModifiers([]);
    setItemQuantity(1);
    setItemNotes("");
    setShowModifierModal(true);
  };

  const updateModifierQuantity = (group: ModifierGroup, modifier: ModifierOption, change: number) => {
    const currentInGroup = currentModifiers.filter((m) => m.groupId === group.id);
    const totalSelected = currentInGroup.reduce((s, m) => s + m.quantity, 0);
    const existing = currentModifiers.find((m) => m.id === modifier.id && m.groupId === group.id);
    const currentQty = existing?.quantity || 0;
    if (change > 0) {
      if (group.maxSelections > 1 && totalSelected >= group.maxSelections) return;
      if (group.maxSelections === 1) {
        if (totalSelected >= 1 && existing) return;
        if (totalSelected >= 1 && !existing) {
          setCurrentModifiers([
            ...currentModifiers.filter((m) => m.groupId !== group.id),
            { groupId: group.id, groupName: group.name, id: modifier.id, name: modifier.name, priceAdjustment: modifier.priceAdjustment, quantity: 1 },
          ]);
          return;
        }
      }
    }
    const newQty = currentQty + change;
    if (newQty < 0) return;
    let mods = [...currentModifiers];
    if (existing) {
      mods = newQty === 0
        ? mods.filter((m) => !(m.id === modifier.id && m.groupId === group.id))
        : mods.map((m) => (m.id === modifier.id && m.groupId === group.id ? { ...m, quantity: newQty } : m));
    } else if (newQty > 0) {
      mods.push({ groupId: group.id, groupName: group.name, id: modifier.id, name: modifier.name, priceAdjustment: modifier.priceAdjustment, quantity: newQty });
    }
    setCurrentModifiers(mods);
  };

  const isGroupValid = (group: ModifierGroup) =>
    !group.isRequired || currentModifiers.filter((m) => m.groupId === group.id).reduce((s, m) => s + m.quantity, 0) >= group.minSelections;

  const confirmAddToCart = () => {
    if (!selectedItemForModifier) return;
    if (!selectedItemForModifier.modifierGroups.every((g) => isGroupValid(g.modifierGroup))) return;
    const modTotal = currentModifiers.reduce((s, m) => s + m.priceAdjustment * m.quantity, 0);
    const lineTotal = (selectedItemForModifier.price + modTotal) * itemQuantity;
    const exploded = currentModifiers.flatMap((m) =>
      Array(m.quantity).fill({ modifierId: m.id, name: m.name, priceAdjustment: m.priceAdjustment }),
    );
    setCart((prev) => [...prev, {
      menuItemId: selectedItemForModifier.id,
      name: selectedItemForModifier.name,
      quantity: itemQuantity,
      unitPrice: selectedItemForModifier.price,
      modifiers: exploded,
      notes: itemNotes || undefined,
      lineTotal,
    }]);
    setShowModifierModal(false);
  };

  // ============================================================================
  // ENVIAR PEDIDO A COCINA (sin cobro)
  // ============================================================================

  const handleSendToTab = async () => {
    if (!activeTab || cart.length === 0) return;
    if (!activeWaiter) { toast.error("Identifícate con tu PIN antes de enviar a cocina"); return; }
    setIsProcessing(true);
    try {
      const result = await addItemsToOpenTabAction({
        openTabId: activeTab.id,
        items: cart,
        waiterProfileId: activeWaiter.id,
      });
      if (!result.success) { toast.error(result.message); return; }
      if (result.data?.kitchenStatus === "SENT" && getPOSConfig().printComandaOnRestaurant) {
        printKitchenCommand({
          orderNumber: result.data.orderNumber,
          orderType: "RESTAURANT",
          tableName: selectedTable?.name ?? null,
          customerName: activeTab.customerLabel || null,
          items: cart.map((i) => ({ name: i.name, quantity: i.quantity, modifiers: i.modifiers.map((m) => m.name), notes: i.notes })),
          createdAt: new Date(),
        });
      }
      setCart([]);
      setSendSuccess(true);
      setTimeout(() => setSendSuccess(false), 2500);
      await loadData();
    } finally {
      setIsProcessing(false);
    }
  };

  // ============================================================================
  // REMOVE ITEM (requiere PIN de supervisor)
  // ============================================================================

  const openRemoveModal = (orderId: string, item: OrderItemSummary) => {
    setRemoveTarget({ orderId, itemId: item.id, itemName: item.itemName });
    setRemovePin(""); setRemoveJustification(""); setRemoveError("");
    setShowRemoveModal(true);
  };

  const handleRemoveItem = async () => {
    if (!removeTarget || !activeTab) return;
    if (!removeJustification.trim()) { setRemoveError("La justificación es obligatoria"); return; }
    setIsProcessing(true); setRemoveError("");
    try {
      const result = await removeItemFromOpenTabAction({
        openTabId: activeTab.id,
        orderId: removeTarget.orderId,
        itemId: removeTarget.itemId,
        cashierPin: removePin,
        justification: removeJustification,
        waiterProfileId: activeWaiter?.id,
      });
      if (!result.success) { setRemoveError(result.message); return; }
      setShowRemoveModal(false);
      await loadData();
    } finally {
      setIsProcessing(false);
    }
  };

  // ============================================================================
  // TRANSFERIR MESA (solo capitanes)
  // ============================================================================

  const openTransferModal = async () => {
    if (!activeWaiter || !activeTab) return;
    setTransferToWaiterId("");
    setTransferReason("");
    setTransferCaptainPin("");
    setTransferError("");
    const res = await getActiveWaitersAction();
    if (res.success) {
      setTransferWaiters((res.data as { id: string; firstName: string; lastName: string }[]).filter((w) => w.id !== activeWaiter.id));
    }
    setShowTransferModal(true);
  };

  const handleTransfer = async () => {
    if (!activeWaiter || !activeTab) return;
    if (!transferToWaiterId) { setTransferError("Selecciona el mesonero destino"); return; }
    if (!transferCaptainPin.trim()) { setTransferError("Ingresa tu PIN de capitán"); return; }
    setIsProcessing(true); setTransferError("");
    try {
      const result = await transferTableAction({
        openTabId: activeTab.id,
        fromWaiterId: activeWaiter.id,
        toWaiterId: transferToWaiterId,
        captainPin: transferCaptainPin,
        reason: transferReason.trim() || undefined,
      });
      if (!result.success) { setTransferError(result.message); return; }
      toast.success(result.message);
      setShowTransferModal(false);
      await loadData();
    } finally {
      setIsProcessing(false);
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (isLoading || !waiterHydrated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🧑‍🍳</div>
          <div className="text-xl font-black text-foreground">Cargando POS Mesero...</div>
        </div>
      </div>
    );
  }

  if (!activeWaiter) {
    return <WaiterIdentification onIdentified={handleWaiterIdentified} />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col pb-16 lg:pb-0">

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <div className="glass-panel px-3 md:px-6 py-3 md:py-4 flex items-center justify-between shrink-0 shadow-lg border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 md:h-12 md:w-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center text-2xl md:text-3xl shadow-inner">
            🧑‍🍳
          </div>
          <div>
            <h1 className="text-lg md:text-2xl font-black tracking-tight text-foreground">
              POS <span className="text-emerald-400 italic">MESERO</span>
            </h1>
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Solo toma de pedidos · Sin acceso a cobro
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Mesonero identificado */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
            <span className="h-7 w-7 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center font-black text-xs">
              {activeWaiter.firstName.charAt(0)}{activeWaiter.lastName.charAt(0)}
            </span>
            <div className="text-[10px] leading-tight">
              <div className="font-black text-emerald-300 uppercase tracking-wider">{activeWaiter.firstName}</div>
              <div className="text-[9px] text-muted-foreground">Mesonero activo</div>
            </div>
          </div>
          <button
            onClick={handleWaiterLogout}
            className="h-9 px-3 rounded-xl bg-secondary border border-border flex items-center justify-center text-[10px] font-black text-muted-foreground hover:text-red-400 hover:border-red-500/30 transition-all uppercase tracking-widest"
            title="Cambiar mesonero"
          >
            Salir
          </button>
          <button
            onClick={loadData}
            className="h-9 w-9 rounded-xl bg-secondary border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
            title="Actualizar"
          >
            🔄
          </button>
          <div className="hidden md:block px-3 py-2 bg-secondary/30 rounded-xl border border-border font-black text-xs tabular-nums text-foreground/60">
            {new Date().toLocaleDateString("es-VE", { timeZone: "America/Caracas" })}
          </div>
        </div>
      </div>

      {/* ── BADGE MÓDULO RESTRINGIDO ─────────────────────────────────────── */}
      <div className="bg-emerald-950/40 border-b border-emerald-900/40 px-4 py-1.5 flex items-center gap-2 text-[10px] font-black text-emerald-400 uppercase tracking-widest">
        <span>🔒</span>
        Modo Mesero — No se permite cobro ni descuentos en esta sesión
      </div>

      {/* ── MAIN GRID ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* ══ LEFT: TABLE GRID ═══════════════════════════════════════════ */}
        <aside className={`w-full lg:w-72 xl:w-80 shrink-0 border-r border-border bg-card/30 flex flex-col overflow-hidden ${mobileTab === "tables" ? "flex" : "hidden"} lg:flex absolute lg:relative inset-0 z-10 lg:z-auto`}>
          {/* Zone selector */}
          <div className="p-4 border-b border-border space-y-3">
            <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest pl-1">Secciones</p>
            <div className="flex gap-2 flex-wrap">
              {layout?.serviceZones.map((z) => (
                <button
                  key={z.id}
                  onClick={() => { setSelectedZoneId(z.id); setSelectedTableId(""); }}
                  className={`flex-1 min-w-0 py-3 rounded-xl text-xs font-black transition-all active:scale-95 ${selectedZoneId === z.id ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-card border border-border text-foreground/60 hover:border-primary/50"}`}
                >
                  {z.zoneType === "BAR" ? "🍺" : "🌿"} {z.name}
                </button>
              ))}
            </div>
            {layoutError && (
              <button onClick={loadData} className="text-xs text-red-400 hover:text-red-300 py-1 text-center w-full">
                ⚠️ Error · Reintentar
              </button>
            )}
          </div>

          {/* Table grid */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-3 gap-3">
              {selectedZone?.tablesOrStations.map((table) => {
                const tab = table.openTabs[0];
                const isSelected = table.id === selectedTableId;
                return (
                  <button
                    key={table.id}
                    onClick={() => {
                      setSelectedTableId(table.id);
                      if (!tab) {
                        // Mesa libre → abrir modal de cuenta directamente
                        setOpenTabName(""); setOpenTabPhone(""); setOpenTabGuests(2);
                        setShowOpenTabModal(true);
                      } else if (window.innerWidth < 1024) {
                        setMobileTab("account");
                      }
                    }}
                    className={`relative aspect-square rounded-2xl flex flex-col items-center justify-center transition-all duration-200 active:scale-90 border-2 ${
                      isSelected
                        ? "border-emerald-400 bg-emerald-400/10 shadow-lg shadow-emerald-400/10 ring-2 ring-emerald-400 ring-offset-2 ring-offset-background"
                        : tab
                          ? "border-emerald-500/50 bg-emerald-500/5"
                          : "border-border bg-card/50 hover:border-emerald-400/30"
                    }`}
                  >
                    <div className={`text-sm md:text-base font-black ${isSelected ? "text-emerald-400" : tab ? "text-emerald-500" : "text-foreground/40"}`}>
                      {table.code}
                    </div>
                    {tab && (
                      <div className="absolute top-1 right-1 h-2.5 w-2.5 bg-emerald-500 rounded-full border-2 border-background animate-pulse" />
                    )}
                    {tab && (
                      <div className="mt-0.5 text-[8px] font-black text-foreground/60 truncate w-full px-1 text-center">
                        ${tab.balanceDue.toFixed(0)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Info de mesa ocupada seleccionada */}
          {selectedTable && activeTab && (
            <div className="border-t border-border p-3 bg-card space-y-1 text-xs shrink-0">
              <div className="font-bold text-emerald-300 truncate">{activeTab.customerLabel}</div>
              {activeTab.customerPhone && (
                <div className="text-muted-foreground">📞 {activeTab.customerPhone}</div>
              )}
              <div className="text-muted-foreground">
                Abrió: <span className="text-white">{activeTab.openedBy.firstName}</span>
                <span className="text-muted-foreground"> · {formatTime(activeTab.openedAt)}</span>
              </div>
            </div>
          )}
        </aside>

        {/* ══ CENTER: MENU ════════════════════════════════════════════════ */}
        <main className={`flex-1 flex flex-col border-r border-border bg-background overflow-hidden ${mobileTab === "menu" ? "flex" : "hidden"} lg:flex absolute lg:relative inset-0 z-10 lg:z-auto`}>
          {/* Search + Categories */}
          <div className="p-3 border-b border-border space-y-2 shrink-0">
            {/* Active tab banner */}
            {activeTab ? (
              <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-xl px-3 py-2 text-xs flex items-center justify-between">
                <span className="text-emerald-200">
                  <b>{selectedTable?.name}</b> · {activeTab.customerLabel}
                </span>
                <span className="text-emerald-400 font-black text-xs">
                  ${activeTab.balanceDue.toFixed(2)}
                </span>
              </div>
            ) : selectedTable ? (
              <div className="bg-secondary border border-border rounded-xl px-3 py-2 text-xs text-muted-foreground">
                {selectedTable.name} · Sin cuenta abierta — presiona &quot;Abrir cuenta&quot; para empezar
              </div>
            ) : (
              <div className="bg-secondary border border-border rounded-xl px-3 py-2 text-xs text-muted-foreground">
                Selecciona una mesa para comenzar
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">🔍</span>
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Buscar producto..."
                className="w-full bg-secondary border border-border rounded-xl py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500"
              />
              {productSearch && (
                <button
                  onClick={() => setProductSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                >✕</button>
              )}
            </div>

            {/* Categories */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => { setSelectedCategory(cat.id); setProductSearch(""); }}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition ${selectedCategory === cat.id ? "bg-emerald-500 text-black" : "bg-secondary text-foreground/70 hover:bg-muted"}`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Menu items */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
              {filteredMenuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleAddToCart(item)}
                  disabled={!activeTab}
                  className="capsula-card group flex flex-col justify-between p-3 md:p-4 text-left disabled:opacity-30 disabled:grayscale h-28 md:h-32 border-primary/5 hover:border-emerald-500/40 active:scale-95 transition-transform"
                >
                  <div className="text-sm font-black text-foreground group-hover:text-emerald-400 transition-colors leading-tight line-clamp-2 uppercase tracking-tight">
                    {item.name}
                  </div>
                  <div className="flex items-end justify-between mt-2">
                    <div className="text-lg font-black text-emerald-400">
                      ${item.price.toFixed(2)}
                    </div>
                    <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all">
                      ➕
                    </div>
                  </div>
                </button>
              ))}
              {filteredMenuItems.length === 0 && (
                <div className="col-span-full text-center text-muted-foreground py-12 text-sm">
                  {productSearch ? `Sin resultados para "${productSearch}"` : "Sin productos en esta categoría"}
                </div>
              )}
            </div>
          </div>
        </main>

        {/* ══ RIGHT: PEDIDO PANEL (sin cobro) ═════════════════════════════ */}
        <aside className={`w-full lg:w-80 xl:w-96 shrink-0 bg-card/80 flex flex-col overflow-hidden ${mobileTab === "account" ? "flex" : "hidden"} lg:flex absolute lg:relative inset-0 z-10 lg:z-auto`}>

          {/* Carrito pendiente */}
          {cart.length > 0 && (
            <div className="border-b border-emerald-900/50 bg-emerald-950/30 p-4 shrink-0">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-black text-sm text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                  🛒 Nuevo pedido
                  <span className="bg-emerald-500 text-black text-[10px] font-black rounded-full w-5 h-5 flex items-center justify-center">
                    {cart.length}
                  </span>
                </h2>
                <button
                  onClick={() => setCart([])}
                  className="text-[10px] text-red-400 hover:text-red-300 font-bold"
                >
                  Limpiar
                </button>
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {cart.map((item, i) => (
                  <div key={i} className="flex justify-between items-center text-xs bg-emerald-900/20 rounded-lg px-3 py-2">
                    <span className="font-bold text-foreground/80 truncate flex-1">
                      <span className="text-emerald-400 font-black">x{item.quantity}</span> {item.name}
                    </span>
                    <span className="text-emerald-400 font-black ml-2">${item.lineTotal.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-between items-center border-t border-emerald-900/50 pt-2">
                <span className="text-xs font-black text-muted-foreground uppercase">Subtotal</span>
                <span className="text-sm font-black text-emerald-400">${cartTotal.toFixed(2)}</span>
              </div>
              <button
                onClick={() => { handleSendToTab(); if (window.innerWidth < 1024) setMobileTab("tables"); }}
                disabled={!activeTab || isProcessing}
                className={`w-full mt-3 py-4 rounded-xl font-black text-sm transition-all active:scale-95 ${
                  sendSuccess
                    ? "bg-emerald-500 text-black"
                    : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 disabled:opacity-40 disabled:cursor-not-allowed"
                }`}
              >
                {sendSuccess ? "✓ ¡Enviado a cocina!" : isProcessing ? "Enviando..." : `🍳 Enviar a cocina · $${cartTotal.toFixed(2)}`}
              </button>
            </div>
          )}

          {/* Cuenta activa — items enviados */}
          {subAccountMode && activeTab ? (
            <SubAccountPanel
              openTabId={activeTab.id}
              exchangeRate={exchangeRate}
              onClose={() => setSubAccountMode(false)}
              onTabUpdated={() => loadData()}
            />
          ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {!activeTab ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground/40 py-10">
                <span className="text-5xl mb-3">🪑</span>
                <p className="text-xs font-black uppercase tracking-widest text-center">
                  Selecciona una mesa<br />para ver la cuenta
                </p>
              </div>
            ) : activeTab.orders.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground/40 py-10">
                <span className="text-5xl mb-3">📋</span>
                <p className="text-xs font-black uppercase tracking-widest text-center">
                  Cuenta abierta<br />Agrega productos del menú
                </p>
              </div>
            ) : (
              <>
                <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">
                  Pedidos enviados
                </p>
                {activeTab.orders.map((order) => (
                  <div key={order.id} className="glass-panel rounded-2xl overflow-hidden border-emerald-900/20">
                    <div className="flex items-center justify-between px-3 py-2 bg-emerald-900/20 border-b border-emerald-900/30">
                      <span className="text-[10px] font-black text-emerald-400 uppercase">#{order.orderNumber}</span>
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                        order.kitchenStatus === "SENT" ? "bg-amber-500/20 text-amber-400" :
                        order.kitchenStatus === "READY" ? "bg-emerald-500/20 text-emerald-400" :
                        "bg-secondary text-muted-foreground"
                      }`}>
                        {order.kitchenStatus === "SENT" ? "🔥 En cocina" : order.kitchenStatus === "READY" ? "✅ Listo" : order.kitchenStatus}
                      </span>
                    </div>
                    <div className="p-3 space-y-1.5">
                      {order.items.map((item) => (
                        <div key={item.id} className="flex justify-between items-center text-xs group">
                          <div className="flex-1 min-w-0">
                            <span className="font-bold text-foreground/80">
                              <span className="text-primary font-black">x{item.quantity}</span> {item.itemName}
                            </span>
                            {item.modifiers && item.modifiers.length > 0 && (
                              <div className="text-[9px] text-muted-foreground truncate pl-4">
                                {item.modifiers.map((m) => m.name).join(" · ")}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 ml-2 shrink-0">
                            <span className="text-foreground/60">${item.lineTotal.toFixed(2)}</span>
                            <button
                              onClick={() => openRemoveModal(order.id, item)}
                              className="h-5 w-5 rounded-md bg-red-500/0 hover:bg-red-500/20 text-red-500/40 hover:text-red-400 flex items-center justify-center text-[10px] transition-all opacity-0 group-hover:opacity-100"
                              title="Anular (requiere PIN supervisor)"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="px-3 pb-3 flex justify-between items-center border-t border-border/50 pt-2">
                      <span className="text-[10px] text-muted-foreground font-bold uppercase">Orden</span>
                      <span className="text-sm font-black text-foreground">${order.total.toFixed(2)}</span>
                    </div>
                  </div>
                ))}

                {/* Total cuenta — solo informativo, sin botón de cobro */}
                <div className="capsula-card p-4 border-emerald-900/30 mt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-muted-foreground uppercase tracking-widest">Total cuenta</span>
                    <span className="text-xl font-black text-emerald-400">${activeTab.balanceDue.toFixed(2)}</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground/60 mt-1 font-bold uppercase tracking-widest">
                    El cobro lo gestiona el cajero
                  </p>
                  {/* Mostrar cuenta al cliente */}
                  <button
                    onClick={() => setShowBillModal(true)}
                    className="mt-3 w-full py-2.5 rounded-xl text-xs font-black bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition"
                  >
                    🧾 Mostrar cuenta al cliente
                  </button>
                  {activeWaiter?.isCaptain && (
                    <>
                      <button
                        onClick={() => setSubAccountMode(true)}
                        className="mt-2 w-full py-2 rounded-xl text-xs font-black bg-secondary hover:bg-amber-500/20 hover:text-amber-400 text-foreground/70 transition"
                      >
                        ÷ Dividir cuenta (subcuentas)
                      </button>
                      <button
                        onClick={openTransferModal}
                        className="mt-2 w-full py-2 rounded-xl text-xs font-black bg-secondary hover:bg-sky-500/20 hover:text-sky-400 text-foreground/70 transition"
                      >
                        ↔ Transferir mesa
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
          )}
        </aside>
      </div>

      {/* ── NAVEGACIÓN MÓVIL ─────────────────────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border flex z-50 shadow-2xl">
        {(["tables", "menu", "account"] as const).map((tab) => {
          const icons = { tables: "🪑", menu: "🍽️", account: "📋" };
          const labels = { tables: "MESAS", menu: "MENÚ", account: "PEDIDO" };
          return (
            <button
              key={tab}
              onClick={() => setMobileTab(tab)}
              className={`flex-1 py-3 flex flex-col items-center gap-1 text-[9px] font-black uppercase tracking-widest relative transition-colors
                ${mobileTab === tab ? "text-emerald-400 bg-emerald-400/5" : "text-muted-foreground"}`}
            >
              {mobileTab === tab && <div className="absolute top-0 left-0 right-0 h-0.5 bg-emerald-400 rounded-b" />}
              <span className="text-xl">{icons[tab]}</span>
              {labels[tab]}
              {tab === "account" && cartBadgeCount > 0 && (
                <span className="absolute top-1 right-6 bg-emerald-500 text-black text-[9px] rounded-full min-w-[16px] h-4 flex items-center justify-center font-black px-1">
                  {cartBadgeCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ══ MODAL: CUENTA AL CLIENTE z-[70] ══════════════════════════════ */}
      {showBillModal && activeTab && (
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-sm rounded-3xl shadow-2xl border border-border flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div>
                <h3 className="font-black text-base text-foreground">Cuenta</h3>
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                  {selectedTable?.name} · {activeTab.customerLabel}
                </p>
              </div>
              <button
                onClick={() => setShowBillModal(false)}
                className="h-9 w-9 rounded-full hover:bg-red-500/10 hover:text-red-400 transition text-2xl flex items-center justify-center text-muted-foreground"
              >
                ×
              </button>
            </div>
            {/* Items */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1">
              {activeTab.orders.flatMap(o => o.items).map((item, i) => (
                <div key={i} className="flex justify-between items-baseline text-sm">
                  <span className="text-foreground/80 font-semibold flex-1 mr-2">
                    <span className="text-foreground/50 text-xs">×{item.quantity}</span> {item.itemName}
                  </span>
                  <span className="font-black tabular-nums">${item.lineTotal.toFixed(2)}</span>
                </div>
              ))}
            </div>
            {/* Totals */}
            {(() => {
              const subtotal = activeTab.orders.reduce((s, o) => s + o.total, 0);
              const serviceCharge = subtotal * 0.10;
              const totalUsd = subtotal + serviceCharge;
              const divisas33 = totalUsd * (1 - 0.33);
              const totalBs = exchangeRate ? totalUsd * exchangeRate : null;
              return (
                <div className="px-5 py-4 border-t border-border space-y-2 shrink-0">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="font-bold uppercase tracking-wider">Subtotal</span>
                    <span className="font-black tabular-nums">${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="font-bold uppercase tracking-wider">Servicio (10%)</span>
                    <span className="font-black tabular-nums">${serviceCharge.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-baseline border-t border-border pt-2 mt-1">
                    <span className="text-sm font-black text-foreground uppercase tracking-widest">Total USD</span>
                    <span className="text-2xl font-black text-emerald-400 tabular-nums">${totalUsd.toFixed(2)}</span>
                  </div>
                  <div className="rounded-xl bg-secondary/50 border border-border p-3 space-y-1.5 mt-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted-foreground font-bold uppercase tracking-wider">Divisas (33% desc.)</span>
                      <span className="font-black tabular-nums text-amber-400">${divisas33.toFixed(2)}</span>
                    </div>
                    {totalBs !== null && (
                      <div className="flex justify-between text-[11px]">
                        <span className="text-muted-foreground font-bold uppercase tracking-wider">
                          Bs. (Tasa {exchangeRate?.toFixed(2)})
                        </span>
                        <span className="font-black tabular-nums text-sky-400">
                          Bs. {totalBs.toLocaleString("es-VE", { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ══ MODAL: ABRIR CUENTA ═══════════════════════════════════════════ */}
      {showOpenTabModal && selectedTable && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card glass-panel w-full max-w-md rounded-3xl p-6 space-y-4 shadow-2xl border border-border">
            <h3 className="font-black text-lg">Abrir cuenta — {selectedTable.name}</h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Nombre del cliente *"
                value={openTabName}
                onChange={(e) => setOpenTabName(e.target.value)}
                className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm font-bold focus:border-emerald-500 focus:outline-none"
              />
              <input
                type="tel"
                placeholder="Teléfono *"
                value={openTabPhone}
                onChange={(e) => setOpenTabPhone(e.target.value)}
                className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm font-bold focus:border-emerald-500 focus:outline-none"
              />
              <div className="flex items-center gap-3">
                <label className="text-xs font-black text-muted-foreground uppercase tracking-widest w-24">Personas</label>
                <div className="flex items-center gap-3 bg-secondary rounded-xl p-1 border border-border">
                  <button onClick={() => setOpenTabGuests(Math.max(1, openTabGuests - 1))} className="h-9 w-9 rounded-lg bg-card font-black transition hover:bg-red-500/10 hover:text-red-400">-</button>
                  <span className="w-8 text-center font-black text-lg">{openTabGuests}</span>
                  <button onClick={() => setOpenTabGuests(openTabGuests + 1)} className="h-9 w-9 rounded-lg bg-primary text-white font-black transition hover:opacity-90">+</button>
                </div>
              </div>
              {activeWaiter && (
                <div className="flex items-center gap-2 px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs">
                  <span className="h-7 w-7 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center font-black">
                    {activeWaiter.firstName.charAt(0)}{activeWaiter.lastName.charAt(0)}
                  </span>
                  <div>
                    <div className="font-black text-emerald-300">{activeWaiter.firstName} {activeWaiter.lastName}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Mesonero de la mesa</div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowOpenTabModal(false)} className="capsula-btn capsula-btn-secondary flex-1 py-3">
                Cancelar
              </button>
              <button
                onClick={handleOpenTab}
                disabled={isProcessing || !openTabName.trim() || !openTabPhone.trim()}
                className="capsula-btn capsula-btn-primary flex-[2] py-3 disabled:opacity-40"
              >
                {isProcessing ? "Abriendo..." : "✓ Abrir cuenta"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: MODIFICADORES ══════════════════════════════════════════ */}
      {showModifierModal && selectedItemForModifier && (
        <div className="fixed inset-0 z-50 bg-background/90 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-card glass-panel w-full max-w-lg rounded-t-3xl sm:rounded-3xl flex flex-col max-h-[92vh] sm:max-h-[90vh] shadow-2xl border border-border">
            <div className="p-5 border-b border-border flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight">{selectedItemForModifier.name}</h3>
                <p className="text-emerald-400 font-black text-lg">${selectedItemForModifier.price.toFixed(2)}</p>
              </div>
              <button onClick={() => setShowModifierModal(false)} className="h-10 w-10 rounded-full hover:bg-red-500/10 hover:text-red-400 transition text-2xl flex items-center justify-center">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {selectedItemForModifier.modifierGroups?.map((groupRel) => {
                const group = groupRel.modifierGroup;
                const totalSelected = currentModifiers.filter((m) => m.groupId === group.id).reduce((s, m) => s + m.quantity, 0);
                const isValid = !group.isRequired || totalSelected >= group.minSelections;
                return (
                  <div key={group.id} className={`p-4 rounded-2xl border-2 transition-colors ${isValid ? "border-border bg-secondary/20" : "border-red-500 bg-red-500/5"}`}>
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="font-black text-sm uppercase tracking-widest text-foreground/70">{group.name}</h4>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${isValid ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500 text-white animate-bounce"}`}>
                        {totalSelected}/{group.maxSelections}{group.isRequired ? " · Req." : ""}
                      </span>
                    </div>
                    <div className="grid gap-2">
                      {group.modifiers.map((mod) => {
                        const existing = currentModifiers.find((m) => m.id === mod.id && m.groupId === group.id);
                        const qty = existing?.quantity || 0;
                        const isMax = group.maxSelections > 1 && totalSelected >= group.maxSelections;
                        const isRadio = group.maxSelections === 1;
                        return (
                          <div key={mod.id} className={`flex justify-between items-center p-3 rounded-xl border-2 transition-all ${qty > 0 ? "bg-emerald-500/10 border-emerald-500" : "bg-background border-border hover:border-emerald-500/30"}`}>
                            <span className="font-bold text-sm">{mod.name}</span>
                            {isRadio ? (
                              <button
                                onClick={() => updateModifierQuantity(group, mod, 1)}
                                className={`h-8 w-8 rounded-full border-2 flex justify-center items-center transition-all ${qty > 0 ? "bg-emerald-500 border-emerald-500 text-white scale-110" : "border-border hover:border-emerald-500"}`}
                              >
                                {qty > 0 && "✓"}
                              </button>
                            ) : (
                              <div className="flex items-center gap-2 bg-card p-1 rounded-xl border border-border">
                                <button onClick={() => updateModifierQuantity(group, mod, -1)} disabled={qty === 0} className={`h-7 w-7 rounded-lg font-black transition ${qty === 0 ? "text-muted-foreground opacity-20" : "bg-secondary hover:bg-red-500/20 hover:text-red-400"}`}>-</button>
                                <span className="font-black text-base w-5 text-center text-emerald-400">{qty}</span>
                                <button onClick={() => updateModifierQuantity(group, mod, 1)} disabled={isMax} className={`h-7 w-7 rounded-lg font-black transition ${isMax ? "text-muted-foreground opacity-20" : "bg-emerald-600 text-white hover:bg-emerald-500"}`}>+</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <div className="bg-secondary/20 p-4 rounded-2xl border border-border">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2 block">Instrucciones especiales</label>
                <textarea
                  value={itemNotes}
                  onChange={(e) => setItemNotes(e.target.value)}
                  className="w-full bg-background rounded-xl p-3 h-20 text-sm font-bold border border-border focus:border-emerald-500 focus:outline-none resize-none"
                  placeholder="Petición del cliente..."
                />
              </div>
              <div className="flex items-center justify-between glass-panel p-4 rounded-2xl border-emerald-900/20">
                <span className="font-black uppercase tracking-tighter text-base">Cantidad</span>
                <div className="flex items-center gap-2 bg-background p-1 rounded-xl border border-border">
                  <button onClick={() => setItemQuantity(Math.max(1, itemQuantity - 1))} className="h-12 w-12 rounded-lg font-black text-xl hover:bg-secondary transition active:scale-90">-</button>
                  <span className="w-12 text-center font-black text-2xl text-emerald-400">{itemQuantity}</span>
                  <button onClick={() => setItemQuantity(itemQuantity + 1)} className="h-12 w-12 rounded-lg bg-emerald-600 text-white font-black text-xl hover:bg-emerald-500 active:scale-95">+</button>
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-border flex gap-3">
              <button onClick={() => setShowModifierModal(false)} className="capsula-btn capsula-btn-secondary flex-1 py-4 text-sm">Cancelar</button>
              <button
                onClick={confirmAddToCart}
                disabled={selectedItemForModifier.modifierGroups.some((g) => !isGroupValid(g.modifierGroup))}
                className="capsula-btn capsula-btn-primary flex-[2] py-4 text-sm bg-emerald-600 border-emerald-700 disabled:opacity-40"
              >
                Agregar al pedido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: TRANSFERIR MESA (solo capitanes) ══════════════════════ */}
      {showTransferModal && activeTab && activeWaiter?.isCaptain && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card glass-panel w-full max-w-md rounded-3xl p-6 space-y-4 shadow-2xl border border-sky-900/30">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 bg-sky-500/10 rounded-2xl flex items-center justify-center text-2xl">↔</div>
              <div>
                <h3 className="font-black text-base text-sky-400">Transferir mesa</h3>
                <p className="text-xs text-muted-foreground">{selectedTable?.name} · {activeTab.customerLabel}</p>
              </div>
              <button
                onClick={() => setShowTransferModal(false)}
                className="ml-auto h-9 w-9 rounded-full hover:bg-red-500/10 hover:text-red-400 transition text-2xl flex items-center justify-center text-muted-foreground"
              >
                ×
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5 block">
                  Mesonero destino
                </label>
                <select
                  value={transferToWaiterId}
                  onChange={(e) => setTransferToWaiterId(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm font-bold focus:border-sky-500 focus:outline-none"
                >
                  <option value="">— Seleccionar mesonero —</option>
                  {transferWaiters.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.firstName} {w.lastName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5 block">
                  Motivo (opcional)
                </label>
                <textarea
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  placeholder="Ej: Cambio de turno, petición del cliente..."
                  className="w-full bg-secondary border border-border rounded-xl p-3 text-sm font-bold focus:border-sky-500 focus:outline-none resize-none h-16"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5 block">
                  PIN de capitán (confirmación)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  placeholder="••••"
                  value={transferCaptainPin}
                  onChange={(e) => setTransferCaptainPin(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm font-bold focus:border-sky-500 focus:outline-none"
                />
              </div>
            </div>
            {transferError && (
              <p className="text-red-400 text-xs font-bold bg-red-950/30 border border-red-900/30 rounded-xl px-3 py-2">
                {transferError}
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setShowTransferModal(false)}
                className="capsula-btn capsula-btn-secondary flex-1 py-3"
              >
                Cancelar
              </button>
              <button
                onClick={handleTransfer}
                disabled={isProcessing || !transferToWaiterId || !transferCaptainPin.trim()}
                className="flex-[2] py-3 bg-sky-600 hover:bg-sky-500 rounded-xl font-black text-sm transition disabled:opacity-40"
              >
                {isProcessing ? "Transfiriendo..." : "↔ Confirmar transferencia"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: ANULAR ÍTEM (requiere PIN supervisor) ══════════════════ */}
      {showRemoveModal && removeTarget && (
        <div className="fixed inset-0 z-50 bg-background/90 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-card glass-panel w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-4 shadow-2xl border border-red-900/30">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 bg-red-500/10 rounded-2xl flex items-center justify-center text-2xl">🔒</div>
              <div>
                <h3 className="font-black text-base text-red-400">Anular ítem</h3>
                <p className="text-xs text-muted-foreground">{removeTarget.itemName}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground bg-red-950/30 border border-red-900/30 rounded-xl p-3">
              Para anular un ítem ya enviado se requiere <b className="text-red-400">PIN de supervisor</b> y una justificación. Esto queda registrado en el log de auditoría.
            </p>
            <textarea
              value={removeJustification}
              onChange={(e) => setRemoveJustification(e.target.value)}
              placeholder="Justificación obligatoria (ej: error del cliente, cambio de pedido...)"
              className="w-full bg-secondary border border-border rounded-xl p-3 text-sm font-bold focus:border-red-500 focus:outline-none resize-none h-20"
            />
            <input
              type="password"
              placeholder="PIN de supervisor (opcional si tienes permiso)"
              value={removePin}
              onChange={(e) => setRemovePin(e.target.value)}
              className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm font-bold focus:border-red-500 focus:outline-none"
            />
            {removeError && <p className="text-red-400 text-xs font-bold">{removeError}</p>}
            <div className="flex gap-3">
              <button onClick={() => setShowRemoveModal(false)} className="capsula-btn capsula-btn-secondary flex-1 py-3">Cancelar</button>
              <button
                onClick={handleRemoveItem}
                disabled={isProcessing || !removeJustification.trim()}
                className="flex-1 py-3 bg-red-600 hover:bg-red-500 rounded-xl font-black text-sm transition disabled:opacity-40"
              >
                {isProcessing ? "Anulando..." : "Confirmar anulación"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
