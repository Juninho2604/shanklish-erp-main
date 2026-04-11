'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui.store';
import { createSalesOrderAction, recordCollectiveTipAction, getMenuForPOSAction, validateManagerPinAction, type CartItem, type PaymentLine } from '@/app/actions/pos.actions';
import MixedPaymentSelector from '@/components/pos/MixedPaymentSelector';
import { getExchangeRateValue } from '@/app/actions/exchange.actions';
import { printReceipt, printKitchenCommand } from '@/lib/print-command';
import { getPOSConfig } from '@/lib/pos-settings';
import toast from 'react-hot-toast';
import WhatsAppOrderParser from '@/components/whatsapp-order-parser';
import { PriceDisplay } from '@/components/pos/PriceDisplay';
import { CurrencyCalculator } from '@/components/pos/CurrencyCalculator';

const DELIVERY_FEE_NORMAL = 4.5;
const DELIVERY_FEE_DIVISAS = 3;


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

export default function POSDeliveryPage() {
    const { posFullscreen } = useUIStore();
    const [categories, setCategories] = useState<any[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [cart, setCart] = useState<CartItem[]>([]);
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerAddress, setCustomerAddress] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);


    // MODAL STATE
    const [showModifierModal, setShowModifierModal] = useState(false);
    const [selectedItemForModifier, setSelectedItemForModifier] = useState<MenuItem | null>(null);
    const [currentModifiers, setCurrentModifiers] = useState<SelectedModifier[]>([]);
    const [itemQuantity, setItemQuantity] = useState(1);
    const [itemNotes, setItemNotes] = useState('');

    // PAYMENT STATE
    const [isMixedMode, setIsMixedMode] = useState(false);
    // Single-payment mode
    const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CASH_USD' | 'CASH_EUR' | 'CASH_BS' | 'CARD' | 'TRANSFER' | 'MOVIL_NG' | 'PDV_SHANKLISH' | 'PDV_SUPERFERRO' | 'ZELLE'>('PDV_SHANKLISH');
    const [amountReceived, setAmountReceived] = useState('');
    // Mixed-payment mode
    const [mixedPayments, setMixedPayments] = useState<PaymentLine[]>([]);
    const [mixedPaymentsComplete, setMixedPaymentsComplete] = useState(false);
    const [exchangeRate, setExchangeRate] = useState<number | null>(null);

    // DISCOUNT STATE
    const [discountType, setDiscountType] = useState<'NONE' | 'DIVISAS_33' | 'CORTESIA_100' | 'CORTESIA_PERCENT'>('NONE');
    const [authorizedManager, setAuthorizedManager] = useState<{ id: string, name: string } | null>(null);
    const [showPinModal, setShowPinModal] = useState(false);
    const [pinInput, setPinInput] = useState('');
    const [pinError, setPinError] = useState('');
    const [cortesiaPercent, setCortesiaPercent] = useState('100');

    // PROPINA COLECTIVA
    const [showTipModal, setShowTipModal] = useState(false);
    const [tipAmount, setTipAmount] = useState('');
    const [tipMethod, setTipMethod] = useState<string>('CASH_USD');
    const [tipClientRef, setTipClientRef] = useState('');
    const [isTipProcessing, setIsTipProcessing] = useState(false);

    // WHATSAPP PARSER
    const [showWhatsAppParser, setShowWhatsAppParser] = useState(false);

    // SEARCH
    const [productSearch, setProductSearch] = useState('');

    const [mobileView, setMobileView] = useState<"menu" | "order">("menu");

    useEffect(() => {
        async function loadMenu() {
            try {
                const [menuResult, rate] = await Promise.all([
                    getMenuForPOSAction(),
                    getExchangeRateValue(),
                ]);
                if (menuResult.success && menuResult.data) {
                    setCategories(menuResult.data);
                    if (menuResult.data.length > 0) setSelectedCategory(menuResult.data[0].id);
                }
                setExchangeRate(rate);
            } catch (error) { console.error(error); } finally { setIsLoading(false); }
        }
        loadMenu();
    }, []);

    useEffect(() => {
        if (selectedCategory) {
            const cat = categories.find(c => c.id === selectedCategory);
            if (cat) setMenuItems(cat.items);
        }
    }, [selectedCategory, categories]);

    useEffect(() => {
        // Auto-clear Divisas in single mode when method switches away from USD
        if (!isMixedMode && !isDivisasMethod(paymentMethod) && discountType === 'DIVISAS_33') {
            setDiscountType('NONE');
        }
    }, [isMixedMode, paymentMethod, discountType]);

    const filteredMenuItems = productSearch.trim()
        ? categories.flatMap((c: any) => c.items as MenuItem[]).filter((i) =>
              i.name.toLowerCase().includes(productSearch.toLowerCase()) ||
              i.sku?.toLowerCase().includes(productSearch.toLowerCase())
          )
        : menuItems;

    const getCategoryIcon = (name: string) => {
        if (name.includes('Tabla') || name.includes('Combo')) return '🍱';
        if (name.includes('Queso')) return '🧀';
        if (name.includes('Platos')) return '🍛';
        // ... (resto igual)
        return '📦';
    };

    const handleAddToCart = (item: MenuItem) => {
        setSelectedItemForModifier(item);
        setCurrentModifiers([]);
        setItemQuantity(1);
        setItemNotes('');
        setShowModifierModal(true);
    };

    const removeFromCart = (i: number) => {
        const nc = [...cart]; nc.splice(i, 1); setCart(nc);
    };

    // LOGICA ACTUALIZADA DE MODIFICADORES CON CANTIDAD
    const updateModifierQuantity = (group: ModifierGroup, modifier: ModifierOption, change: number) => {
        const currentInGroup = currentModifiers.filter(m => m.groupId === group.id);
        const totalSelectedInGroup = currentInGroup.reduce((s, m) => s + m.quantity, 0);
        const existingMod = currentModifiers.find(m => m.id === modifier.id && m.groupId === group.id);
        const currentQty = existingMod ? existingMod.quantity : 0;

        if (change > 0) {
            if (group.maxSelections > 1 && totalSelectedInGroup >= group.maxSelections) return;
            if (group.maxSelections === 1) {
                if (totalSelectedInGroup >= 1 && existingMod) return;
                if (totalSelectedInGroup >= 1 && !existingMod) {
                    const others = currentModifiers.filter(m => m.groupId !== group.id);
                    setCurrentModifiers([...others, {
                        groupId: group.id, groupName: group.name,
                        id: modifier.id, name: modifier.name,
                        priceAdjustment: modifier.priceAdjustment, quantity: 1
                    }]);
                    return;
                }
            }
        }

        const newQty = currentQty + change;
        if (newQty < 0) return;

        let newModifiers = [...currentModifiers];
        if (existingMod) {
            if (newQty === 0) newModifiers = newModifiers.filter(m => !(m.id === modifier.id && m.groupId === group.id));
            else newModifiers = newModifiers.map(m => (m.id === modifier.id && m.groupId === group.id) ? { ...m, quantity: newQty } : m);
        } else if (newQty > 0) {
            newModifiers.push({ groupId: group.id, groupName: group.name, id: modifier.id, name: modifier.name, priceAdjustment: modifier.priceAdjustment, quantity: newQty });
        }
        setCurrentModifiers(newModifiers);
    };

    const isGroupValid = (group: ModifierGroup) => {
        if (!group.isRequired) return true;
        const count = currentModifiers.filter(m => m.groupId === group.id).reduce((s, m) => s + m.quantity, 0);
        return count >= group.minSelections;
    };

    const confirmAddToCart = () => {
        if (!selectedItemForModifier) return;
        if (!selectedItemForModifier.modifierGroups.every(g => isGroupValid(g.modifierGroup))) return;

        const modTotal = currentModifiers.reduce((s, m) => s + (m.priceAdjustment * m.quantity), 0);
        const lineTotal = (selectedItemForModifier.price + modTotal) * itemQuantity;

        const explodedModifiers = currentModifiers.flatMap(m => Array(m.quantity).fill({ modifierId: m.id, name: m.name, priceAdjustment: m.priceAdjustment }));

        setCart([...cart, {
            menuItemId: selectedItemForModifier.id, name: selectedItemForModifier.name, quantity: itemQuantity, unitPrice: selectedItemForModifier.price,
            modifiers: explodedModifiers, notes: itemNotes || undefined, lineTotal
        }]);
        setShowModifierModal(false); setSelectedItemForModifier(null);
    };

    const cartSubtotal = cart.reduce((s, i) => s + i.lineTotal, 0);
    // Divisas methods: CASH, CASH_USD, CASH_EUR, ZELLE get 33.33% discount
    const roundToWhole = (amount: number, method: string): number =>
        (method === 'CASH_USD' || method === 'ZELLE' || method === 'CASH_BS') ? Math.round(amount) : amount;
    const isDivisasMethod = (m: string) => m === 'CASH' || m === 'CASH_USD' || m === 'CASH_EUR' || m === 'ZELLE';
    // Bs methods: user enters amount in Bs, needs conversion to USD
    const BS_SINGLE_METHODS = new Set(['PDV_SHANKLISH', 'PDV_SUPERFERRO', 'MOVIL_NG', 'CASH_BS']);
    const isBsPayMethod = BS_SINGLE_METHODS.has(paymentMethod);
    // isPagoDivisas: single mode → method must be CASH/CASH_USD/CASH_EUR/ZELLE; mixed → at least one divisas line
    const isPagoDivisas = isMixedMode
        ? mixedPayments.some(p => isDivisasMethod(p.method))
        : isDivisasMethod(paymentMethod);
    // In mixed mode, divisas discount only applies to the USD portion
    const divisasUsdAmount = isMixedMode
        ? mixedPayments.filter(p => isDivisasMethod(p.method)).reduce((s, p) => s + p.amountUSD, 0)
        : undefined; // undefined = full total gets -33%
    const cortesiaPercentNum = Math.min(100, Math.max(0, parseFloat(cortesiaPercent) || 0));
    const deliveryFee = discountType === 'DIVISAS_33' && isPagoDivisas ? DELIVERY_FEE_DIVISAS : DELIVERY_FEE_NORMAL;
    const itemsAfterDiscount = discountType === 'DIVISAS_33' && isPagoDivisas
        ? cartSubtotal - (isMixedMode ? (divisasUsdAmount ?? 0) / 3 : cartSubtotal / 3)
        : discountType === 'CORTESIA_100' ? 0
        : discountType === 'CORTESIA_PERCENT' ? cartSubtotal * (1 - cortesiaPercentNum / 100)
        : cartSubtotal;
    const finalTotal = roundToWhole(
        (discountType === 'CORTESIA_100') ? 0
        : discountType === 'CORTESIA_PERCENT' ? itemsAfterDiscount + (cortesiaPercentNum >= 100 ? 0 : deliveryFee)
        : itemsAfterDiscount + deliveryFee,
        paymentMethod
    );
    const totalMixedPaid = mixedPayments.reduce((s, p) => s + p.amountUSD, 0);

    const handleRecordTip = async () => {
        const amount = parseFloat(tipAmount);
        if (!amount || amount <= 0) return;
        setIsTipProcessing(true);
        try {
            const note = tipClientRef.trim()
                ? `Propina colectiva — Cliente: ${tipClientRef.trim()}`
                : 'Propina colectiva';
            const result = await recordCollectiveTipAction({ tipAmount: amount, paymentMethod: tipMethod, note });
            if (result.success) {
                toast.success(`Propina de $${amount.toFixed(2)} registrada`);
                setShowTipModal(false);
                setTipAmount('');
                setTipMethod('CASH_USD');
                setTipClientRef('');
            } else {
                toast.error(result.message || 'Error al registrar propina');
            }
        } finally {
            setIsTipProcessing(false);
        }
    };

    const handleCheckout = async () => {
        if (cart.length === 0) return;
        setIsProcessing(true);
        try {
            const result = await createSalesOrderAction({
                orderType: 'DELIVERY',
                customerName: customerName || 'Delivery',
                customerPhone, customerAddress: customerAddress || 'N/A',
                items: cart,
                ...(isMixedMode
                    ? { payments: mixedPayments.length > 0 ? mixedPayments : [{ method: 'TRANSFER', amountUSD: finalTotal }],
                        amountPaid: totalMixedPaid || finalTotal,
                        divisasUsdAmount: discountType === 'DIVISAS_33' ? divisasUsdAmount : undefined }
                    : (() => {
                        const rawAmt = parseFloat(amountReceived) || 0;
                        // PDV terminals always charge exact total — never need manual Bs entry
                        if (paymentMethod === 'PDV_SHANKLISH' || paymentMethod === 'PDV_SUPERFERRO') {
                            return { paymentMethod, amountPaid: finalTotal };
                        }
                        // MOVIL_NG: only do Bs→USD if rawAmt clearly looks like Bs (≥ 10× USD total)
                        // Protects against cashier entering USD amount in the Bs field
                        if (paymentMethod === 'MOVIL_NG') {
                            if (exchangeRate && rawAmt >= finalTotal * 10) {
                                const usdAmt = rawAmt / exchangeRate;
                                return { payments: [{ method: paymentMethod, amountUSD: usdAmt, amountBS: rawAmt, exchangeRate }], amountPaid: usdAmt };
                            }
                            return { paymentMethod, amountPaid: finalTotal };
                        }
                        // CASH_BS: standard Bs→USD conversion with actual bills received
                        if (isBsPayMethod && exchangeRate && rawAmt > 0) {
                            const usdAmt = rawAmt / exchangeRate;
                            return { payments: [{ method: paymentMethod, amountUSD: usdAmt, amountBS: rawAmt, exchangeRate }], amountPaid: usdAmt };
                        }
                        return { paymentMethod, amountPaid: rawAmt || finalTotal };
                    })()),
                discountType,
                discountPercent: discountType === 'CORTESIA_PERCENT' ? cortesiaPercentNum : undefined,
                authorizedById: authorizedManager?.id,
                notes: `Dirección: ${customerAddress}`
            });

            if (result.success && result.data) {
                const cfg = getPOSConfig();
                if (cfg.printComandaOnDelivery) {
                    printKitchenCommand({
                        orderNumber: result.data.orderNumber, orderType: 'DELIVERY',
                        customerName: `${customerName} (${customerPhone})`,
                        items: cart.map(i => ({ name: i.name, quantity: i.quantity, modifiers: i.modifiers.map(m => m.name), notes: i.notes })),
                        createdAt: new Date(), address: customerAddress
                    });
                }
                const receiptData = {
                    orderNumber: result.data.orderNumber,
                    orderType: 'DELIVERY' as const,
                    date: new Date(),
                    cashierName: 'Delivery',
                    customerName: customerName || undefined,
                    customerPhone: customerPhone || undefined,
                    customerAddress: customerAddress || undefined,
                    items: cart.map(i => ({
                        name: i.name,
                        quantity: i.quantity,
                        unitPrice: i.unitPrice,
                        total: i.lineTotal,
                        modifiers: i.modifiers.map(m => m.name)
                    })),
                    subtotal: cartSubtotal,
                    discount: (() => {
                        if (discountType === 'DIVISAS_33' && isPagoDivisas) {
                            const base = isMixedMode ? (divisasUsdAmount ?? cartSubtotal) : cartSubtotal;
                            return base / 3 + (DELIVERY_FEE_NORMAL - DELIVERY_FEE_DIVISAS);
                        }
                        if (discountType === 'CORTESIA_100') return cartSubtotal + DELIVERY_FEE_NORMAL;
                        if (discountType === 'CORTESIA_PERCENT') return (cartSubtotal * cortesiaPercentNum / 100);
                        return 0;
                    })(),
                    hideDiscount: discountType === 'DIVISAS_33',
                    discountReason: (() => {
                        if (discountType === 'CORTESIA_100') return 'Cortesía Autorizada (100%)';
                        if (discountType === 'CORTESIA_PERCENT') return `Cortesía Autorizada (${cortesiaPercentNum}%)`;
                        return undefined;
                    })(),
                    deliveryFee: discountType === 'CORTESIA_100' ? 0 : deliveryFee,
                    total: finalTotal
                };
                if (cfg.printReceiptOnDelivery) {
                    printReceipt(receiptData);
                }
                setCart([]); setCustomerName(''); setCustomerPhone(''); setCustomerAddress('');
                setPaymentMethod('PDV_SHANKLISH'); setAmountReceived('');
                setMixedPayments([]); setMixedPaymentsComplete(false); setIsMixedMode(false);
                setDiscountType('NONE'); setAuthorizedManager(null);
            } else toast.error(result.message ?? 'Error al procesar el pedido');
        } catch (e) { console.error(e); toast.error('Error al procesar el pedido'); } finally { setIsProcessing(false); }
    };

    const handleDiscountSelect = (t: string) => {
        if (t === 'CORTESIA_100') { setPinInput(''); setPinError(''); setCortesiaPercent('100'); setShowPinModal(true); }
        else { setDiscountType(t as any); setAuthorizedManager(null); }
    };
    const handlePinSubmit = async () => {
        const r = await validateManagerPinAction(pinInput);
        if (r.success && r.data) {
            setAuthorizedManager({ id: r.data.managerId, name: r.data.managerName });
            const pct = parseFloat(cortesiaPercent);
            setDiscountType(pct >= 100 ? 'CORTESIA_100' : 'CORTESIA_PERCENT');
            setShowPinModal(false);
        } else setPinError('PIN Inválido');
    };
    const handlePinKey = (k: string) => { if (k === 'clear') setPinInput(''); else if (k === 'back') setPinInput(p => p.slice(0, -1)); else setPinInput(p => p + k); };

    if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="text-center"><div className="text-4xl mb-4">🛵</div><div className="text-xl font-black text-foreground">Cargando Delivery...</div></div></div>;

    return (
        <div className={`${posFullscreen ? 'min-h-screen' : 'flex-1 -m-4 md:-m-6 h-[calc(100vh-4rem)]'} bg-background text-foreground flex flex-col font-sans animate-in fade-in duration-700 pb-16 lg:pb-0`}>
            <div className={`glass-panel px-3 md:px-6 py-3 md:py-4 ${posFullscreen ? 'fixed top-0 w-full z-30' : 'relative w-full z-[31]'} shadow-2xl flex justify-between items-center h-16 md:h-24 border-b-primary/10`}>
                <div className="flex items-center gap-4">
                    <div className="h-10 w-10 md:h-14 md:w-14 bg-blue-600 rounded-xl md:rounded-2xl flex items-center justify-center text-2xl md:text-4xl shadow-lg shadow-blue-500/20">🛵</div>
                    <div>
                        <h1 className="text-xl md:text-3xl font-black tracking-tighter uppercase italic text-blue-600 dark:text-blue-400">Shanklish <span className="text-foreground">Delivery</span></h1>
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
                            Sistema de Despacho Táctil CAPSULA
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="glass-panel p-2 rounded-2xl border-primary/5">
                        <CurrencyCalculator totalUsd={finalTotal} deliveryFee={discountType === 'DIVISAS_33' && isPagoDivisas ? DELIVERY_FEE_DIVISAS : DELIVERY_FEE_NORMAL} hasServiceFee={false} onRateUpdated={setExchangeRate} />
                    </div>
                    <button
                        onClick={() => setShowWhatsAppParser(!showWhatsAppParser)}
                        className={`capsula-btn min-h-0 py-3 px-6 text-sm ${showWhatsAppParser ? 'capsula-btn-primary bg-emerald-600 border-emerald-700' : 'capsula-btn-secondary'}`}
                    >
                        💬 WhatsApp
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowTipModal(true)}
                        className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-black uppercase hover:bg-amber-500/20 transition-colors"
                    >
                        + Propina
                    </button>
                    <div className="px-4 py-2 bg-secondary/30 rounded-xl border border-border font-black text-sm tabular-nums text-foreground/70">
                        {new Date().toLocaleDateString('es-VE')}
                    </div>
                </div>
            </div>

            <div className={`flex ${posFullscreen ? 'h-screen pt-16 md:pt-24' : 'flex-1 min-h-0'} overflow-hidden`}>
                <div className={`flex-1 flex flex-col overflow-hidden bg-background ${mobileView === "menu" ? "flex" : "hidden"} lg:flex`}>
                    {/* Search bar */}
                    <div className="px-6 py-4 bg-background border-b border-border">
                        <div className="relative group">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary">🔍</span>
                            <input
                                type="text"
                                value={productSearch}
                                onChange={(e) => setProductSearch(e.target.value)}
                                placeholder="Buscar producto por nombre o SKU..."
                                className="w-full bg-secondary/50 border border-border rounded-2xl py-4 pl-12 pr-12 text-base font-medium focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                            />
                            {productSearch && (
                                <button
                                    onClick={() => setProductSearch('')}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    </div>
                    {/* Categories */}
                    {!productSearch && (
                        <div className="flex gap-3 px-6 py-4 bg-background border-b border-border overflow-x-auto no-scrollbar scroll-smooth">
                            {categories.map((cat: any) => (
                                <button
                                    key={cat.id}
                                    onClick={() => setSelectedCategory(cat.id)}
                                    className={`group shrink-0 px-6 py-3 rounded-2xl font-black text-sm transition-all active:scale-95 flex items-center gap-2 border-2 ${selectedCategory === cat.id ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20' : 'bg-card border-border text-foreground/50 hover:border-primary/30'}`}
                                >
                                    <span className="text-xl group-hover:rotate-12 transition-transform">{getCategoryIcon(cat.name)}</span> {cat.name}
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="flex-1 p-6 overflow-y-auto pb-24 scroll-smooth">
                        {productSearch && (
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4">
                                💡 {filteredMenuItems.length} productos coinciden con tu búsqueda
                            </p>
                        )}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 tablet-land:grid-cols-4 xl:grid-cols-4 gap-3">
                            {filteredMenuItems.map(item => (
                                <button
                                    key={item.id}
                                    onClick={() => handleAddToCart(item)}
                                    className="capsula-card group p-3 md:p-5 text-left h-32 md:h-40 flex flex-col justify-between border-primary/5 hover:border-primary/40 active:scale-[0.98] transition-transform"
                                >
                                    <div className="font-black text-base uppercase leading-tight tracking-tight group-hover:text-primary transition-colors">{item.name}</div>
                                    <div className="flex items-end justify-between">
                                        <div className="text-2xl font-black text-primary italic">
                                            <PriceDisplay usd={item.price} rate={exchangeRate} size="lg" showBs={false} />
                                        </div>
                                        <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all lg:translate-y-4 lg:group-hover:translate-y-0">
                                            ➕
                                        </div>
                                    </div>
                                </button>
                            ))}
                            {filteredMenuItems.length === 0 && (
                                <div className="col-span-full flex flex-col items-center justify-center py-20 text-muted-foreground opacity-50">
                                    <span className="text-6xl mb-4">🔍</span>
                                    <p className="font-black uppercase tracking-widest">Sin resultados</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className={`w-full lg:w-[460px] xl:w-[520px] bg-card border-l border-border flex flex-col shadow-2xl z-20 ${mobileView === "order" ? "flex" : "hidden"} lg:flex`}>
                    <div className="p-6 bg-secondary/20 border-b border-border space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="font-black text-lg uppercase tracking-tight flex items-center gap-2">📦 Entrega</h2>
                            <span className="text-[10px] font-black bg-blue-500/10 text-blue-600 px-2 py-1 rounded-full border border-blue-500/20">NUEVA ORDEN</span>
                        </div>
                        <div className="space-y-3">
                            <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="👤 Nombre Cliente" className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm font-bold focus:border-primary focus:ring-0 transition-all" />
                            <input type="text" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="📞 Teléfono" className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm font-bold focus:border-primary focus:ring-0 transition-all" />
                            <textarea value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} placeholder="📍 Dirección exacta de entrega..." className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm font-bold focus:border-primary focus:ring-0 transition-all h-16 resize-none" />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-card/50 no-scrollbar">
                        {cart.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-muted-foreground/30 py-10">
                                <span className="text-5xl mb-2">🛒</span>
                                <p className="text-xs font-black uppercase tracking-widest">Carrito Vacío</p>
                            </div>
                        )}
                        {cart.map((item, i) => (
                            <div key={i} className="glass-panel p-4 rounded-2xl border-primary/5 flex justify-between group relative overflow-hidden active:scale-95 transition-transform">
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary/20"></div>
                                <div>
                                    <div className="font-black text-sm flex gap-2"><span className="text-primary tracking-tighter">x{item.quantity}</span> {item.name}</div>
                                    <div className="text-[10px] uppercase font-bold text-muted-foreground mt-1 pl-5">{item.modifiers.map(m => m.name).join(' · ')}</div>
                                    {item.notes && <div className="text-[10px] font-black text-blue-500 pl-5 italic mt-1 bg-blue-500/5 py-1 px-2 rounded-lg">💬 "{item.notes}"</div>}
                                </div>
                                <div className="text-right flex flex-col justify-between items-end">
                                    <div className="font-black text-sm text-foreground">${item.lineTotal.toFixed(2)}</div>
                                    <button onClick={() => removeFromCart(i)} className="h-6 w-6 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all">🗑️</button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="overflow-y-auto p-6 bg-secondary/30 border-t border-border space-y-4 shrink-0 max-h-[520px]">
                        <div className="capsula-card p-4 space-y-2 border-primary/10 shadow-lg">
                            <div className="flex justify-between text-xs font-black text-muted-foreground uppercase tracking-widest">
                                <span>Subtotal Orden</span>
                                <PriceDisplay usd={cartSubtotal} rate={exchangeRate} size="sm" showBs={false} />
                            </div>
                            <div className="flex justify-between text-xs font-black text-blue-600 uppercase tracking-widest">
                                <span>🛵 Tarifa Delivery</span>
                                <span>+${deliveryFee.toFixed(2)}</span>
                            </div>
                            {discountType === 'DIVISAS_33' && isPagoDivisas && (
                                <div className="flex justify-between text-xs font-black text-primary uppercase tracking-widest bg-primary/10 p-2 rounded-lg">
                                    <span>Descuento % Divisas</span>
                                    <span>-${((divisasUsdAmount ?? cartSubtotal) / 3 + DELIVERY_FEE_NORMAL - DELIVERY_FEE_DIVISAS).toFixed(2)}</span>
                                </div>
                            )}
                            <div className="flex justify-between font-black text-xl text-foreground border-t border-border pt-2 mt-2">
                                <span className="uppercase tracking-tighter italic">Total</span>
                                <div className="text-primary italic">
                                    <PriceDisplay usd={finalTotal} rate={exchangeRate} size="lg" showBs={false} />
                                </div>
                            </div>
                            {/* Calculadora USD → Bs inline en el panel de cobro */}
                            <div className="pt-1">
                                <CurrencyCalculator
                                    totalUsd={finalTotal}
                                    deliveryFee={discountType === 'DIVISAS_33' && isPagoDivisas ? DELIVERY_FEE_DIVISAS : DELIVERY_FEE_NORMAL}
                                    hasServiceFee={false}
                                    onRateUpdated={setExchangeRate}
                                    inline
                                    startCollapsed
                                />
                            </div>
                        </div>

                        {/* Descuentos y Pagos */}
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => handleDiscountSelect('NONE')} className={`py-3.5 rounded-xl text-sm font-black uppercase tracking-widest transition-all ${discountType === 'NONE' ? 'bg-secondary text-foreground border-2 border-primary/50' : 'bg-background border border-border text-muted-foreground'}`}>Normal</button>
                                <button onClick={() => handleDiscountSelect('DIVISAS_33')} className={`py-3.5 rounded-xl text-sm font-black uppercase tracking-widest transition-all ${discountType === 'DIVISAS_33' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-background border border-border text-primary'}`}>Divisa -33%</button>
                                <button onClick={() => handleDiscountSelect('CORTESIA_100')} className={`col-span-2 py-3.5 rounded-xl text-sm font-black uppercase tracking-widest transition-all ${(discountType === 'CORTESIA_100' || discountType === 'CORTESIA_PERCENT') ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'bg-background border border-border text-purple-600'}`}>
                                    {(discountType === 'CORTESIA_100' || discountType === 'CORTESIA_PERCENT')
                                        ? `🎁 Cortesía ${discountType === 'CORTESIA_PERCENT' ? cortesiaPercentNum + '%' : '100%'} — ${authorizedManager?.name || ''}`
                                        : '🎁 Cortesía (Autorizar PIN)'}
                                </button>
                            </div>

                            {/* Modo de pago: Pago Único / Pago Mixto */}
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => { setIsMixedMode(false); setMixedPayments([]); }}
                                    className={`py-3.5 rounded-xl text-sm font-black uppercase tracking-tight transition-all ${!isMixedMode ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-background border border-border text-muted-foreground'}`}
                                >
                                    Pago Único
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setIsMixedMode(true); setAmountReceived(''); }}
                                    className={`py-3.5 rounded-xl text-sm font-black uppercase tracking-tight transition-all ${isMixedMode ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-background border border-border text-muted-foreground'}`}
                                >
                                    💳 Pago Mixto
                                </button>
                            </div>

                            {!isMixedMode ? (
                                /* ── Pago Único ── */
                                <div className="space-y-3">
                                    <div className="grid grid-cols-3 gap-2">
                                        {([
                                            { id: 'CASH_USD',       label: '💵 Cash $' },
                                            { id: 'CASH_EUR',       label: '€ Cash €' },
                                            { id: 'ZELLE',          label: '⚡ Zelle' },
                                            { id: 'PDV_SHANKLISH',  label: '💳 PDV Shan.' },
                                            { id: 'PDV_SUPERFERRO', label: '💳 PDV Super.' },
                                            { id: 'MOVIL_NG',       label: '📱 Pago Móvil NG' },
                                            { id: 'CASH_BS',        label: '💴 Efectivo Bs' },
                                        ] as const).map(m => (
                                            <button key={m.id} type="button" onClick={() => { setPaymentMethod(m.id); setAmountReceived(''); }}
                                                className={`py-3.5 rounded-xl text-sm font-black uppercase transition-all active:scale-95 ${paymentMethod === m.id ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-background border border-border text-muted-foreground'}`}>
                                                {m.label}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-2 bg-background border border-border p-1 rounded-2xl">
                                        <input type="number" value={amountReceived} onChange={e => setAmountReceived(e.target.value)}
                                            placeholder={isBsPayMethod && exchangeRate ? `Bs ${(finalTotal * exchangeRate).toFixed(0)}` : 'Recibido...'}
                                            className="flex-1 bg-transparent border-none rounded-xl px-4 py-3 text-lg font-black focus:ring-0 placeholder:text-muted-foreground/30" />
                                        <div className="pr-4 text-xs font-black text-muted-foreground uppercase">
                                            {isBsPayMethod ? 'Bs' : 'USD'}
                                        </div>
                                    </div>
                                    {/* USD equivalent for Bs methods */}
                                    {isBsPayMethod && exchangeRate && (parseFloat(amountReceived) || 0) > 0 && (
                                        <div className="flex justify-between text-xs px-1">
                                            <span className="text-muted-foreground">Equivalente USD</span>
                                            <span className="font-bold text-emerald-400">${((parseFloat(amountReceived) || 0) / exchangeRate).toFixed(2)}</span>
                                        </div>
                                    )}
                                    {/* Change display for CASH_USD */}
                                    {paymentMethod === 'CASH_USD' && (parseFloat(amountReceived) || 0) > finalTotal + 0.001 && (
                                        <div className="flex justify-between text-sm font-black px-1">
                                            <span className="text-amber-400">Vuelto</span>
                                            <span className="text-amber-400">${Math.max(0, (parseFloat(amountReceived) || 0) - finalTotal).toFixed(2)}</span>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                /* ── Pago Mixto ── */
                                <div className="space-y-2">
                                    <MixedPaymentSelector
                                        key={`delivery-mixed-${isMixedMode}`}
                                        totalAmount={finalTotal}
                                        exchangeRate={exchangeRate}
                                        onChange={(lines, _paid, complete) => {
                                            setMixedPayments(lines);
                                            setMixedPaymentsComplete(complete);
                                        }}
                                        disabled={isProcessing}
                                    />
                                    {discountType === 'DIVISAS_33' && (divisasUsdAmount ?? 0) > 0 && (
                                        <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/30 px-3 py-2 text-xs text-indigo-300 space-y-0.5">
                                            <div className="flex justify-between">
                                                <span>Divisas sobre ${(divisasUsdAmount ?? 0).toFixed(2)} USD</span>
                                                <span className="font-black">-${((divisasUsdAmount ?? 0) / 3).toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between font-black text-white">
                                                <span>Total a cobrar</span>
                                                <span>${finalTotal.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <button onClick={handleCheckout} disabled={cart.length === 0 || isProcessing} className="capsula-btn capsula-btn-primary w-full py-6 text-xl shadow-2xl shadow-primary/30">
                                {isProcessing ? 'PROCESANDO...' : `CONFIRMAR ORDEN`}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* WhatsApp Parser Modal */}
            {showWhatsAppParser && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-md z-60 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-card glass-panel w-full max-w-2xl rounded-3xl flex flex-col max-h-[90vh] shadow-2xl border-primary/20">
                        <div className="p-5 border-b border-border flex justify-between items-center flex-shrink-0">
                            <h3 className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
                                <span className="text-2xl">💬</span> Pegar Chat de WhatsApp
                            </h3>
                            <button
                                onClick={() => setShowWhatsAppParser(false)}
                                className="h-10 w-10 rounded-full hover:bg-red-500/10 hover:text-red-500 transition-colors text-2xl flex items-center justify-center"
                            >
                                &times;
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-5 no-scrollbar">
                            <WhatsAppOrderParser
                                onOrderReady={(items, name, phone, address) => {
                                    setCart(items);
                                    setCustomerName(name);
                                    setCustomerPhone(phone);
                                    setCustomerAddress(address);
                                    setShowWhatsAppParser(false);
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {showModifierModal && selectedItemForModifier && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-md z-60 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in zoom-in duration-300">
                    <div className="bg-card glass-panel w-full max-w-lg rounded-t-3xl sm:rounded-3xl flex flex-col max-h-[92vh] sm:max-h-[90vh] shadow-2xl border-primary/20">
                        <div className="p-6 border-b border-border flex justify-between items-center">
                            <div>
                                <h3 className="text-2xl font-black uppercase tracking-tight">{selectedItemForModifier.name}</h3>
                                <div className="text-primary font-black text-2xl italic mt-1">
                                    <PriceDisplay usd={selectedItemForModifier.price} rate={exchangeRate} size="lg" showBs={false} />
                                </div>
                            </div>
                            <button onClick={() => setShowModifierModal(false)} className="h-12 w-12 rounded-full hover:bg-red-500/10 hover:text-red-500 transition-colors text-3xl flex items-center justify-center">&times;</button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
                            {selectedItemForModifier.modifierGroups?.map((groupRel) => {
                                const group = groupRel.modifierGroup;
                                const totalSelector = currentModifiers.filter(m => m.groupId === group.id).reduce((s, m) => s + m.quantity, 0);
                                const isValid = !group.isRequired || totalSelector >= group.minSelections;
                                return (
                                    <div key={group.id} className={`p-5 rounded-3xl border-2 transition-colors ${isValid ? 'border-border bg-secondary/20' : 'border-red-500 bg-red-500/5'}`}>
                                        <div className="flex justify-between items-center mb-4">
                                            <h4 className="font-black text-sm uppercase tracking-widest text-foreground/70">{group.name}</h4>
                                            <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${isValid ? 'bg-primary/20 text-primary' : 'bg-red-500 text-white animate-bounce'}`}>
                                                {totalSelector}/{group.maxSelections} {group.isRequired ? '• Requerido' : ''}
                                            </span>
                                        </div>
                                        <div className="grid gap-3">
                                            {group.modifiers.map(mod => {
                                                const existing = currentModifiers.find(m => m.id === mod.id && m.groupId === group.id);
                                                const qty = existing ? existing.quantity : 0;
                                                const isMax = group.maxSelections > 1 && totalSelector >= group.maxSelections;
                                                const isRadio = group.maxSelections === 1;
                                                return (
                                                    <div key={mod.id} className={`flex justify-between items-center p-4 rounded-2xl border-2 transition-all ${qty > 0 ? 'bg-primary/10 border-primary' : 'bg-background border-border hover:border-primary/30'}`}>
                                                        <div className="font-bold text-sm">{mod.name}</div>
                                                        {isRadio ? (
                                                            <button 
                                                                onClick={() => updateModifierQuantity(group, mod, 1)} 
                                                                className={`h-8 w-8 rounded-full border-2 flex justify-center items-center transition-all ${qty > 0 ? 'bg-primary border-primary text-white scale-110 shadow-lg shadow-primary/30' : 'border-border hover:border-primary'}`}
                                                            >
                                                                {qty > 0 && '✓'}
                                                            </button>
                                                        ) : (
                                                            <div className="flex items-center gap-3 bg-card p-1 rounded-2xl border border-border shadow-inner">
                                                                <button onClick={() => updateModifierQuantity(group, mod, -1)} disabled={qty === 0} className={`h-8 w-8 rounded-xl font-black transition-all ${qty === 0 ? 'text-muted-foreground opacity-20' : 'bg-secondary text-foreground hover:bg-red-500 hover:text-white hover:scale-105'}`}>-</button>
                                                                <span className="font-black text-lg w-6 text-center text-primary">{qty}</span>
                                                                <button onClick={() => updateModifierQuantity(group, mod, 1)} disabled={isMax} className={`h-8 w-8 rounded-xl font-black transition-all ${isMax ? 'text-muted-foreground opacity-20' : 'bg-primary text-white hover:scale-105 shadow-lg shadow-primary/20'}`}>+</button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })}
                            
                            <div className="bg-secondary/20 p-6 rounded-3xl border border-border">
                                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3 block">Instrucciones Especiales (Opcional)</label>
                                <textarea value={itemNotes} onChange={e => setItemNotes(e.target.value)} className="w-full bg-background rounded-2xl p-4 h-24 text-sm font-bold border border-border focus:border-primary focus:ring-0 transition-all resize-none" placeholder="Escribe aquí si el cliente tiene alguna petición..." />
                            </div>

                            <div className="flex items-center justify-between glass-panel p-6 rounded-3xl border-primary/5">
                                <span className="font-black uppercase tracking-tighter text-lg">Cantidad</span>
                                <div className="flex items-center gap-2 bg-background p-1.5 rounded-2xl border border-border shadow-inner">
                                    <button onClick={() => setItemQuantity(Math.max(1, itemQuantity - 1))} className="h-14 w-14 rounded-xl font-black text-2xl hover:bg-secondary transition-all active:scale-90">-</button>
                                    <span className="w-16 text-center font-black text-3xl italic text-primary">{itemQuantity}</span>
                                    <button onClick={() => setItemQuantity(itemQuantity + 1)} className="h-14 w-14 rounded-xl bg-primary text-white font-black text-2xl shadow-xl shadow-primary/30 hover:scale-105 active:scale-95">+</button>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 border-t border-border flex gap-4">
                            <button onClick={() => setShowModifierModal(false)} className="capsula-btn capsula-btn-secondary flex-1 py-5 text-sm">CANCELAR</button>
                            <button onClick={confirmAddToCart} disabled={selectedItemForModifier?.modifierGroups.some(g => !isGroupValid(g.modifierGroup))} className="capsula-btn capsula-btn-primary flex-[2] py-5 text-sm shadow-xl shadow-primary/30">AGREGAR AL CARRITO</button>
                        </div>
                    </div>
                </div>
            )}

            {showPinModal && (
                <div className="fixed inset-0 bg-background/90 backdrop-blur-xl flex items-end sm:items-center justify-center z-[60] animate-in fade-in duration-500 p-0 sm:p-4">
                    <div className="bg-card glass-panel p-6 md:p-8 rounded-t-[2rem] sm:rounded-[2.5rem] w-full max-w-md shadow-2xl border-purple-500/20">
                        <div className="text-center mb-6">
                            <div className="h-16 w-16 bg-purple-500/10 rounded-3xl flex items-center justify-center text-4xl mx-auto mb-4">🎁</div>
                            <h3 className="font-black text-2xl uppercase tracking-tighter text-purple-600 dark:text-purple-400 italic">Autorizar Cortesía</h3>
                            <p className="text-xs font-medium text-muted-foreground mt-1">Este descuento requiere validación de gerencia</p>
                        </div>
                        
                        <div className="space-y-6">
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center mb-3">Selecciona el % de descuento</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {['25','50','75','100'].map(v => (
                                        <button key={v} onClick={() => setCortesiaPercent(v)}
                                            className={`py-3 rounded-2xl text-sm font-black transition-all active:scale-95 ${cortesiaPercent === v ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'bg-secondary text-muted-foreground hover:bg-purple-500/10 hover:text-purple-600'}`}>
                                            {v}%
                                        </button>
                                    ))}
                                </div>
                                <div className="mt-3 relative">
                                    <input type="number" min="1" max="100" value={cortesiaPercent}
                                        onChange={e => setCortesiaPercent(e.target.value)}
                                        className="w-full bg-secondary/50 border border-border rounded-2xl py-4 text-center font-black text-xl focus:border-purple-500 focus:outline-none transition-all placeholder:text-muted-foreground/30"
                                        placeholder="Valor %" />
                                    <span className="absolute right-6 top-1/2 -translate-y-1/2 font-black text-purple-600">%</span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center mb-3">Introduce tu PIN de Seguridad</label>
                                <div className="bg-secondary/40 border border-border rounded-3xl p-6 text-4xl tracking-[1.5em] mb-4 font-black flex justify-center items-center h-24 text-purple-600 shadow-inner">
                                    {pinInput.length > 0 ? pinInput.replace(/./g, '•') : <span className="text-muted-foreground/10 tracking-normal text-xl font-medium">MODO PIN...</span>}
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                                        <button key={n} onClick={() => handlePinKey(n.toString())} className="h-16 rounded-2xl bg-secondary hover:bg-purple-500/10 hover:text-purple-600 font-black text-2xl transition-all active:scale-90 border border-border/50 shadow-sm">{n}</button>
                                    ))}
                                    <button onClick={() => handlePinKey('clear')} className="h-16 rounded-2xl bg-red-500/10 text-red-500 font-black text-lg hover:bg-red-500 hover:text-white transition-all active:scale-90 border border-red-500/20 shadow-sm">CLR</button>
                                    <button key={0} onClick={() => handlePinKey('0')} className="h-16 rounded-2xl bg-secondary hover:bg-purple-500/10 hover:text-purple-600 font-black text-2xl transition-all active:scale-90 border border-border/50 shadow-sm">0</button>
                                    <button onClick={() => handlePinKey('back')} className="h-16 rounded-2xl bg-secondary hover:bg-purple-500/10 hover:text-purple-600 font-black text-2xl transition-all active:scale-90 border border-border/50 shadow-sm">⌫</button>
                                </div>
                            </div>

                            {pinError && <div className="bg-red-500/10 border border-red-500/20 text-red-600 text-xs font-black text-center py-3 rounded-2xl animate-bounce">{pinError}</div>}

                            <div className="grid grid-cols-2 gap-4 pt-2">
                                <button onClick={() => { setShowPinModal(false); setPinInput(''); }} className="capsula-btn capsula-btn-secondary py-4 font-black uppercase tracking-widest">Cerrar</button>
                                <button onClick={handlePinSubmit} disabled={!pinInput} className="capsula-btn capsula-btn-primary bg-purple-600 border-purple-700 shadow-lg shadow-purple-500/20 py-4 font-black uppercase tracking-widest">Validar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* ── MODAL: PROPINA COLECTIVA ─────────────────────────────────────── */}
            {showTipModal && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-md z-60 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-card glass-panel w-full max-w-sm rounded-3xl shadow-2xl border border-amber-500/20 p-6 space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xl font-black uppercase tracking-tight text-amber-400">Propina Colectiva</h3>
                            <button type="button" onClick={() => setShowTipModal(false)} className="text-muted-foreground hover:text-foreground text-2xl leading-none">×</button>
                        </div>
                        <p className="text-xs text-muted-foreground">Propina recibida después del cobro. Indica el cliente para trazabilidad.</p>
                        {/* Cliente / referencia */}
                        <input
                            type="text"
                            value={tipClientRef}
                            onChange={e => setTipClientRef(e.target.value)}
                            placeholder="Nombre del cliente (opcional)"
                            className="w-full bg-background border border-border rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-amber-500/50 placeholder:text-muted-foreground/40"
                        />
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
                                autoFocus
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

            {/* Navegación móvil delivery */}
            <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border flex z-50 shadow-2xl">
                <button
                onClick={() => setMobileView("menu")}
                className={`flex-1 py-3 flex flex-col items-center gap-1 text-[9px] font-black uppercase tracking-widest relative transition-colors      
                    ${mobileView === "menu" ? "text-blue-500 bg-blue-500/5" : "text-muted-foreground"}`}
                >
                {mobileView === "menu" && <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 rounded-b" />}
                <span className="text-xl">🍽️</span>
                MENÚ
                </button>
                <button
                onClick={() => setMobileView("order")}
                className={`flex-1 py-3 flex flex-col items-center gap-1 text-[9px] font-black uppercase tracking-widest relative transition-colors      
                    ${mobileView === "order" ? "text-blue-500 bg-blue-500/5" : "text-muted-foreground"}`}
                >
                {mobileView === "order" && <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 rounded-b" />}
                <span className="text-xl">📦</span>
                ORDEN
                {cart.length > 0 && (
                    <span className="absolute top-1 right-8 bg-blue-500 text-white text-[9px] rounded-full min-w-[16px] h-4 flex items-center
            justify-center font-black px-1">
                    {cart.length}
                    </span>
                )}
                </button>
            </nav>
        </div>
    );
}
