"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addItemsToOpenTabAction,
  closeOpenTabAction,
  getMenuForPOSAction,
  getRestaurantLayoutAction,
  getUsersForTabAction,
  openTabAction,
  registerOpenTabPaymentAction,
  createSalesOrderAction,
  removeItemFromOpenTabAction,
  validateManagerPinAction,
  type CartItem,
} from "@/app/actions/pos.actions";
import { getExchangeRateValue } from "@/app/actions/exchange.actions";
import { printKitchenCommand, printReceipt } from "@/lib/print-command";
import { getPOSConfig } from "@/lib/pos-settings";
import { PriceDisplay } from "@/components/pos/PriceDisplay";
import { CurrencyCalculator } from "@/components/pos/CurrencyCalculator";
import { CashierShiftModal } from "@/components/pos/CashierShiftModal";

// ============================================================================
// TIPOS
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
interface PaymentSplit {
  id: string;
  splitLabel: string;
  paymentMethod?: string;
  total: number;
  paidAmount: number;
  paidAt?: string;
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
  createdBy?: { firstName: string; lastName: string };
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
  closedBy?: UserSummary | null;
  orders: SalesOrderSummary[];
  paymentSplits: PaymentSplit[];
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

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "💵 Efectivo $",
  CARD: "💳 Tarjeta",
  MOBILE_PAY: "📱 Pago Móvil",
  TRANSFER: "🏦 Transferencia",
  ZELLE: "⚡ Zelle",
};
const CASHIER_ROLES = ["OWNER", "ADMIN_MANAGER", "OPS_MANAGER", "AREA_LEAD"];

function getRoleLabel(role: string) {
  const map: Record<string, string> = {
    OWNER: "Dueño",
    ADMIN_MANAGER: "Gerente Adm.",
    OPS_MANAGER: "Gerente Ops.",
    AREA_LEAD: "Cajera/Líder",
    CHEF: "Cocina",
  };
  return map[role] || role;
}

function formatTime(d: string | Date) {
  return new Date(d).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Caracas" });
}
function formatDateTime(d: string | Date) {
  return new Date(d).toLocaleString("es-VE", {
    timeZone: "America/Caracas",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export default function POSSportBarPage() {
  // ── Data ──────────────────────────────────────────────────────────────────
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [layout, setLayout] = useState<SportBarLayout | null>(null);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [productSearch, setProductSearch] = useState("");

  // ── Zone / Table / Tab selection ──────────────────────────────────────────
  const [selectedZoneId, setSelectedZoneId] = useState("");
  const [selectedTableId, setSelectedTableId] = useState("");

  // ── Open tab form (modal) ─────────────────────────────────────────────────
  const [showOpenTabModal, setShowOpenTabModal] = useState(false);
  const [openTabName, setOpenTabName] = useState("");
  const [openTabPhone, setOpenTabPhone] = useState("");
  const [openTabGuests, setOpenTabGuests] = useState(2);
  const [openTabWaiter, setOpenTabWaiter] = useState("");

  // ── Cart ──────────────────────────────────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>([]);

  // ── Payment ───────────────────────────────────────────────────────────────
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "TRANSFER" | "MOBILE_PAY" | "ZELLE">("CASH");
  const [amountReceived, setAmountReceived] = useState("");
  const [showPaymentPinModal, setShowPaymentPinModal] = useState(false);
  const [paymentPin, setPaymentPin] = useState("");
  const [paymentPinError, setPaymentPinError] = useState("");

  // ── Descuento ─────────────────────────────────────────────────────────────
  const [discountType, setDiscountType] = useState<"NONE" | "DIVISAS_33" | "CORTESIA_100" | "CORTESIA_PERCENT">("NONE");
  const [authorizedManager, setAuthorizedManager] = useState<{ id: string; name: string } | null>(null);
  const [showCortesiaModal, setShowCortesiaModal] = useState(false);
  const [cortesiaPin, setCortesiaPin] = useState("");
  const [cortesiaPercent, setCortesiaPercent] = useState("100");
  const [cortesiaPinError, setCortesiaPinError] = useState("");

  // ── 10% Servicio (solo sala principal, opcional) ───────────────────────────
  const [serviceFeeIncluded, setServiceFeeIncluded] = useState(true);

  // ── Remove item ───────────────────────────────────────────────────────────
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{
    orderId: string;
    itemId: string;
    itemName: string;
    qty: number;
    lineTotal: number;
  } | null>(null);
  const [removePin, setRemovePin] = useState("");
  const [removeJustification, setRemoveJustification] = useState("");
  const [removeError, setRemoveError] = useState("");

  // ── Modifier modal ────────────────────────────────────────────────────────
  const [showModifierModal, setShowModifierModal] = useState(false);
  const [selectedItemForModifier, setSelectedItemForModifier] = useState<MenuItem | null>(null);
  const [currentModifiers, setCurrentModifiers] = useState<SelectedModifier[]>([]);
  const [itemQuantity, setItemQuantity] = useState(1);
  const [itemNotes, setItemNotes] = useState("");

  // ── State flags ───────────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [layoutError, setLayoutError] = useState("");

  // ── Nueva Funcionalidad: Cajero y Pickup ──────────────────────────────────
  const [cashierName, setCashierName] = useState("");
  const [showChangeCashierModal, setShowChangeCashierModal] = useState(false);
  const [isPickupMode, setIsPickupMode] = useState(false);
  const [pickupCustomerName, setPickupCustomerName] = useState("");
  const [lastPickupOrder, setLastPickupOrder] = useState<{
    orderNumber: string;
    total: number;
    subtotal: number;
    discount: number;
    items: { name: string; quantity: number; unitPrice: number; total: number; modifiers: string[] }[];
    customerName: string;
  } | null>(null);

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  const loadData = async () => {
    setIsLoading(true);
    setLayoutError("");
    try {
      const [menuResult, layoutResult, usersResult, rate] = await Promise.all([
        getMenuForPOSAction(),
        getRestaurantLayoutAction(),
        getUsersForTabAction(),
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
      if (usersResult.success && usersResult.data) {
        setUsers(usersResult.data);
      }
      setExchangeRate(rate);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (paymentMethod !== "CASH" && paymentMethod !== "ZELLE" && discountType === "DIVISAS_33") {
      setDiscountType("NONE");
    }
  }, [paymentMethod, discountType]);

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

  const allMenuItems = useMemo(
    () => categories.flatMap((c) => (c.items || [])),
    [categories],
  );

  const filteredMenuItems = useMemo(() => {
    if (!productSearch.trim()) return menuItems;
    const q = productSearch.toLowerCase();
    return allMenuItems.filter((i) => i.name.toLowerCase().includes(q) || i.sku?.toLowerCase().includes(q));
  }, [menuItems, productSearch, allMenuItems]);

  const cartTotal = cart.reduce((s, i) => s + i.lineTotal, 0);
  const paidAmount = parseFloat(amountReceived) || 0;
  const isPagoDivisas = paymentMethod === "CASH" || paymentMethod === "ZELLE";

  const cortesiaPercentNum = Math.min(100, Math.max(0, parseFloat(cortesiaPercent) || 0));

  const paymentBaseAmount = activeTab
    ? discountType === "DIVISAS_33"
      ? (activeTab.balanceDue * 2) / 3
      : discountType === "CORTESIA_100"
      ? 0
      : discountType === "CORTESIA_PERCENT"
      ? activeTab.balanceDue * (1 - cortesiaPercentNum / 100)
      : activeTab.balanceDue
    : 0;
  const paymentAmountToCharge = serviceFeeIncluded ? paymentBaseAmount * 1.1 : paymentBaseAmount;

  // ============================================================================
  // OPEN TAB
  // ============================================================================

  const handleOpenTab = async () => {
    if (!selectedTable) return;
    if (!openTabName.trim()) {
      alert("El nombre del cliente es obligatorio");
      return;
    }
    if (!openTabPhone.trim()) {
      alert("El teléfono del cliente es obligatorio");
      return;
    }
    setIsProcessing(true);
    try {
      const result = await openTabAction({
        tableOrStationId: selectedTable.id,
        customerLabel: openTabName.trim(),
        customerPhone: openTabPhone.trim(),
        guestCount: openTabGuests,
        waiterLabel: openTabWaiter ? `Mesonero ${openTabWaiter}` : undefined,
      });
      if (!result.success) {
        alert(result.message);
        return;
      }
      setShowOpenTabModal(false);
      setOpenTabName("");
      setOpenTabPhone("");
      setOpenTabGuests(2);
      setOpenTabWaiter("");
      await loadData();
    } finally {
      setIsProcessing(false);
    }
  };

  // ============================================================================
  // CART & MODIFIERS
  // ============================================================================

  const handleAddToCart = (item: MenuItem) => {
    if (!activeTab && !isPickupMode) return;
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
        const others = currentModifiers.filter((m) => m.groupId !== group.id);
        setCurrentModifiers([
          ...others,
          {
            groupId: group.id,
            groupName: group.name,
            id: modifier.id,
            name: modifier.name,
            priceAdjustment: modifier.priceAdjustment,
            quantity: 1,
          },
        ]);
        return;
      }
    }
    const newQty = currentQty + change;
    if (newQty < 0) return;
    let mods = [...currentModifiers];
    if (existing) {
      mods =
        newQty === 0
          ? mods.filter((m) => !(m.id === modifier.id && m.groupId === group.id))
          : mods.map((m) => (m.id === modifier.id && m.groupId === group.id ? { ...m, quantity: newQty } : m));
    } else if (newQty > 0) {
      mods.push({
        groupId: group.id,
        groupName: group.name,
        id: modifier.id,
        name: modifier.name,
        priceAdjustment: modifier.priceAdjustment,
        quantity: newQty,
      });
    }
    setCurrentModifiers(mods);
  };

  const isGroupValid = (group: ModifierGroup) => {
    if (!group.isRequired) return true;
    return (
      currentModifiers.filter((m) => m.groupId === group.id).reduce((s, m) => s + m.quantity, 0) >= group.minSelections
    );
  };

  const confirmAddToCart = () => {
    if (!selectedItemForModifier) return;
    if (!selectedItemForModifier.modifierGroups.every((g) => isGroupValid(g.modifierGroup))) return;
    const modTotal = currentModifiers.reduce((s, m) => s + m.priceAdjustment * m.quantity, 0);
    const lineTotal = (selectedItemForModifier.price + modTotal) * itemQuantity;
    const exploded = currentModifiers.flatMap((m) =>
      Array(m.quantity).fill({ modifierId: m.id, name: m.name, priceAdjustment: m.priceAdjustment }),
    );
    setCart((prev) => [
      ...prev,
      {
        menuItemId: selectedItemForModifier.id,
        name: selectedItemForModifier.name,
        quantity: itemQuantity,
        unitPrice: selectedItemForModifier.price,
        modifiers: exploded,
        notes: itemNotes || undefined,
        lineTotal,
      },
    ]);
    setShowModifierModal(false);
  };

  // ============================================================================
  // SEND TO TAB
  // ============================================================================

  const handleSendToTab = async () => {
    if (!activeTab || cart.length === 0) return;
    setIsProcessing(true);
    try {
      const result = await addItemsToOpenTabAction({ openTabId: activeTab.id, items: cart });
      if (!result.success) {
        alert(result.message);
        return;
      }
      if (result.data?.kitchenStatus === "SENT" && getPOSConfig().printComandaOnRestaurant) {
        printKitchenCommand({
          orderNumber: result.data.orderNumber,
          orderType: "RESTAURANT",
          customerName: activeTab.customerLabel || selectedTable?.name,
          items: cart.map((i) => ({
            name: i.name,
            quantity: i.quantity,
            modifiers: i.modifiers.map((m) => m.name),
            notes: i.notes,
          })),
          createdAt: new Date(),
        });
      }
      setCart([]);
      await loadData();
    } finally {
      setIsProcessing(false);
    }
  };

  // ============================================================================
  // CORTESIA AUTH
  // ============================================================================

  const openCortesiaModal = () => {
    setCortesiaPin("");
    setCortesiaPinError("");
    setCortesiaPercent("100");
    setShowCortesiaModal(true);
  };

  const handleCortesiaPinKey = (k: string) => {
    if (k === "clear") setCortesiaPin("");
    else if (k === "back") setCortesiaPin((p) => p.slice(0, -1));
    else setCortesiaPin((p) => p + k);
  };

  const handleCortesiaPinConfirm = async () => {
    setCortesiaPinError("");
    const r = await validateManagerPinAction(cortesiaPin);
    if (r.success && r.data) {
      setAuthorizedManager({ id: r.data.managerId, name: r.data.managerName });
      const pct = parseFloat(cortesiaPercent);
      if (pct >= 100) {
        setDiscountType("CORTESIA_100");
      } else {
        setDiscountType("CORTESIA_PERCENT");
      }
      setShowCortesiaModal(false);
    } else {
      setCortesiaPinError("PIN inválido");
    }
  };

  const clearDiscount = () => {
    setDiscountType("NONE");
    setAuthorizedManager(null);
    setCortesiaPercent("100");
  };

  // ============================================================================
  // PAYMENT (requiere PIN de cajera)
  // ============================================================================

  const handlePaymentPinConfirm = async () => {
    if (!activeTab || paidAmount <= 0) return;
    setPaymentPinError("");
    setIsProcessing(true);
    try {
      const pinResult = await validateManagerPinAction(paymentPin);
      if (!pinResult.success) {
        setPaymentPinError("PIN incorrecto o sin permisos de cajera");
        return;
      }
      let discountAmount = 0;
      let discountLabel = "";
      if (discountType === "DIVISAS_33") {
        discountAmount = activeTab.balanceDue / 3;
        discountLabel = " · -33.33% Divisas";
      } else if (discountType === "CORTESIA_100") {
        discountAmount = activeTab.balanceDue;
        discountLabel = " · Cortesía 100%";
      } else if (discountType === "CORTESIA_PERCENT") {
        discountAmount = activeTab.balanceDue * (cortesiaPercentNum / 100);
        discountLabel = ` · Cortesía ${cortesiaPercentNum}%`;
      }
      const result = await registerOpenTabPaymentAction({
        openTabId: activeTab.id,
        amount: paidAmount,
        paymentMethod,
        splitLabel: `${PAYMENT_LABELS[paymentMethod] || paymentMethod}${discountLabel} – ${pinResult.data?.managerName || ""}`,
        discountAmount: discountAmount > 0 ? discountAmount : undefined,
        serviceFeeIncluded,
      });
      if (!result.success) {
        alert(result.message);
        return;
      }
      // Imprimir factura: correlativo fijo por mesa (tabCode), 10% servicio solo si el cliente lo pagó
      const subtotal = (activeTab as any).runningSubtotal ?? activeTab.orders.reduce((s, o) => s + o.items.reduce((si: number, i: any) => si + (i.lineTotal || 0), 0), 0);
      const discount = discountAmount > 0 ? discountAmount : ((activeTab as any).runningDiscount ?? 0);
      const totalAntesServicio = Math.max(0, activeTab.balanceDue - discountAmount);
      const serviceFee = serviceFeeIncluded ? totalAntesServicio * 0.1 : 0;
      const allItems = activeTab.orders.flatMap((o) =>
        (o.items || []).map((i: any) => ({
          name: i.itemName,
          quantity: i.quantity,
          unitPrice: (i.lineTotal || 0) / (i.quantity || 1),
          total: i.lineTotal || 0,
          modifiers: (i.modifiers || []).map((m: any) => m.name),
        }))
      );
      if (getPOSConfig().printReceiptOnRestaurant) {
      printReceipt({
        orderNumber: activeTab.tabCode,
        orderType: "RESTAURANT",
        date: new Date(),
        cashierName: cashierName || pinResult.data?.managerName || "Cajera",
        customerName: activeTab.customerLabel,
        items: allItems,
        subtotal,
        discount,
        discountReason: discountType === "DIVISAS_33" ? "Descuento aplicado" : undefined,
        total: totalAntesServicio,
        serviceFee,
      });
      }
      setAmountReceived("");
      setPaymentPin("");
      clearDiscount();
      setServiceFeeIncluded(true);
      setShowPaymentPinModal(false);
      await loadData();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCloseTab = async () => {
    if (!activeTab) return;
    const balance = Number(activeTab.balanceDue ?? 0);
    if (balance > 0.01) {
      alert("La cuenta aún tiene saldo pendiente");
      return;
    }
    if (!confirm("¿Cerrar esta cuenta?")) return;
    setIsProcessing(true);
    try {
      const result = await closeOpenTabAction(activeTab.id);
      if (!result.success) {
        alert(result.message);
        return;
      }
      await loadData();
      setSelectedTableId("");
    } finally {
      setIsProcessing(false);
    }
  };

  // ============================================================================
  // CHECKOUT PICKUP
  // ============================================================================

  const handleCheckoutPickup = async () => {
    if (cart.length === 0) return;
    setIsProcessing(true);
    try {
      const pickupDiscount = discountType === "DIVISAS_33" ? cartTotal / 3
        : discountType === "CORTESIA_100" ? cartTotal
        : discountType === "CORTESIA_PERCENT" ? cartTotal * (cortesiaPercentNum / 100)
        : 0;
      const finalTotal = Math.max(0, cartTotal - pickupDiscount);

      const result = await createSalesOrderAction({
        orderType: "RESTAURANT",
        customerName: pickupCustomerName || "Cliente en Caja",
        items: cart,
        paymentMethod,
        amountPaid: paidAmount || finalTotal,
        notes: "Venta Directa Pickup",
        discountType,
        discountPercent: discountType === "CORTESIA_PERCENT" ? cortesiaPercentNum : undefined,
        authorizedById: authorizedManager?.id,
      });

      if (result.success && result.data) {
        if (getPOSConfig().printComandaOnRestaurant) {
        printKitchenCommand({
          orderNumber: result.data.orderNumber,
          orderType: "RESTAURANT",
          customerName: pickupCustomerName || "Cliente Caja",
          items: cart.map((i) => ({
            name: i.name,
            quantity: i.quantity,
            modifiers: i.modifiers.map((m) => m.name),
            notes: i.notes,
          })),
          createdAt: new Date(),
        });
        }
        const subtotal = cart.reduce((s, i) => s + i.lineTotal, 0);
        const discount = pickupDiscount;
        const discountReason = discount > 0 ? "Descuento aplicado" : undefined;
        const pickupReceiptItems = cart.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          total: i.lineTotal,
          modifiers: i.modifiers.map((m) => m.name),
        }));
        const pickupReceiptData = {
          orderNumber: result.data.orderNumber,
          orderType: "RESTAURANT" as const,
          date: new Date(),
          cashierName: cashierName || "Cajera",
          customerName: pickupCustomerName || "Cliente en Caja",
          items: pickupReceiptItems,
          subtotal,
          discount,
          discountReason,
          total: finalTotal,
          serviceFee: 0,
        };
        if (getPOSConfig().printReceiptOnRestaurant) {
          printReceipt(pickupReceiptData);
        }
        setLastPickupOrder({
          orderNumber: result.data.orderNumber,
          total: finalTotal,
          subtotal,
          discount,
          items: pickupReceiptItems,
          customerName: pickupCustomerName || "Cliente en Caja",
        });

        setCart([]);
        setPaymentMethod("CASH");
        setAmountReceived("");
        clearDiscount();
        setPickupCustomerName("");
      } else {
        alert(result.message);
      }
    } catch (e) {
      console.error(e);
      alert("Error en Venta Directa");
    } finally {
      setIsProcessing(false);
    }
  };

  // ============================================================================
  // REMOVE ITEM
  // ============================================================================

  const openRemoveModal = (orderId: string, item: OrderItemSummary) => {
    setRemoveTarget({
      orderId,
      itemId: item.id,
      itemName: item.itemName,
      qty: item.quantity,
      lineTotal: item.lineTotal,
    });
    setRemovePin("");
    setRemoveJustification("");
    setRemoveError("");
    setShowRemoveModal(true);
  };

  const handleRemoveItem = async () => {
    if (!removeTarget || !activeTab) return;
    if (!removeJustification.trim()) {
      setRemoveError("La justificación es obligatoria");
      return;
    }
    setIsProcessing(true);
    setRemoveError("");
    try {
      const result = await removeItemFromOpenTabAction({
        openTabId: activeTab.id,
        orderId: removeTarget.orderId,
        itemId: removeTarget.itemId,
        cashierPin: removePin,
        justification: removeJustification,
      });
      if (!result.success) {
        setRemoveError(result.message);
        return;
      }
      setShowRemoveModal(false);
      await loadData();
    } finally {
      setIsProcessing(false);
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        <div className="text-center">
          <div className="text-4xl mb-4">🍸</div>
          <div className="text-xl font-bold">Cargando Restaurante...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <CashierShiftModal
        forceOpen={showChangeCashierModal}
        onShiftOpen={(name) => {
          setCashierName(name);
          setShowChangeCashierModal(false);
        }}
      />

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <div className="glass-panel px-6 py-4 flex items-center justify-between shrink-0 shadow-lg border-b-primary/10">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 bg-primary/20 rounded-2xl flex items-center justify-center text-3xl shadow-inner">🍸</div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">POS <span className="text-primary italic">RESTAURANTE</span></h1>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              Gestión Táctil CAPSULA · Operaciones en Vivo
              {cashierName ? (
                <span className="flex items-center gap-2 bg-secondary/50 px-2 py-0.5 rounded-full border border-border">
                  👤 {cashierName}
                  <button
                    onClick={() => setShowChangeCashierModal(true)}
                    className="text-primary hover:text-accent font-black underline"
                  >
                    Cambiar
                  </button>
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {activeTab && (
            <div className="hidden md:block">
               <CurrencyCalculator totalUsd={Number(activeTab.balanceDue.toFixed(2))} onRateUpdated={setExchangeRate} />
            </div>
          )}
          <div className="px-4 py-2 bg-secondary/30 rounded-xl border border-border font-black text-sm tabular-nums text-foreground/70">
            {new Date().toLocaleDateString("es-VE", { timeZone: "America/Caracas" })}
          </div>
        </div>
      </div>

      {/* ── MAIN GRID ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ══ LEFT: TABLE GRID ═══════════════════════════════════════════ */}
        <aside className="w-72 xl:w-80 shrink-0 border-r border-border bg-card/30 flex flex-col overflow-hidden">
          {/* Zone selector */}
          <div className="p-4 border-b border-border space-y-3">
            <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest pl-1">Secciones</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  setIsPickupMode(true);
                  setSelectedTableId("");
                  setSelectedZoneId("");
                }}
                className={`capsula-btn min-h-0 py-3 text-sm ${isPickupMode ? "capsula-btn-primary" : "capsula-btn-secondary"}`}
              >
                🛍️ Venta Directa / Pickup
              </button>
              <div className="flex gap-2">
                {layout?.serviceZones.map((z) => (
                  <button
                    key={z.id}
                    onClick={() => {
                      setIsPickupMode(false);
                      setSelectedZoneId(z.id);
                      setSelectedTableId("");
                    }}
                    className={`flex-1 py-3 rounded-xl text-xs font-black transition-all active:scale-95 ${selectedZoneId === z.id && !isPickupMode ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-card border border-border text-foreground/60 hover:border-primary/50"}`}
                  >
                    {z.zoneType === "BAR" ? "🍺" : "🌿"} {z.name}
                  </button>
                ))}
              </div>
            </div>
            {!layout && !layoutError && (
              <div className="flex-1 text-center text-xs text-slate-500 py-2">Cargando...</div>
            )}
            {layoutError && (
              <button onClick={loadData} className="flex-1 text-xs text-red-400 hover:text-red-300 py-2 text-center">
                ⚠️ Error · Reintentar
              </button>
            )}
          </div>

          {/* Error detail */}
          {layoutError && (
            <div className="px-3 py-2 text-[10px] text-red-400 bg-red-950/30 border-b border-red-900/30">
              {layoutError}
            </div>
          )}

          {/* Table grid */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-3 gap-3">
              {selectedZone?.tablesOrStations.map((table) => {
                const tab = table.openTabs[0];
                const isSelected = table.id === selectedTableId;
                return (
                  <button
                    key={table.id}
                    onClick={() => setSelectedTableId(table.id)}
                    className={`relative aspect-square rounded-2xl flex flex-col items-center justify-center transition-all duration-200 active:scale-90 border-2 ${
                      isSelected
                        ? "border-primary bg-primary/10 shadow-lg shadow-primary/10 z-10"
                        : tab
                          ? "border-emerald-500/50 bg-emerald-500/5"
                          : "border-border bg-card/50 hover:border-primary/30"
                    }`}
                  >
                    <div className={`text-base font-black ${isSelected ? 'text-primary' : tab ? 'text-emerald-500' : 'text-foreground/40'}`}>{table.code}</div>
                    {tab ? (
                      <div className="absolute top-1 right-1 h-3 w-3 bg-emerald-500 rounded-full border-2 border-background animate-pulse"></div>
                    ) : null}
                    {tab && (
                      <div className="mt-1 text-[9px] font-black text-foreground/70 truncate w-full px-1 text-center">
                         ${tab.balanceDue.toFixed(0)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected table info & open tab CTA */}
          {selectedTable && (
            <div className="border-t border-slate-800 p-3 bg-slate-900">
              {!activeTab ? (
                <button
                  onClick={() => setShowOpenTabModal(true)}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-black text-sm transition"
                >
                  + Abrir cuenta en {selectedTable.name}
                </button>
              ) : (
                <div className="space-y-1 text-xs">
                  <div className="font-bold text-emerald-300 truncate">{activeTab.customerLabel}</div>
                  {activeTab.customerPhone && <div className="text-slate-400">📞 {activeTab.customerPhone}</div>}
                  <div className="text-slate-400">
                    Abrió:{" "}
                    <span className="text-white">
                      {activeTab.openedBy.firstName} {activeTab.openedBy.lastName}
                    </span>
                    <span className="text-slate-500"> · {formatTime(activeTab.openedAt)}</span>
                  </div>
                  {activeTab.assignedWaiter && (
                    <div className="text-slate-400">
                      Mesonero: <span className="text-white">{(activeTab as any).waiterLabel || "—"}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </aside>

        {/* ══ CENTER: MENU ════════════════════════════════════════════════ */}
        <main className="flex-1 flex flex-col border-r border-slate-800 bg-slate-950 overflow-hidden">
          {/* Search + Categories */}
          <div className="p-3 border-b border-slate-800 space-y-2 shrink-0">
            {/* Active tab banner */}
            {activeTab ? (
              <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-xl px-3 py-2 text-xs flex items-center justify-between">
                <span className="text-emerald-200">
                  <b>{selectedTable?.name}</b> · {activeTab.customerLabel}
                  {activeTab.customerPhone && <> · {activeTab.customerPhone}</>}
                </span>
                <span className="text-emerald-400 font-black">
                  <PriceDisplay usd={activeTab.balanceDue} rate={exchangeRate} size="sm" />
                </span>
              </div>
            ) : selectedTable ? (
              <div className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-400">
                {selectedTable.name} · Sin cuenta abierta — presiona &quot;Abrir cuenta&quot; para empezar
              </div>
            ) : (
              <div className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-500">
                Selecciona una mesa para empezar
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder={`Buscar producto... ${isPickupMode ? "(Modo Pickup)" : ""}`}
                className={`w-full bg-slate-800 border ${isPickupMode ? "border-indigo-600/50" : "border-slate-700"} rounded-xl py-2 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500`}
              />
              {productSearch && (
                <button
                  onClick={() => setProductSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Categories */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    setSelectedCategory(cat.id);
                    setProductSearch("");
                  }}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition ${selectedCategory === cat.id ? "bg-amber-500 text-black" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Menu items */}
          <div className="flex-1 overflow-y-auto p-4 scroll-smooth">
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredMenuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleAddToCart(item)}
                  disabled={!activeTab && !isPickupMode}
                  className="capsula-card group flex flex-col justify-between p-4 text-left disabled:opacity-30 disabled:grayscale h-32 border-primary/5 hover:border-primary/40"
                >
                  <div className="text-sm font-black text-foreground group-hover:text-primary transition-colors leading-tight line-clamp-2 uppercase tracking-tight">{item.name}</div>
                  <div className="flex items-end justify-between mt-2">
                    <div className="text-xl font-black text-primary">
                      <PriceDisplay usd={item.price} rate={exchangeRate} size="sm" showBs={false} />
                    </div>
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary opacity-0 group-hover:opacity-100 transition-all group-hover:translate-y-[-4px]">
                      ➕
                    </div>
                  </div>
                </button>
              ))}
              {filteredMenuItems.length === 0 && (
                <div className="col-span-full text-center text-slate-500 py-12 text-sm">
                  {productSearch ? `Sin resultados para "${productSearch}"` : "Sin productos en esta categoría"}
                </div>
              )}
            </div>
          </div>
        </main>

        {/* ══ RIGHT: ACCOUNT PANEL ════════════════════════════════════════ */}
        <aside className="w-80 xl:w-96 shrink-0 bg-slate-900/80 flex flex-col overflow-hidden">
          {isPickupMode ? (
            <div className="flex-1 flex flex-col overflow-hidden bg-slate-800/80">
              <div className="p-4 border-b border-indigo-900/50 bg-indigo-900/20 space-y-2 shrink-0">
                <h2 className="font-black text-lg text-indigo-300 flex items-center gap-2">
                  🛍️ Pickup - Venta Directa
                </h2>
                <input
                  type="text"
                  value={pickupCustomerName}
                  onChange={(e) => setPickupCustomerName(e.target.value)}
                  placeholder="Nombre del Cliente..."
                  className="w-full bg-slate-950/50 border border-indigo-500/30 rounded py-2 px-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2 relative">
                {cart.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
                    Carrito vacío
                  </div>
                )}
                {cart.map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-900 p-3 rounded-xl border border-slate-700 flex justify-between shadow-sm"
                  >
                    <div>
                      <div className="font-bold text-sm">
                        <span className="text-indigo-400">x{item.quantity}</span> {item.name}
                      </div>
                      {item.modifiers.length > 0 && (
                        <div className="text-xs text-slate-400 pl-4">
                          {item.modifiers.map((m) => m.name).join(", ")}
                        </div>
                      )}
                      {item.notes && <div className="text-xs text-amber-300 pl-4 italic">&quot;{item.notes}&quot;</div>}
                    </div>
                    <div className="text-right flex flex-col justify-between items-end">
                      <div className="font-bold text-sm leading-none">${item.lineTotal.toFixed(2)}</div>
                      <button
                        onClick={() => setCart((p) => p.filter((_, i) => i !== idx))}
                        className="text-red-400/80 text-xs hover:text-red-300 leading-none"
                      >
                        Borrar
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 bg-slate-900 border-t border-slate-800 space-y-3 shrink-0">
                {/* Descuento */}
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={clearDiscount}
                    className={`py-1.5 text-xs font-bold rounded-lg transition ${discountType === "NONE" ? "bg-slate-500 text-white ring-1 ring-white" : "bg-slate-800 hover:bg-slate-700"}`}
                  >
                    Normal
                  </button>
                  <button
                    onClick={() => isPagoDivisas ? setDiscountType("DIVISAS_33") : undefined}
                    disabled={!isPagoDivisas}
                    title={!isPagoDivisas ? "Solo con Efectivo o Zelle" : ""}
                    className={`py-1.5 text-xs font-bold rounded-lg transition ${discountType === "DIVISAS_33" ? "bg-indigo-600 text-white" : isPagoDivisas ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-slate-800 text-slate-600 cursor-not-allowed opacity-50"}`}
                  >
                    Divisas -33%
                  </button>
                  <button
                    onClick={openCortesiaModal}
                    className={`col-span-2 py-1.5 text-xs font-bold rounded-lg transition ${(discountType === "CORTESIA_100" || discountType === "CORTESIA_PERCENT") ? "bg-purple-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
                  >
                    {(discountType === "CORTESIA_100" || discountType === "CORTESIA_PERCENT")
                      ? `🎁 Cortesía ${discountType === "CORTESIA_PERCENT" ? cortesiaPercentNum + "%" : "100%"}`
                      : "🎁 Cortesía (PIN)"}
                  </button>
                </div>
                {/* Métodos de pago */}
                <div className="grid grid-cols-2 gap-2">
                  {(["CASH", "ZELLE", "CARD", "MOBILE_PAY", "TRANSFER"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setPaymentMethod(m)}
                      className={`py-3 rounded-xl text-[11px] font-black uppercase tracking-tighter transition-all active:scale-95 ${paymentMethod === m ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-card border border-border text-foreground/50"}`}
                    >
                      {PAYMENT_LABELS[m]}
                    </button>
                  ))}
                </div>

                {/* Total calculado pickup */}
                {(() => {
                  const pickupDiscount = discountType === "DIVISAS_33" ? cartTotal / 3
                    : discountType === "CORTESIA_100" ? cartTotal
                    : discountType === "CORTESIA_PERCENT" ? cartTotal * (cortesiaPercentNum / 100)
                    : 0;
                  const pickupTotal = Math.max(0, cartTotal - pickupDiscount);
                  return (
                    <div className="space-y-4 pt-2">
                       <div className="flex items-center gap-2 bg-background border border-border p-1 rounded-2xl">
                        <input
                          type="number"
                          value={amountReceived}
                          onChange={(e) => setAmountReceived(e.target.value)}
                          placeholder={`Recibido...`}
                          className="flex-1 bg-transparent border-none rounded-xl px-4 py-3 text-lg font-black focus:ring-0 placeholder:text-muted-foreground/30"
                        />
                        <div className="pr-4 text-xs font-black text-muted-foreground uppercase">USD</div>
                      </div>
                      
                      <div className="glass-panel p-4 rounded-2xl border-primary/5">
                        <CurrencyCalculator
                          totalUsd={pickupTotal}
                          hasServiceFee={false}
                          onRateUpdated={setExchangeRate}
                          className="w-full justify-center"
                        />
                      </div>

                      <button
                        onClick={handleCheckoutPickup}
                        disabled={cart.length === 0 || isProcessing}
                        className="capsula-btn capsula-btn-primary w-full py-6 text-xl shadow-xl shadow-primary/20"
                      >
                        {isProcessing ? "PROCESANDO..." : `COBRAR $${pickupTotal.toFixed(2)}`}
                      </button>
                    </div>
                  );
                })()}
                {lastPickupOrder && (
                  <button
                    onClick={() => {
                      printReceipt({
                        orderNumber: lastPickupOrder.orderNumber,
                        orderType: "RESTAURANT",
                        date: new Date(),
                        cashierName: cashierName || "Cajera",
                        customerName: lastPickupOrder.customerName,
                        items: lastPickupOrder.items,
                        subtotal: lastPickupOrder.subtotal,
                        discount: lastPickupOrder.discount,
                        discountReason: lastPickupOrder.discount > 0 ? "Descuento aplicado" : undefined,
                        total: lastPickupOrder.total,
                        serviceFee: 0,
                      });
                    }}
                    className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 border border-slate-600 text-sm"
                  >
                    🖨️ Imprimir factura {lastPickupOrder.orderNumber}
                  </button>
                )}
              </div>
            </div>
          ) : !activeTab ? (
            <div className="flex-1 flex items-center justify-center p-6 text-center text-slate-400 text-sm">
              {selectedTable
                ? "Abre una cuenta para gestionar consumos"
                : "Selecciona una mesa o usa Venta Directa (Pickup)"}
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Tab header */}
              <div className="p-3 border-b border-slate-800 bg-slate-900 space-y-1.5 shrink-0">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-black text-base">{activeTab.customerLabel}</div>
                    {activeTab.customerPhone && (
                      <div className="text-xs text-slate-400">📞 {activeTab.customerPhone}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500 uppercase">Saldo</div>
                    <div className="text-xl font-black text-amber-400">
                      <PriceDisplay usd={activeTab.balanceDue} rate={exchangeRate} size="md" showBs={false} />
                    </div>
                  </div>
                </div>
                <div className="text-[10px] text-slate-500 space-y-0.5">
                  <div>
                    🔓 Abrió:{" "}
                    <span className="text-slate-300">
                      {activeTab.openedBy.firstName} {activeTab.openedBy.lastName}
                    </span>{" "}
                    · {formatDateTime(activeTab.openedAt)}
                  </div>
                  {(activeTab as any).waiterLabel && (
                    <div>
                      👤 Mesonero: <span className="text-slate-300">{(activeTab as any).waiterLabel}</span>
                    </div>
                  )}
                  <div>
                    🏷️ {activeTab.tabCode} · {activeTab.guestCount} pax ·{" "}
                    <span className={activeTab.status === "OPEN" ? "text-emerald-400" : "text-amber-400"}>
                      {activeTab.status}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {/* Temporary cart */}
                <div className="rounded-xl border border-slate-700 bg-slate-800 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-400 uppercase">Carrito (nueva tanda)</span>
                    <span className="text-xs font-bold text-amber-400">
                      <PriceDisplay usd={cartTotal} rate={exchangeRate} size="sm" showBs={false} />
                    </span>
                  </div>
                  {cart.length === 0 ? (
                    <div className="text-xs text-slate-500 text-center py-2">Agrega items del menú</div>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {cart.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-xs bg-slate-900 rounded-lg px-2 py-1.5"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">
                              {item.quantity}× {item.name}
                            </div>
                            {item.modifiers.length > 0 && (
                              <div className="text-slate-500 truncate">
                                {item.modifiers.map((m) => m.name).join(", ")}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 ml-2 shrink-0">
                            <span className="text-amber-400 font-bold">${item.lineTotal.toFixed(2)}</span>
                            <button
                              onClick={() => setCart((p) => p.filter((_, i) => i !== idx))}
                              className="text-red-400 hover:text-red-300 text-base leading-none"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={handleSendToTab}
                    disabled={cart.length === 0 || isProcessing}
                    className="mt-2 w-full py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-black transition disabled:opacity-40"
                  >
                    Agregar consumo a la cuenta →
                  </button>
                </div>

                {/* Consumed orders */}
                {activeTab.orders.length > 0 && (
                  <div className="rounded-xl border border-slate-700 bg-slate-800 p-3">
                    <div className="text-xs font-bold text-slate-400 uppercase mb-2">Consumos cargados</div>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {activeTab.orders.map((order) => (
                        <div key={order.id} className="bg-slate-900 rounded-lg p-2">
                          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                            <span>{order.orderNumber}</span>
                            <span className="flex items-center gap-1">
                              {order.createdBy && <span>{order.createdBy.firstName}</span>}·{" "}
                              {formatTime(order.createdAt)}
                            </span>
                          </div>
                          {order.items.map((item) => (
                            <div key={item.id} className="flex items-center justify-between text-xs py-0.5">
                              <span className="text-slate-300 flex-1 truncate">
                                {item.quantity}× {item.itemName}
                              </span>
                              <div className="flex items-center gap-1.5 ml-2 shrink-0">
                                <span className="text-slate-400">${item.lineTotal.toFixed(2)}</span>
                                <button
                                  onClick={() => openRemoveModal(order.id, item)}
                                  className="text-red-500 hover:text-red-400 text-[10px] font-bold border border-red-800/50 rounded px-1 py-0.5 hover:border-red-600"
                                  title="Eliminar (requiere PIN cajera)"
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>
                          ))}
                          <div className="text-right text-[10px] text-amber-400 font-bold mt-1">
                            ${order.total.toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Payment section */}
                <div className="rounded-xl border border-slate-700 bg-slate-800 p-3">
                  <div className="text-xs font-bold text-slate-400 uppercase mb-2">Cobrar cuenta</div>

                  {/* 1. Descuento */}
                  <div className="mb-3">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">1. Descuento</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        onClick={clearDiscount}
                        className={`py-1.5 text-xs font-bold rounded-lg transition ${discountType === "NONE" ? "bg-slate-500 text-white ring-1 ring-white" : "bg-slate-900 text-slate-300 hover:bg-slate-700"}`}
                      >
                        Normal
                      </button>
                      <button
                        onClick={() => isPagoDivisas && setDiscountType("DIVISAS_33")}
                        disabled={!isPagoDivisas}
                        title={!isPagoDivisas ? "Solo con Efectivo o Zelle" : "Descuento por pago en divisas"}
                        className={`py-1.5 text-xs font-bold rounded-lg transition ${discountType === "DIVISAS_33" ? "bg-blue-600 text-white ring-1 ring-white" : isPagoDivisas ? "bg-slate-900 text-slate-300 hover:bg-slate-700" : "bg-slate-900 text-slate-600 cursor-not-allowed opacity-50"}`}
                      >
                        Divisas -33%
                      </button>
                      <button
                        onClick={openCortesiaModal}
                        className={`col-span-2 py-1.5 text-xs font-bold rounded-lg transition ${(discountType === "CORTESIA_100" || discountType === "CORTESIA_PERCENT") ? "bg-purple-600 text-white ring-1 ring-purple-400" : "bg-slate-900 text-slate-300 hover:bg-slate-700"}`}
                      >
                        {(discountType === "CORTESIA_100" || discountType === "CORTESIA_PERCENT")
                          ? `🎁 Cortesía ${discountType === "CORTESIA_PERCENT" ? cortesiaPercentNum + "%" : "100%"} — ${authorizedManager?.name || ""}`
                          : "🎁 Cortesía (PIN)"}
                      </button>
                    </div>
                    {discountType === "DIVISAS_33" && (
                      <p className="text-[10px] text-blue-400 mt-1">
                        Descuento: -${(activeTab.balanceDue / 3).toFixed(2)} → Total: $
                        {((activeTab.balanceDue * 2) / 3).toFixed(2)}
                      </p>
                    )}
                    {(discountType === "CORTESIA_100" || discountType === "CORTESIA_PERCENT") && (
                      <p className="text-[10px] text-purple-400 mt-1">
                        Descuento: -${(activeTab.balanceDue * (cortesiaPercentNum / 100)).toFixed(2)} → Total: ${(activeTab.balanceDue * (1 - cortesiaPercentNum / 100)).toFixed(2)}
                      </p>
                    )}
                  </div>

                  {/* 2. Método de pago */}
                  <div className="mb-3">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">2. Forma de pago</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(["CASH", "ZELLE", "CARD", "MOBILE_PAY", "TRANSFER"] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => setPaymentMethod(m)}
                          className={`py-2 rounded-lg text-xs font-bold transition ${paymentMethod === m ? "bg-amber-500 text-black" : "bg-slate-900 text-slate-300 hover:bg-slate-700"}`}
                        >
                          {PAYMENT_LABELS[m]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Resumen */}
                  {(() => {
                    return (
                      <div className="bg-slate-900 rounded-lg px-3 py-2 mb-2 text-xs space-y-1">
                        <div className="flex justify-between text-slate-400">
                          <span>Saldo</span>
                          <span>${activeTab.balanceDue.toFixed(2)}</span>
                        </div>
                        {discountType === "DIVISAS_33" && (
                          <div className="flex justify-between text-blue-400">
                            <span>Descuento divisas</span>
                            <span>-${(activeTab.balanceDue / 3).toFixed(2)}</span>
                          </div>
                        )}
                        <label className="flex items-center gap-2 mt-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={serviceFeeIncluded}
                            onChange={(e) => setServiceFeeIncluded(e.target.checked)}
                            className="rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500"
                          />
                          <span className="text-slate-300">Incluir 10% servicio</span>
                        </label>
                        <div className="flex justify-between font-bold text-white border-t border-slate-700 pt-1">
                          <span>A cobrar</span>
                          <span>${paymentAmountToCharge.toFixed(2)}</span>
                        </div>
                        {!serviceFeeIncluded && (
                          <div className="flex justify-between text-amber-500/80 text-[10px]">
                            <span>Sin 10% servicio</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <input
                    type="number"
                    value={amountReceived}
                    onChange={(e) => setAmountReceived(e.target.value)}
                    placeholder={`Monto a recibir ($${paymentAmountToCharge.toFixed(2)})`}
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:border-amber-500 focus:outline-none mb-2"
                  />

                  {/* CurrencyCalculator */}
                  <CurrencyCalculator
                    totalUsd={paidAmount > 0 ? paidAmount : paymentAmountToCharge}
                    hasServiceFee={false}
                    onRateUpdated={setExchangeRate}
                    className="w-full justify-center mb-2"
                  />

                  {/* Register payment (requiere PIN) */}
                  <button
                    onClick={() => {
                      setPaymentPin("");
                      setPaymentPinError("");
                      setShowPaymentPinModal(true);
                    }}
                    disabled={paidAmount <= 0 || isProcessing}
                    className="capsula-btn capsula-btn-primary w-full py-5 text-sm shadow-xl shadow-primary/10"
                  >
                    🔐 REGISTRAR PAGO ${paidAmount > 0 ? paidAmount.toFixed(2) : "0.00"}
                  </button>

                  {/* Paid splits */}
                  {activeTab.paymentSplits.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {activeTab.paymentSplits.map((p) => {
                        const hasService = (p.splitLabel || "").includes("| +10% serv");
                        const label = (p.splitLabel || "").replace(" | +10% serv", "");
                        return (
                          <div
                            key={p.id}
                            className="flex justify-between items-center text-[10px] text-slate-400 bg-slate-900 rounded px-2 py-1"
                          >
                            <span>
                              {label}
                              {hasService && (
                                <span className="ml-1 text-emerald-400 font-bold">+10%</span>
                              )}
                            </span>
                            <span className="text-emerald-400 font-bold">${p.paidAmount.toFixed(2)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <p className="mt-2 text-[10px] text-slate-500 text-center">La factura se imprime al registrar el pago. Reimprimir desde Historial de Ventas.</p>
                  {/* Close tab - permitir cerrar cuando no hay consumo (saldo 0) o ya se cobró */}
                  <button
                    onClick={handleCloseTab}
                    disabled={(Number(activeTab.balanceDue ?? 0) > 0.01) || isProcessing}
                    className="mt-2 w-full py-2 border border-slate-600 rounded-lg text-xs font-bold text-slate-300 hover:bg-slate-700 transition disabled:opacity-30"
                  >
                    Cerrar cuenta (saldo ${(Number(activeTab.balanceDue ?? 0)).toFixed(2)})
                  </button>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* MODAL: ABRIR CUENTA                                              */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {showOpenTabModal && selectedTable && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="border-b border-slate-800 p-5 flex items-center justify-between">
              <h3 className="text-lg font-black">Abrir cuenta — {selectedTable.name}</h3>
              <button
                onClick={() => setShowOpenTabModal(false)}
                className="text-slate-400 hover:text-white text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">
                  Nombre del cliente <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={openTabName}
                  onChange={(e) => setOpenTabName(e.target.value)}
                  placeholder="Ej: Juan Pérez"
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">
                  Teléfono del cliente <span className="text-red-400">*</span>
                </label>
                <input
                  type="tel"
                  value={openTabPhone}
                  onChange={(e) => setOpenTabPhone(e.target.value)}
                  placeholder="Ej: 0414-1234567"
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Número de personas</label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setOpenTabGuests(Math.max(1, openTabGuests - 1))}
                      className="w-9 h-9 bg-slate-800 rounded-lg font-bold text-lg"
                    >
                      −
                    </button>
                    <span className="flex-1 text-center font-black text-lg">{openTabGuests}</span>
                    <button
                      onClick={() => setOpenTabGuests(openTabGuests + 1)}
                      className="w-9 h-9 bg-amber-600 rounded-lg font-bold text-lg"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Mesonero asignado</label>
                  <select
                    value={openTabWaiter}
                    onChange={(e) => setOpenTabWaiter(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:border-amber-500 focus:outline-none"
                  >
                    <option value="">— Ninguno —</option>
                    <option value="1">Mesonero 1</option>
                    <option value="2">Mesonero 2</option>
                    <option value="3">Mesonero 3</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="border-t border-slate-800 p-4 flex gap-3">
              <button
                onClick={() => setShowOpenTabModal(false)}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold text-sm transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleOpenTab}
                disabled={isProcessing || !openTabName.trim() || !openTabPhone.trim()}
                className="flex-[2] py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-black text-sm transition disabled:opacity-50"
              >
                {isProcessing ? "Abriendo..." : "✓ Abrir cuenta"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* MODAL: PIN CAJERA — REGISTRAR PAGO                               */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {showPaymentPinModal && activeTab && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="border-b border-slate-800 p-5 flex items-center justify-between">
              <h3 className="text-lg font-black">🔐 Autorizar cobro</h3>
              <button
                onClick={() => setShowPaymentPinModal(false)}
                className="text-slate-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-slate-800 rounded-xl p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Método:</span>
                  <span className="font-bold">{PAYMENT_LABELS[paymentMethod]}</span>
                </div>
                {discountType === "DIVISAS_33" && activeTab && (
                  <div className="flex justify-between text-blue-400 text-xs">
                    <span>Descuento -33.33%:</span>
                    <span>-${(activeTab.balanceDue / 3).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">Monto:</span>
                  <span className="font-black text-emerald-400 text-base">${paidAmount.toFixed(2)}</span>
                </div>
                {exchangeRate && (
                  <div className="flex justify-between text-slate-500 text-xs">
                    <span>Equivalente Bs:</span>
                    <span>Bs. {(paidAmount * exchangeRate).toFixed(2)}</span>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">PIN de cajera / gerente</label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={paymentPin}
                  onChange={(e) => {
                    setPaymentPin(e.target.value);
                    setPaymentPinError("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handlePaymentPinConfirm()}
                  placeholder="••••••"
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-3 text-white text-center text-xl tracking-widest focus:border-amber-500 focus:outline-none"
                />
                {paymentPinError && <p className="text-red-400 text-xs mt-1">{paymentPinError}</p>}
              </div>
            </div>
            <div className="border-t border-slate-800 p-4 flex gap-3">
              <button
                onClick={() => setShowPaymentPinModal(false)}
                className="flex-1 py-3 bg-slate-800 rounded-xl font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handlePaymentPinConfirm}
                disabled={!paymentPin || isProcessing}
                className="flex-[2] py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-black text-sm transition disabled:opacity-50"
              >
                {isProcessing ? "Procesando..." : "✓ Confirmar pago"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* MODAL: CORTESÍA (PIN + PORCENTAJE)                               */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {showCortesiaModal && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-purple-800/60 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="border-b border-slate-800 p-5 flex items-center justify-between">
              <h3 className="text-lg font-black text-purple-300">🎁 Cortesía</h3>
              <button onClick={() => setShowCortesiaModal(false)} className="text-slate-400 hover:text-white text-2xl">×</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">% de Cortesía</label>
                <div className="flex gap-2 mb-2">
                  {["25", "50", "75", "100"].map(v => (
                    <button key={v} onClick={() => setCortesiaPercent(v)}
                      className={`flex-1 py-2 text-sm font-bold rounded-lg transition ${cortesiaPercent === v ? "bg-purple-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
                      {v}%
                    </button>
                  ))}
                </div>
                <input
                  type="number" min="1" max="100"
                  value={cortesiaPercent}
                  onChange={e => setCortesiaPercent(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-white text-center text-lg font-bold focus:border-purple-500 focus:outline-none"
                  placeholder="% personalizado"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">PIN de Gerente / Dueño</label>
                <div className="bg-slate-800 p-3 rounded-xl text-2xl tracking-widest text-center font-mono mb-3 min-h-[3rem]">
                  {cortesiaPin.replace(/./g, "•")}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[1,2,3,4,5,6,7,8,9,0].map(n => (
                    <button key={n} onClick={() => handleCortesiaPinKey(n.toString())}
                      className="bg-slate-700 hover:bg-slate-600 rounded-lg py-3 font-bold text-xl">{n}</button>
                  ))}
                  <button onClick={() => handleCortesiaPinKey("clear")} className="bg-red-900 hover:bg-red-800 rounded-lg py-3 font-bold text-red-200 text-sm">C</button>
                  <button onClick={() => handleCortesiaPinKey("back")} className="bg-slate-600 hover:bg-slate-500 rounded-lg py-3 font-bold">⌫</button>
                </div>
                {cortesiaPinError && <p className="text-red-400 text-xs mt-2 text-center">{cortesiaPinError}</p>}
              </div>
            </div>
            <div className="border-t border-slate-800 p-4 flex gap-3">
              <button onClick={() => setShowCortesiaModal(false)} className="flex-1 py-3 bg-slate-800 rounded-xl font-bold text-sm">Cancelar</button>
              <button onClick={handleCortesiaPinConfirm} disabled={!cortesiaPin} className="flex-[2] py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-xl font-black text-sm transition">
                Aplicar Cortesía
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* MODAL: ELIMINAR ITEM (PIN + JUSTIFICACIÓN)                       */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {showRemoveModal && removeTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-red-900/50 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="border-b border-slate-800 p-5 flex items-center justify-between">
              <h3 className="text-lg font-black text-red-400">🗑️ Eliminar item</h3>
              <button onClick={() => setShowRemoveModal(false)} className="text-slate-400 hover:text-white text-2xl">
                ×
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-red-900/20 border border-red-800/40 rounded-xl p-3 text-sm">
                <div className="font-bold text-white">
                  {removeTarget.qty}× {removeTarget.itemName}
                </div>
                <div className="text-red-400 font-black">−${removeTarget.lineTotal.toFixed(2)}</div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">
                  Justificación <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={removeJustification}
                  onChange={(e) => {
                    setRemoveJustification(e.target.value);
                    setRemoveError("");
                  }}
                  placeholder="Ej: Error de pedido, cliente cambió de opinión..."
                  rows={2}
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm resize-none focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">
                  PIN de cajera / gerente <span className="text-red-400">*</span>
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={removePin}
                  onChange={(e) => {
                    setRemovePin(e.target.value);
                    setRemoveError("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleRemoveItem()}
                  placeholder="••••••"
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-3 text-white text-center text-xl tracking-widest focus:border-red-500 focus:outline-none"
                />
                {removeError && <p className="text-red-400 text-xs mt-1">{removeError}</p>}
              </div>
            </div>
            <div className="border-t border-slate-800 p-4 flex gap-3">
              <button
                onClick={() => setShowRemoveModal(false)}
                className="flex-1 py-3 bg-slate-800 rounded-xl font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleRemoveItem}
                disabled={!removePin || !removeJustification.trim() || isProcessing}
                className="flex-[2] py-3 bg-red-700 hover:bg-red-600 rounded-xl font-black text-sm transition disabled:opacity-50"
              >
                {isProcessing ? "Eliminando..." : "Eliminar item"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* MODAL: MODIFICADORES                                              */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {showModifierModal && selectedItemForModifier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900">
            <div className="border-b border-slate-800 p-5 flex items-start justify-between">
              <div>
                <h3 className="text-xl font-black">{selectedItemForModifier.name}</h3>
                <p className="mt-1 text-lg font-bold text-amber-400">${selectedItemForModifier.price.toFixed(2)}</p>
              </div>
              <button onClick={() => setShowModifierModal(false)} className="text-slate-400 hover:text-white text-2xl">
                ×
              </button>
            </div>

            <div className="space-y-5 p-5">
              {selectedItemForModifier.modifierGroups.map((gr) => {
                const group = gr.modifierGroup;
                const totalSel = currentModifiers
                  .filter((m) => m.groupId === group.id)
                  .reduce((s, m) => s + m.quantity, 0);
                return (
                  <div key={group.id} className="rounded-xl border border-slate-700 bg-slate-800 p-4">
                    <div className="flex justify-between items-center mb-3">
                      <span className="font-bold">
                        {group.name}
                        {group.isRequired && <span className="text-red-400 ml-1 text-xs">*</span>}
                      </span>
                      <span className="text-xs text-slate-400">
                        {totalSel}/{group.maxSelections}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {group.modifiers
                        .filter((m) => m.isAvailable)
                        .map((modifier) => {
                          const sel = currentModifiers.find((m) => m.id === modifier.id && m.groupId === group.id);
                          const qty = sel?.quantity || 0;
                          const isRadio = group.maxSelections === 1;
                          return (
                            <div
                              key={modifier.id}
                              className="flex items-center justify-between rounded-lg bg-slate-900 px-3 py-2"
                            >
                              <div>
                                <div className="text-sm font-medium">{modifier.name}</div>
                                {modifier.priceAdjustment !== 0 && (
                                  <div className="text-xs text-slate-400">+${modifier.priceAdjustment.toFixed(2)}</div>
                                )}
                              </div>
                              {isRadio ? (
                                <button
                                  onClick={() => updateModifierQuantity(group, modifier, 1)}
                                  className={`h-7 w-7 rounded-full border text-sm ${qty > 0 ? "border-amber-500 bg-amber-500 text-black" : "border-slate-500"}`}
                                >
                                  {qty > 0 ? "✓" : ""}
                                </button>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => updateModifierQuantity(group, modifier, -1)}
                                    className="h-8 w-8 rounded-lg bg-slate-700 font-bold"
                                  >
                                    −
                                  </button>
                                  <span className="w-5 text-center font-black text-amber-400">{qty}</span>
                                  <button
                                    onClick={() => updateModifierQuantity(group, modifier, 1)}
                                    className="h-8 w-8 rounded-lg bg-amber-600 font-bold"
                                  >
                                    +
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                );
              })}

              <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
                <label className="block text-xs font-bold text-slate-400 mb-2">Notas</label>
                <textarea
                  value={itemNotes}
                  onChange={(e) => setItemNotes(e.target.value)}
                  className="h-16 w-full resize-none rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                  placeholder="Sin hielo, extra limón..."
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800 p-4">
                <span className="font-bold">Cantidad</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setItemQuantity(Math.max(1, itemQuantity - 1))}
                    className="h-10 w-10 rounded-full bg-slate-700 font-bold text-xl"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-xl font-black">{itemQuantity}</span>
                  <button
                    onClick={() => setItemQuantity(itemQuantity + 1)}
                    className="h-10 w-10 rounded-full bg-amber-600 font-bold text-xl"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-3 border-t border-slate-800 p-5">
              <button
                onClick={() => setShowModifierModal(false)}
                className="flex-1 rounded-xl bg-slate-700 py-3 font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={confirmAddToCart}
                disabled={selectedItemForModifier.modifierGroups.some((g) => !isGroupValid(g.modifierGroup))}
                className="flex-[2] rounded-xl bg-amber-600 hover:bg-amber-500 py-3 font-black transition disabled:opacity-50"
              >
                Agregar al carrito
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
