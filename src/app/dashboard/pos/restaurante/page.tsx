'use client';

import { useState, useEffect, useRef } from 'react';

import PrintTicket from '@/components/pos/PrintTicket';
import { createSalesOrderAction, getMenuForPOSAction, validateManagerPinAction, type CartItem } from '@/app/actions/pos.actions';
import { printReceipt, printKitchenCommand } from '@/lib/print-command';

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
    modifierGroups: {
        modifierGroup: ModifierGroup
    }[];
}

interface SelectedModifier {
    groupId: string;
    groupName: string;
    id: string;
    name: string;
    priceAdjustment: number;
    quantity: number;
}

export default function POSRestaurantPage() {
    // Hooks de Impresion
    const ticketRef = useRef<HTMLDivElement>(null);

    const handlePrintTicket = () => {
        const printContent = ticketRef.current;
        if (!printContent) return;

        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow?.document;
        if (doc) {
            doc.open();
            doc.write(`
                <html>
                <head>
                    <title>Factura</title>
                    <style>
                        @page { size: 80mm auto; margin: 0; }
                        body { 
                            width: 72mm; 
                            min-width: 72mm; 
                            max-width: 72mm; 
                            margin: 0 auto; 
                            padding: 2mm; 
                            font-family: 'Times New Roman', serif; 
                        }
                        * { box-sizing: border-box; }
                        
                        .text-center { text-align: center; }
                        .text-right { text-align: right; }
                        .font-bold { font-weight: bold; }
                        .italic { font-style: italic; }
                        .uppercase { text-transform: uppercase; }
                        .leading-tight { line-height: 1.1; }
                        
                        .flex { display: flex; }
                        .flex-col { display: flex; flex-direction: column; }
                        .justify-between { justify-content: space-between; }
                        .justify-end { justify-content: flex-end; }
                        .items-end { align-items: flex-end; }
                        .flex-1 { flex: 1; }
                        
                        /* Dimensiones */
                        .w-full { width: 100%; }
                        .w-8 { width: 8mm; display: inline-block; text-align: right; margin-right: 2px; }
                        .w-12 { width: 12mm; display: inline-block; }
                        .w-14 { width: 14mm; display: inline-block; text-align: right; }
                        .w-16 { width: 16mm; display: inline-block; text-align: right; }
                        /* w-48 ajustado para que ocupe todo el ancho disponible en ticket pequeño */
                        .w-48 { width: 100%; } 
                        
                        /* Espaciado */
                        .mb-1 { margin-bottom: 3px; }
                        .mb-2 { margin-bottom: 6px; }
                        .mb-4 { margin-bottom: 12px; }
                        .mt-1 { margin-top: 3px; }
                        .mt-2 { margin-top: 6px; }
                        .mt-8 { margin-top: 24px; }
                        .mr-2 { margin-right: 6px; }
                        .pb-2 { padding-bottom: 6px; }
                        .pl-10 { padding-left: 10mm; }
                        .my-2 { margin-top: 6px; margin-bottom: 6px; }
                        
                        /* Bordes */
                        .border-b { border-bottom: 1px solid #000; }
                        .border-t { border-top: 1px dashed #000; }
                        .border-dashed { border-style: dashed; }
                        
                        /* Tipografia Tailwind Escapada */
                        .text-\\[10px\\] { font-size: 10px; }
                        .text-\\[11px\\] { font-size: 11px; }
                        .text-\\[12px\\] { font-size: 12px; }
                        .text-\\[14px\\] { font-size: 14px; }
                        .text-3xl { font-size: 20px; }
                        .font-serif { font-family: 'Times New Roman', serif; }
                        
                        .hidden { display: none; }
                    </style>
                </head>
                <body>
                    ${printContent.innerHTML}
                </body>
                </html>
            `);
            doc.close();

            setTimeout(() => {
                iframe.contentWindow?.focus();
                iframe.contentWindow?.print();
                setTimeout(() => document.body.removeChild(iframe), 5000);
            }, 500);
        }
    };

    const [categories, setCategories] = useState<any[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [cart, setCart] = useState<CartItem[]>([]);
    const [customerName, setCustomerName] = useState('');
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
    const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'TRANSFER' | 'MOBILE_PAY'>('CASH');
    const [amountReceived, setAmountReceived] = useState('');

    // DISCOUNT STATE
    const [discountType, setDiscountType] = useState<'NONE' | 'DIVISAS_33' | 'CORTESIA_100'>('NONE');
    const [authorizedManager, setAuthorizedManager] = useState<{ id: string, name: string } | null>(null);
    const [showPinModal, setShowPinModal] = useState(false);
    const [pinInput, setPinInput] = useState('');
    const [pinError, setPinError] = useState('');

    // RESPONSIVE STATE
    const [showMobileCart, setShowMobileCart] = useState(false);

    useEffect(() => {
        async function loadMenu() {
            try {
                const result = await getMenuForPOSAction();
                if (result.success && result.data) {
                    setCategories(result.data);
                    if (result.data.length > 0) {
                        setSelectedCategory(result.data[0].id);
                    }
                }
            } catch (error) {
                console.error('Error cargando menú:', error);
            } finally {
                setIsLoading(false);
            }
        }
        loadMenu();
    }, []);

    useEffect(() => {
        if (selectedCategory) {
            const category = categories.find(c => c.id === selectedCategory);
            if (category) {
                setMenuItems(category.items);
            }
        }
    }, [selectedCategory, categories]);

    const getCategoryIcon = (name: string) => {
        if (name.includes('Tabla') || name.includes('Combo')) return '🍱';
        if (name.includes('Queso')) return '🧀';
        if (name.includes('Platos')) return '🍛';
        if (name.includes('Shawarma')) return '🥙';
        if (name.includes('Especial')) return '⭐';
        if (name.includes('Ensalada')) return '🥗';
        if (name.includes('Crema')) return '🥣';
        if (name.includes('Bebida')) return '🥤';
        if (name.includes('Postre')) return '🍨';
        return '🍽️';
    };

    const handleAddToCart = (item: MenuItem) => {
        setSelectedItemForModifier(item);
        setCurrentModifiers([]);
        setItemQuantity(1);
        setItemNotes('');
        setShowModifierModal(true);
    };

    const removeFromCart = (index: number) => {
        const newCart = [...cart];
        newCart.splice(index, 1);
        setCart(newCart);
    };

    // UPDATE QUANTITY LOGIC
    const updateModifierQuantity = (group: ModifierGroup, modifier: ModifierOption, change: number) => {
        const currentInGroup = currentModifiers.filter(m => m.groupId === group.id);
        const totalSelectedInGroup = currentInGroup.reduce((sum, m) => sum + m.quantity, 0);
        const existingMod = currentModifiers.find(m => m.id === modifier.id && m.groupId === group.id);
        const currentQty = existingMod ? existingMod.quantity : 0;

        // Validaciones
        if (change > 0) {
            // Check Max Selections
            if (group.maxSelections > 1 && totalSelectedInGroup >= group.maxSelections) return;

            // Radio Button Logic (Max 1)
            if (group.maxSelections === 1) {
                if (totalSelectedInGroup >= 1 && existingMod) return; // Ya tiene este
                if (totalSelectedInGroup >= 1 && !existingMod) {
                    // Reemplazar selección anterior
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
            if (newQty === 0) {
                newModifiers = newModifiers.filter(m => !(m.id === modifier.id && m.groupId === group.id));
            } else {
                newModifiers = newModifiers.map(m => (m.id === modifier.id && m.groupId === group.id) ? { ...m, quantity: newQty } : m);
            }
        } else if (newQty > 0) {
            newModifiers.push({
                groupId: group.id, groupName: group.name,
                id: modifier.id, name: modifier.name,
                priceAdjustment: modifier.priceAdjustment, quantity: newQty
            });
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
        const allGroupsValid = selectedItemForModifier.modifierGroups.every(g => isGroupValid(g.modifierGroup));
        if (!allGroupsValid) return;

        const modifierTotal = currentModifiers.reduce((sum, m) => sum + (m.priceAdjustment * m.quantity), 0);
        const lineTotal = (selectedItemForModifier.price + modifierTotal) * itemQuantity;

        // Flatten modifiers for cart
        const explodedModifiers = currentModifiers.flatMap(m => {
            return Array(m.quantity).fill({
                modifierId: m.id,
                name: m.name,
                priceAdjustment: m.priceAdjustment
            });
        });

        const newItem: CartItem = {
            menuItemId: selectedItemForModifier.id,
            name: selectedItemForModifier.name,
            quantity: itemQuantity,
            unitPrice: selectedItemForModifier.price,
            modifiers: explodedModifiers,
            notes: itemNotes || undefined,
            lineTotal,
        };

        setCart([...cart, newItem]);
        setShowModifierModal(false);
        setSelectedItemForModifier(null);
    };

    // Totales
    const cartTotal = cart.reduce((sum, item) => sum + item.lineTotal, 0);
    const discountAmount = discountType === 'DIVISAS_33' ? cartTotal * 0.33 : (discountType === 'CORTESIA_100' ? cartTotal : 0);
    const finalTotal = cartTotal - discountAmount;
    const paidAmount = parseFloat(amountReceived) || 0;
    const changeAmount = paidAmount - finalTotal;

    const handleCheckout = async () => {
        if (cart.length === 0) return;
        setIsProcessing(true);
        try {
            const result = await createSalesOrderAction({
                orderType: 'RESTAURANT',
                customerName: customerName || 'Cliente Restaurante',
                items: cart,
                paymentMethod,
                amountPaid: paidAmount || finalTotal,
                discountType,
                authorizedById: authorizedManager?.id,
                notes: undefined
            });

            if (result.success && result.data) {
                printKitchenCommand({
                    orderNumber: result.data.orderNumber,
                    orderType: 'RESTAURANT',
                    customerName: customerName,
                    items: cart.map(item => ({
                        name: item.name,
                        quantity: item.quantity,
                        modifiers: item.modifiers.map(m => m.name),
                        notes: item.notes,
                    })),
                    createdAt: new Date(),
                });

                setLastOrder({
                    orderNumber: result.data.orderNumber,
                    total: finalTotal,
                    subtotal: cartTotal,
                    discount: discountAmount,
                    itemsSnapshot: cart.map(item => ({
                        sku: '00-000',
                        name: item.name,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        total: item.lineTotal,
                        modifiers: item.modifiers.map(m => m.name),
                    })),
                });

                setCart([]);
                setCustomerName('');
                setAmountReceived('');
                setDiscountType('NONE');
                setAuthorizedManager(null);
                setShowMobileCart(false);
            } else {
                alert(result.message);
            }
        } catch (error) {
            console.error('Error venta:', error);
            alert('Error procesando venta');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDiscountSelect = (type: string) => {
        if (type === 'CORTESIA_100') {
            setPinInput(''); setPinError(''); setShowPinModal(true);
        } else {
            setDiscountType(type as any); setAuthorizedManager(null);
        }
    };
    const handlePinSubmit = async () => {
        const res = await validateManagerPinAction(pinInput);
        if (res.success && res.data) {
            setAuthorizedManager({ id: res.data.managerId, name: res.data.managerName });
            setDiscountType('CORTESIA_100'); setShowPinModal(false);
        } else setPinError('PIN inválido');
    };
    const handlePinKey = (k: string) => {
        if (k === 'back') setPinInput(p => p.slice(0, -1));
        else if (k === 'clear') setPinInput('');
        else setPinInput(p => p + k);
    };

    if (isLoading) return <div className="text-white p-10">Cargando menú...</div>;

    return (
        <div className="min-h-screen bg-gray-900 text-white relative">
            <div className="bg-gradient-to-r from-amber-600 to-orange-600 px-6 py-4 fixed top-0 w-full z-30 flex justify-between items-center shadow-md">
                <div className="flex items-center gap-3">
                    <span className="text-3xl">🧀</span>
                    <div>
                        <h1 className="text-2xl font-bold">Shanklish POS</h1>
                        <p className="text-amber-100 text-sm">Restaurante</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <button className="lg:hidden bg-gray-800 p-2 rounded-lg" onClick={() => setShowMobileCart(true)}>
                        🛒 <b>${cartTotal.toFixed(2)}</b>
                    </button>
                    <p className="hidden lg:block font-mono text-lg">{new Date().toLocaleDateString('es-VE')}</p>
                </div>
            </div>

            <div className="flex h-screen pt-[5rem]">
                <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex gap-2 p-4 bg-gray-800 border-b border-gray-700 overflow-x-auto whitespace-nowrap snap-x">
                        {categories.map(cat => (
                            <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} className={`flex-shrink-0 px-5 py-3 rounded-xl font-bold text-lg transition-all flex items-center gap-2 snap-start ${selectedCategory === cat.id ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' : 'bg-gray-700 text-gray-300'}`}>
                                <span>{getCategoryIcon(cat.name)}</span> {cat.name}
                            </button>
                        ))}
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto pb-24">
                        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                            {menuItems.map(item => (
                                <button key={item.id} onClick={() => handleAddToCart(item)} className="bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-amber-500/50 rounded-2xl p-5 text-left transition-all hover:scale-[1.01] h-40 flex flex-col justify-between shadow-lg">
                                    <div className="font-bold text-lg leading-tight line-clamp-2">{item.name}</div>
                                    <div className="text-3xl font-black text-amber-500">${item.price.toFixed(2)}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className={`fixed inset-0 z-40 bg-gray-900 flex flex-col transition-transform duration-300 lg:static lg:bg-gray-800 lg:w-96 lg:translate-x-0 lg:border-l lg:border-gray-700 ${showMobileCart ? 'translate-x-0' : 'translate-x-full'}`}>
                    <div className="lg:hidden p-4 border-b border-gray-700 flex justify-between bg-gray-800">
                        <h2 className="font-bold text-xl">Carrito</h2>
                        <button onClick={() => setShowMobileCart(false)}>✕</button>
                    </div>
                    <div className="p-4 border-b border-gray-700 bg-gray-800/50">
                        <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Cliente / Mesa" className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-white focus:border-amber-500 outline-none" />
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {cart.length === 0 ? (
                            <div className="text-center text-gray-500 mt-10">Vacío 🛒</div>
                        ) : (
                            cart.map((item, i) => (
                                <div key={i} className="bg-gray-700 p-3 rounded-lg border border-gray-600 relative group">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="flex items-center gap-2 font-bold"><span className="bg-amber-500 text-black w-5 h-5 flex items-center justify-center rounded-full text-xs">{item.quantity}</span> {item.name}</div>
                                            {item.modifiers.length > 0 && <div className="text-xs text-gray-400 mt-1 pl-7">{item.modifiers.map(m => m.name).join(', ')}</div>}
                                            {item.notes && <div className="text-xs text-amber-300 mt-1 pl-7 italic">"{item.notes}"</div>}
                                        </div>
                                        <div className="text-right">
                                            <div className="font-bold text-amber-400">${item.lineTotal.toFixed(2)}</div>
                                            <button onClick={() => removeFromCart(i)} className="text-red-400 text-xs hover:underline mt-1">Quitar</button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    <div className="p-4 bg-gray-800 border-t border-gray-700 space-y-3">
                        <div className="flex gap-2">
                            <button onClick={() => handleDiscountSelect('NONE')} className={`flex-1 py-2 text-xs font-bold rounded ${discountType === 'NONE' ? 'bg-gray-500 text-white' : 'bg-gray-700'}`}>Normal</button>
                            <button onClick={() => handleDiscountSelect('DIVISAS_33')} className={`flex-1 py-2 text-xs font-bold rounded ${discountType === 'DIVISAS_33' ? 'bg-blue-600 text-white' : 'bg-gray-700'}`}>-33%</button>
                            <button onClick={() => handleDiscountSelect('CORTESIA_100')} className={`flex-1 py-2 text-xs font-bold rounded ${discountType === 'CORTESIA_100' ? 'bg-purple-600 text-white' : 'bg-gray-700'}`}>Cortesía</button>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                            {['CASH', 'CARD', 'MOBILE_PAY', 'TRANSFER'].map(m => (
                                <button key={m} onClick={() => setPaymentMethod(m as any)} className={`py-2 rounded text-xs font-bold ${paymentMethod === m ? 'bg-amber-500 text-black' : 'bg-gray-700'}`}>
                                    {m === 'CASH' ? '💵' : m === 'CARD' ? '💳' : m === 'MOBILE_PAY' ? '📱' : '🏦'}
                                </button>
                            ))}
                        </div>
                        <div className="bg-gray-900 p-3 rounded-lg border border-gray-700">
                            {paymentMethod === 'CASH' && (
                                <div className="mb-2 border-b border-gray-700 pb-2">
                                    <label className="text-xs text-gray-400">Recibido:</label>
                                    <input type="number" value={amountReceived} onChange={e => setAmountReceived(e.target.value)} className="w-full bg-gray-800 border border-gray-600 rounded p-1 text-right text-white font-bold" />
                                </div>
                            )}
                            <div className="flex justify-between text-lg font-bold"><span>Total</span> <span>${finalTotal.toFixed(2)}</span></div>
                            {paymentMethod === 'CASH' && changeAmount > 0 && <div className="flex justify-between text-green-400 text-sm"><span>Cambio</span> <span>${changeAmount.toFixed(2)}</span></div>}
                        </div>
                        <button onClick={handleCheckout} disabled={cart.length === 0 || isProcessing} className="w-full py-4 bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl font-black text-xl shadow-lg disabled:opacity-50">
                            {isProcessing ? '...' : `COBRAR $${finalTotal.toFixed(2)}`}
                        </button>
                    </div>
                </div>
            </div>

            {!showMobileCart && cart.length > 0 && (
                <button onClick={() => setShowMobileCart(true)} className="lg:hidden fixed bottom-6 right-6 bg-amber-500 text-black px-6 py-4 rounded-full font-bold shadow-2xl z-50 animate-bounce">
                    🛒 ${cartTotal.toFixed(2)}
                </button>
            )}

            {showModifierModal && selectedItemForModifier && (
                <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-gray-800 w-full max-w-lg rounded-2xl flex flex-col max-h-[90vh] shadow-2xl border border-gray-700">
                        <div className="p-5 border-b border-gray-700 flex justify-between items-start bg-gray-850">
                            <div>
                                <h3 className="text-2xl font-bold text-white leading-none">{selectedItemForModifier.name}</h3>
                                <p className="text-amber-500 font-bold text-xl mt-1">${selectedItemForModifier.price.toFixed(2)}</p>
                            </div>
                            <button onClick={() => setShowModifierModal(false)} className="text-gray-400 hover:text-white text-3xl leading-none">&times;</button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-5 space-y-6">
                            {selectedItemForModifier.modifierGroups?.map((groupRel, idx) => {
                                const group = groupRel.modifierGroup;
                                const totalSelected = currentModifiers.filter(m => m.groupId === group.id).reduce((s, m) => s + m.quantity, 0);
                                const isValid = !group.isRequired || totalSelected >= group.minSelections;

                                return (
                                    <div key={group.id} className={`p-4 rounded-xl border-2 ${isValid ? 'border-gray-700 bg-gray-750' : 'border-red-500/50 bg-red-900/10'}`}>
                                        <div className="flex justify-between mb-3">
                                            <h4 className="font-bold text-lg text-amber-100">{group.name}</h4>
                                            <span className={`text-xs font-bold px-2 py-1 rounded ${isValid ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                                                {totalSelected} / {group.maxSelections}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-1 gap-2">
                                            {group.modifiers.map(mod => {
                                                const existing = currentModifiers.find(m => m.id === mod.id && m.groupId === group.id);
                                                const qty = existing ? existing.quantity : 0;
                                                const isMaxReached = group.maxSelections > 1 && totalSelected >= group.maxSelections;
                                                const isRadio = group.maxSelections === 1;

                                                return (
                                                    <div key={mod.id} className={`flex justify-between items-center p-3 rounded-lg border transition-all ${qty > 0 ? 'bg-amber-900/30 border-amber-500' : 'bg-gray-800 border-gray-600'}`}>
                                                        <span className="text-gray-200 font-medium">{mod.name}</span>
                                                        {isRadio ? (
                                                            <button
                                                                onClick={() => updateModifierQuantity(group, mod, 1)}
                                                                className={`w-6 h-6 rounded-full border flex items-center justify-center ${qty > 0 ? 'bg-amber-500 border-amber-500 text-black' : 'border-gray-500'}`}
                                                            >
                                                                {qty > 0 && '✓'}
                                                            </button>
                                                        ) : (
                                                            <div className="flex items-center gap-3 bg-gray-900 rounded-lg p-1">
                                                                <button
                                                                    onClick={() => updateModifierQuantity(group, mod, -1)}
                                                                    className={`w-8 h-8 rounded flex items-center justify-center font-bold transition-colors ${qty > 0 ? 'bg-gray-700 text-white hover:bg-gray-600' : 'text-gray-600 cursor-not-allowed'}`}
                                                                    disabled={qty === 0}
                                                                >
                                                                    -
                                                                </button>
                                                                <span className="w-6 text-center font-bold text-amber-500">{qty}</span>
                                                                <button
                                                                    onClick={() => updateModifierQuantity(group, mod, 1)}
                                                                    className={`w-8 h-8 rounded flex items-center justify-center font-bold transition-colors ${(!isMaxReached) ? 'bg-amber-600 text-white hover:bg-amber-500' : 'bg-gray-800 text-gray-600 cursor-not-allowed'}`}
                                                                    disabled={isMaxReached}
                                                                >
                                                                    +
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        {group.minSelections > 0 && totalSelected < group.minSelections && (
                                            <p className="text-red-400 text-xs mt-2 text-right">Faltan {group.minSelections - totalSelected}</p>
                                        )}
                                    </div>
                                );
                            })}

                            <div className="bg-gray-750 p-4 rounded-xl border border-gray-700">
                                <label className="text-sm text-gray-400 uppercase font-bold block mb-2">Notas de Cocina</label>
                                <textarea value={itemNotes} onChange={e => setItemNotes(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-white h-20 resize-none focus:border-amber-500 outline-none" placeholder="Sin cebolla, extra picante..." />
                            </div>

                            <div className="flex items-center justify-between bg-gray-750 p-4 rounded-xl border border-gray-700">
                                <span className="font-bold text-lg">Cantidad</span>
                                <div className="flex items-center gap-4 bg-gray-900 rounded-full p-1">
                                    <button onClick={() => setItemQuantity(Math.max(1, itemQuantity - 1))} className="w-10 h-10 rounded-full bg-gray-700 hover:bg-gray-600 font-bold text-xl">-</button>
                                    <span className="w-8 text-center font-bold text-xl">{itemQuantity}</span>
                                    <button onClick={() => setItemQuantity(itemQuantity + 1)} className="w-10 h-10 rounded-full bg-amber-500 text-black hover:bg-amber-400 font-bold text-xl">+</button>
                                </div>
                            </div>
                        </div>

                        <div className="p-5 border-t border-gray-700 bg-gray-850 flex gap-3">
                            <button onClick={() => setShowModifierModal(false)} className="flex-1 py-3 bg-gray-700 rounded-xl font-bold hover:bg-gray-600">Cancelar</button>
                            <button
                                onClick={confirmAddToCart}
                                disabled={selectedItemForModifier?.modifierGroups.some(g => !isGroupValid(g.modifierGroup))}
                                className="flex-[2] py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-black rounded-xl font-black text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                AGREGAR
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showPinModal && (
                <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[60]">
                    <div className="bg-gray-800 p-6 rounded-2xl w-80">
                        <h3 className="text-center font-bold text-xl mb-4">PIN Gerente</h3>
                        <div className="bg-black p-4 rounded text-center text-3xl tracking-widest mb-4">{pinInput.replace(/./g, '*')}</div>
                        <div className="grid grid-cols-3 gap-2 mb-4">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(n => <button key={n} onClick={() => handlePinKey(n.toString())} className="bg-gray-700 p-4 rounded font-bold text-xl">{n}</button>)}
                            <button onClick={() => handlePinKey('clear')} className="bg-red-900 text-red-200 rounded font-bold">C</button>
                            <button onClick={() => handlePinKey('back')} className="bg-gray-600 rounded font-bold">⌫</button>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setShowPinModal(false)} className="flex-1 py-3 bg-gray-700 rounded">Cancelar</button>
                            <button onClick={handlePinSubmit} className="flex-1 py-3 bg-amber-500 text-black rounded font-bold">OK</button>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal de Éxito / Factura */}
            {lastOrder && (
                <div className="fixed inset-0 z-[70] bg-black/95 flex items-center justify-center p-4">
                    <div className="bg-white text-black w-full max-w-md rounded-2xl p-8 text-center shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <span className="text-5xl">✅</span>
                        </div>

                        <h2 className="text-3xl font-black mb-2 font-serif text-gray-900">¡Orden Exitosa!</h2>
                        <p className="text-xl text-gray-600 font-serif mb-8">Orden #{lastOrder.orderNumber}</p>

                        <div className="flex flex-col gap-4">
                            <button
                                onClick={() => handlePrintTicket()}
                                className="w-full py-5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-bold text-xl flex items-center justify-center gap-3 shadow-lg transition-all"
                            >
                                <span>🖨️</span> IMPRIMIR FACTURA
                            </button>

                            <button
                                onClick={() => setLastOrder(null)}
                                className="w-full py-4 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl font-bold text-lg border-2 border-gray-200"
                            >
                                Nueva Orden
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Componente Oculto para Impresión */}
            {lastOrder && (
                <div style={{ display: 'none' }}>
                    <PrintTicket
                        ref={ticketRef}
                        data={{
                            orderNumber: lastOrder.orderNumber,
                            orderType: 'RESTAURANT', // Siempre es restaurant aqui
                            items: lastOrder.itemsSnapshot.map(i => ({
                                name: i.name,
                                quantity: i.quantity,
                                unitPrice: i.unitPrice,
                                lineTotal: i.total,
                                modifiers: i.modifiers.map((m: string) => ({ name: m, priceAdjustment: 0 })) // Snapshot simple
                            })),
                            subtotal: lastOrder.subtotal,
                            total: lastOrder.total,
                            paymentMethod: 'CASH', // TODO: Pasar método real si se guardó en lastOrder
                            amountPaid: lastOrder.total, // fallback
                            change: 0,
                            date: new Date()
                        }}
                    />
                </div>
            )}
        </div>
    );
}
