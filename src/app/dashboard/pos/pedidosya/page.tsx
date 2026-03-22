'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { getMenuForPOSAction, type CartItem } from '@/app/actions/pos.actions';
import { createPedidosYAOrderAction } from '@/app/actions/pedidosya.actions';
import { printKitchenCommand } from '@/lib/print-command';
import { getPOSConfig } from '@/lib/pos-settings';

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

export default function POSPedidosYAPage() {
    const [categories, setCategories] = useState<any[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);

    const [cart, setCart] = useState<CartItem[]>([]);
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerAddress, setCustomerAddress] = useState('');
    const [externalOrderId, setExternalOrderId] = useState('');
    const [notes, setNotes] = useState('');
    const [productSearch, setProductSearch] = useState('');

    // MODIFIER MODAL
    const [showModifierModal, setShowModifierModal] = useState(false);
    const [selectedItemForModifier, setSelectedItemForModifier] = useState<MenuItem | null>(null);
    const [currentModifiers, setCurrentModifiers] = useState<SelectedModifier[]>([]);
    const [itemQuantity, setItemQuantity] = useState(1);
    const [itemNotes, setItemNotes] = useState('');

    // Last order for reprint
    const [lastOrder, setLastOrder] = useState<{ orderNumber: string; items: CartItem[]; customerName: string } | null>(null);

    useEffect(() => {
        getMenuForPOSAction().then(res => {
            if (res.success && res.data) {
                setCategories(res.data);
                if (res.data.length > 0) setSelectedCategory(res.data[0].id);
            }
        }).finally(() => setIsLoading(false));
    }, []);

    useEffect(() => {
        if (selectedCategory) {
            const cat = categories.find((c: any) => c.id === selectedCategory);
            if (cat) setMenuItems(cat.items);
        }
    }, [selectedCategory, categories]);

    const filteredMenuItems = productSearch.trim()
        ? categories.flatMap((c: any) => c.items as MenuItem[]).filter(i =>
            i.name.toLowerCase().includes(productSearch.toLowerCase()) ||
            i.sku?.toLowerCase().includes(productSearch.toLowerCase())
        )
        : menuItems;

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

    const updateModifierQuantity = (group: ModifierGroup, modifier: ModifierOption, change: number) => {
        const currentInGroup = currentModifiers.filter(m => m.groupId === group.id);
        const totalSelected = currentInGroup.reduce((s, m) => s + m.quantity, 0);
        const existing = currentModifiers.find(m => m.id === modifier.id && m.groupId === group.id);
        const currentQty = existing ? existing.quantity : 0;

        if (change > 0) {
            if (group.maxSelections > 1 && totalSelected >= group.maxSelections) return;
            if (group.maxSelections === 1) {
                const others = currentModifiers.filter(m => m.groupId !== group.id);
                setCurrentModifiers([...others, { groupId: group.id, groupName: group.name, id: modifier.id, name: modifier.name, priceAdjustment: modifier.priceAdjustment, quantity: 1 }]);
                return;
            }
        }

        const newQty = currentQty + change;
        if (newQty < 0) return;
        let mods = [...currentModifiers];
        if (existing) {
            mods = newQty === 0 ? mods.filter(m => !(m.id === modifier.id && m.groupId === group.id)) : mods.map(m => (m.id === modifier.id && m.groupId === group.id ? { ...m, quantity: newQty } : m));
        } else if (newQty > 0) {
            mods.push({ groupId: group.id, groupName: group.name, id: modifier.id, name: modifier.name, priceAdjustment: modifier.priceAdjustment, quantity: newQty });
        }
        setCurrentModifiers(mods);
    };

    const isGroupValid = (group: ModifierGroup) => {
        if (!group.isRequired) return true;
        return currentModifiers.filter(m => m.groupId === group.id).reduce((s, m) => s + m.quantity, 0) >= group.minSelections;
    };

    const confirmAddToCart = () => {
        if (!selectedItemForModifier) return;
        if (!selectedItemForModifier.modifierGroups.every(g => isGroupValid(g.modifierGroup))) return;
        const modTotal = currentModifiers.reduce((s, m) => s + m.priceAdjustment * m.quantity, 0);
        const lineTotal = (selectedItemForModifier.price + modTotal) * itemQuantity;
        const exploded = currentModifiers.flatMap(m => Array(m.quantity).fill({ modifierId: m.id, name: m.name, priceAdjustment: m.priceAdjustment }));
        setCart([...cart, {
            menuItemId: selectedItemForModifier.id, name: selectedItemForModifier.name, quantity: itemQuantity,
            unitPrice: selectedItemForModifier.price, modifiers: exploded, notes: itemNotes || undefined, lineTotal
        }]);
        setShowModifierModal(false);
    };

    const cartSubtotal = cart.reduce((s, i) => s + i.lineTotal, 0);

    const handleSubmit = async () => {
        if (cart.length === 0) return;
        setIsProcessing(true);
        try {
            const result = await createPedidosYAOrderAction({
                customerName: customerName || 'PedidosYA',
                customerPhone,
                customerAddress,
                externalOrderId,
                items: cart,
                notes,
            });

            if (result.success && result.data) {
                // Comanda cocina
                const cfg = getPOSConfig();
                if (cfg.printComandaOnDelivery) {
                    printKitchenCommand({
                        orderNumber: result.data.orderNumber,
                        orderType: 'DELIVERY',
                        customerName: customerName || 'PedidosYA',
                        items: cart.map(i => ({ name: i.name, quantity: i.quantity, modifiers: i.modifiers.map(m => m.name), notes: i.notes })),
                        createdAt: new Date(),
                        address: customerAddress,
                    });
                }
                setLastOrder({ orderNumber: result.data.orderNumber, items: [...cart], customerName: customerName || 'PedidosYA' });
                setCart([]);
                setCustomerName(''); setCustomerPhone(''); setCustomerAddress(''); setExternalOrderId(''); setNotes('');
                alert(`✅ Pedido registrado: ${result.data.orderNumber}`);
            } else {
                alert(result.message || 'Error al registrar');
            }
        } catch (e) {
            console.error(e);
            alert('Error al registrar pedido');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleReprintComanda = () => {
        if (!lastOrder) return;
        printKitchenCommand({
            orderNumber: lastOrder.orderNumber,
            orderType: 'DELIVERY',
            customerName: lastOrder.customerName,
            items: lastOrder.items.map(i => ({ name: i.name, quantity: i.quantity, modifiers: i.modifiers.map(m => m.name), notes: i.notes })),
            createdAt: new Date(),
        });
    };

    if (isLoading) return <div className="text-white p-10">Cargando menú...</div>;

    return (
        <div className="min-h-screen bg-gray-950 text-white relative flex flex-col font-sans">
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-600 to-red-700 px-6 py-4 fixed top-0 w-full z-30 shadow-xl flex justify-between items-center h-20">
                <div className="flex items-center gap-3">
                    <span className="text-4xl">🍔</span>
                    <div>
                        <h1 className="text-2xl font-black">PedidosYA</h1>
                        <p className="text-orange-200 text-xs font-bold uppercase">Registro de Pedidos Externos</p>
                    </div>
                </div>
                <p className="font-mono text-xl">{new Date().toLocaleDateString('es-VE')}</p>
            </div>

            <div className="flex h-screen pt-20 overflow-hidden">
                {/* Menú izquierda */}
                <div className="flex-1 flex flex-col overflow-hidden bg-gray-900">
                    {/* Búsqueda */}
                    <div className="px-3 pt-3 pb-1 bg-gray-800 border-b border-gray-700">
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                            <input
                                type="text"
                                value={productSearch}
                                onChange={e => setProductSearch(e.target.value)}
                                placeholder="Buscar producto..."
                                className="w-full bg-gray-700 border border-gray-600 rounded-xl py-2 pl-9 pr-9 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-orange-500"
                            />
                            {productSearch && (
                                <button onClick={() => setProductSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">✕</button>
                            )}
                        </div>
                    </div>
                    {/* Categorías */}
                    {!productSearch && (
                        <div className="flex gap-2 p-3 bg-gray-800 border-b border-gray-700 overflow-x-auto whitespace-nowrap">
                            {categories.map((cat: any) => (
                                <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} className={`px-4 py-2 rounded-lg font-bold transition-all text-sm ${selectedCategory === cat.id ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-300'}`}>
                                    {cat.name}
                                </button>
                            ))}
                        </div>
                    )}
                    {/* Productos */}
                    <div className="flex-1 p-4 overflow-y-auto pb-24">
                        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                            {filteredMenuItems.map(item => (
                                <button key={item.id} onClick={() => handleAddToCart(item)} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-orange-500 rounded-xl p-4 text-left shadow-md group h-32 flex flex-col justify-between">
                                    <div className="font-bold text-base leading-tight group-hover:text-orange-300">{item.name}</div>
                                    <div className="text-xl font-black text-orange-400">${item.price.toFixed(2)}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Panel derecho */}
                <div className="w-96 bg-gray-900 border-l border-gray-800 flex flex-col shadow-2xl z-20">
                    {/* Datos del pedido */}
                    <div className="p-4 bg-gray-800 border-b border-gray-700 space-y-2">
                        <h2 className="font-black text-lg flex items-center gap-2">📦 Datos del Pedido</h2>
                        <div className="grid grid-cols-2 gap-2">
                            <input type="text" value={externalOrderId} onChange={e => setExternalOrderId(e.target.value)} placeholder="# PedidosYA" className="col-span-2 bg-orange-900/30 border border-orange-700 rounded p-2 text-white text-sm focus:ring-2 focus:ring-orange-500 placeholder-orange-300/60 font-mono" />
                            <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Nombre cliente" className="bg-gray-700 border-none rounded p-2 text-white text-sm focus:ring-2 focus:ring-orange-500" />
                            <input type="text" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="Teléfono" className="bg-gray-700 border-none rounded p-2 text-white text-sm focus:ring-2 focus:ring-orange-500" />
                        </div>
                        <textarea value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} placeholder="Dirección..." className="w-full bg-gray-700 border-none rounded p-2 text-white text-sm focus:ring-2 focus:ring-orange-500 h-16 resize-none" />
                        <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas adicionales..." className="w-full bg-gray-700 border-none rounded p-2 text-white text-sm focus:ring-2 focus:ring-orange-500" />
                    </div>

                    {/* Carrito */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-900/50">
                        {cart.length === 0 && (
                            <div className="text-center text-gray-500 py-8 text-sm">
                                <p className="text-3xl mb-2">🍔</p>
                                <p>Agrega productos del menú</p>
                            </div>
                        )}
                        {cart.map((item, i) => (
                            <div key={i} className="bg-gray-800 p-3 rounded border border-gray-700 flex justify-between group">
                                <div>
                                    <div className="font-bold text-sm flex gap-2"><span className="text-orange-400">x{item.quantity}</span> {item.name}</div>
                                    {item.modifiers.length > 0 && <div className="text-xs text-gray-400 pl-6">{item.modifiers.map(m => m.name).join(', ')}</div>}
                                    {item.notes && <div className="text-xs text-orange-300 pl-6 italic">"{item.notes}"</div>}
                                </div>
                                <div className="text-right">
                                    <div className="font-bold text-sm">${item.lineTotal.toFixed(2)}</div>
                                    <button onClick={() => removeFromCart(i)} className="text-red-500 text-xs hover:underline opacity-0 group-hover:opacity-100">Borrar</button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Footer: total + botones */}
                    <div className="p-4 bg-gray-800 border-t border-gray-700 space-y-3">
                        <div className="flex justify-between text-sm text-gray-300 bg-gray-900 rounded-lg px-3 py-2">
                            <span>Total estimado</span>
                            <span className="font-bold text-white">${cartSubtotal.toFixed(2)}</span>
                        </div>
                        <div className="rounded-lg bg-orange-900/20 border border-orange-700/40 px-3 py-2 text-xs text-orange-300">
                            ℹ️ <strong>PedidosYA gestiona el cobro.</strong> Este registro es solo para inventario y cocina. No se genera cobranza interna.
                        </div>
                        <button
                            onClick={handleSubmit}
                            disabled={cart.length === 0 || isProcessing}
                            className="w-full py-4 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-bold text-xl shadow-lg disabled:opacity-50"
                        >
                            {isProcessing ? 'REGISTRANDO...' : `REGISTRAR PEDIDO`}
                        </button>
                        {lastOrder && (
                            <button
                                onClick={handleReprintComanda}
                                className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 border border-gray-600 text-sm"
                            >
                                🖨️ Reimprimir comanda {lastOrder.orderNumber}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Modal modificadores */}
            {showModifierModal && selectedItemForModifier && (
                <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-gray-800 w-full max-w-lg rounded-2xl flex flex-col max-h-[90vh] shadow-2xl border border-gray-700">
                        <div className="p-5 border-b border-gray-700 flex justify-between">
                            <div>
                                <h3 className="text-2xl font-bold">{selectedItemForModifier.name}</h3>
                                <p className="text-orange-400 font-bold text-xl">${selectedItemForModifier.price.toFixed(2)}</p>
                            </div>
                            <button onClick={() => setShowModifierModal(false)} className="text-4xl leading-none hover:text-red-500">&times;</button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-5 space-y-4">
                            {selectedItemForModifier.modifierGroups?.map(groupRel => {
                                const group = groupRel.modifierGroup;
                                const totalSelected = currentModifiers.filter(m => m.groupId === group.id).reduce((s, m) => s + m.quantity, 0);
                                const isValid = !group.isRequired || totalSelected >= group.minSelections;
                                return (
                                    <div key={group.id} className={`p-4 rounded-xl border ${isValid ? 'border-gray-600' : 'border-red-500 bg-red-900/10'}`}>
                                        <div className="flex justify-between mb-2">
                                            <h4 className="font-bold text-orange-100">{group.name}</h4>
                                            <span className={`text-xs px-2 py-0.5 rounded ${isValid ? 'bg-orange-900 text-orange-300' : 'bg-red-800 text-red-200'}`}>{totalSelected}/{group.maxSelections}</span>
                                        </div>
                                        <div className="grid gap-2">
                                            {group.modifiers.filter(m => m.isAvailable).map(mod => {
                                                const existing = currentModifiers.find(m => m.id === mod.id && m.groupId === group.id);
                                                const qty = existing ? existing.quantity : 0;
                                                const isMax = group.maxSelections > 1 && totalSelected >= group.maxSelections;
                                                const isRadio = group.maxSelections === 1;
                                                return (
                                                    <div key={mod.id} className={`flex justify-between items-center p-3 rounded-lg border ${qty > 0 ? 'bg-orange-900/40 border-orange-500' : 'bg-gray-800 border-gray-600'}`}>
                                                        <span className="text-sm">{mod.name}{mod.priceAdjustment !== 0 && <span className="text-xs text-orange-400 ml-1">{mod.priceAdjustment > 0 ? '+' : ''}${mod.priceAdjustment.toFixed(2)}</span>}</span>
                                                        {isRadio ? (
                                                            <button onClick={() => updateModifierQuantity(group, mod, 1)} className={`w-6 h-6 rounded-full border flex justify-center items-center ${qty > 0 ? 'bg-orange-500 border-orange-500' : 'border-gray-500'}`}>{qty > 0 && '✓'}</button>
                                                        ) : (
                                                            <div className="flex gap-2 bg-gray-900 p-1 rounded">
                                                                <button onClick={() => updateModifierQuantity(group, mod, -1)} disabled={qty === 0} className={`w-6 h-6 ${qty === 0 ? 'text-gray-600' : 'text-white'}`}>-</button>
                                                                <span className="font-bold text-orange-400 w-4 text-center">{qty}</span>
                                                                <button onClick={() => updateModifierQuantity(group, mod, 1)} disabled={isMax} className={`w-6 h-6 ${isMax ? 'text-gray-600' : 'text-orange-400'}`}>+</button>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                            <div className="bg-gray-750 p-4 rounded-xl border border-gray-600">
                                <label className="text-xs font-bold uppercase text-gray-400 mb-2 block">Notas</label>
                                <textarea value={itemNotes} onChange={e => setItemNotes(e.target.value)} className="w-full bg-gray-900 rounded p-3 h-16 text-white border-none focus:ring-2 focus:ring-orange-500" placeholder="Instrucciones especiales..." />
                            </div>
                            <div className="flex items-center justify-between bg-gray-750 p-4 rounded-xl border border-gray-600">
                                <span className="font-bold">Cantidad</span>
                                <div className="flex bg-gray-900 rounded-lg">
                                    <button onClick={() => setItemQuantity(Math.max(1, itemQuantity - 1))} className="w-12 h-10 hover:bg-gray-700 font-bold">-</button>
                                    <span className="w-10 h-10 flex items-center justify-center font-bold">{itemQuantity}</span>
                                    <button onClick={() => setItemQuantity(itemQuantity + 1)} className="w-12 h-10 bg-orange-600 hover:bg-orange-500 font-bold text-white rounded-r-lg">+</button>
                                </div>
                            </div>
                        </div>
                        <div className="p-4 border-t border-gray-700 flex gap-3">
                            <button onClick={() => setShowModifierModal(false)} className="flex-1 py-3 bg-gray-700 rounded-lg font-bold">Cancelar</button>
                            <button
                                onClick={confirmAddToCart}
                                disabled={selectedItemForModifier?.modifierGroups.some(g => !isGroupValid(g.modifierGroup))}
                                className="flex-[2] py-3 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg font-bold shadow-lg disabled:opacity-50"
                            >
                                AGREGAR
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
