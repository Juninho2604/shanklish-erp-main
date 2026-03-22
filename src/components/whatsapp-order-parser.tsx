'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn, formatCurrency } from '@/lib/utils';
import { getMenuForPOSAction, type CartItem } from '@/app/actions/pos.actions';
import { Combobox } from '@/components/ui/combobox';

interface MenuItem {
    id: string;
    name: string;
    price: number;
    sku: string;
    categoryName?: string;
}

interface ParsedLine {
    id: string; // unique id for key
    raw: string;
    quantity: number;
    productName: string;
    matchedItem: MenuItem | null;
    matchScore: number;
    alternatives: MenuItem[];
    notes: string;
    isCustom?: boolean; // manually added by user
    isEditing?: boolean; // currently being edited
}

interface WhatsAppParserProps {
    onOrderReady: (items: CartItem[], customerName: string, customerPhone: string, customerAddress: string) => void;
}

// Known customizable items - these get special treatment
const CUSTOMIZABLE_KEYWORDS = [
    'tabla', 'arma tu', 'personaliza', 'combo', 'shanklish personalizado',
    'armar', 'armada', 'especial personaliz',
];

// Normaliza texto para comparación fuzzy
function normalize(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remover acentos
        .replace(/[^a-z0-9\s]/g, '') // Solo alfanuméricos
        .replace(/\s+/g, ' ')
        .trim();
}

// Fuzzy match score (0-1) — improved algorithm
function fuzzyScore(input: string, target: string): number {
    const a = normalize(input);
    const b = normalize(target);

    if (!a || !b) return 0;

    // Exact match
    if (a === b) return 1;

    // One contains the other
    if (b.includes(a)) return 0.92;
    if (a.includes(b)) return 0.88;

    // Token matching
    const inputTokens = a.split(' ').filter(t => t.length > 1);
    const targetTokens = b.split(' ').filter(t => t.length > 1);

    if (inputTokens.length === 0 || targetTokens.length === 0) return 0;

    let matchCount = 0;
    let partialMatchCount = 0;
    for (const token of inputTokens) {
        const exactMatch = targetTokens.some(t => t === token);
        const partialMatch = targetTokens.some(t => t.includes(token) || token.includes(t));
        if (exactMatch) {
            matchCount++;
        } else if (partialMatch) {
            partialMatchCount++;
        }
    }

    const totalScore = (matchCount + partialMatchCount * 0.6) / Math.max(inputTokens.length, 1);
    return totalScore * 0.85;
}

// Check if a line refers to a customizable item (tabla, arma tu shanklish, etc.)
function isCustomizableItem(text: string): boolean {
    const n = normalize(text);
    return CUSTOMIZABLE_KEYWORDS.some(kw => n.includes(kw));
}

// Generate unique ID
let _idCounter = 0;
function genId() {
    return `pl-${Date.now()}-${_idCounter++}`;
}

// Parsear una línea de texto a cantidad + nombre
function parseLine(line: string): { quantity: number; productName: string; notes: string } | null {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 3) return null;

    // Ignore greetings and irrelevant lines
    const ignorePatterns = /^(hola|buenos|buenas|ok|listo|gracia|perfecto|dale|por favor|si|no|ahi|claro|muchas|buen|hey|bueno|como|esta|cuando|donde|aqui|habla|saludo|bienvenido|menu|ver|tienen|disponible|hay|precio|cuanto|cuesta|omitir|ya|voy|lista|vale|exacto|genial|super|excelente|listo|foto|imagen|audio|video|sticker|gif|documento|ubicacion|contacto|eliminaste)/i;
    if (ignorePatterns.test(trimmed.replace(/^[^a-záéíóú]*/i, ''))) return null;

    // Ignore very short lines that are likely not products
    if (trimmed.length < 4 && !/^\d/.test(trimmed)) return null;

    let quantity = 1;
    let productName = trimmed;
    let notes = '';

    // Extract notes between parentheses
    const noteMatch = productName.match(/\(([^)]+)\)/);
    if (noteMatch) {
        notes = noteMatch[1];
        productName = productName.replace(/\(([^)]+)\)/, '').trim();
    }

    // Extract notes after " - " or ":"
    const dashMatch = productName.match(/\s[-–]\s(.+)$/);
    if (dashMatch) {
        notes = notes ? `${notes}, ${dashMatch[1]}` : dashMatch[1];
        productName = productName.replace(/\s[-–]\s.+$/, '').trim();
    }

    // Quantity patterns at start
    const qtyPatterns = [
        /^(\d+)\s*[xX×]\s*/,       // 2x, 2 x, 2×
        /^[xX×]\s*(\d+)\s+/,        // x2
        /^#?(\d+)\s*[-–]?\s+/,      // 2 shawarma, 2- shawarma, #2 shawarma
        /^(\d+)\s+/,                 // simple: "2 whatever"
    ];

    for (const pattern of qtyPatterns) {
        const match = productName.match(pattern);
        if (match) {
            quantity = parseInt(match[1]) || 1;
            productName = productName.replace(pattern, '').trim();
            break;
        }
    }

    // Quantity at end
    const qtyEndPatterns = [
        /\s*[xX×]\s*(\d+)$/,
        /\s*\((\d+)\)$/,
    ];
    for (const pattern of qtyEndPatterns) {
        const match = productName.match(pattern);
        if (match) {
            quantity = parseInt(match[1]) || quantity;
            productName = productName.replace(pattern, '').trim();
            break;
        }
    }

    if (!productName || productName.length < 2) return null;

    return { quantity, productName, notes };
}

export default function WhatsAppOrderParser({ onOrderReady }: WhatsAppParserProps) {
    const [chatText, setChatText] = useState('');
    const [allMenuItems, setAllMenuItems] = useState<MenuItem[]>([]);
    const [parsedLines, setParsedLines] = useState<ParsedLine[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isParsing, setIsParsing] = useState(false);

    // Customer info extracted
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerAddress, setCustomerAddress] = useState('');

    // For manual product adding
    const [showAddProduct, setShowAddProduct] = useState(false);
    const [manualProductId, setManualProductId] = useState('');
    const [manualQuantity, setManualQuantity] = useState(1);
    const [manualNotes, setManualNotes] = useState('');

    // Load menu on mount
    useEffect(() => {
        async function loadMenu() {
            try {
                const result = await getMenuForPOSAction();
                if (result.success && result.data) {
                    const items: MenuItem[] = [];
                    for (const cat of result.data) {
                        for (const item of cat.items) {
                            items.push({
                                id: item.id,
                                name: item.name,
                                price: item.price,
                                sku: item.sku,
                                categoryName: cat.name,
                            });
                        }
                    }
                    setAllMenuItems(items);
                }
            } catch (e) {
                console.error('Error loading menu:', e);
            }
            setIsLoading(false);
        }
        loadMenu();
    }, []);

    const parseChat = useCallback(() => {
        if (!chatText.trim()) return;
        setIsParsing(true);

        const lines = chatText.split('\n').filter(l => l.trim());
        const results: ParsedLine[] = [];

        // Try to extract customer info
        for (const line of lines) {
            const phoneMatch = line.match(/(0\d{3}[-\s]?\d{7}|\+?58\d{10})/);
            if (phoneMatch) setCustomerPhone(phoneMatch[1].replace(/[-\s]/g, ''));

            const namePatterns = [
                /(?:nombre|cliente|para|a nombre de)[\s:]+([A-ZÁ-Ú][a-zá-ú]+(?:\s[A-ZÁ-Ú][a-zá-ú]+)*)/i,
                /(?:habla|soy|me llamo)[\s:]+([A-ZÁ-Ú][a-zá-ú]+(?:\s[A-ZÁ-Ú][a-zá-ú]+)*)/i,
            ];
            for (const pat of namePatterns) {
                const nameMatch = line.match(pat);
                if (nameMatch) setCustomerName(nameMatch[1]);
            }

            const addrPatterns = [
                /(?:dirección|direccion|entregar en|enviar a|llevar a|dir)[\s:]+(.{10,})/i,
            ];
            for (const pat of addrPatterns) {
                const addrMatch = line.match(pat);
                if (addrMatch) setCustomerAddress(addrMatch[1].trim());
            }
        }

        // Parse each line for order items
        for (const line of lines) {
            const parsed = parseLine(line);
            if (!parsed) continue;

            // Check if this is a customizable item (tabla, arma tu shanklish)
            const customizable = isCustomizableItem(parsed.productName);

            // Find best match and alternatives
            let bestMatch: MenuItem | null = null;
            let bestScore = 0;
            const alternatives: MenuItem[] = [];

            for (const item of allMenuItems) {
                const score = fuzzyScore(parsed.productName, item.name);
                if (score > bestScore) {
                    if (bestMatch) alternatives.push(bestMatch);
                    bestScore = score;
                    bestMatch = item;
                } else if (score > 0.25) {
                    alternatives.push(item);
                }
            }

            // For customizable items, lower the threshold — we want to show them even if no great match
            const threshold = customizable ? 0.3 : 0.4;
            if (bestScore < threshold) {
                bestMatch = null;
            }

            // If customizable and we found something, put the original text as notes
            let notes = parsed.notes;
            if (customizable && !notes) {
                notes = `Personalizado: ${parsed.productName}`;
            }

            results.push({
                id: genId(),
                raw: line.trim(),
                quantity: parsed.quantity,
                productName: parsed.productName,
                matchedItem: bestMatch,
                matchScore: bestScore,
                alternatives: alternatives
                    .sort((a, b) => fuzzyScore(parsed.productName, b.name) - fuzzyScore(parsed.productName, a.name))
                    .slice(0, 8),
                notes,
                isCustom: customizable,
            });
        }

        setParsedLines(results);
        setIsParsing(false);
    }, [chatText, allMenuItems]);

    const updateMatch = (id: string, item: MenuItem) => {
        setParsedLines(prev => prev.map(l => l.id === id ? { ...l, matchedItem: item, matchScore: 1, isEditing: false } : l));
    };

    const updateQuantity = (id: string, qty: number) => {
        if (qty <= 0) {
            removeLine(id);
            return;
        }
        setParsedLines(prev => prev.map(l => l.id === id ? { ...l, quantity: qty } : l));
    };

    const updateNotes = (id: string, notes: string) => {
        setParsedLines(prev => prev.map(l => l.id === id ? { ...l, notes } : l));
    };

    const removeLine = (id: string) => {
        setParsedLines(prev => prev.filter(l => l.id !== id));
    };

    const toggleEditing = (id: string) => {
        setParsedLines(prev => prev.map(l => l.id === id ? { ...l, isEditing: !l.isEditing } : l));
    };

    // Add a product manually  
    const addManualProduct = () => {
        if (!manualProductId) return;
        const item = allMenuItems.find(i => i.id === manualProductId);
        if (!item) return;

        setParsedLines(prev => [...prev, {
            id: genId(),
            raw: `(Agregado manualmente)`,
            quantity: manualQuantity,
            productName: item.name,
            matchedItem: item,
            matchScore: 1,
            alternatives: [],
            notes: manualNotes,
            isCustom: false,
        }]);

        setManualProductId('');
        setManualQuantity(1);
        setManualNotes('');
        setShowAddProduct(false);
    };

    const matchedLines = parsedLines.filter(l => l.matchedItem);
    const unmatchedLines = parsedLines.filter(l => !l.matchedItem);
    const orderTotal = matchedLines.reduce((sum, l) => sum + (l.matchedItem!.price * l.quantity), 0);

    const handleConfirm = () => {
        const cartItems: CartItem[] = matchedLines.map(l => ({
            menuItemId: l.matchedItem!.id,
            name: l.matchedItem!.name,
            quantity: l.quantity,
            unitPrice: l.matchedItem!.price,
            modifiers: [],
            notes: l.notes || undefined,
            lineTotal: l.matchedItem!.price * l.quantity,
        }));
        onOrderReady(cartItems, customerName, customerPhone, customerAddress);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto"></div>
                    <p className="mt-2 text-sm text-gray-500">Cargando menú...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* Input Area */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <span className="text-2xl">💬</span> Pegar Chat de WhatsApp
                    </h3>
                    <span className="text-xs text-gray-400">{allMenuItems.length} items en menú</span>
                </div>

                <textarea
                    id="whatsapp-chat-input"
                    value={chatText}
                    onChange={e => setChatText(e.target.value)}
                    onInput={e => setChatText((e.target as HTMLTextAreaElement).value)}
                    placeholder={`Pega aquí el chat del cliente...\n\nEjemplo:\n2 shawarma mixto grande\n1 tabla familiar\n3 kebbe frito\n1 arma tu shanklish (picante, tomate seco, pesto)\nNombre: Juan Pérez\nDirección: Av. Libertador, Edif. Los Pinos`}
                    rows={8}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-mono focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white resize-none"
                />

                <div className="flex gap-2 mt-3">
                    <button
                        onClick={parseChat}
                        disabled={!chatText.trim() || isParsing}
                        className="flex-1 min-h-[48px] rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-3 font-semibold text-white shadow-sm hover:shadow-md transition-all disabled:opacity-50"
                    >
                        {isParsing ? '⏳ Analizando...' : '🔍 Analizar Pedido'}
                    </button>
                    {parsedLines.length > 0 && (
                        <button
                            onClick={() => { setParsedLines([]); setChatText(''); setCustomerName(''); setCustomerPhone(''); setCustomerAddress(''); }}
                            className="min-h-[48px] rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
                        >
                            🗑️ Limpiar
                        </button>
                    )}
                </div>
            </div>

            {/* Results */}
            {parsedLines.length > 0 && (
                <div className="space-y-4">
                    {/* Customer info */}
                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                        <h4 className="text-sm font-semibold text-gray-500 mb-3">📋 Datos del Cliente</h4>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <input
                                type="text"
                                value={customerName}
                                onChange={e => setCustomerName(e.target.value)}
                                placeholder="Nombre"
                                className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white min-h-[44px]"
                            />
                            <input
                                type="text"
                                value={customerPhone}
                                onChange={e => setCustomerPhone(e.target.value)}
                                placeholder="Teléfono"
                                className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white min-h-[44px]"
                            />
                            <input
                                type="text"
                                value={customerAddress}
                                onChange={e => setCustomerAddress(e.target.value)}
                                placeholder="Dirección"
                                className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white min-h-[44px]"
                            />
                        </div>
                    </div>

                    {/* Summary bar */}
                    <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 px-5 py-3 text-white shadow-lg">
                        <div className="flex items-center gap-4">
                            <div>
                                <span className="text-sm opacity-80">Reconocidos</span>
                                <span className="ml-1.5 text-lg font-bold">{matchedLines.length}</span>
                            </div>
                            {unmatchedLines.length > 0 && (
                                <div>
                                    <span className="text-sm opacity-80">Sin match</span>
                                    <span className="ml-1.5 text-lg font-bold text-amber-300">{unmatchedLines.length}</span>
                                </div>
                            )}
                        </div>
                        <div className="text-right">
                            <span className="text-sm opacity-80">Total estimado</span>
                            <span className="ml-2 text-xl font-bold">{formatCurrency(orderTotal)}</span>
                        </div>
                    </div>

                    {/* ALL parsed items — unified list with edit capabilities */}
                    <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
                        <div className="border-b border-gray-200 px-5 py-3 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800 flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                🛒 Items del Pedido ({parsedLines.length})
                            </h4>
                            <button
                                onClick={() => setShowAddProduct(!showAddProduct)}
                                className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            >
                                + Agregar Producto
                            </button>
                        </div>

                        {/* Manual add product */}
                        {showAddProduct && (
                            <div className="border-b border-gray-200 bg-emerald-50/30 px-5 py-3 dark:border-gray-700 flex items-center gap-3">
                                <div className="flex-1">
                                    <Combobox
                                        items={allMenuItems.map(i => ({
                                            value: i.id,
                                            label: `${i.name} — ${formatCurrency(i.price)}`
                                        }))}
                                        value={manualProductId}
                                        onChange={setManualProductId}
                                        placeholder="Buscar producto del menú..."
                                        searchPlaceholder="Shawarma, Tabla, Kibbe..."
                                    />
                                </div>
                                <input
                                    type="number"
                                    min={1}
                                    value={manualQuantity}
                                    onChange={e => setManualQuantity(parseInt(e.target.value) || 1)}
                                    className="w-16 rounded-lg border border-gray-200 px-2 py-2 text-center text-sm min-h-[40px]"
                                    placeholder="Cant"
                                />
                                <input
                                    type="text"
                                    value={manualNotes}
                                    onChange={e => setManualNotes(e.target.value)}
                                    className="w-40 rounded-lg border border-gray-200 px-3 py-2 text-sm min-h-[40px]"
                                    placeholder="Notas..."
                                />
                                <button
                                    onClick={addManualProduct}
                                    disabled={!manualProductId}
                                    className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-40 min-h-[40px]"
                                >
                                    ✓
                                </button>
                            </div>
                        )}

                        <div className="divide-y divide-gray-100 dark:divide-gray-700">
                            {parsedLines.map((line) => (
                                <div
                                    key={line.id}
                                    className={cn(
                                        'px-5 py-3 transition-colors',
                                        !line.matchedItem && 'bg-amber-50/50 dark:bg-amber-900/10',
                                        line.isCustom && line.matchedItem && 'bg-purple-50/30 dark:bg-purple-900/10',
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        {/* Status indicator */}
                                        <div className={cn(
                                            'flex h-8 w-8 items-center justify-center rounded-full text-sm flex-shrink-0',
                                            line.matchedItem
                                                ? 'bg-emerald-100 text-emerald-600'
                                                : 'bg-amber-100 text-amber-600'
                                        )}>
                                            {line.matchedItem ? '✓' : '?'}
                                        </div>

                                        {/* Quantity controls */}
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            <button
                                                onClick={() => updateQuantity(line.id, line.quantity - 1)}
                                                className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 text-sm font-bold"
                                            >
                                                −
                                            </button>
                                            <input
                                                type="number"
                                                min={1}
                                                value={line.quantity}
                                                onChange={e => updateQuantity(line.id, parseInt(e.target.value) || 1)}
                                                className="w-10 text-center font-mono font-bold text-sm rounded border border-gray-200 py-1 dark:border-gray-600 dark:bg-gray-700"
                                            />
                                            <button
                                                onClick={() => updateQuantity(line.id, line.quantity + 1)}
                                                className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 text-sm font-bold"
                                            >
                                                +
                                            </button>
                                        </div>

                                        {/* Product info */}
                                        <div className="flex-1 min-w-0">
                                            {line.matchedItem ? (
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-medium text-gray-900 dark:text-white truncate">
                                                            {line.matchedItem.name}
                                                        </p>
                                                        {line.isCustom && (
                                                            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[9px] font-bold text-purple-700 flex-shrink-0">
                                                                PERSONALIZADO
                                                            </span>
                                                        )}
                                                        {line.matchScore < 0.9 && line.matchScore > 0 && (
                                                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 flex-shrink-0">
                                                                {Math.round(line.matchScore * 100)}%
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] text-gray-400 truncate">&quot;{line.raw}&quot;</p>
                                                </div>
                                            ) : (
                                                <div>
                                                    <p className="text-sm text-gray-700 dark:text-gray-300">
                                                        <span className="font-mono text-amber-600">⚠️</span> &quot;{line.productName}&quot;
                                                    </p>
                                                    <p className="text-[11px] text-gray-400">No se encontró coincidencia en el menú</p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Price */}
                                        {line.matchedItem && (
                                            <div className="text-right flex-shrink-0">
                                                <p className="font-bold text-emerald-600">{formatCurrency(line.matchedItem.price * line.quantity)}</p>
                                                <p className="text-[10px] text-gray-400">{formatCurrency(line.matchedItem.price)} c/u</p>
                                            </div>
                                        )}

                                        {/* Actions */}
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            <button
                                                onClick={() => toggleEditing(line.id)}
                                                className={cn(
                                                    'flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-colors',
                                                    line.isEditing
                                                        ? 'bg-blue-100 text-blue-600'
                                                        : 'text-gray-400 hover:text-blue-500 hover:bg-blue-50'
                                                )}
                                                title="Cambiar producto"
                                            >
                                                ✏️
                                            </button>
                                            <button
                                                onClick={() => removeLine(line.id)}
                                                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 text-sm"
                                                title="Eliminar"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>

                                    {/* Notes */}
                                    {(line.notes || line.isCustom) && (
                                        <div className="ml-[72px] mt-1">
                                            <input
                                                type="text"
                                                value={line.notes}
                                                onChange={e => updateNotes(line.id, e.target.value)}
                                                placeholder="Agregar notas (personalización, ingredientes, etc.)"
                                                className={cn(
                                                    'w-full rounded border px-2.5 py-1.5 text-xs',
                                                    line.isCustom
                                                        ? 'border-purple-200 bg-purple-50/50 text-purple-700 placeholder:text-purple-300'
                                                        : 'border-blue-200 bg-blue-50/50 text-blue-700 placeholder:text-blue-300'
                                                )}
                                            />
                                        </div>
                                    )}

                                    {/* Edit mode: change product selection */}
                                    {line.isEditing && (
                                        <div className="ml-[72px] mt-2 space-y-2">
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1">
                                                    <Combobox
                                                        items={allMenuItems.map(i => ({
                                                            value: i.id,
                                                            label: `${i.name} — ${formatCurrency(i.price)}`
                                                        }))}
                                                        value={line.matchedItem?.id || ''}
                                                        onChange={val => {
                                                            const item = allMenuItems.find(i => i.id === val);
                                                            if (item) updateMatch(line.id, item);
                                                        }}
                                                        placeholder="Buscar producto del menú..."
                                                        searchPlaceholder="Escribir nombre..."
                                                    />
                                                </div>
                                            </div>

                                            {/* Quick alternatives */}
                                            {line.alternatives.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5">
                                                    <span className="text-[10px] text-gray-400 py-1">Sugerencias:</span>
                                                    {line.alternatives.map(alt => (
                                                        <button
                                                            key={alt.id}
                                                            onClick={() => updateMatch(line.id, alt)}
                                                            className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 transition-colors dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
                                                        >
                                                            {alt.name} <span className="text-gray-400">{formatCurrency(alt.price)}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Show alternatives for unmatched items (always) */}
                                    {!line.matchedItem && !line.isEditing && line.alternatives.length > 0 && (
                                        <div className="ml-[72px] mt-2 flex flex-wrap gap-1.5">
                                            <span className="text-[10px] text-gray-400 py-1">¿Quisiste decir?</span>
                                            {line.alternatives.slice(0, 5).map(alt => (
                                                <button
                                                    key={alt.id}
                                                    onClick={() => updateMatch(line.id, alt)}
                                                    className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100 transition-colors dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                                >
                                                    {alt.name} <span className="opacity-60">{formatCurrency(alt.price)}</span>
                                                </button>
                                            ))}
                                            <button
                                                onClick={() => toggleEditing(line.id)}
                                                className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                                            >
                                                🔍 Buscar en menú
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {parsedLines.length === 0 && (
                                <div className="px-5 py-8 text-center text-gray-400 text-sm">
                                    Analiza un chat para ver los items aquí
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Confirm button */}
                    {matchedLines.length > 0 && (
                        <button
                            onClick={handleConfirm}
                            className="w-full min-h-[56px] rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-4 font-bold text-white shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-3"
                        >
                            <span className="text-lg">✅</span>
                            <span>Cargar {matchedLines.length} items al carrito</span>
                            <span className="rounded-full bg-white/20 px-3 py-1 text-sm">{formatCurrency(orderTotal)}</span>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
