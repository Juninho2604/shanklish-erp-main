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
  recordCollectiveTipAction,
  modifyTabItemAction,
  validateManagerPinAction,
  getDailyPickupCountAction,
  type CartItem,
  type PaymentLine,
  type ModifyTabItemModification,
} from "@/app/actions/pos.actions";
import MixedPaymentSelector from "@/components/pos/MixedPaymentSelector";
import { getExchangeRateValue } from "@/app/actions/exchange.actions";
import { printKitchenCommand, printReceipt, printVoidKitchenCommand, type VoidKitchenCommandData } from "@/lib/print-command";
import { getPOSConfig } from "@/lib/pos-settings";
import toast from "react-hot-toast";
import { PriceDisplay } from "@/components/pos/PriceDisplay";
import { CurrencyCalculator } from "@/components/pos/CurrencyCalculator";
import { CashierShiftModal } from "@/components/pos/CashierShiftModal";
import { SubAccountPanel } from "@/components/pos/SubAccountPanel";

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
  posGroup?: string | null;
  posSubcategory?: string | null;
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
  role?: string;
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
  waiterLabel?: string | null;
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
interface PickupTabLocal {
  id: string;
  pickupNumber: string;
  customerName: string;
  customerPhone: string;
  cart: CartItem[];
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
  CASH:          "💵 Cash $",
  CASH_USD:      "💵 Cash $",
  CASH_EUR:      "€ Cash €",
  CASH_BS:       "💴 Efectivo Bs",
  CARD:          "💳 PDV",
  PDV_SHANKLISH: "💳 PDV Shan.",
  PDV_SUPERFERRO:"💳 PDV Super.",
  MOBILE_PAY:    "📱 Pago Móvil",
  MOVIL_NG:      "📱 Pago Móvil NG",
  TRANSFER:      "🏦 Transf.",
  ZELLE:         "⚡ Zelle",
};

/** Métodos donde el cliente paga en Bs — el input acepta Bs y se convierte a USD */
const BS_SINGLE_METHODS = new Set(["PDV_SHANKLISH", "PDV_SUPERFERRO", "MOVIL_NG", "CASH_BS"]);

const SINGLE_PAY_METHODS = ["CASH_USD", "CASH_EUR", "ZELLE", "PDV_SHANKLISH", "PDV_SUPERFERRO", "MOVIL_NG", "CASH_BS"] as const;

/** Métodos donde la cajera debe ingresar el monto manualmente (efectivo, divisas, Bs efectivo).
 *  PDV y MOVIL_NG no necesitan monto — el terminal procesa el monto exacto. */
const METHODS_REQUIRING_AMOUNT = new Set(["CASH_USD", "CASH_EUR", "ZELLE", "CASH_BS"]);
type SinglePayMethod = typeof SINGLE_PAY_METHODS[number];
const CASHIER_ROLES = ["OWNER", "ADMIN_MANAGER", "OPS_MANAGER", "AREA_LEAD"];

function getRoleLabel(role: string) {
  const map: Record<string, string> = {
    OWNER: "Dueño",
    ADMIN_MANAGER: "Gerente Adm.",
    OPS_MANAGER: "Gerente Ops.",
    AREA_LEAD: "Cajera/Líder",
    CHEF: "Cocina",
    WAITER: "Mesonero",
    KITCHEN_CHEF: "Chef Cocina",
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
  const [selectedSubcategory, setSelectedSubcategory] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");

  // ── Zone / Table / Tab selection ──────────────────────────────────────────
  const [selectedZoneId, setSelectedZoneId] = useState("");
  const [selectedTableId, setSelectedTableId] = useState("");

  // ── Mesa selection modal ──────────────────────────────────────────────────
  const [showTableModal, setShowTableModal] = useState(false);

  // ── Open tab form (modal) ─────────────────────────────────────────────────
  const [showOpenTabModal, setShowOpenTabModal] = useState(false);
  const [openTabName, setOpenTabName] = useState("");
  const [openTabGuests, setOpenTabGuests] = useState(2);
  const [openTabWaiter, setOpenTabWaiter] = useState("");

  // ── Cart ──────────────────────────────────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>([]);

  // ── Payment (table mode) ─────────────────────────────────────────────────
  const [paymentMethod, setPaymentMethod] = useState<SinglePayMethod>("CASH_USD");
  const [amountReceived, setAmountReceived] = useState("");
  const [showPaymentPinModal, setShowPaymentPinModal] = useState(false);
  const [paymentPin, setPaymentPin] = useState("");
  const [paymentPinError, setPaymentPinError] = useState("");

  // ── Payment (pickup mode) ────────────────────────────────────────────────
  const [isPickupMixedMode, setIsPickupMixedMode] = useState(false);
  const [mixedPaymentsPickup, setMixedPaymentsPickup] = useState<PaymentLine[]>([]);

  // ── Payment (table / salón mode) ─────────────────────────────────────────
  const [isTableMixedMode, setIsTableMixedMode] = useState(false);
  const [mixedPaymentsTable, setMixedPaymentsTable] = useState<PaymentLine[]>([]);

  // ── Descuento ─────────────────────────────────────────────────────────────
  const [discountType, setDiscountType] = useState<"NONE" | "DIVISAS_33" | "CORTESIA_100" | "CORTESIA_PERCENT">("NONE");
  const [authorizedManager, setAuthorizedManager] = useState<{ id: string; name: string } | null>(null);
  const [showCortesiaModal, setShowCortesiaModal] = useState(false);
  const [cortesiaPin, setCortesiaPin] = useState("");
  const [cortesiaPercent, setCortesiaPercent] = useState("100");
  const [cortesiaPinError, setCortesiaPinError] = useState("");

  // ── 10% Servicio (solo sala principal, opcional) ───────────────────────────
  const [serviceFeeIncluded, setServiceFeeIncluded] = useState(true);

  // ── Modificar ítem enviado (void / ajuste cantidad / reemplazo) ──────────
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{
    orderId: string;
    itemId: string;
    itemName: string;
    quantity: number;
    lineTotal: number;
    modifiers: string[];
  } | null>(null);
  const [removeModType, setRemoveModType] = useState<"VOID" | "ADJUST_QTY" | "REPLACE">("VOID");
  const [removeNewQty, setRemoveNewQty] = useState(1);
  const [removeReplaceItemId, setRemoveReplaceItemId] = useState("");
  const [removeReplaceSearch, setRemoveReplaceSearch] = useState("");
  const [removePin, setRemovePin] = useState("");
  const [removeJustification, setRemoveJustification] = useState("");
  const [removeError, setRemoveError] = useState("");

  // ── Modifier modal ────────────────────────────────────────────────────────
  const [showModifierModal, setShowModifierModal] = useState(false);
  const [selectedItemForModifier, setSelectedItemForModifier] = useState<MenuItem | null>(null);
  const [currentModifiers, setCurrentModifiers] = useState<SelectedModifier[]>([]);
  const [itemQuantity, setItemQuantity] = useState(1);
  const [itemNotes, setItemNotes] = useState("");
  const [itemTakeaway, setItemTakeaway] = useState(false);

  // ── State flags ───────────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [layoutError, setLayoutError] = useState("");

  const [mobileTab, setMobileTab] = useState<"tables" | "menu" | "account">("tables");
  const cartBadgeCount = cart.length;

  // ── Nueva Funcionalidad: Cajero y Pickup ──────────────────────────────────
  const [cashierName, setCashierName] = useState("");
  const [showChangeCashierModal, setShowChangeCashierModal] = useState(false);
  const [isPickupMode, setIsPickupMode] = useState(false);

  // ── Pickup Tabs (múltiples pickups simultáneos como mesas virtuales) ───────
  const [pickupTabs, setPickupTabs] = useState<PickupTabLocal[]>([]);
  const [activePickupTabId, setActivePickupTabId] = useState<string | null>(null);
  const [showPickupOpenModal, setShowPickupOpenModal] = useState(false);
  const [newPickupNumber, setNewPickupNumber] = useState("");
  const [newPickupName, setNewPickupName] = useState("");
  const [newPickupPhone, setNewPickupPhone] = useState("");

  // ── Subcuentas ────────────────────────────────────────────────────────────
  const [subAccountMode, setSubAccountMode] = useState(false);
  const [pickupCustomerName, setPickupCustomerName] = useState("");
  const [checkoutTip, setCheckoutTip] = useState(''); // propina en el momento del cobro

  // ── Propina colectiva ─────────────────────────────────────────────────────
  const [showTipModal, setShowTipModal] = useState(false);
  const [tipAmount, setTipAmount] = useState('');
  const [tipMethod, setTipMethod] = useState<string>('CASH_USD');
  const [tipTableRef, setTipTableRef] = useState('');
  const [isTipProcessing, setIsTipProcessing] = useState(false);

  const [lastPickupOrder, setLastPickupOrder] = useState<{
    orderNumber: string;
    pickupNumber?: string;
    total: number;
    subtotal: number;
    discount: number;
    hideDiscount: boolean;
    items: { name: string; quantity: number; unitPrice: number; total: number; modifiers: string[] }[];
    customerName: string;
  } | null>(null);

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  const loadData = async (showSpinner = true) => {
    if (showSpinner) setIsLoading(true);
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
      if (showSpinner) setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!isDivisasMethod(paymentMethod) && discountType === "DIVISAS_33") {
      setDiscountType("NONE");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMethod, discountType]);

  useEffect(() => {
    if (!selectedCategory || !categories.length) return;
    const cat = categories.find((c) => c.id === selectedCategory);
    setMenuItems(cat?.items || []);
    setSelectedSubcategory("");
    setSelectedGroup("");
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

  const activePickupTab = useMemo(
    () => pickupTabs.find((t) => t.id === activePickupTabId) ?? null,
    [pickupTabs, activePickupTabId],
  );

  const allMenuItems = useMemo(
    () => categories.flatMap((c) => (c.items || [])),
    [categories],
  );

  const filteredMenuItems = useMemo(() => {
    if (!productSearch.trim()) return menuItems;
    const q = productSearch.toLowerCase();
    return allMenuItems.filter((i) => i.name.toLowerCase().includes(q) || i.sku?.toLowerCase().includes(q));
  }, [menuItems, productSearch, allMenuItems]);

  // ── POS Hierarchical Navigation ───────────────────────────────────────────
  // Items after subcategory filter (used to compute groups + singles)
  const subcatFilteredItems = useMemo(() => {
    if (!selectedSubcategory) return menuItems;
    return menuItems.filter((i) => i.posSubcategory === selectedSubcategory);
  }, [menuItems, selectedSubcategory]);

  // Unique subcategory labels in current category
  const subcategories = useMemo(() => {
    const subcats = menuItems.map((i) => i.posSubcategory).filter(Boolean) as string[];
    return Array.from(new Set(subcats));
  }, [menuItems]);

  // Unique group labels after subcategory filter
  const groupsInView = useMemo(() => {
    const groups = subcatFilteredItems.map((i) => i.posGroup).filter(Boolean) as string[];
    return Array.from(new Set(groups));
  }, [subcatFilteredItems]);

  const cartTotal = cart.reduce((s, i) => s + i.lineTotal, 0);
  const rawAmount = parseFloat(amountReceived) || 0;
  /** Si el método es Bs (PDV, Móvil, Efectivo Bs) el input está en Bs → convertir a USD */
  const isBsPayMethod = BS_SINGLE_METHODS.has(paymentMethod);
  const paidAmount = isBsPayMethod && exchangeRate && rawAmount > 0
    ? rawAmount / exchangeRate
    : rawAmount;
  // Divisas methods: CASH, CASH_USD, CASH_EUR, ZELLE get 33.33% discount
  const roundToWhole = (amount: number, method: string): number =>
    (method === 'CASH_USD' || method === 'ZELLE' || method === 'CASH_BS') ? Math.round(amount) : amount;
  const isDivisasMethod = (m: string) => m === "CASH" || m === "CASH_USD" || m === "CASH_EUR" || m === "ZELLE";
  // isPagoDivisas: used by TABLE mode (registerOpenTabPaymentAction)
  const isPagoDivisas = isDivisasMethod(paymentMethod);
  // isPagoDivisasPickup: single mode → method CASH/ZELLE; mixed mode → at least one USD line
  const isPagoDivisasPickup = isPickupMixedMode
    ? mixedPaymentsPickup.some(p => isDivisasMethod(p.method))
    : isDivisasMethod(paymentMethod);
  const divisasUsdAmountPickup = isPickupMixedMode
    ? mixedPaymentsPickup.filter(p => isDivisasMethod(p.method)).reduce((s, p) => s + p.amountUSD, 0)
    : undefined;
  const totalMixedPickupPaid = mixedPaymentsPickup.reduce((s, p) => s + p.amountUSD, 0);

  // In TABLE mixed mode, only the divisas (CASH/CASH_USD/CASH_EUR/ZELLE) lines get the -33% discount
  const divisasUsdAmountTable = isTableMixedMode
    ? mixedPaymentsTable.filter(p => isDivisasMethod(p.method)).reduce((s, p) => s + p.amountUSD, 0)
    : 0;
  /** Suma total ingresada en el MixedPaymentSelector de mesa */
  const totalMixedTablePaid = mixedPaymentsTable.reduce((s, p) => s + p.amountUSD, 0);

  const cortesiaPercentNum = Math.min(100, Math.max(0, parseFloat(cortesiaPercent) || 0));

  const paymentBaseAmount = activeTab
    ? discountType === "DIVISAS_33"
      ? isTableMixedMode
        ? activeTab.balanceDue - divisasUsdAmountTable / 3   // partial: only USD lines get -33%
        : (activeTab.balanceDue * 2) / 3                     // full: entire balance -33%
      : discountType === "CORTESIA_100"
      ? 0
      : discountType === "CORTESIA_PERCENT"
      ? activeTab.balanceDue * (1 - cortesiaPercentNum / 100)
      : activeTab.balanceDue
    : 0;
  // En modo mixto NO se redondea: el target del MixedPaymentSelector debe ser el monto exacto
  // (PDV/Bs methods no se redondean; aplicar roundToWhole del single-method causaría underpay/overpay)
  const paymentAmountToCharge = isTableMixedMode
    ? (serviceFeeIncluded ? paymentBaseAmount * 1.1 : paymentBaseAmount)
    : roundToWhole(serviceFeeIncluded ? paymentBaseAmount * 1.1 : paymentBaseAmount, paymentMethod);

  // ============================================================================
  // OPEN TAB
  // ============================================================================

  const handleOpenTab = async () => {
    if (!selectedTable) return;
    setIsProcessing(true);
    try {
      const selectedWaiter = users.find((u) => u.id === openTabWaiter);
      const result = await openTabAction({
        tableOrStationId: selectedTable.id,
        customerLabel: openTabName.trim() || "Cliente",
        guestCount: openTabGuests,
        waiterLabel: selectedWaiter
          ? `${selectedWaiter.firstName} ${selectedWaiter.lastName}`
          : undefined,
      });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      setShowOpenTabModal(false);
      setOpenTabName("");
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
    setItemTakeaway(false);
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
        takeaway: itemTakeaway || undefined,
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
        toast.error(result.message);
        return;
      }
      if (result.data?.kitchenStatus === "SENT" && getPOSConfig().printComandaOnRestaurant) {
        printKitchenCommand({
          orderNumber: result.data.orderNumber,
          orderType: "RESTAURANT",
          tableName: selectedTable?.name ?? null,
          customerName: activeTab.customerLabel || null,
          waiterLabel: activeTab.waiterLabel || null,
          items: cart.map((i) => ({
            name: i.name,
            quantity: i.quantity,
            modifiers: i.modifiers.map((m) => m.name),
            notes: i.notes,
            takeaway: i.takeaway,
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
  // RESET TABLE STATE — limpia estado dependiente de la mesa activa
  // Llamar al cambiar de mesa, zona o modo pickup para evitar contaminación
  // ============================================================================

  const resetTableState = () => {
    setCart([]);
    setDiscountType("NONE");
    setAuthorizedManager(null);
    setMixedPaymentsTable([]);
    setIsTableMixedMode(false);
    setCortesiaPercent("100");
    setAmountReceived("");
    setSubAccountMode(false);
    setCheckoutTip("");
  };

  // ============================================================================
  // PICKUP TABS — Gestión de múltiples pickups simultáneos
  // ============================================================================

  /** Guarda el carrito actual en el pickup tab activo antes de cambiar de contexto */
  const saveActivePickupCart = (currentCart: CartItem[]) => {
    if (!activePickupTabId) return;
    setPickupTabs((prev) =>
      prev.map((t) => (t.id === activePickupTabId ? { ...t, cart: currentCart } : t)),
    );
  };

  /** Abre el modal para crear un nuevo pickup tab.
   *  Consulta el backend para obtener el número de pickup secuencial del día. */
  const openPickupModal = async () => {
    setNewPickupNumber("PK-…");   // placeholder mientras carga
    setNewPickupName("");
    setNewPickupPhone("");
    setShowPickupOpenModal(true);
    // Pasar los números de los tabs abiertos en memoria para que la action
    // pueda buscar el primer hueco combinando BD + estado local.
    const openNumbers = pickupTabs.map((t) => t.pickupNumber);
    const res = await getDailyPickupCountAction(openNumbers);
    setNewPickupNumber(res.nextNumber);
  };

  /** Confirma creación de un nuevo pickup tab */
  const handleCreatePickupTab = () => {
    // Guardar carrito del tab activo antes de cambiar
    if (isPickupMode && activePickupTabId) {
      saveActivePickupCart(cart);
    }
    const newTab: PickupTabLocal = {
      id: crypto.randomUUID(),
      pickupNumber: newPickupNumber.trim() || `PK-${(pickupTabs.length + 1).toString().padStart(2, "0")}`,
      customerName: newPickupName.trim(),
      customerPhone: newPickupPhone.trim(),
      cart: [],
    };
    setPickupTabs((prev) => [...prev, newTab]);
    setActivePickupTabId(newTab.id);
    setPickupCustomerName(newTab.customerName);
    setCart([]);
    setDiscountType("NONE");
    setAuthorizedManager(null);
    // Limpiar monto y propina al abrir nuevo tab — evita arrastre entre tabs
    setAmountReceived("");
    setCheckoutTip("");
    setIsPickupMixedMode(false);
    setMixedPaymentsPickup([]);
    setIsPickupMode(true);
    setSelectedTableId("");
    setSelectedZoneId("");
    setShowPickupOpenModal(false);
  };

  /** Cambia al pickup tab seleccionado, guardando el carrito del activo */
  const handleSelectPickupTab = (tabId: string) => {
    if (activePickupTabId === tabId) return;
    // Guardar carrito actual
    if (isPickupMode && activePickupTabId) {
      saveActivePickupCart(cart);
    }
    const tab = pickupTabs.find((t) => t.id === tabId);
    if (!tab) return;
    setCart(tab.cart);
    setActivePickupTabId(tabId);
    setPickupCustomerName(tab.customerName);
    setDiscountType("NONE");
    setAuthorizedManager(null);
    // Limpiar monto y propina al cambiar de tab — evita arrastre entre tabs
    setAmountReceived("");
    setCheckoutTip("");
    setIsPickupMixedMode(false);
    setMixedPaymentsPickup([]);
    setIsPickupMode(true);
    setSelectedTableId("");
    setSelectedZoneId("");
  };

  /** Elimina un pickup tab (sin cobrar — descartado) */
  const handleDiscardPickupTab = (tabId: string) => {
    const remaining = pickupTabs.filter((t) => t.id !== tabId);
    setPickupTabs(remaining);
    if (activePickupTabId === tabId) {
      if (remaining.length > 0) {
        const next = remaining[remaining.length - 1];
        setCart(next.cart);
        setActivePickupTabId(next.id);
        setPickupCustomerName(next.customerName);
      } else {
        setActivePickupTabId(null);
        setIsPickupMode(false);
        resetTableState();
      }
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
    const effectiveAmount = isTableMixedMode
      ? mixedPaymentsTable.reduce((s, p) => s + p.amountUSD, 0)
      : paidAmount; // paidAmount already in USD (Bs methods auto-converted above)
    if (!activeTab || effectiveAmount <= 0) return;
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
        if (isTableMixedMode) {
          discountAmount = divisasUsdAmountTable / 3;
          discountLabel = ` · Divisas sobre $${divisasUsdAmountTable.toFixed(2)}`;
        } else {
          discountAmount = activeTab.balanceDue / 3;
          discountLabel = " · -33.33% Divisas";
        }
      } else if (discountType === "CORTESIA_100") {
        discountAmount = activeTab.balanceDue;
        discountLabel = " · Cortesía 100%";
      } else if (discountType === "CORTESIA_PERCENT") {
        discountAmount = activeTab.balanceDue * (cortesiaPercentNum / 100);
        discountLabel = ` · Cortesía ${cortesiaPercentNum}%`;
      }
      const effectiveMethod = isTableMixedMode
        ? (mixedPaymentsTable.length === 1 ? mixedPaymentsTable[0].method as typeof paymentMethod : "CASH_USD")
        : paymentMethod;
      const effectiveLabel = isTableMixedMode
        ? `Pago Mixto${discountLabel} – ${pinResult.data?.managerName || ""}`
        : `${PAYMENT_LABELS[paymentMethod] || paymentMethod}${discountLabel} – ${pinResult.data?.managerName || ""}`;
      const result = await registerOpenTabPaymentAction({
        openTabId: activeTab.id,
        amount: effectiveAmount,
        paymentMethod: effectiveMethod,
        splitLabel: effectiveLabel,
        discountAmount: discountAmount > 0 ? discountAmount : undefined,
        serviceFeeIncluded,
      });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      // Imprimir factura: correlativo fijo por mesa (tabCode), 10% servicio solo si el cliente lo pagó
      const subtotal = activeTab.runningTotal;
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
      // Calcular propina antes de imprimir para incluirla en el recibo
      const tipVal = parseFloat(checkoutTip) || 0;
      if (getPOSConfig().printReceiptOnRestaurant) {
      printReceipt({
        orderNumber: activeTab.tabCode,
        orderType: "RESTAURANT",
        date: new Date(),
        cashierName: cashierName || pinResult.data?.managerName || "Cajera",
        customerName: activeTab.customerLabel,
        tableLabel: selectedTable?.name,
        items: allItems,
        subtotal,
        discount,
        hideDiscount: discountType === "DIVISAS_33",
        discountReason: discountType === "CORTESIA_100" ? 'Cortesía Autorizada (100%)'
            : discountType === "CORTESIA_PERCENT" ? `Cortesía Autorizada (${cortesiaPercentNum}%)`
            : undefined,
        total: totalAntesServicio,
        serviceFee,
        tipAmount: tipVal > 0 ? tipVal : undefined,
      });
      }
      // Registrar propina si la cajera la capturó durante el cobro
      // (tipVal ya calculado arriba)
      if (tipVal > 0) {
        await recordCollectiveTipAction({
          tipAmount: tipVal,
          paymentMethod: effectiveMethod,
          note: `Propina colectiva — Mesa/Ref: ${activeTab.customerLabel}`,
        });
      }
      setAmountReceived("");
      setPaymentPin("");
      setCheckoutTip('');
      clearDiscount();
      setServiceFeeIncluded(true);
      setShowPaymentPinModal(false);
      setIsTableMixedMode(false);
      setMixedPaymentsTable([]);
      await loadData();
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrintPrecuenta = () => {
    if (!activeTab) return;
    const allItems = activeTab.orders.flatMap((order) =>
      (order.items || []).map((item) => ({
        name: item.itemName,
        quantity: item.quantity,
        unitPrice: item.lineTotal / Math.max(1, item.quantity),
        total: item.lineTotal,
        modifiers: ((item as any).modifiers || [])
          .map((m: any) => (typeof m === "string" ? m : m?.name))
          .filter(Boolean) as string[],
      }))
    );
    // Use runningTotal as base — balanceDue decrements with partial payments, causing
    // a false "discount" line when items sum doesn't match the printed subtotal.
    const base = activeTab.runningTotal;
    const discountAmt =
      discountType === "DIVISAS_33"
        ? (isTableMixedMode ? divisasUsdAmountTable / 3 : base / 3)  // partial vs full
        : discountType === "CORTESIA_100" ? base
        : discountType === "CORTESIA_PERCENT" ? base * (cortesiaPercentNum / 100)
        : 0;
    const afterDiscount = base - discountAmt;
    const svcFee = serviceFeeIncluded ? afterDiscount * 0.1 : 0;
    const precuentaTotal = afterDiscount + svcFee;
    const discountReason =
      discountType === "DIVISAS_33"
        ? (isTableMixedMode && divisasUsdAmountTable > 0 && divisasUsdAmountTable < base - 0.01
            ? `Pago Mixto Divisas (33.33% sobre $${divisasUsdAmountTable.toFixed(2)})`
            : 'Pago en Divisas (33.33%)')
        : discountType === "CORTESIA_100" ? "Cortesía Autorizada (100%)"
        : discountType === "CORTESIA_PERCENT" ? `Cortesía Autorizada (${cortesiaPercentNum}%)`
        : undefined;
    printReceipt({
      orderNumber: activeTab.tabCode,
      orderType: "RESTAURANT",
      date: new Date(),
      cashierName: cashierName || "Cajera",
      customerName: activeTab.customerLabel || undefined,
      customerPhone: activeTab.customerPhone || undefined,
      tableLabel: selectedTable?.name,
      items: allItems,
      subtotal: base,
      discount: discountAmt > 0 ? discountAmt : undefined,
      discountReason,
      serviceFee: svcFee > 0 ? svcFee : undefined,
      total: afterDiscount,  // printReceipt suma serviceFee internamente para el total final
      isPrecuenta: true,
    });
  };

  const handleCloseTab = async () => {
    if (!activeTab) return;
    const balance = Number(activeTab.balanceDue ?? 0);
    if (balance > 0.01) {
      toast.error("La cuenta aún tiene saldo pendiente");
      return;
    }
    if (!confirm("¿Cerrar esta cuenta?")) return;
    setIsProcessing(true);
    try {
      const result = await closeOpenTabAction(activeTab.id);
      if (!result.success) {
        toast.error(result.message);
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

  const handleRecordTip = async () => {
    const amount = parseFloat(tipAmount);
    if (!amount || amount <= 0) return;
    setIsTipProcessing(true);
    try {
      const note = tipTableRef.trim()
        ? `Propina colectiva — Mesa/Ref: ${tipTableRef.trim()}`
        : 'Propina colectiva';
      const isBsMethod = ['CASH_BS', 'PDV_SHANKLISH', 'PDV_SUPERFERRO', 'MOVIL_NG'].includes(tipMethod);
      // Si el monto está en Bs, convertir a USD antes de guardar en BD
      const tipAmountUSD = isBsMethod && exchangeRate ? Math.round(amount / exchangeRate * 100) / 100 : amount;
      const result = await recordCollectiveTipAction({ tipAmount: tipAmountUSD, paymentMethod: tipMethod, note });
      if (result.success) {
        const displayStr = isBsMethod
          ? `Bs ${amount.toFixed(2)} ($${tipAmountUSD.toFixed(2)}) registrada`
          : `$${amount.toFixed(2)} registrada`;
        toast.success(`Propina de ${displayStr}`);
        setShowTipModal(false);
        setTipAmount('');
        setTipMethod('CASH_USD');
        setTipTableRef('');
      } else {
        toast.error(result.message || 'Error al registrar propina');
      }
    } finally {
      setIsTipProcessing(false);
    }
  };

  const handleCheckoutPickup = async () => {
    if (cart.length === 0) return;
    setIsProcessing(true);
    try {
      // Snapshot del tab activo tomado antes de cualquier await — el estado puede
      // cambiar durante la operación asíncrona (p.ej. otro tab se cierra).
      const activeTabSnap = pickupTabs.find((t) => t.id === activePickupTabId);

      const rc = (n: number) => Math.round(n * 100) / 100;
      const pickupDiscount = discountType === "DIVISAS_33"
        ? rc(isPickupMixedMode && divisasUsdAmountPickup != null
            ? divisasUsdAmountPickup / 3            // partial: only divisas portion gets -33%
            : cartTotal / 3)                        // full: entire order in USD
        : discountType === "CORTESIA_100" ? rc(cartTotal)
        : discountType === "CORTESIA_PERCENT" ? rc(cartTotal * (cortesiaPercentNum / 100))
        : 0;
      const finalTotal = roundToWhole(Math.max(0, cartTotal - pickupDiscount), paymentMethod);

      const result = await createSalesOrderAction({
        orderType: "RESTAURANT",
        customerName: pickupCustomerName || "Cliente en Caja",
        items: cart,
        ...(isPickupMixedMode
          ? { payments: mixedPaymentsPickup.length > 0 ? mixedPaymentsPickup : [{ method: "CASH", amountUSD: finalTotal }],
              amountPaid: totalMixedPickupPaid || finalTotal,
              divisasUsdAmount: discountType === "DIVISAS_33" ? divisasUsdAmountPickup : undefined }
          : isBsPayMethod && exchangeRate && rawAmount > 0
            ? { payments: [{ method: paymentMethod, amountUSD: paidAmount || finalTotal, amountBS: rawAmount, exchangeRate }],
                amountPaid: paidAmount || finalTotal }
            : { paymentMethod, amountPaid: paidAmount || finalTotal,
                tipAtCheckout: parseFloat(checkoutTip) > 0 ? parseFloat(checkoutTip) : undefined }),
        // El PK number se incrusta en notes para que getDailyPickupCountAction
        // pueda recuperarlo y detectar huecos en la numeración del día.
        notes: activeTabSnap?.pickupNumber
          ? `Venta Directa Pickup | ${activeTabSnap.pickupNumber}`
          : "Venta Directa Pickup",
        discountType,
        discountPercent: discountType === "CORTESIA_PERCENT" ? cortesiaPercentNum : undefined,
        authorizedById: authorizedManager?.id,
      });

      if (result.success && result.data) {
        if (getPOSConfig().printComandaOnRestaurant) {
        printKitchenCommand({
          orderNumber: result.data.orderNumber,
          orderType: "RESTAURANT",
          tableName: null,
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
        const discountReason = discountType === "CORTESIA_100" ? 'Cortesía Autorizada (100%)'
            : discountType === "CORTESIA_PERCENT" ? `Cortesía Autorizada (${cortesiaPercentNum}%)`
            : undefined;
        const pickupReceiptItems = cart.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          total: i.lineTotal,
          modifiers: i.modifiers.map((m) => m.name),
        }));
        const pickupTipVal = parseFloat(checkoutTip) || 0;
        const pickupReceiptData = {
          orderNumber: result.data.orderNumber,
          orderType: "RESTAURANT" as const,
          date: new Date(),
          cashierName: cashierName || "Cajera",
          customerName: activeTabSnap?.customerName || pickupCustomerName || "Cliente en Caja",
          // tableLabel reutiliza la infraestructura de impresión para mostrar PK-02
          // en el recibo bajo el correlativo REST-XXXXX; tableLabelTitle lo etiqueta correctamente.
          tableLabel: activeTabSnap?.pickupNumber,
          tableLabelTitle: activeTabSnap?.pickupNumber ? "Pickup" : undefined,
          items: pickupReceiptItems,
          subtotal,
          discount,
          discountReason,
          hideDiscount: discountType === "DIVISAS_33",
          total: finalTotal,
          serviceFee: 0,
          tipAmount: pickupTipVal > 0 ? pickupTipVal : undefined,
        };
        if (getPOSConfig().printReceiptOnRestaurant) {
          printReceipt(pickupReceiptData);
        }
        setLastPickupOrder({
          orderNumber: result.data.orderNumber,
          pickupNumber: activeTabSnap?.pickupNumber,
          total: finalTotal,
          subtotal,
          discount,
          hideDiscount: discountType === "DIVISAS_33",
          items: pickupReceiptItems,
          customerName: activeTabSnap?.customerName || pickupCustomerName || "Cliente en Caja",
        });

        // Eliminar el pickup tab completado y cambiar al siguiente (si existe)
        const completedTabId = activePickupTabId;
        const remaining = pickupTabs.filter((t) => t.id !== completedTabId);
        setPickupTabs(remaining);
        if (remaining.length > 0) {
          const next = remaining[remaining.length - 1];
          setCart(next.cart);
          setActivePickupTabId(next.id);
          setPickupCustomerName(next.customerName);
        } else {
          setCart([]);
          setActivePickupTabId(null);
          // Keep isPickupMode=true so the reprint button remains visible in the panel.
          // The user exits pickup mode by clicking a zone button in the left column.
          setPickupCustomerName("");
        }
        setMixedPaymentsPickup([]); setIsPickupMixedMode(false);
        setCheckoutTip('');
        clearDiscount();
      } else {
        toast.error(result.message);
      }
    } catch (e) {
      console.error(e);
      toast.error("Error en Venta Directa");
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
      quantity: item.quantity,
      lineTotal: item.lineTotal,
      modifiers: (item.modifiers ?? []).map((m) => m.name),
    });
    setRemoveModType("VOID");
    setRemoveNewQty(Math.max(1, item.quantity - 1));
    setRemoveReplaceItemId("");
    setRemoveReplaceSearch("");
    setRemovePin("");
    setRemoveJustification("");
    setRemoveError("");
    setShowRemoveModal(true);
  };

  const handleRemoveItem = async () => {
    if (!removeTarget || !activeTab) return;
    if (!removeJustification.trim()) { setRemoveError("El motivo es obligatorio"); return; }
    if (!removePin.trim()) { setRemoveError("Ingresa el PIN de capitán o gerente"); return; }
    if (removeModType === "ADJUST_QTY" && (removeNewQty < 1 || removeNewQty >= removeTarget.quantity)) {
      setRemoveError(`La cantidad debe ser entre 1 y ${removeTarget.quantity - 1}`); return;
    }
    if (removeModType === "REPLACE" && !removeReplaceItemId) {
      setRemoveError("Selecciona el producto de reemplazo"); return;
    }

    const modification: ModifyTabItemModification =
      removeModType === "VOID"       ? { type: "VOID" } :
      removeModType === "ADJUST_QTY" ? { type: "ADJUST_QTY", newQuantity: removeNewQty } :
                                       { type: "REPLACE", newMenuItemId: removeReplaceItemId };

    setIsProcessing(true);
    setRemoveError("");
    try {
      const result = await modifyTabItemAction({
        openTabId: activeTab.id,
        orderId: removeTarget.orderId,
        itemId: removeTarget.itemId,
        captainPin: removePin,
        reason: removeJustification,
        modification,
      });
      if (!result.success) { setRemoveError(result.message); return; }
      setShowRemoveModal(false);
      if (result.data?.kitchenPrintData) {
        printVoidKitchenCommand(result.data.kitchenPrintData as VoidKitchenCommandData);
      }
      await loadData(false);
    } finally {
      setIsProcessing(false);
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🍸</div>
          <div className="text-xl font-bold text-foreground">Cargando Restaurante...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col pb-16 lg:pb-0">
      <CashierShiftModal
        forceOpen={showChangeCashierModal}
        onShiftOpen={(name) => {
          setCashierName(name);
          setShowChangeCashierModal(false);
        }}
      />

      {/* ── MODAL: PROPINA COLECTIVA ─────────────────────────────────────── */}
      {showTipModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-md z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-card glass-panel w-full max-w-sm rounded-3xl shadow-2xl border border-amber-500/20 p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-black uppercase tracking-tight text-amber-400">Propina Colectiva</h3>
              <button type="button" onClick={() => setShowTipModal(false)} className="text-muted-foreground hover:text-foreground text-2xl leading-none">×</button>
            </div>
            <p className="text-xs text-muted-foreground">Propina recibida después del cobro. Indica la mesa o cliente para trazabilidad.</p>
            {/* Mesa / referencia */}
            <input
              type="text"
              value={tipTableRef}
              onChange={e => setTipTableRef(e.target.value)}
              placeholder="Mesa o cliente (ej: Mesa 5, Juan Pérez)"
              className="w-full bg-background border border-border rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-amber-500/50 placeholder:text-muted-foreground/40"
            />
            {/* Method */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'CASH_USD',       label: '💵 Cash $' },
                { id: 'CASH_EUR',       label: '€ Cash €' },
                { id: 'ZELLE',          label: '⚡ Zelle' },
                { id: 'PDV_SHANKLISH',  label: '💳 PDV Shan.' },
                { id: 'PDV_SUPERFERRO', label: '💳 PDV Super.' },
                { id: 'MOVIL_NG',       label: '📱 Móvil NG' },
                { id: 'CASH_BS',        label: '💴 Efectivo Bs' },
              ].map(m => (
                <button key={m.id} type="button" onClick={() => setTipMethod(m.id)}
                  className={`py-2 rounded-xl text-xs font-black uppercase transition-all ${tipMethod === m.id ? 'bg-amber-500 text-white' : 'bg-background border border-border text-muted-foreground hover:border-amber-500/50'}`}>
                  {m.label}
                </button>
              ))}
            </div>
            {/* Amount */}
            <div className="flex items-center bg-background border border-border rounded-2xl p-1">
              <span className="pl-4 text-muted-foreground text-sm font-black">
                {['CASH_BS','PDV_SHANKLISH','PDV_SUPERFERRO','MOVIL_NG'].includes(tipMethod) ? 'Bs' : '$'}
              </span>
              <input
                type="number" min="0" step="0.01"
                value={tipAmount}
                onChange={e => setTipAmount(e.target.value)}
                placeholder="0.00"
                className="flex-1 bg-transparent border-none px-3 py-3 text-2xl font-black focus:outline-none placeholder:text-muted-foreground/30"
              />
            </div>
            {['CASH_BS','PDV_SHANKLISH','PDV_SUPERFERRO','MOVIL_NG'].includes(tipMethod) && exchangeRate && (parseFloat(tipAmount) || 0) > 0 && (
              <div className="flex justify-between text-xs px-1">
                <span className="text-muted-foreground">Equivalente USD</span>
                <span className="font-bold text-emerald-400">${((parseFloat(tipAmount) || 0) / exchangeRate).toFixed(2)}</span>
              </div>
            )}
            <button
              type="button"
              onClick={handleRecordTip}
              disabled={isTipProcessing || !(parseFloat(tipAmount) > 0)}
              className="w-full py-4 rounded-2xl bg-amber-500 text-white font-black uppercase text-lg shadow-lg shadow-amber-500/30 disabled:opacity-40 active:scale-95 transition-all"
            >
              {isTipProcessing ? 'Registrando...' : 'Registrar Propina'}
            </button>
          </div>
        </div>
      )}

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <div className="glass-panel px-3 md:px-6 py-3 md:py-4 flex items-center justify-between shrink-0 shadow-lg border-b-primary/10">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 bg-primary/20 rounded-2xl flex items-center justify-center text-3xl shadow-inner">🍸</div>
          <div>
            <h1 className="text-lg md:text-2xl font-black tracking-tight text-gray-950 dark:text-foreground">POS <span className="text-primary italic">RESTAURANTE</span></h1>
            <p className="text-[10px] font-bold text-gray-700 dark:text-muted-foreground uppercase tracking-widest flex items-center gap-2">
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
          <button
            type="button"
            onClick={() => setShowTipModal(true)}
            className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-black uppercase hover:bg-amber-500/20 transition-colors"
          >
            + Propina
          </button>
          <div className="px-4 py-2 bg-secondary/30 rounded-xl border border-border font-black text-sm tabular-nums text-foreground/70">
            {new Date().toLocaleDateString("es-VE", { timeZone: "America/Caracas" })}
          </div>
        </div>
      </div>

      {/* ── MAIN GRID ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* ══ LEFT: TABLE GRID ═══════════════════════════════════════════ */}
        <aside className={`w-full lg:w-64 tablet-land:w-64 xl:w-72 shrink-0 border-r border-border bg-card/30 flex flex-col overflow-hidden ${mobileTab === "tables" ? "flex" : "hidden"} lg:flex absolute lg:relative inset-0 z-10 lg:z-auto`}>
          {/* Zone selector */}
          <div className="p-4 border-b border-border space-y-3">
            <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest pl-1">Secciones</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={openPickupModal}
                className={`capsula-btn min-h-0 py-3 text-sm ${isPickupMode ? "capsula-btn-primary" : "capsula-btn-secondary"}`}
              >
                🛍️ {pickupTabs.length > 0 ? `Nuevo Pickup (${pickupTabs.length} abiertos)` : "Venta Directa / Pickup"}
              </button>

              {/* Lista de pickup tabs abiertos */}
              {pickupTabs.length > 0 && (
                <div className="flex flex-col gap-1">
                  {pickupTabs.map((pt) => (
                    <div key={pt.id} className={`flex items-center gap-1 rounded-xl border text-xs font-bold transition-all ${activePickupTabId === pt.id ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground/70 hover:border-primary/40"}`}>
                      <button
                        className="flex-1 py-2 pl-3 text-left truncate"
                        onClick={() => handleSelectPickupTab(pt.id)}
                      >
                        {pt.pickupNumber}{pt.customerName ? ` · ${pt.customerName}` : ""}
                        <span className="ml-1 font-normal text-muted-foreground">
                          ${pt.cart.reduce((s, i) => s + i.lineTotal, 0).toFixed(2)}
                          {activePickupTabId === pt.id && cart.length > 0 &&
                            ` · ${cart.reduce((s, i) => s + i.lineTotal, 0).toFixed(2)} (activo)`}
                        </span>
                      </button>
                      <button
                        onClick={() => handleDiscardPickupTab(pt.id)}
                        className="px-2 py-2 text-red-400/70 hover:text-red-300 leading-none"
                        title="Descartar pickup"
                      >×</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                {layout?.serviceZones.map((z) => (
                  <button
                    key={z.id}
                    onClick={() => {
                      if (isPickupMode && activePickupTabId) saveActivePickupCart(cart);
                      resetTableState();
                      setIsPickupMode(false);
                      setActivePickupTabId(null);
                      setSelectedZoneId(z.id);
                      setSelectedTableId("");
                    }}
                    className={`flex-1 py-3 rounded-xl text-xs font-black transition-all active:scale-95 ${selectedZoneId === z.id && !isPickupMode ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-card border border-border text-gray-900 dark:text-foreground/60 hover:border-primary/50"}`}
                  >
                    {z.zoneType === "BAR" ? "🍺" : "🌿"} {z.name}
                  </button>
                ))}
              </div>
            </div>
            {!layout && !layoutError && (
              <div className="flex-1 text-center text-xs text-muted-foreground py-2">Cargando...</div>
            )}
            {layoutError && (
              <button onClick={() => loadData()} className="flex-1 text-xs text-red-400 hover:text-red-300 py-2 text-center">
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
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 gap-3">
              {selectedZone?.tablesOrStations.map((table) => {
                const tab = table.openTabs[0];
                const isSelected = table.id === selectedTableId;
                return (
                  <button
                    key={table.id}
                    onClick={() => {
                      if (isPickupMode && activePickupTabId) saveActivePickupCart(cart);
                      resetTableState();
                      setIsPickupMode(false);
                      setActivePickupTabId(null);
                      setSelectedTableId(table.id);
                      setShowTableModal(true);
                    }}
                    className={`relative aspect-square rounded-2xl flex flex-col items-center justify-center transition-all duration-200 active:scale-90 border-2 ${
                      isSelected
                        ? "border-primary bg-primary/10 shadow-lg shadow-primary/10 z-10"
                        : tab
                          ? "border-emerald-500/50 bg-emerald-500/5"
                          : "border-border bg-card/50 hover:border-primary/30"
                    }`}
                  >
                    <div className={`text-sm md:text-base font-black ${isSelected ? 'text-primary' : tab ? 'text-emerald-600' : 'text-gray-900 dark:text-foreground/40'}`}>{table.code}</div>
                    {tab ? (
                      <div className="absolute top-1 right-1 h-3 w-3 bg-emerald-500 rounded-full border-2 border-background animate-pulse"></div>
                    ) : null}
                    {tab && (
                      <div className="mt-1 text-[9px] font-black text-gray-950 dark:text-foreground/70 truncate w-full px-1 text-center">
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
            <div className="border-t border-border p-3 bg-card">
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
                  {activeTab.customerPhone && <div className="text-muted-foreground">📞 {activeTab.customerPhone}</div>}
                  <div className="text-muted-foreground">
                    Abrió:{" "}
                    <span className="text-foreground">
                      {activeTab.openedBy.firstName} {activeTab.openedBy.lastName}
                    </span>
                    <span className="text-muted-foreground"> · {formatTime(activeTab.openedAt)}</span>
                  </div>
                  {activeTab.assignedWaiter && (
                    <div className="text-muted-foreground">
                      Mesonero: <span className="text-foreground">{(activeTab as any).waiterLabel || "—"}</span>
                    </div>
                  )}
                </div>
              )}
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
                <span className="text-emerald-950 dark:text-emerald-200">
                  <b>{selectedTable?.name}</b> · {activeTab.customerLabel}
                  {activeTab.customerPhone && <> · {activeTab.customerPhone}</>}
                </span>
                <span className="text-emerald-400 font-black">
                  <PriceDisplay usd={activeTab.balanceDue} rate={exchangeRate} size="sm" />
                </span>
              </div>
            ) : selectedTable ? (
              <div className="bg-secondary border border-border rounded-xl px-3 py-2 text-xs text-muted-foreground">
                {selectedTable.name} · Sin cuenta abierta — presiona &quot;Abrir cuenta&quot; para empezar
              </div>
            ) : (
              <div className="bg-secondary border border-border rounded-xl px-3 py-2 text-xs text-muted-foreground">
                Selecciona una mesa para empezar
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">🔍</span>
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder={`Buscar producto... ${isPickupMode ? "(Modo Pickup)" : ""}`}
                className={`w-full bg-secondary border ${isPickupMode ? "border-indigo-600/50" : "border-border"} rounded-xl py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500`}
              />
              {productSearch && (
                <button
                  onClick={() => setProductSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
                    setSelectedSubcategory("");
                    setSelectedGroup("");
                    setProductSearch("");
                  }}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition ${selectedCategory === cat.id ? "bg-amber-500 text-black" : "bg-secondary text-foreground/70 hover:bg-muted"}`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Subcategories (Bebidas, etc.) */}
            {!productSearch && subcategories.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                <button
                  onClick={() => { setSelectedSubcategory(""); setSelectedGroup(""); }}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition ${!selectedSubcategory ? "bg-amber-500/20 text-amber-400 border border-amber-500/40" : "bg-secondary text-foreground/50 hover:bg-muted"}`}
                >
                  Todos
                </button>
                {subcategories.map((subcat) => (
                  <button
                    key={subcat}
                    onClick={() => { setSelectedSubcategory(subcat); setSelectedGroup(""); }}
                    className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition ${selectedSubcategory === subcat ? "bg-amber-500/20 text-amber-400 border border-amber-500/40" : "bg-secondary text-foreground/50 hover:bg-muted"}`}
                  >
                    {subcat}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Menu items */}
          <div className="flex-1 overflow-y-auto p-4 scroll-smooth">
            {/* Back button when inside a group */}
            {selectedGroup && !productSearch && (
              <button
                onClick={() => setSelectedGroup("")}
                className="mb-3 flex items-center gap-1.5 text-sm font-bold text-amber-400 hover:text-amber-300 active:scale-95 transition"
              >
                ← {selectedGroup}
              </button>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 tablet-land:grid-cols-4 xl:grid-cols-4 gap-3 md:gap-4">

              {/* ── Group buttons (one per unique posGroup, when no group is selected and not searching) ── */}
              {!selectedGroup && !productSearch && groupsInView.map((group) => {
                const gItems = subcatFilteredItems.filter((i) => i.posGroup === group);
                const prices = gItems.map((i) => i.price);
                const minP = Math.min(...prices);
                const maxP = Math.max(...prices);
                return (
                  <button
                    key={group}
                    onClick={() => setSelectedGroup(group)}
                    disabled={!activeTab && !isPickupMode}
                    className="capsula-card group flex flex-col justify-between p-3 md:p-4 text-left disabled:opacity-30 disabled:grayscale h-28 md:h-32 border-primary/5 hover:border-amber-500/40 active:scale-95 transition-transform bg-white dark:bg-card"
                  >
                    <div className="text-sm font-black text-gray-950 dark:text-foreground group-hover:text-amber-500 transition-colors leading-tight line-clamp-2 uppercase tracking-tight">{group}</div>
                    <div className="flex items-end justify-between mt-2">
                      <div className="text-base font-black text-primary">
                        {minP === maxP ? `$${minP.toFixed(2)}` : `$${minP.toFixed(0)} – $${maxP.toFixed(0)}`}
                      </div>
                      <div className="text-[10px] font-bold text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                        {gItems.length} op →
                      </div>
                    </div>
                  </button>
                );
              })}

              {/* ── Size variant buttons (when inside a group) ── */}
              {selectedGroup && !productSearch && subcatFilteredItems.filter((i) => i.posGroup === selectedGroup).map((item) => {
                const sizeLabel = item.name.replace(new RegExp(selectedGroup.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "").trim() || item.name;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleAddToCart(item)}
                    disabled={!activeTab && !isPickupMode}
                    className="capsula-card group flex flex-col justify-between p-3 md:p-4 text-left disabled:opacity-30 disabled:grayscale h-28 md:h-32 border-primary/5 hover:border-amber-500/40 active:scale-95 transition-transform bg-white dark:bg-card"
                  >
                    <div className="text-lg font-black text-gray-950 dark:text-foreground uppercase tracking-tight">{sizeLabel}</div>
                    <div className="text-xl font-black text-primary mt-auto">
                      <PriceDisplay usd={item.price} rate={exchangeRate} size="sm" showBs={false} />
                    </div>
                  </button>
                );
              })}

              {/* ── Single items (no posGroup) or search results ── */}
              {(productSearch || !selectedGroup) && (productSearch ? filteredMenuItems : subcatFilteredItems.filter((i) => !i.posGroup)).map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleAddToCart(item)}
                  disabled={!activeTab && !isPickupMode}
                  className="capsula-card group flex flex-col justify-between p-3 md:p-4 text-left disabled:opacity-30 disabled:grayscale h-28 md:h-32 border-primary/5 hover:border-primary/40 active:scale-95 transition-transform bg-white dark:bg-card"
                >
                  <div className="text-sm font-black text-gray-950 dark:text-foreground group-hover:text-primary transition-colors leading-tight line-clamp-2 uppercase tracking-tight">{item.name}</div>
                  <div className="flex items-end justify-between mt-2">
                    <div className="text-xl font-black text-primary">
                      <PriceDisplay usd={item.price} rate={exchangeRate} size="sm" showBs={false} />
                    </div>
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all lg:group-hover:translate-y-[-4px]">
                      ➕
                    </div>
                  </div>
                </button>
              ))}

              {/* Empty state */}
              {!productSearch && groupsInView.length === 0 && subcatFilteredItems.filter((i) => !i.posGroup).length === 0 && !selectedGroup && (
                <div className="col-span-full text-center text-muted-foreground py-12 text-sm">Sin productos en esta categoría</div>
              )}
              {productSearch && filteredMenuItems.length === 0 && (
                <div className="col-span-full text-center text-muted-foreground py-12 text-sm">Sin resultados para &quot;{productSearch}&quot;</div>
              )}
            </div>
          </div>
        </main>

        {/* ══ RIGHT: ACCOUNT PANEL ════════════════════════════════════════ */}
        <aside className={`w-full lg:w-[380px] tablet-land:w-[380px] xl:w-[440px] shrink-0 bg-card/80 flex flex-col overflow-hidden ${mobileTab === "account" ? "flex" : "hidden"} lg:flex absolute lg:relative inset-0 z-10 lg:z-auto`}>
          {isPickupMode ? (
            <div className="flex-1 flex flex-col overflow-hidden bg-secondary/80">
              <div className="p-4 border-b border-indigo-900/50 bg-indigo-900/20 space-y-2 shrink-0">
                <div className="flex items-center justify-between">
                  <h2 className="font-black text-lg text-indigo-300 flex items-center gap-2">
                    🛍️ {activePickupTab?.pickupNumber || "Pickup"}
                  </h2>
                  {activePickupTab?.customerPhone && (
                    <span className="text-xs text-muted-foreground">📞 {activePickupTab.customerPhone}</span>
                  )}
                </div>
                <input
                  type="text"
                  value={pickupCustomerName}
                  onChange={(e) => {
                    setPickupCustomerName(e.target.value);
                    if (activePickupTabId) {
                      setPickupTabs((prev) =>
                        prev.map((t) =>
                          t.id === activePickupTabId ? { ...t, customerName: e.target.value } : t,
                        ),
                      );
                    }
                  }}
                  placeholder="Nombre del Cliente..."
                  className="w-full bg-background/50 border border-indigo-500/30 rounded py-2 px-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2 relative">
                {cart.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                    Carrito vacío
                  </div>
                )}
                {cart.map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-card p-4 rounded-2xl border border-border flex justify-between shadow-sm"
                  >
                    <div>
                      <div className="font-bold text-sm flex items-center gap-1.5 flex-wrap">
                        <span className="text-indigo-400">x{item.quantity}</span>
                        {item.name}
                        {item.takeaway && (
                          <span className="inline-flex items-center rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-black text-amber-400 uppercase tracking-wide">
                            🥡 Llevar
                          </span>
                        )}
                      </div>
                      {item.modifiers.length > 0 && (
                        <div className="text-xs text-muted-foreground pl-4">
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

              <div className="overflow-y-auto p-4 bg-card border-t border-border space-y-3 shrink-0 max-h-[calc(100vh-200px)]">
                {/* Descuento */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={clearDiscount}
                    className={`py-3 text-sm font-bold rounded-xl transition ${discountType === "NONE" ? "bg-muted-foreground/60 text-white ring-1 ring-white" : "bg-secondary hover:bg-muted"}`}
                  >
                    Normal
                  </button>
                  <button
                    onClick={() => isPagoDivisasPickup ? setDiscountType("DIVISAS_33") : undefined}
                    disabled={!isPagoDivisasPickup}
                    title={!isPagoDivisasPickup ? "Solo con Efectivo o Zelle" : ""}
                    className={`py-3 text-sm font-bold rounded-xl transition ${discountType === "DIVISAS_33" ? "bg-indigo-600 text-white" : isPagoDivisasPickup ? "bg-secondary text-foreground/70 hover:bg-muted" : "bg-secondary text-foreground/50 cursor-not-allowed opacity-50"}`}
                  >
                    Divisas -33%
                  </button>
                  <button
                    onClick={openCortesiaModal}
                    className={`col-span-2 py-3 text-sm font-bold rounded-xl transition ${(discountType === "CORTESIA_100" || discountType === "CORTESIA_PERCENT") ? "bg-purple-600 text-white" : "bg-secondary text-foreground/70 hover:bg-muted"}`}
                  >
                    {(discountType === "CORTESIA_100" || discountType === "CORTESIA_PERCENT")
                      ? `🎁 Cortesía ${discountType === "CORTESIA_PERCENT" ? cortesiaPercentNum + "%" : "100%"}`
                      : "🎁 Cortesía (PIN)"}
                  </button>
                </div>
                {/* Modo de pago + total calculado */}
                {(() => {
                  const baseDiscount = discountType === "DIVISAS_33"
                    ? (isPickupMixedMode ? Math.round((divisasUsdAmountPickup ?? 0) / 3 * 100) / 100 : Math.round(cartTotal / 3 * 100) / 100)
                    : discountType === "CORTESIA_100" ? cartTotal
                    : discountType === "CORTESIA_PERCENT" ? cartTotal * (cortesiaPercentNum / 100)
                    : 0;
                  const pickupTotal = roundToWhole(Math.max(0, cartTotal - baseDiscount), paymentMethod);
                  const singlePaidAmount = parseFloat(amountReceived) || 0;
                  const pickupChange = isPickupMixedMode
                    ? Math.max(0, totalMixedPickupPaid - pickupTotal)
                    : Math.max(0, singlePaidAmount - pickupTotal);
                  return (
                    <div className="space-y-3 pt-2">
                      {/* Toggle Pago Único / Pago Mixto */}
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button"
                          onClick={() => { setIsPickupMixedMode(false); setMixedPaymentsPickup([]); }}
                          className={`py-3 rounded-xl text-sm font-black uppercase tracking-tight transition-all ${!isPickupMixedMode ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-card border border-border text-foreground/50"}`}
                        >Pago Único</button>
                        <button type="button"
                          onClick={() => { setIsPickupMixedMode(true); setAmountReceived(""); }}
                          className={`py-3 rounded-xl text-sm font-black uppercase tracking-tight transition-all ${isPickupMixedMode ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-card border border-border text-foreground/50"}`}
                        >💳 Pago Mixto</button>
                      </div>

                      {!isPickupMixedMode ? (
                        /* ── Pago Único ── */
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            {SINGLE_PAY_METHODS.map((m) => (
                              <button key={m} type="button" onClick={() => setPaymentMethod(m)}
                                className={`py-3 rounded-xl text-sm font-black uppercase tracking-tighter transition-all active:scale-95 ${paymentMethod === m ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-card border border-border text-foreground/50"}`}>
                                {PAYMENT_LABELS[m]}
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-2 bg-background border border-border p-1 rounded-2xl">
                            <input type="number" value={amountReceived}
                              onChange={(e) => { setAmountReceived(e.target.value); setCheckoutTip(''); }}
                              placeholder="Recibido..."
                              className="flex-1 bg-transparent border-none rounded-xl px-4 py-3 text-lg font-black focus:ring-0 placeholder:text-muted-foreground/30 text-foreground" />
                            <div className="pr-4 text-xs font-black text-muted-foreground uppercase">
                              {isBsPayMethod ? 'Bs' : 'USD'}
                            </div>
                          </div>
                          {/* Equivalente USD para métodos Bs */}
                          {isBsPayMethod && exchangeRate && rawAmount > 0 && (
                            <div className="flex justify-between text-xs px-1">
                              <span className="text-muted-foreground">Equivalente USD</span>
                              <span className="font-bold text-emerald-400">${(rawAmount / exchangeRate).toFixed(2)}</span>
                            </div>
                          )}
                          {/* Vuelto para efectivo USD */}
                          {!isBsPayMethod && paymentMethod === 'CASH_USD' && paidAmount > 0 && paidAmount > (cartTotal - (discountType === 'DIVISAS_33' ? Math.round(cartTotal / 3 * 100) / 100 : 0)) && (
                            <div className="flex justify-between text-sm font-black px-1">
                              <span className="text-amber-400">Vuelto</span>
                              <span className="text-amber-400">${Math.max(0, paidAmount - Math.max(0, cartTotal - (discountType === 'DIVISAS_33' ? Math.round(cartTotal / 3 * 100) / 100 : 0))).toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* ── Pago Mixto ── */
                        <div className="space-y-2">
                          <MixedPaymentSelector
                            key={`pickup-mixed-${pickupTotal.toFixed(2)}-${isPickupMixedMode}`}
                            totalAmount={pickupTotal}
                            exchangeRate={exchangeRate}
                            onChange={(lines, _paid, _complete) => setMixedPaymentsPickup(lines)}
                            disabled={isProcessing}
                          />
                          {discountType === "DIVISAS_33" && (divisasUsdAmountPickup ?? 0) > 0 && (
                            <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/30 px-3 py-2 text-xs text-indigo-300 space-y-0.5">
                              <div className="flex justify-between">
                                <span>Divisas sobre ${(divisasUsdAmountPickup ?? 0).toFixed(2)} USD</span>
                                <span className="font-black">-${((divisasUsdAmountPickup ?? 0) / 3).toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between font-black text-white">
                                <span>Total a cobrar</span>
                                <span>${pickupTotal.toFixed(2)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Vuelto + Propina voluntaria */}
                      {pickupChange > 0.001 && (() => {
                        const tipVal = Math.min(parseFloat(checkoutTip) || 0, pickupChange);
                        const changeBack = pickupChange - tipVal;
                        return (
                          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
                            {/* Fila principal: vuelto a devolver (lo más importante) */}
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-black text-amber-400">💵 Vuelto a devolver:</span>
                              <span className="text-lg font-black text-amber-400">${Math.max(0, changeBack).toFixed(2)}</span>
                            </div>
                            {/* Separador antes de la propina opcional */}
                            <div className="border-t border-amber-500/20 pt-2">
                              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">
                                Propina voluntaria (opcional — solo si el cliente la deja)
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 flex items-center bg-background border border-border rounded-lg px-2">
                                  <span className="text-xs text-muted-foreground mr-1">$</span>
                                  <input
                                    type="number" min="0" step="0.01"
                                    max={pickupChange}
                                    value={checkoutTip}
                                    onChange={e => setCheckoutTip(e.target.value)}
                                    placeholder="0.00"
                                    className="flex-1 bg-transparent text-sm font-black focus:outline-none py-1.5 w-0"
                                  />
                                </div>
                                {tipVal > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setCheckoutTip("")}
                                    className="text-muted-foreground hover:text-destructive text-lg leading-none px-1"
                                    title="Limpiar propina"
                                  >×</button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      <CurrencyCalculator totalUsd={pickupTotal} hasServiceFee={false} onRateUpdated={setExchangeRate} inline startCollapsed />

                      {(() => {
                        const needsAmount = !isPickupMixedMode && METHODS_REQUIRING_AMOUNT.has(paymentMethod) && paidAmount <= 0;
                        return (
                          <>
                            {needsAmount && (
                              <div className="text-center text-xs text-amber-400 font-bold py-1">
                                ⚠️ Ingresa el monto recibido
                              </div>
                            )}
                            <button
                              onClick={handleCheckoutPickup}
                              disabled={cart.length === 0 || isProcessing || needsAmount}
                              className="capsula-btn capsula-btn-primary w-full py-6 text-xl shadow-xl shadow-primary/20"
                            >
                              {isProcessing ? "PROCESANDO..." : `COBRAR $${pickupTotal.toFixed(2)}`}
                            </button>
                          </>
                        );
                      })()}
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
                        tableLabel: lastPickupOrder.pickupNumber,
                        tableLabelTitle: lastPickupOrder.pickupNumber ? "Pickup" : undefined,
                        items: lastPickupOrder.items,
                        subtotal: lastPickupOrder.subtotal,
                        discount: lastPickupOrder.discount,
                        hideDiscount: lastPickupOrder.hideDiscount,
                        discountReason: lastPickupOrder.discount > 0 && !lastPickupOrder.hideDiscount ? "Descuento aplicado" : undefined,
                        total: lastPickupOrder.total,
                        serviceFee: 0,
                      });
                    }}
                    className="w-full py-3 bg-secondary hover:bg-muted text-foreground rounded-xl font-bold flex items-center justify-center gap-2 border border-border text-sm"
                  >
                    🖨️ Reimprimir {lastPickupOrder.pickupNumber || lastPickupOrder.orderNumber}
                  </button>
                )}
              </div>
            </div>
          ) : !activeTab ? (
            <div className="flex-1 flex items-center justify-center p-6 text-center text-muted-foreground text-sm">
              {selectedTable
                ? "Abre una cuenta para gestionar consumos"
                : "Selecciona una mesa o usa Venta Directa (Pickup)"}
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Tab header */}
              <div className="p-3 border-b border-border bg-card space-y-1.5 shrink-0">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-black text-base text-gray-950 dark:text-foreground">{activeTab.customerLabel}</div>
                    {activeTab.customerPhone && (
                      <div className="text-xs text-muted-foreground">📞 {activeTab.customerPhone}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground uppercase">Saldo</div>
                    <div className="text-xl font-black text-amber-400">
                      <PriceDisplay usd={activeTab.balanceDue} rate={exchangeRate} size="md" showBs={false} />
                    </div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div>
                    🔓 Abrió:{" "}
                    <span className="text-foreground/70">
                      {activeTab.openedBy.firstName} {activeTab.openedBy.lastName}
                    </span>{" "}
                    · {formatDateTime(activeTab.openedAt)}
                  </div>
                  {(activeTab as any).waiterLabel && (
                    <div>
                      👤 Mesonero: <span className="text-foreground/70">{(activeTab as any).waiterLabel}</span>
                    </div>
                  )}
                  <div>
                    🏷️ {activeTab.tabCode} · {activeTab.guestCount} pax ·{" "}
                    <span className={activeTab.status === "OPEN" ? "text-emerald-400" : "text-amber-400"}>
                      {activeTab.status}
                    </span>
                  </div>
                </div>
                {/* Subcuentas toggle */}
                <button
                  onClick={() => setSubAccountMode((p) => !p)}
                  className={`w-full py-2 rounded-xl text-xs font-black transition ${
                    subAccountMode
                      ? "bg-amber-500 text-black"
                      : "bg-secondary hover:bg-amber-500/20 hover:text-amber-400 text-foreground/70"
                  }`}
                >
                  ÷ {subAccountMode ? "Viendo subcuentas — Volver a cobro normal" : "Dividir cuenta (subcuentas)"}
                </button>
              </div>

              {subAccountMode ? (
                <SubAccountPanel
                  openTabId={activeTab.id}
                  exchangeRate={exchangeRate}
                  onClose={() => setSubAccountMode(false)}
                  onTabUpdated={() => loadData(false)}
                />
              ) : (
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {/* Temporary cart */}
                <div className="rounded-xl border border-border bg-secondary p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-muted-foreground uppercase">Carrito (nueva tanda)</span>
                    <span className="text-xs font-bold text-amber-400">
                      <PriceDisplay usd={cartTotal} rate={exchangeRate} size="sm" showBs={false} />
                    </span>
                  </div>
                  {cart.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-2">Agrega items del menú</div>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {cart.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-xs bg-card rounded-lg px-2 py-1.5"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-bold truncate text-gray-950 dark:text-foreground">
                              {item.quantity}× {item.name}
                            </div>
                            {item.modifiers.length > 0 && (
                              <div className="text-muted-foreground truncate">
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
                    className="mt-2 w-full py-2 bg-muted hover:bg-secondary/80 rounded-lg text-xs font-black transition disabled:opacity-40"
                  >
                    Agregar consumo a la cuenta →
                  </button>
                </div>

                {/* Consumed orders */}
                {activeTab.orders.length > 0 && (
                  <div className="rounded-xl border border-border bg-secondary p-3">
                    <div className="text-xs font-bold text-muted-foreground uppercase mb-2">Consumos cargados</div>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {activeTab.orders.map((order) => (
                        <div key={order.id} className="bg-card rounded-lg p-2">
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                            <span>{order.orderNumber}</span>
                            <span className="flex items-center gap-1">
                              {order.createdBy && <span>{order.createdBy.firstName}</span>}·{" "}
                              {formatTime(order.createdAt)}
                            </span>
                          </div>
                          {order.items.map((item) => (
                            <div key={item.id} className="flex items-center justify-between text-xs py-0.5">
                              <span className="text-gray-950 dark:text-foreground/70 flex-1 truncate">
                                {item.quantity}× {item.itemName}
                              </span>
                              <div className="flex items-center gap-1.5 ml-2 shrink-0">
                                <span className="text-muted-foreground">${item.lineTotal.toFixed(2)}</span>
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
                <div className="rounded-xl border border-border bg-secondary p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-bold text-muted-foreground uppercase">Cobrar cuenta</div>
                    {activeTab.orders.length > 0 && (
                      <button
                        onClick={handlePrintPrecuenta}
                        className="text-xs font-bold text-blue-300 bg-blue-900/30 hover:bg-blue-900/60 border border-blue-700/50 rounded-lg px-3 py-1.5 transition-colors"
                      >
                        🖨️ Pre-Cuenta
                      </button>
                    )}
                  </div>

                  {/* 1. Descuento */}
                  <div className="mb-3">
                    <p className="text-xs font-bold text-muted-foreground uppercase mb-1.5">1. Descuento</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={clearDiscount}
                        className={`py-3 text-sm font-bold rounded-xl transition ${discountType === "NONE" ? "bg-muted-foreground/60 text-white ring-1 ring-white" : "bg-card text-foreground/70 hover:bg-muted"}`}
                      >
                        Normal
                      </button>
                      <button
                        onClick={() => (isPagoDivisas || isTableMixedMode) && setDiscountType("DIVISAS_33")}
                        disabled={!isPagoDivisas && !isTableMixedMode}
                        title={(!isPagoDivisas && !isTableMixedMode) ? "Solo con Efectivo o Zelle" : "Descuento por pago en divisas"}
                        className={`py-3 text-sm font-bold rounded-xl transition ${discountType === "DIVISAS_33" ? "bg-blue-600 text-white ring-1 ring-white" : (isPagoDivisas || isTableMixedMode) ? "bg-card text-foreground/70 hover:bg-muted" : "bg-card text-foreground/50 cursor-not-allowed opacity-50"}`}
                      >
                        Divisas -33%
                      </button>
                      <button
                        onClick={openCortesiaModal}
                        className={`col-span-2 py-3 text-sm font-bold rounded-xl transition ${(discountType === "CORTESIA_100" || discountType === "CORTESIA_PERCENT") ? "bg-purple-600 text-white ring-1 ring-purple-400" : "bg-card text-foreground/70 hover:bg-muted"}`}
                      >
                        {(discountType === "CORTESIA_100" || discountType === "CORTESIA_PERCENT")
                          ? `🎁 Cortesía ${discountType === "CORTESIA_PERCENT" ? cortesiaPercentNum + "%" : "100%"} — ${authorizedManager?.name || ""}`
                          : "🎁 Cortesía (PIN)"}
                      </button>
                    </div>
                    {discountType === "DIVISAS_33" && (
                      <p className="text-xs text-blue-400 mt-1.5">
                        Descuento: -${(activeTab.balanceDue / 3).toFixed(2)} → Total: $
                        {((activeTab.balanceDue * 2) / 3).toFixed(2)}
                      </p>
                    )}
                    {(discountType === "CORTESIA_100" || discountType === "CORTESIA_PERCENT") && (
                      <p className="text-xs text-purple-400 mt-1.5">
                        Descuento: -${(activeTab.balanceDue * (cortesiaPercentNum / 100)).toFixed(2)} → Total: ${(activeTab.balanceDue * (1 - cortesiaPercentNum / 100)).toFixed(2)}
                      </p>
                    )}
                  </div>

                  {/* 2. Forma de pago */}
                  <div className="mb-3">
                    <p className="text-xs font-bold text-muted-foreground uppercase mb-1.5">2. Forma de pago</p>
                    {/* Toggle Pago Único / Pago Mixto */}
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <button type="button"
                        onClick={() => { setIsTableMixedMode(false); setMixedPaymentsTable([]); }}
                        className={`py-3 rounded-xl text-sm font-bold transition ${!isTableMixedMode ? "bg-amber-500 text-black" : "bg-card text-foreground/50 hover:bg-muted"}`}
                      >Pago Único</button>
                      <button type="button"
                        onClick={() => { setIsTableMixedMode(true); setAmountReceived(""); }}
                        className={`py-3 rounded-xl text-sm font-bold transition ${isTableMixedMode ? "bg-amber-500 text-black" : "bg-card text-foreground/50 hover:bg-muted"}`}
                      >💳 Pago Mixto</button>
                    </div>
                    {!isTableMixedMode ? (
                      <div className="grid grid-cols-2 gap-2">
                        {SINGLE_PAY_METHODS.map((m) => (
                          <button key={m} onClick={() => setPaymentMethod(m)}
                            className={`py-3 rounded-xl text-sm font-bold transition ${paymentMethod === m ? "bg-amber-500 text-black" : "bg-card text-foreground/70 hover:bg-muted"}`}>
                            {PAYMENT_LABELS[m]}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <MixedPaymentSelector
                          key={`table-mixed-${activeTab?.id}`}
                          totalAmount={paymentAmountToCharge}
                          exchangeRate={exchangeRate}
                          onChange={(lines, _paid, _complete) => setMixedPaymentsTable(lines)}
                          disabled={isProcessing}
                        />
                        {discountType === "DIVISAS_33" && divisasUsdAmountTable > 0 && (() => {
                          return (
                            <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/30 px-2 py-1.5 text-[10px] text-indigo-300 space-y-0.5">
                              <div className="flex justify-between"><span>Divisas ${divisasUsdAmountTable.toFixed(2)}</span><span>-${(divisasUsdAmountTable / 3).toFixed(2)}</span></div>
                              <div className="flex justify-between font-black text-white"><span>Total a cobrar</span><span>${paymentAmountToCharge.toFixed(2)}</span></div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Resumen */}
                  {(() => {
                    return (
                      <div className="bg-card rounded-lg px-3 py-2 mb-2 text-xs space-y-1">
                        <div className="flex justify-between text-muted-foreground">
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
                            className="rounded border-border bg-secondary text-amber-500 focus:ring-amber-500"
                          />
                          <span className="text-foreground/70">Incluir 10% servicio</span>
                        </label>
                        <div className="flex justify-between font-bold text-foreground border-t border-border pt-1">
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

                  <div className="relative mb-2">
                    <input
                      type="number"
                      value={amountReceived}
                      onChange={(e) => setAmountReceived(e.target.value)}
                      placeholder={isBsPayMethod && exchangeRate
                        ? `Bs ${(paymentAmountToCharge * exchangeRate).toFixed(0)}`
                        : `$${paymentAmountToCharge.toFixed(2)}`}
                      className="w-full bg-card border border-border rounded-lg px-3 py-2.5 text-foreground text-sm focus:border-amber-500 focus:outline-none pr-14"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                      {isBsPayMethod ? 'Bs' : 'USD'}
                    </span>
                  </div>
                  {/* Equivalente USD para Bs methods */}
                  {isBsPayMethod && exchangeRate && rawAmount > 0 && (
                    <div className="flex justify-between text-xs px-1 mb-2">
                      <span className="text-muted-foreground">Equivalente USD</span>
                      <span className="font-bold text-emerald-400">${(rawAmount / exchangeRate).toFixed(2)}</span>
                    </div>
                  )}

                  {/* Vuelto + Propina inline (mesa, pago único en efectivo) */}
                  {!isTableMixedMode && !isBsPayMethod && paidAmount > paymentAmountToCharge + 0.001 && (() => {
                    const tableChange = paidAmount - paymentAmountToCharge;
                    const tipVal = Math.min(parseFloat(checkoutTip) || 0, tableChange);
                    const changeBack = tableChange - tipVal;
                    return (
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2 mb-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Vuelto total:</span>
                          <span className="font-black text-amber-400">${tableChange.toFixed(2)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground shrink-0">Propina extra:</span>
                          <div className="flex-1 flex items-center bg-background border border-border rounded-lg px-2">
                            <span className="text-xs text-muted-foreground mr-1">$</span>
                            <input
                              type="number" min="0" step="0.01"
                              max={tableChange}
                              value={checkoutTip}
                              onChange={e => setCheckoutTip(e.target.value)}
                              placeholder="0.00"
                              className="flex-1 bg-transparent text-sm font-black focus:outline-none py-1 w-0"
                            />
                          </div>
                        </div>
                        <div className="flex justify-between text-xs font-black pt-1 border-t border-amber-500/20">
                          <span>Vuelto a devolver:</span>
                          <span className="text-emerald-400">${Math.max(0, changeBack).toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* CurrencyCalculator */}
                  <CurrencyCalculator
                    totalUsd={paidAmount > 0 ? paidAmount : paymentAmountToCharge}
                    hasServiceFee={false}
                    onRateUpdated={setExchangeRate}
                    inline
                    startCollapsed
                  />

                  {/* Register payment (requiere PIN) */}
                  <button
                    onClick={() => {
                      setPaymentPin("");
                      setPaymentPinError("");
                      setShowPaymentPinModal(true);
                    }}
                    disabled={isTableMixedMode ? (totalMixedTablePaid <= 0 || isProcessing) : (paidAmount <= 0 || isProcessing)}
                    className="capsula-btn capsula-btn-primary w-full py-5 text-base shadow-xl shadow-primary/10"
                  >
                    🔐 REGISTRAR PAGO ${isTableMixedMode
                      ? (totalMixedTablePaid > 0 ? totalMixedTablePaid.toFixed(2) : "0.00")
                      : (paidAmount > 0 ? paidAmount.toFixed(2) : "0.00")}
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
                            className="flex justify-between items-center text-xs text-muted-foreground bg-card rounded px-2 py-1"
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

                  <p className="mt-2 text-xs text-muted-foreground text-center">La factura se imprime al registrar el pago. Reimprimir desde Historial de Ventas.</p>
                  {/* Close tab - permitir cerrar cuando no hay consumo (saldo 0) o ya se cobró */}
                  <button
                    onClick={handleCloseTab}
                    disabled={(Number(activeTab.balanceDue ?? 0) > 0.01) || isProcessing}
                    className="mt-2 w-full py-2 border border-border rounded-lg text-xs font-bold text-foreground/70 hover:bg-muted transition disabled:opacity-30"
                  >
                    Cerrar cuenta (saldo ${(Number(activeTab.balanceDue ?? 0)).toFixed(2)})
                  </button>
                </div>
              </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* MODAL: SELECCIÓN DE MESA                                         */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {showTableModal && selectedTable && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 flex items-end sm:items-center justify-center p-4"
          onClick={() => { setShowTableModal(false); resetTableState(); setSelectedTableId(""); }}
        >
          <div
            className="bg-card border border-border w-full max-w-sm mx-auto rounded-t-3xl sm:rounded-3xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-border p-5 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black">{selectedTable.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedTable.currentStatus === "AVAILABLE" ? "Mesa disponible" :
                   selectedTable.currentStatus === "OCCUPIED" ? "Mesa ocupada" :
                   selectedTable.currentStatus === "RESERVED" ? "Mesa reservada" : selectedTable.currentStatus}
                </p>
              </div>
              <button
                onClick={() => setShowTableModal(false)}
                className="text-muted-foreground hover:text-white text-2xl leading-none"
              >×</button>
            </div>

            <div className="p-5 space-y-3">
              {!activeTab ? (
                /* Mesa libre */
                <>
                  <p className="text-sm text-muted-foreground">¿Qué deseas hacer con esta mesa?</p>
                  <button
                    onClick={() => { setShowTableModal(false); setShowOpenTabModal(true); }}
                    className="w-full min-h-[52px] bg-emerald-600 hover:bg-emerald-500 rounded-2xl font-black text-lg transition active:scale-95"
                  >
                    ✚ Abrir cuenta
                  </button>
                </>
              ) : (
                /* Mesa ocupada */
                <div className="space-y-3">
                  <div className="rounded-xl bg-secondary p-3 text-sm space-y-1">
                    <div className="font-bold text-emerald-400 truncate">{activeTab.customerLabel}</div>
                    {activeTab.customerPhone && <div className="text-muted-foreground text-xs">📞 {activeTab.customerPhone}</div>}
                    {(activeTab as any).waiterLabel && (
                      <div className="text-muted-foreground text-xs">🧑‍🍽️ {(activeTab as any).waiterLabel}</div>
                    )}
                    <div className="flex justify-between pt-1 border-t border-border">
                      <span className="text-muted-foreground">Balance:</span>
                      <span className="font-black text-amber-400">${activeTab.balanceDue.toFixed(2)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => { setShowTableModal(false); setMobileTab("menu"); }}
                    className="w-full min-h-[52px] bg-amber-600 hover:bg-amber-500 rounded-2xl font-black transition active:scale-95"
                  >
                    🍽️ Agregar pedido
                  </button>
                  <button
                    onClick={() => { setShowTableModal(false); setMobileTab("account"); }}
                    className="w-full min-h-[48px] bg-secondary hover:bg-muted rounded-2xl font-bold text-sm transition active:scale-95 border border-border"
                  >
                    🧾 Ver cuenta
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* MODAL: ABRIR CUENTA                                              */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* MODAL: NUEVA VENTA PICKUP                                         */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {showPickupOpenModal && (
        <div className="fixed inset-0 z-[60] bg-background/90 flex items-end sm:items-center justify-center p-4">
          <div className="bg-card border border-border w-full max-w-md mx-auto rounded-t-3xl sm:rounded-3xl shadow-2xl">
            <div className="border-b border-border p-5 flex items-center justify-between">
              <h3 className="text-lg font-black">🛍️ Nueva Venta Pickup</h3>
              <button
                onClick={() => setShowPickupOpenModal(false)}
                className="text-muted-foreground hover:text-destructive text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1">
                  Número de pickup del día
                </label>
                <div className="w-full bg-secondary/50 border border-border rounded-xl px-3 py-2.5 text-foreground text-sm font-black tracking-wide flex items-center gap-2">
                  <span className="flex-1">{newPickupNumber}</span>
                  {newPickupNumber === "PK-…" && (
                    <span className="text-xs text-muted-foreground animate-pulse">calculando…</span>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1">
                  Nombre del cliente <span className="text-muted-foreground font-normal">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={newPickupName}
                  onChange={(e) => setNewPickupName(e.target.value)}
                  placeholder="Ej: Juan Pérez"
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-foreground text-sm focus:border-indigo-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1">
                  Teléfono <span className="text-muted-foreground font-normal">(opcional)</span>
                </label>
                <input
                  type="tel"
                  value={newPickupPhone}
                  onChange={(e) => setNewPickupPhone(e.target.value)}
                  placeholder="Ej: 0414-1234567"
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-foreground text-sm focus:border-indigo-400 focus:outline-none"
                />
              </div>
            </div>
            <div className="border-t border-border p-4 flex gap-3">
              <button
                onClick={() => setShowPickupOpenModal(false)}
                className="flex-1 py-3 bg-secondary hover:bg-muted rounded-xl font-bold text-sm transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreatePickupTab}
                disabled={isProcessing}
                className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-black text-sm transition disabled:opacity-50"
              >
                ✓ Abrir Pickup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* MODAL: ABRIR CUENTA                                              */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {showOpenTabModal && selectedTable && (
        <div className="fixed inset-0 z-[60] bg-background/90 flex items-end sm:items-center justify-center p-4">
          <div className="bg-card border border-border w-full max-w-md mx-auto rounded-t-3xl sm:rounded-3xl shadow-2xl">
            <div className="border-b border-border p-5 flex items-center justify-between">
              <h3 className="text-lg font-black">Abrir cuenta — {selectedTable.name}</h3>
              <button
                onClick={() => setShowOpenTabModal(false)}
                className="text-muted-foreground hover:text-destructive text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1">
                  Nombre del cliente <span className="text-muted-foreground font-normal">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={openTabName}
                  onChange={(e) => setOpenTabName(e.target.value)}
                  placeholder="Ej: Juan Pérez"
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-foreground text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1">Número de personas</label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setOpenTabGuests(Math.max(1, openTabGuests - 1))}
                      className="w-9 h-9 bg-secondary rounded-lg font-bold text-lg"
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
                  <label className="block text-xs font-bold text-muted-foreground mb-1">Mesonero asignado</label>
                  <select
                    value={openTabWaiter}
                    onChange={(e) => setOpenTabWaiter(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-foreground text-sm focus:border-amber-500 focus:outline-none"
                  >
                    <option value="">— Ninguno —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.firstName} {u.lastName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="border-t border-border p-4 flex gap-3">
              <button
                onClick={() => setShowOpenTabModal(false)}
                className="flex-1 py-3 bg-secondary hover:bg-muted rounded-xl font-bold text-sm transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleOpenTab}
                disabled={isProcessing}
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
        <div className="fixed inset-0 z-[60] bg-background/90 flex items-end sm:items-center justify-center p-4">
          <div className="bg-card border border-border w-full max-w-sm mx-auto rounded-t-3xl sm:rounded-3xl shadow-2xl">
            <div className="border-b border-border p-5 flex items-center justify-between">
              <h3 className="text-lg font-black">🔐 Autorizar cobro</h3>
              <button
                onClick={() => setShowPaymentPinModal(false)}
                className="text-muted-foreground hover:text-destructive text-2xl"
              >
                ×
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-secondary rounded-xl p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Método:</span>
                  <span className="font-bold">{PAYMENT_LABELS[paymentMethod]}</span>
                </div>
                {discountType === "DIVISAS_33" && activeTab && (
                  <div className="flex justify-between text-blue-400 text-xs">
                    <span>Descuento -33.33%:</span>
                    <span>-${(activeTab.balanceDue / 3).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Monto:</span>
                  <span className="font-black text-emerald-400 text-base">${paidAmount.toFixed(2)}</span>
                </div>
                {exchangeRate && (
                  <div className="flex justify-between text-muted-foreground text-xs">
                    <span>Equivalente Bs:</span>
                    <span>Bs. {(paidAmount * exchangeRate).toFixed(2)}</span>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1">PIN de cajera / gerente</label>
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
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-3 text-foreground text-center text-xl tracking-widest focus:border-amber-500 focus:outline-none"
                />
                {paymentPinError && <p className="text-red-400 text-xs mt-1">{paymentPinError}</p>}
              </div>
            </div>
            <div className="border-t border-border p-4 flex gap-3">
              <button
                onClick={() => setShowPaymentPinModal(false)}
                className="flex-1 py-3 bg-secondary rounded-xl font-bold text-sm"
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
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-end sm:items-center justify-center p-4">
          <div className="bg-card border border-purple-800/60 w-full max-w-sm mx-auto rounded-t-3xl sm:rounded-3xl shadow-2xl">
            <div className="border-b border-border p-5 flex items-center justify-between">
              <h3 className="text-lg font-black text-purple-300">🎁 Cortesía</h3>
              <button onClick={() => setShowCortesiaModal(false)} className="text-muted-foreground hover:text-destructive text-2xl">×</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1">% de Cortesía</label>
                <div className="flex gap-2 mb-2">
                  {["25", "50", "75", "100"].map(v => (
                    <button key={v} onClick={() => setCortesiaPercent(v)}
                      className={`flex-1 py-2 text-sm font-bold rounded-lg transition ${cortesiaPercent === v ? "bg-purple-600 text-white" : "bg-secondary text-foreground/70 hover:bg-muted"}`}>
                      {v}%
                    </button>
                  ))}
                </div>
                <input
                  type="number" min="1" max="100"
                  value={cortesiaPercent}
                  onChange={e => setCortesiaPercent(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-foreground text-center text-lg font-bold focus:border-purple-500 focus:outline-none"
                  placeholder="% personalizado"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1">PIN de Gerente / Dueño</label>
                <div className="bg-secondary p-3 rounded-xl text-2xl tracking-widest text-center font-mono mb-3 min-h-[3rem]">
                  {cortesiaPin.replace(/./g, "•")}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[1,2,3,4,5,6,7,8,9,0].map(n => (
                    <button key={n} onClick={() => handleCortesiaPinKey(n.toString())}
                      className="bg-muted hover:bg-secondary/80 rounded-lg py-3 font-bold text-xl">{n}</button>
                  ))}
                  <button onClick={() => handleCortesiaPinKey("clear")} className="bg-red-900 hover:bg-red-800 rounded-lg py-3 font-bold text-red-200 text-sm">C</button>
                  <button onClick={() => handleCortesiaPinKey("back")} className="bg-secondary hover:bg-muted-foreground/60 rounded-lg py-3 font-bold">⌫</button>
                </div>
                {cortesiaPinError && <p className="text-red-400 text-xs mt-2 text-center">{cortesiaPinError}</p>}
              </div>
            </div>
            <div className="border-t border-border p-4 flex gap-3">
              <button onClick={() => setShowCortesiaModal(false)} className="flex-1 py-3 bg-secondary rounded-xl font-bold text-sm">Cancelar</button>
              <button onClick={handleCortesiaPinConfirm} disabled={!cortesiaPin} className="flex-[2] py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-xl font-black text-sm transition">
                Aplicar Cortesía
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* MODAL: MODIFICAR ÍTEM ENVIADO                                    */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {showRemoveModal && removeTarget && (() => {
        const replaceItems = allMenuItems.filter((m: MenuItem) =>
          m.id !== removeTarget.itemId &&
          (!removeReplaceSearch.trim() || m.name.toLowerCase().includes(removeReplaceSearch.toLowerCase()))
        ).slice(0, 30);
        return (
          <div className="fixed inset-0 z-[60] bg-background/90 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-card border border-red-900/50 w-full max-w-md mx-auto rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
              {/* Header */}
              <div className="border-b border-border p-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-red-400">✏️ Modificar ítem</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <span className="font-bold text-foreground">{removeTarget.quantity}×</span> {removeTarget.itemName}
                    <span className="ml-2 text-red-400 font-bold">−${removeTarget.lineTotal.toFixed(2)}</span>
                  </p>
                </div>
                <button onClick={() => setShowRemoveModal(false)} className="text-muted-foreground hover:text-destructive text-2xl ml-4">×</button>
              </div>

              <div className="p-5 space-y-4">
                {/* Opciones */}
                <div className="grid grid-cols-3 gap-2">
                  {(["VOID", "ADJUST_QTY", "REPLACE"] as const).map((t) => {
                    const labels = { VOID: "❌ Cancelar", ADJUST_QTY: "✏️ Ajustar", REPLACE: "🔄 Cambiar" };
                    return (
                      <button
                        key={t}
                        onClick={() => setRemoveModType(t)}
                        className={`py-2.5 rounded-xl text-xs font-black border transition ${
                          removeModType === t
                            ? "bg-red-700 border-red-600 text-white"
                            : "bg-secondary border-border hover:border-red-500/40 hover:text-red-400"
                        }`}
                      >
                        {labels[t]}
                      </button>
                    );
                  })}
                </div>

                {/* Ajustar cantidad */}
                {removeModType === "ADJUST_QTY" && (
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground mb-2">
                      Nueva cantidad (actual: {removeTarget.quantity})
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setRemoveNewQty((q) => Math.max(1, q - 1))}
                        className="h-10 w-10 rounded-xl bg-secondary border border-border text-lg font-black hover:border-red-500/40"
                      >−</button>
                      <span className="flex-1 text-center text-2xl font-black">{removeNewQty}</span>
                      <button
                        onClick={() => setRemoveNewQty((q) => Math.min(removeTarget.quantity - 1, q + 1))}
                        className="h-10 w-10 rounded-xl bg-secondary border border-border text-lg font-black hover:border-sky-500/40"
                      >+</button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
                      Se anularán {removeTarget.quantity - removeNewQty} unidad(es)
                    </p>
                  </div>
                )}

                {/* Cambiar por otro ítem */}
                {removeModType === "REPLACE" && (
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-muted-foreground">Producto de reemplazo</label>
                    <input
                      value={removeReplaceSearch}
                      onChange={(e) => setRemoveReplaceSearch(e.target.value)}
                      placeholder="Buscar producto..."
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm font-bold focus:border-sky-500 focus:outline-none"
                    />
                    <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                      {replaceItems.map((m: MenuItem) => (
                        <button
                          key={m.id}
                          onClick={() => setRemoveReplaceItemId(m.id)}
                          className={`w-full flex justify-between items-center px-3 py-2 rounded-lg text-xs font-bold transition border ${
                            removeReplaceItemId === m.id
                              ? "bg-sky-700 border-sky-600 text-white"
                              : "bg-secondary border-border hover:border-sky-500/40"
                          }`}
                        >
                          <span className="truncate">{m.name}</span>
                          <span className="ml-2 shrink-0 opacity-70">${m.price?.toFixed(2)}</span>
                        </button>
                      ))}
                      {replaceItems.length === 0 && (
                        <p className="text-xs text-muted-foreground px-2 py-1">Sin resultados</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Motivo */}
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1">
                    Motivo <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    value={removeJustification}
                    onChange={(e) => { setRemoveJustification(e.target.value); setRemoveError(""); }}
                    placeholder="Ej: Error de pedido, cliente cambió de opinión..."
                    rows={2}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm resize-none focus:border-amber-500 focus:outline-none"
                  />
                </div>

                {/* PIN */}
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1">
                    PIN de capitán / gerente <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    value={removePin}
                    onChange={(e) => { setRemovePin(e.target.value); setRemoveError(""); }}
                    onKeyDown={(e) => e.key === "Enter" && handleRemoveItem()}
                    placeholder="••••••"
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-3 text-center text-xl tracking-widest focus:border-red-500 focus:outline-none"
                  />
                  {removeError && <p className="text-red-400 text-xs mt-1">{removeError}</p>}
                </div>
              </div>

              <div className="border-t border-border p-4 flex gap-3">
                <button onClick={() => setShowRemoveModal(false)} className="flex-1 py-3 bg-secondary rounded-xl font-bold text-sm">
                  Cancelar
                </button>
                <button
                  onClick={handleRemoveItem}
                  disabled={!removePin.trim() || !removeJustification.trim() || isProcessing}
                  className="flex-[2] py-3 bg-red-700 hover:bg-red-600 rounded-xl font-black text-sm transition disabled:opacity-50"
                >
                  {isProcessing ? "Procesando..." : (
                    removeModType === "VOID"       ? "❌ Anular ítem" :
                    removeModType === "ADJUST_QTY" ? "✏️ Ajustar cantidad" :
                                                     "🔄 Confirmar cambio"
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* MODAL: MODIFICADORES                                              */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {showModifierModal && selectedItemForModifier && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-background/90 p-4 text-foreground">
          <div className="max-h-[92vh] sm:max-h-[90vh] w-full max-w-lg mx-auto overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-border bg-card shadow-2xl">
            <div className="border-b border-border p-5 flex items-start justify-between">
              <div>
                <h3 className="text-xl font-black text-foreground">{selectedItemForModifier.name}</h3>
                <p className="mt-1 text-lg font-bold text-amber-400">${selectedItemForModifier.price.toFixed(2)}</p>
              </div>
              <button onClick={() => setShowModifierModal(false)} className="text-muted-foreground hover:text-destructive text-2xl">
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
                  <div key={group.id} className="rounded-xl border border-border bg-secondary p-4">
                    <div className="flex justify-between items-center mb-3">
                      <span className="font-bold text-foreground">
                        {group.name}
                        {group.isRequired && <span className="text-red-400 ml-1 text-xs">*</span>}
                      </span>
                      <span className="text-xs text-muted-foreground">
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
                              className="flex items-center justify-between rounded-lg bg-card px-3 py-2"
                            >
                              <div>
                                <div className="text-sm font-medium text-foreground">{modifier.name}</div>
                                {modifier.priceAdjustment !== 0 && (
                                  <div className="text-xs text-muted-foreground">+${modifier.priceAdjustment.toFixed(2)}</div>
                                )}
                              </div>
                              {isRadio ? (
                                <button
                                  onClick={() => updateModifierQuantity(group, modifier, 1)}
                                  className={`h-7 w-7 rounded-full border text-sm ${qty > 0 ? "border-amber-500 bg-amber-500 text-black" : "border-muted-foreground/50"}`}
                                >
                                  {qty > 0 ? "✓" : ""}
                                </button>
                              ) : (
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => updateModifierQuantity(group, modifier, -1)}
                                      className="h-8 w-8 rounded-lg bg-muted font-bold text-foreground"
                                    >
                                      −
                                    </button>
                                    <span className="w-5 text-center font-black text-amber-400">{qty}</span>
                                    <button
                                      onClick={() => updateModifierQuantity(group, modifier, 1)}
                                      className="h-8 w-8 rounded-lg bg-amber-600 font-bold text-white"
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

              <div className="rounded-xl border border-border bg-secondary p-4">
                <label className="block text-xs font-bold text-muted-foreground mb-2">Notas</label>
                <textarea
                  value={itemNotes}
                  onChange={(e) => setItemNotes(e.target.value)}
                  className="h-16 w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-amber-500 focus:outline-none"
                  placeholder="Sin hielo, extra limón..."
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-border bg-secondary p-4">
                <span className="font-bold text-foreground">Cantidad</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setItemQuantity(Math.max(1, itemQuantity - 1))}
                    className="h-10 w-10 rounded-full bg-muted font-bold text-xl text-foreground"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-xl font-black text-foreground">{itemQuantity}</span>
                  <button
                    onClick={() => setItemQuantity(itemQuantity + 1)}
                    className="h-10 w-10 rounded-full bg-amber-600 font-bold text-xl text-white"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Para llevar — solo disponible en mesas (no pickup) */}
              {activeTab && (
                <button
                  type="button"
                  onClick={() => setItemTakeaway(!itemTakeaway)}
                  className={`w-full rounded-xl border p-4 flex items-center justify-between transition-all ${
                    itemTakeaway
                      ? "border-amber-500 bg-amber-500/10 text-amber-400"
                      : "border-border bg-secondary text-muted-foreground"
                  }`}
                >
                  <span className="font-bold">🥡 Para llevar</span>
                  <span className={`text-xs font-black uppercase ${itemTakeaway ? "text-amber-400" : "text-muted-foreground"}`}>
                    {itemTakeaway ? "SÍ — aparecerá en comanda" : "No"}
                  </span>
                </button>
              )}
            </div>

            <div className="flex gap-3 border-t border-border p-5">
              <button
                onClick={() => setShowModifierModal(false)}
                className="flex-1 rounded-xl bg-muted py-3 font-bold text-foreground"
              >
                Cancelar
              </button>
              <button
                onClick={confirmAddToCart}
                disabled={selectedItemForModifier.modifierGroups.some((g) => !isGroupValid(g.modifierGroup))}
                className="flex-[2] rounded-xl bg-amber-600 hover:bg-amber-500 py-3 font-black transition disabled:opacity-50 text-white"
              >
                Agregar al carrito
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Navegación móvil — solo visible en móvil/tablet */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border flex z-50 shadow-2xl safe-area-inset-bottom">
        {(["tables", "menu", "account"] as const).map((tab) => {
          const icons = { tables: "🪑", menu: "🍽️", account: "🧾" };
          const labels = { tables: "MESAS", menu: "MENÚ", account: "CUENTA" };
          return (
            <button
              key={tab}
              onClick={() => setMobileTab(tab)}
              className={`flex-1 min-h-[56px] py-2 flex flex-col items-center justify-center gap-1 text-[10px] font-black uppercase tracking-widest relative transition-colors
                ${mobileTab === tab ? "text-primary bg-primary/5" : "text-muted-foreground"}`}
            >
              {mobileTab === tab && <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary rounded-b" />}
              <span className="text-xl">{icons[tab]}</span>
              {labels[tab]}
              {tab === "account" && cartBadgeCount > 0 && (
                <span className="absolute top-1 right-6 bg-primary text-white text-[9px] rounded-full min-w-[16px] h-4 flex items-center
      justify-center font-black px-1">
                  {cartBadgeCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
