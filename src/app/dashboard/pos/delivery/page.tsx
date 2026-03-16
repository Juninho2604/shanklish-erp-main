'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { createSalesOrderAction, getMenuForPOSAction, validateManagerPinAction, type CartItem } from '@/app/actions/pos.actions';
import { getExchangeRateValue } from '@/app/actions/exchange.actions';
import { printReceipt, printKitchenCommand } from '@/lib/print-command';
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
    const [categories, setCategories] = useState<any[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [cart, setCart] = useState<CartItem[]>([]);
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerAddress, setCustomerAddress] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    // lastOrder
    const [lastOrder, setLastOrder] = useState<{
        orderNumber: string;
        total: number;
        subtotal: number;
        discount: number;
        itemsSnapshot: any[];
    } | null>(null);

    // MODAL STATE
    const [showModifierModal, setShowModifierModal] = useState(false);
    const [selectedItemForModifier, setSelectedItemForModifier] = useState<MenuItem | null>(null);
    const [currentModifiers, setCurrentModifiers] = useState<SelectedModifier[]>([]);
    const [itemQuantity, setItemQuantity] = useState(1);
    const [itemNotes, setItemNotes] = useState('');

    // PAYMENT STATE
    const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'TRANSFER' | 'MOBILE_PAY' | 'ZELLE'>('TRANSFER');
    const [amountReceived, setAmountReceived] = useState('');
    const [exchangeRate, setExchangeRate] = useState<number | null>(null);

    // DISCOUNT STATE
    const [discountType, setDiscountType] = useState<'NONE' | 'DIVISAS_33' | 'CORTESIA_100'>('NONE');
    const [authorizedManager, setAuthorizedManager] = useState<{ id: string, name: string } | null>(null);
    const [showPinModal, setShowPinModal] = useState(false);
    const [pinInput, setPinInput] = useState('');
    const [pinError, setPinError] = useState('');

    // WHATSAPP PARSER
    const [showWhatsAppParser, setShowWhatsAppParser] = useState(false);

    // SEARCH
    const [productSearch, setProductSearch] = useState('');

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
        if (paymentMethod !== 'CASH' && paymentMethod !== 'ZELLE' && discountType === 'DIVISAS_33') {
            setDiscountType('NONE');
        }
    }, [paymentMethod, discountType]);

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
    const isPagoDivisas = paymentMethod === 'CASH' || paymentMethod === 'ZELLE';
    const deliveryFee = discountType === 'DIVISAS_33' && isPagoDivisas ? DELIVERY_FEE_DIVISAS : DELIVERY_FEE_NORMAL;
    const itemsAfterDiscount = discountType === 'DIVISAS_33' && isPagoDivisas ? cartSubtotal * (2 / 3) : (discountType === 'CORTESIA_100' ? 0 : cartSubtotal);
    const finalTotal = discountType === 'CORTESIA_100' ? 0 : itemsAfterDiscount + deliveryFee;
    const paidAmount = parseFloat(amountReceived) || 0;

    const handleCheckout = async () => {
        if (cart.length === 0) return;
        setIsProcessing(true);
        try {
            const result = await createSalesOrderAction({
                orderType: 'DELIVERY',
                customerName: customerName || 'Delivery',
                customerPhone, customerAddress: customerAddress || 'N/A', // Asegurar que no sea null
                items: cart, paymentMethod, amountPaid: paidAmount || finalTotal, discountType, authorizedById: authorizedManager?.id, notes: `Dirección: ${customerAddress}`
            });

            if (result.success && result.data) {
                printKitchenCommand({
                    orderNumber: result.data.orderNumber, orderType: 'DELIVERY',
                    customerName: `${customerName} (${customerPhone})`,
                    items: cart.map(i => ({ name: i.name, quantity: i.quantity, modifiers: i.modifiers.map(m => m.name), notes: i.notes })),
                    createdAt: new Date(), address: customerAddress
                });
                printReceipt({
                    orderNumber: result.data.orderNumber,
                    orderType: 'DELIVERY',
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
                    discount: discountType === 'DIVISAS_33' && isPagoDivisas ? cartSubtotal / 3 + DELIVERY_FEE_NORMAL - DELIVERY_FEE_DIVISAS : (discountType === 'CORTESIA_100' ? cartSubtotal + DELIVERY_FEE_NORMAL : 0),
                    discountReason: discountType === 'DIVISAS_33' && isPagoDivisas ? 'Pago en divisas -33.33%' : (discountType === 'CORTESIA_100' ? 'Cortesía 100%' : undefined),
                    deliveryFee: discountType === 'CORTESIA_100' ? 0 : deliveryFee,
                    total: finalTotal
                });

                setCart([]); setCustomerName(''); setCustomerPhone(''); setCustomerAddress(''); setPaymentMethod('TRANSFER'); setAmountReceived('');
                setDiscountType('NONE'); setAuthorizedManager(null);
            } else alert(result.message);
        } catch (e) { console.error(e); alert('Error'); } finally { setIsProcessing(false); }
    };

    const handleDiscountSelect = (t: string) => { if (t === 'CORTESIA_100') { setPinInput(''); setPinError(''); setShowPinModal(true); } else { setDiscountType(t as any); setAuthorizedManager(null); } };
    const handlePinSubmit = async () => { const r = await validateManagerPinAction(pinInput); if (r.success && r.data) { setAuthorizedManager({ id: r.data.managerId, name: r.data.managerName }); setDiscountType('CORTESIA_100'); setShowPinModal(false); } else setPinError('PIN Inválido'); };
    const handlePinKey = (k: string) => { if (k === 'clear') setPinInput(''); else if (k === 'back') setPinInput(p => p.slice(0, -1)); else setPinInput(p => p + k); };

    if (isLoading) return <div className="text-white p-10">Cargando...</div>;

    return (
        <div className="min-h-screen bg-gray-950 text-white relative flex flex-col font-sans">
            <div className="bg-gradient-to-r from-blue-700 to-indigo-800 px-6 py-4 fixed top-0 w-full z-30 shadow-xl flex justify-between items-center h-20">
                <div className="flex items-center gap-3">
                    <span className="text-4xl">🛵</span>
                    <div><h1 className="text-2xl font-black">Shanklish Delivery</h1><p className="text-blue-200 text-xs font-bold uppercase">Sistema de Despacho</p></div>
                </div>
                <div className="flex items-center gap-3">
                    <CurrencyCalculator totalUsd={finalTotal} deliveryFee={discountType === 'DIVISAS_33' && isPagoDivisas ? DELIVERY_FEE_DIVISAS : DELIVERY_FEE_NORMAL} hasServiceFee={false} onRateUpdated={setExchangeRate} className="bg-white/10 hover:bg-white/20 text-white" />
                    <button
                        onClick={() => setShowWhatsAppParser(!showWhatsAppParser)}
                        className={cn(
                            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all',
                            showWhatsAppParser
                                ? 'bg-green-500 text-white shadow-lg'
                                : 'bg-white/10 text-white/80 hover:bg-white/20'
                        )}
                    >
                        💬 WhatsApp
                    </button>
                    <p className="font-mono text-xl">{new Date().toLocaleDateString('es-VE')}</p>
                </div>
            </div>

            <div className="flex h-screen pt-20 overflow-hidden">
                <div className="flex-1 flex flex-col overflow-hidden bg-gray-900">
                    {/* WhatsApp Parser Panel */}
                    {showWhatsAppParser ? (
                        <div className="flex-1 overflow-y-auto p-4 pb-24">
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
                    ) : (
                        <>
                            {/* Search bar */}
                            <div className="px-3 pt-3 pb-1 bg-gray-800 border-b border-gray-700">
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                                    <input
                                        type="text"
                                        value={productSearch}
                                        onChange={(e) => setProductSearch(e.target.value)}
                                        placeholder="Buscar producto..."
                                        className="w-full bg-gray-700 border border-gray-600 rounded-xl py-2 pl-9 pr-9 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                                    />
                                    {productSearch && (
                                        <button
                                            onClick={() => setProductSearch('')}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>
                            </div>
                            {/* Categories */}
                            {!productSearch && (
                                <div className="flex gap-2 p-3 bg-gray-800 border-b border-gray-700 overflow-x-auto whitespace-nowrap">
                                    {categories.map((cat: any) => (
                                        <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} className={`px-5 py-3 rounded-lg font-bold transition-all flex items-center gap-2 ${selectedCategory === cat.id ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}>
                                            <span>{getCategoryIcon(cat.name)}</span> {cat.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="flex-1 p-4 overflow-y-auto pb-24">
                                {productSearch && (
                                    <p className="text-xs text-gray-400 mb-3">
                                        {filteredMenuItems.length} resultado(s) para &quot;{productSearch}&quot;
                                    </p>
                                )}
                                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {filteredMenuItems.map(item => (
                                        <button key={item.id} onClick={() => handleAddToCart(item)} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-blue-500 rounded-xl p-4 text-left shadow-md group h-36 flex flex-col justify-between">
                                            <div className="font-bold text-lg leading-tight group-hover:text-blue-300">{item.name}</div>
                                            <div className="text-2xl font-black text-blue-400">${item.price.toFixed(2)}</div>
                                        </button>
                                    ))}
                                    {filteredMenuItems.length === 0 && (
                                        <div className="col-span-full text-center text-gray-500 py-12 text-sm">
                                            Sin resultados para &quot;{productSearch}&quot;
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                        )}
                </div>

                <div className="w-96 bg-gray-900 border-l border-gray-800 flex flex-col shadow-2xl z-20">
                    <div className="p-4 bg-gray-800 border-b border-gray-700">
                        <h2 className="font-black text-xl mb-3 flex items-center gap-2">📦 Datos de Entrega</h2>
                        <div className="space-y-2">
                            <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Nombre Cliente" className="w-full bg-gray-700 border-none rounded p-2 text-white focus:ring-2 focus:ring-blue-500" />
                            <input type="text" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="Teléfono" className="w-full bg-gray-700 border-none rounded p-2 text-white focus:ring-2 focus:ring-blue-500" />
                            <textarea value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} placeholder="Dirección exacta..." className="w-full bg-gray-700 border-none rounded p-2 text-white focus:ring-2 focus:ring-blue-500 h-20 resize-none text-sm" />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-900/50">
                        {cart.map((item, i) => (
                            <div key={i} className="bg-gray-800 p-3 rounded border border-gray-700 flex justify-between group">
                                <div>
                                    <div className="font-bold text-sm flex gap-2"><span className="text-blue-400">x{item.quantity}</span> {item.name}</div>
                                    <div className="text-xs text-gray-400 pl-6">{item.modifiers.map(m => m.name).join(', ')}</div>
                                    {item.notes && <div className="text-xs text-blue-300 pl-6 italic">"{item.notes}"</div>}
                                </div>
                                <div className="text-right">
                                    <div className="font-bold text-sm">${item.lineTotal.toFixed(2)}</div>
                                    <button onClick={() => removeFromCart(i)} className="text-red-500 text-xs hover:underline opacity-0 group-hover:opacity-100">Borrar</button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="p-4 bg-gray-800 border-t border-gray-700 space-y-3">
                        <div className="rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-xs space-y-1">
                            <div className="flex justify-between text-gray-400">
                                <span>Subtotal</span>
                                <PriceDisplay usd={cartSubtotal} rate={exchangeRate} size="sm" showBs={false} />
                            </div>
                            <div className="flex justify-between text-gray-400">
                                <span>🛵 Delivery</span>
                                <span className="text-blue-300">${deliveryFee.toFixed(2)}</span>
                            </div>
                            {discountType === 'DIVISAS_33' && isPagoDivisas && (
                                <div className="flex justify-between text-blue-400">
                                    <span>Descuento divisas -33.33%</span>
                                    <span>-${(cartSubtotal / 3 + DELIVERY_FEE_NORMAL - DELIVERY_FEE_DIVISAS).toFixed(2)}</span>
                                </div>
                            )}
                            {discountType === 'CORTESIA_100' && (
                                <div className="flex justify-between text-purple-400">
                                    <span>Cortesía 100%</span>
                                    <span>-${(cartSubtotal + DELIVERY_FEE_NORMAL).toFixed(2)}</span>
                                </div>
                            )}
                            <div className="flex justify-between font-bold text-white border-t border-gray-700 pt-1">
                                <span>Total</span>
                                <PriceDisplay usd={finalTotal} rate={exchangeRate} size="sm" showBs={false} />
                            </div>
                        </div>
                        <div className="flex gap-1">
                            <button onClick={() => handleDiscountSelect('NONE')} className={`flex-1 py-1.5 text-[10px] font-bold rounded ${discountType === 'NONE' ? 'bg-blue-900 text-blue-200 ring-1 ring-blue-500' : 'bg-gray-700 text-gray-300'}`}>Normal</button>
                            <button onClick={() => isPagoDivisas && handleDiscountSelect('DIVISAS_33')} disabled={!isPagoDivisas} title={!isPagoDivisas ? 'Solo con Efectivo o Zelle' : 'Descuento divisas - Delivery $3'} className={`flex-1 py-1.5 text-[10px] font-bold rounded ${discountType === 'DIVISAS_33' ? 'bg-blue-600 text-white' : isPagoDivisas ? 'bg-gray-700 text-gray-300' : 'bg-gray-800 text-gray-600 cursor-not-allowed opacity-60'}`}>Divisa -33%</button>
                            <button onClick={() => handleDiscountSelect('CORTESIA_100')} className={`flex-1 py-1.5 text-[10px] font-bold rounded ${discountType === 'CORTESIA_100' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300'}`}>Cortesía</button>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                            {(['TRANSFER', 'MOBILE_PAY', 'CASH', 'ZELLE', 'CARD'] as const).map(m => (
                                <button key={m} onClick={() => setPaymentMethod(m)} className={`py-2 text-[10px] font-bold rounded ${paymentMethod === m ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>
                                    {m === 'TRANSFER' ? 'Transf' : m === 'MOBILE_PAY' ? 'P.Móvil' : m === 'CASH' ? 'Efect' : m === 'ZELLE' ? 'Zelle' : 'Punto'}
                                </button>
                            ))}
                        </div>
                        <input
                            type="number"
                            value={amountReceived}
                            onChange={(e) => setAmountReceived(e.target.value)}
                            placeholder={`Monto recibido ($${finalTotal.toFixed(2)})`}
                            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                        {cart.length > 0 && (
                            <button
                                onClick={() => {
                                    const orderRef = `DELV-${new Date().toISOString().slice(0, 10)}-${String(Date.now()).slice(-4)}`;
                                    printReceipt({
                                        orderNumber: orderRef,
                                        orderType: 'DELIVERY',
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
                                        discount: discountType === 'DIVISAS_33' && isPagoDivisas ? cartSubtotal / 3 + DELIVERY_FEE_NORMAL - DELIVERY_FEE_DIVISAS : (discountType === 'CORTESIA_100' ? cartSubtotal + DELIVERY_FEE_NORMAL : 0),
                                        discountReason: discountType === 'DIVISAS_33' && isPagoDivisas ? 'Pago en divisas -33.33%' : (discountType === 'CORTESIA_100' ? 'Cortesía 100%' : undefined),
                                        deliveryFee: discountType === 'CORTESIA_100' ? 0 : deliveryFee,
                                        total: finalTotal
                                    });
                                }}
                                className="w-full py-2 border border-gray-600 rounded-lg text-xs font-bold text-gray-300 hover:bg-gray-700 transition flex items-center justify-center gap-2"
                            >
                                🖨️ Imprimir factura
                            </button>
                        )}
                        <button onClick={handleCheckout} disabled={cart.length === 0 || isProcessing} className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xl shadow-lg disabled:opacity-50">
                            {isProcessing ? 'PROCESANDO...' : `CONFIRMAR $${finalTotal.toFixed(2)}`}
                        </button>
                    </div>
                </div>
            </div>

            {showModifierModal && selectedItemForModifier && (
                <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-gray-800 w-full max-w-lg rounded-2xl flex flex-col max-h-[90vh] shadow-2xl border border-gray-700">
                        <div className="p-5 border-b border-gray-700 flex justify-between bg-gray-850">
                            <div><h3 className="text-2xl font-bold">{selectedItemForModifier.name}</h3><p className="text-blue-400 font-bold text-xl">${selectedItemForModifier.price.toFixed(2)}</p></div>
                            <button onClick={() => setShowModifierModal(false)} className="text-4xl leading-none hover:text-red-500">&times;</button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-5 space-y-4">
                            {selectedItemForModifier.modifierGroups?.map((groupRel) => {
                                const group = groupRel.modifierGroup;
                                const totalSelector = currentModifiers.filter(m => m.groupId === group.id).reduce((s, m) => s + m.quantity, 0);
                                const isValid = !group.isRequired || totalSelector >= group.minSelections;
                                return (
                                    <div key={group.id} className={`p-4 rounded-xl border ${isValid ? 'border-gray-600 bg-gray-750' : 'border-red-500 bg-red-900/10'}`}>
                                        <div className="flex justify-between mb-2">
                                            <h4 className="font-bold text-blue-100">{group.name}</h4>
                                            <span className={`text-xs px-2 py-0.5 rounded ${isValid ? 'bg-blue-900 text-blue-300' : 'bg-red-800 text-red-200'}`}>{totalSelector}/{group.maxSelections}</span>
                                        </div>
                                        <div className="grid gap-2">
                                            {group.modifiers.map(mod => {
                                                const existing = currentModifiers.find(m => m.id === mod.id && m.groupId === group.id);
                                                const qty = existing ? existing.quantity : 0;
                                                const isMax = group.maxSelections > 1 && totalSelector >= group.maxSelections;
                                                const isRadio = group.maxSelections === 1;
                                                return (
                                                    <div key={mod.id} className={`flex justify-between items-center p-3 rounded-lg border ${qty > 0 ? 'bg-blue-900/40 border-blue-500' : 'bg-gray-800 border-gray-600'}`}>
                                                        <span>{mod.name}</span>
                                                        {isRadio ? (
                                                            <button onClick={() => updateModifierQuantity(group, mod, 1)} className={`w-6 h-6 rounded-full border flex justify-center items-center ${qty > 0 ? 'bg-blue-500 border-blue-500' : 'border-gray-500'}`}>{qty > 0 && '✓'}</button>
                                                        ) : (
                                                            <div className="flex gap-2 bg-gray-900 p-1 rounded">
                                                                <button onClick={() => updateModifierQuantity(group, mod, -1)} disabled={qty === 0} className={`w-6 h-6 ${qty === 0 ? 'text-gray-600' : 'text-white'}`}>-</button>
                                                                <span className="font-bold text-blue-400">{qty}</span>
                                                                <button onClick={() => updateModifierQuantity(group, mod, 1)} disabled={isMax} className={`w-6 h-6 ${isMax ? 'text-gray-600' : 'text-blue-400'}`}>+</button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })}
                            <div className="bg-gray-750 p-4 rounded-xl border border-gray-600">
                                <label className="text-xs font-bold uppercase text-gray-400 mb-2 block">Notas</label>
                                <textarea value={itemNotes} onChange={e => setItemNotes(e.target.value)} className="w-full bg-gray-900 rounded p-3 h-20 text-white border-none focus:ring-2 focus:ring-blue-500" placeholder="Instrucciones..." />
                            </div>
                            <div className="flex items-center justify-between bg-gray-750 p-4 rounded-xl border border-gray-600">
                                <span className="font-bold">Cantidad</span>
                                <div className="flex bg-gray-900 rounded-lg">
                                    <button onClick={() => setItemQuantity(Math.max(1, itemQuantity - 1))} className="w-12 h-10 hover:bg-gray-700 font-bold">-</button>
                                    <span className="w-10 h-10 flex items-center justify-center font-bold">{itemQuantity}</span>
                                    <button onClick={() => setItemQuantity(itemQuantity + 1)} className="w-12 h-10 bg-blue-600 hover:bg-blue-500 font-bold text-white rounded-r-lg">+</button>
                                </div>
                            </div>
                        </div>
                        <div className="p-4 border-t border-gray-700 flex gap-3">
                            <button onClick={() => setShowModifierModal(false)} className="flex-1 py-3 bg-gray-700 rounded-lg font-bold">Cancelar</button>
                            <button onClick={confirmAddToCart} disabled={selectedItemForModifier?.modifierGroups.some(g => !isGroupValid(g.modifierGroup))} className="flex-[2] py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-bold shadow-lg disabled:opacity-50">AGREGAR</button>
                        </div>
                    </div>
                </div>
            )}

            {showPinModal && (
                <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[60]">
                    <div className="bg-gray-800 p-6 rounded-2xl w-80 text-center">
                        <h3 className="font-bold text-xl mb-4">Autorización</h3>
                        <div className="bg-black p-4 rounded text-2xl tracking-widest mb-4 font-mono">{pinInput.replace(/./g, '*')}</div>
                        <div className="grid grid-cols-3 gap-2 mb-4">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(n => <button key={n} onClick={() => handlePinKey(n.toString())} className="bg-gray-700 p-3 rounded font-bold text-xl">{n}</button>)}
                            <button onClick={() => handlePinKey('clear')} className="bg-red-800 rounded font-bold text-red-200">C</button>
                            <button onClick={() => handlePinKey('back')} className="bg-gray-600 rounded font-bold">⌫</button>
                        </div>
                        <div className="flex gap-2"><button onClick={() => setShowPinModal(false)} className="flex-1 bg-gray-600 py-2 rounded">Cancelar</button><button onClick={handlePinSubmit} className="flex-1 bg-blue-600 py-2 rounded font-bold">OK</button></div>
                    </div>
                </div>
            )}
        </div>
    );
}
