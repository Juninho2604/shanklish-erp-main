'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { getMenuForPOSAction, type CartItem } from '@/app/actions/pos.actions';
import { createPedidosYAOrderAction } from '@/app/actions/pedidosya.actions';
import { calcPedidosYaPrice } from '@/lib/pedidosya-price';
import { printKitchenCommand } from '@/lib/print-command';
import { getPOSConfig } from '@/lib/pos-settings';
import toast from 'react-hot-toast';

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
    pedidosYaPrice?: number | null;
    pedidosYaEnabled?: boolean;
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

    const getPYAPrice = (item: MenuItem) =>
        item.pedidosYaPrice ?? calcPedidosYaPrice(item.price);

    const confirmAddToCart = () => {
        if (!selectedItemForModifier) return;
        if (!selectedItemForModifier.modifierGroups.every(g => isGroupValid(g.modifierGroup))) return;
        const modTotal = currentModifiers.reduce((s, m) => s + m.priceAdjustment * m.quantity, 0);
        const pyaBase = getPYAPrice(selectedItemForModifier);
        const lineTotal = (pyaBase + modTotal) * itemQuantity;
        const exploded = currentModifiers.flatMap(m => Array(m.quantity).fill({ modifierId: m.id, name: m.name, priceAdjustment: m.priceAdjustment }));
        setCart([...cart, {
            menuItemId: selectedItemForModifier.id, name: selectedItemForModifier.name, quantity: itemQuantity,
            unitPrice: pyaBase, modifiers: exploded, notes: itemNotes || undefined, lineTotal
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
                toast.success(`Pedido registrado: ${result.data.orderNumber}`);
            } else {
                toast.error(result.message || 'Error al registrar');
            }
        } catch (e) {
            console.error(e);
            toast.error('Error al registrar pedido');
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

    if (isLoading) return (
        <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="text-center">
                <div className="text-4xl mb-4">🍔</div>
                <div className="text-xl font-black text-foreground">Cargando PedidosYA...</div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-background text-foreground relative flex flex-col font-sans">
            {/* Header */}
            <div className="glass-panel px-3 md:px-6 py-3 md:py-4 fixed top-0 w-full z-30 shadow-2xl flex justify-between items-center h-16 md:h-20 border-b border-border">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 md:h-12 md:w-12 bg-orange-500/20 rounded-2xl flex items-center justify-center text-2xl md:text-3xl shadow-inner">🍔</div>
                    <div>
                        <h1 className="text-lg md:text-2xl font-black tracking-tight text-foreground">POS <span className="text-orange-500 italic">PedidosYA</span></h1>
                        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse" />
                            Registro de Pedidos Externos
                        </p>
                    </div>
                </div>
                <div className="px-3 py-2 bg-secondary/30 rounded-xl border border-border font-black text-xs tabular-nums text-foreground/60">
                    {new Date().toLocaleDateString('es-VE')}
                </div>
            </div>

            <div className="flex h-screen pt-16 md:pt-20 overflow-hidden">
                {/* Menú izquierda */}
                <div className="flex-1 flex flex-col overflow-hidden bg-background">
                    {/* Búsqueda */}
                    <div className="px-4 py-3 bg-background border-b border-border">
                        <div className="relative group">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary">🔍</span>
                            <input
                                type="text"
                                value={productSearch}
                                onChange={e => setProductSearch(e.target.value)}
                                placeholder="Buscar producto por nombre o SKU..."
                                className="w-full bg-secondary/50 border border-border rounded-2xl py-3 pl-12 pr-12 text-sm font-medium focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                            />
                            {productSearch && (
                                <button onClick={() => setProductSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground">✕</button>
                            )}
                        </div>
                    </div>
                    {/* Categorías */}
                    {!productSearch && (
                        <div className="flex gap-3 px-4 py-3 bg-background border-b border-border overflow-x-auto no-scrollbar">
                            {categories.map((cat: any) => (
                                <button
                                    key={cat.id}
                                    onClick={() => setSelectedCategory(cat.id)}
                                    className={`shrink-0 px-5 py-2.5 rounded-2xl font-black text-sm transition-all active:scale-95 border-2 ${selectedCategory === cat.id ? 'bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-500/20' : 'bg-card border-border text-foreground/50 hover:border-orange-400/40'}`}
                                >
                                    {cat.name}
                                </button>
                            ))}
                        </div>
                    )}
                    {/* Productos */}
                    <div className="flex-1 p-4 overflow-y-auto pb-24">
                        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                            {filteredMenuItems.map(item => (
                                <button
                                    key={item.id}
                                    onClick={() => handleAddToCart(item)}
                                    className="capsula-card group p-4 text-left h-32 flex flex-col justify-between border-primary/5 hover:border-orange-400/40 active:scale-[0.98] transition-transform"
                                >
                                    <div className="font-black text-sm uppercase leading-tight tracking-tight group-hover:text-orange-500 transition-colors">{item.name}</div>
                                    <div>
                                        <div className="text-2xl font-black text-orange-500 italic">${getPYAPrice(item).toFixed(2)}</div>
                                        <div className="text-xs text-muted-foreground line-through">${item.price.toFixed(2)}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Panel derecho */}
                <div className="w-96 bg-card border-l border-border flex flex-col shadow-2xl z-20">
                    {/* Datos del pedido */}
                    <div className="p-4 bg-card border-b border-border space-y-2">
                        <h2 className="font-black text-base flex items-center gap-2 text-foreground">📦 Datos del Pedido</h2>
                        <div className="grid grid-cols-2 gap-2">
                            <input type="text" value={externalOrderId} onChange={e => setExternalOrderId(e.target.value)} placeholder="# PedidosYA" className="col-span-2 bg-orange-500/10 border border-orange-500/40 rounded-xl p-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 placeholder-orange-500/40 font-mono" />
                            <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Nombre cliente" className="bg-secondary/50 border border-border rounded-xl p-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                            <input type="text" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="Teléfono" className="bg-secondary/50 border border-border rounded-xl p-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                        </div>
                        <textarea value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} placeholder="Dirección..." className="w-full bg-secondary/50 border border-border rounded-xl p-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 h-16 resize-none" />
                        <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas adicionales..." className="w-full bg-secondary/50 border border-border rounded-xl p-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>

                    {/* Carrito */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {cart.length === 0 && (
                            <div className="text-center text-muted-foreground py-8 text-sm">
                                <p className="text-3xl mb-2">🍔</p>
                                <p>Agrega productos del menú</p>
                            </div>
                        )}
                        {cart.map((item, i) => (
                            <div key={i} className="bg-secondary/30 p-3 rounded-xl border border-border flex justify-between group">
                                <div>
                                    <div className="font-bold text-sm flex gap-2"><span className="text-orange-500">x{item.quantity}</span> {item.name}</div>
                                    {item.modifiers.length > 0 && <div className="text-xs text-muted-foreground pl-6">{item.modifiers.map(m => m.name).join(', ')}</div>}
                                    {item.notes && <div className="text-xs text-orange-400 pl-6 italic">"{item.notes}"</div>}
                                </div>
                                <div className="text-right">
                                    <div className="font-bold text-sm">${item.lineTotal.toFixed(2)}</div>
                                    <button onClick={() => removeFromCart(i)} className="text-destructive text-xs hover:underline opacity-0 group-hover:opacity-100 transition-opacity">Borrar</button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Footer: total + botones */}
                    <div className="p-4 bg-card border-t border-border space-y-3">
                        <div className="flex justify-between text-sm text-muted-foreground bg-secondary/30 rounded-lg px-3 py-2">
                            <span>Total estimado</span>
                            <span className="font-bold text-foreground">${cartSubtotal.toFixed(2)}</span>
                        </div>
                        <div className="rounded-xl bg-orange-500/10 border border-orange-500/30 px-3 py-2 text-xs text-orange-500">
                            ℹ️ <strong>PedidosYA gestiona el cobro.</strong> Este registro es solo para inventario y cocina. No se genera cobranza interna.
                        </div>
                        <button
                            onClick={handleSubmit}
                            disabled={cart.length === 0 || isProcessing}
                            className="w-full py-4 bg-orange-500 hover:bg-orange-400 text-white rounded-xl font-bold text-lg shadow-lg shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                        >
                            {isProcessing ? '⏳ REGISTRANDO...' : 'REGISTRAR PEDIDO'}
                        </button>
                        {lastOrder && (
                            <button
                                onClick={handleReprintComanda}
                                className="w-full py-3 bg-secondary hover:bg-secondary/80 text-foreground rounded-xl font-bold flex items-center justify-center gap-2 border border-border text-sm transition-all"
                            >
                                🖨️ Reimprimir comanda {lastOrder.orderNumber}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Modal modificadores */}
            {showModifierModal && selectedItemForModifier && (
                <div className="fixed inset-0 bg-background/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-card w-full max-w-lg rounded-2xl flex flex-col max-h-[90vh] shadow-2xl border border-border">
                        <div className="p-5 border-b border-border flex justify-between">
                            <div>
                                <h3 className="text-2xl font-bold text-foreground">{selectedItemForModifier.name}</h3>
                                <p className="text-orange-500 font-bold text-xl">
                                    ${getPYAPrice(selectedItemForModifier).toFixed(2)}
                                    <span className="text-sm text-muted-foreground line-through ml-2">${selectedItemForModifier.price.toFixed(2)}</span>
                                </p>
                            </div>
                            <button onClick={() => setShowModifierModal(false)} className="text-4xl leading-none text-muted-foreground hover:text-destructive transition-colors">&times;</button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-5 space-y-4">
                            {selectedItemForModifier.modifierGroups?.map(groupRel => {
                                const group = groupRel.modifierGroup;
                                const totalSelected = currentModifiers.filter(m => m.groupId === group.id).reduce((s, m) => s + m.quantity, 0);
                                const isValid = !group.isRequired || totalSelected >= group.minSelections;
                                return (
                                    <div key={group.id} className={`p-4 rounded-xl border ${isValid ? 'border-border' : 'border-destructive bg-destructive/5'}`}>
                                        <div className="flex justify-between mb-2">
                                            <h4 className="font-bold text-foreground">{group.name}</h4>
                                            <span className={`text-xs px-2 py-0.5 rounded-full ${isValid ? 'bg-orange-500/10 text-orange-500' : 'bg-destructive/10 text-destructive'}`}>{totalSelected}/{group.maxSelections}</span>
                                        </div>
                                        <div className="grid gap-2">
                                            {group.modifiers.filter(m => m.isAvailable).map(mod => {
                                                const existing = currentModifiers.find(m => m.id === mod.id && m.groupId === group.id);
                                                const qty = existing ? existing.quantity : 0;
                                                const isMax = group.maxSelections > 1 && totalSelected >= group.maxSelections;
                                                const isRadio = group.maxSelections === 1;
                                                return (
                                                    <div key={mod.id} className={`flex justify-between items-center p-3 rounded-xl border transition-colors ${qty > 0 ? 'bg-orange-500/10 border-orange-500/50' : 'bg-secondary/30 border-border'}`}>
                                                        <span className="text-sm text-foreground">{mod.name}{mod.priceAdjustment !== 0 && <span className="text-xs text-orange-500 ml-1">{mod.priceAdjustment > 0 ? '+' : ''}${mod.priceAdjustment.toFixed(2)}</span>}</span>
                                                        {isRadio ? (
                                                            <button onClick={() => updateModifierQuantity(group, mod, 1)} className={`w-6 h-6 rounded-full border-2 flex justify-center items-center text-xs transition-colors ${qty > 0 ? 'bg-orange-500 border-orange-500 text-white' : 'border-border text-transparent'}`}>✓</button>
                                                        ) : (
                                                            <div className="flex gap-1 bg-background border border-border p-1 rounded-lg">
                                                                <button onClick={() => updateModifierQuantity(group, mod, -1)} disabled={qty === 0} className={`w-7 h-7 rounded-lg font-bold text-base transition-colors ${qty === 0 ? 'text-muted-foreground/30' : 'text-foreground hover:bg-secondary'}`}>−</button>
                                                                <span className="font-bold text-orange-500 w-5 text-center text-sm flex items-center justify-center">{qty}</span>
                                                                <button onClick={() => updateModifierQuantity(group, mod, 1)} disabled={isMax} className={`w-7 h-7 rounded-lg font-bold text-base transition-colors ${isMax ? 'text-muted-foreground/30' : 'text-orange-500 hover:bg-orange-500/10'}`}>+</button>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                            <div className="p-4 rounded-xl border border-border bg-secondary/20">
                                <label className="text-xs font-bold uppercase text-muted-foreground mb-2 block">Notas</label>
                                <textarea value={itemNotes} onChange={e => setItemNotes(e.target.value)} className="w-full bg-background border border-border rounded-xl p-3 h-16 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" placeholder="Instrucciones especiales..." />
                            </div>
                            <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-secondary/20">
                                <span className="font-bold text-foreground">Cantidad</span>
                                <div className="flex bg-background border border-border rounded-xl overflow-hidden">
                                    <button onClick={() => setItemQuantity(Math.max(1, itemQuantity - 1))} className="w-12 h-10 font-bold text-foreground hover:bg-secondary transition-colors">−</button>
                                    <span className="w-10 h-10 flex items-center justify-center font-black text-foreground">{itemQuantity}</span>
                                    <button onClick={() => setItemQuantity(itemQuantity + 1)} className="w-12 h-10 bg-orange-500 hover:bg-orange-400 font-bold text-white transition-colors">+</button>
                                </div>
                            </div>
                        </div>
                        <div className="p-4 border-t border-border flex gap-3">
                            <button onClick={() => setShowModifierModal(false)} className="flex-1 py-3 bg-secondary hover:bg-secondary/80 text-foreground rounded-xl font-bold transition-colors">Cancelar</button>
                            <button
                                onClick={confirmAddToCart}
                                disabled={selectedItemForModifier?.modifierGroups.some(g => !isGroupValid(g.modifierGroup))}
                                className="flex-[2] py-3 bg-orange-500 hover:bg-orange-400 text-white rounded-xl font-bold shadow-lg shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
