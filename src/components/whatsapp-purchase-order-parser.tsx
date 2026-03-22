'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { getAllItemsForPurchaseAction } from '@/app/actions/purchase.actions';
import { Combobox } from '@/components/ui/combobox';

interface InventoryItem {
    id: string;
    name: string;
    sku: string;
    category: string;
    baseUnit: string;
}

export interface PurchaseOrderParsedItem {
    inventoryItemId: string;
    name: string;
    category: string;
    quantity: number;
    unit: string;
}

interface WhatsAppPurchaseParserProps {
    onOrderReady: (items: PurchaseOrderParsedItem[], supplierName?: string, notes?: string) => void;
}

function normalize(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function fuzzyScore(input: string, target: string): number {
    const a = normalize(input);
    const b = normalize(target);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (b.includes(a)) return 0.92;
    if (a.includes(b)) return 0.88;

    const inputTokens = a.split(' ').filter(t => t.length > 1);
    const targetTokens = b.split(' ').filter(t => t.length > 1);
    if (inputTokens.length === 0 || targetTokens.length === 0) return 0;

    let matchCount = 0;
    let partialMatchCount = 0;
    for (const token of inputTokens) {
        const exactMatch = targetTokens.some(t => t === token);
        const partialMatch = targetTokens.some(t => t.includes(token) || token.includes(t));
        if (exactMatch) matchCount++;
        else if (partialMatch) partialMatchCount++;
    }
    return ((matchCount + partialMatchCount * 0.6) / Math.max(inputTokens.length, 1)) * 0.85;
}

function parsePurchaseLine(line: string): { quantity: number; productName: string; notes: string } | null {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 3) return null;

    const ignorePatterns = /^(hola|buenos|buenas|ok|listo|gracia|perfecto|dale|por favor|si|no|ahi|claro|muchas|buen|hey|bueno|como|esta|cuando|donde|aqui|habla|saludo|bienvenido|menu|ver|tienen|disponible|hay|precio|cuanto|cuesta|omitir|ya|voy|lista|vale|exacto|genial|super|excelente|foto|imagen|audio|video|sticker|gif|documento|ubicacion|contacto|eliminaste)/i;
    if (ignorePatterns.test(trimmed.replace(/^[^a-záéíóú]*/i, ''))) return null;
    if (trimmed.length < 4 && !/^\d/.test(trimmed)) return null;

    let quantity = 1;
    let productName = trimmed;
    let notes = '';

    const noteMatch = productName.match(/\(([^)]+)\)/);
    if (noteMatch) {
        notes = noteMatch[1];
        productName = productName.replace(/\(([^)]+)\)/, '').trim();
    }
    const dashMatch = productName.match(/\s[-–]\s(.+)$/);
    if (dashMatch) {
        notes = notes ? `${notes}, ${dashMatch[1]}` : dashMatch[1];
        productName = productName.replace(/\s[-–]\s.+$/, '').trim();
    }

    const qtyPatterns = [
        /^(\d+(?:[.,]\d+)?)\s*[xX×]\s*/,
        /^[xX×]\s*(\d+(?:[.,]\d+)?)\s+/,
        /^#?(\d+(?:[.,]\d+)?)\s*[-–]?\s+/,
        /^(\d+(?:[.,]\d+)?)\s+/,
    ];
    for (const pattern of qtyPatterns) {
        const match = productName.match(pattern);
        if (match) {
            quantity = parseFloat(match[1].replace(',', '.')) || 1;
            productName = productName.replace(pattern, '').trim();
            break;
        }
    }

    const qtyEndPatterns = [/\s*[xX×]\s*(\d+(?:[.,]\d+)?)$/, /\s*\((\d+(?:[.,]\d+)?)\)$/];
    for (const pattern of qtyEndPatterns) {
        const match = productName.match(pattern);
        if (match) {
            quantity = parseFloat(match[1].replace(',', '.')) || quantity;
            productName = productName.replace(pattern, '').trim();
            break;
        }
    }

    if (!productName || productName.length < 2) return null;
    return { quantity, productName, notes };
}

let _idCounter = 0;
function genId() {
    return `po-${Date.now()}-${_idCounter++}`;
}

interface ParsedLine {
    id: string;
    raw: string;
    quantity: number;
    productName: string;
    matchedItem: InventoryItem | null;
    matchScore: number;
    alternatives: InventoryItem[];
    notes: string;
}

export default function WhatsAppPurchaseOrderParser({ onOrderReady }: WhatsAppPurchaseParserProps) {
    const [chatText, setChatText] = useState('');
    const [allItems, setAllItems] = useState<InventoryItem[]>([]);
    const [parsedLines, setParsedLines] = useState<ParsedLine[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isParsing, setIsParsing] = useState(false);
    const [supplierName, setSupplierName] = useState('');
    const [extractedNotes, setExtractedNotes] = useState('');
    const [showAddProduct, setShowAddProduct] = useState(false);
    const [manualProductId, setManualProductId] = useState('');
    const [manualQuantity, setManualQuantity] = useState(1);

    useEffect(() => {
        async function load() {
            const items = await getAllItemsForPurchaseAction();
            setAllItems(items.map(i => ({ id: i.id, name: i.name, sku: i.sku, category: i.category || 'Sin Categoría', baseUnit: i.baseUnit })));
            setIsLoading(false);
        }
        load();
    }, []);

    const parseChat = useCallback(() => {
        if (!chatText.trim()) return;
        setIsParsing(true);

        const lines = chatText.split('\n').filter(l => l.trim());
        for (const line of lines) {
            const provMatch = line.match(/(?:proveedor|provider|de)[\s:]+([A-Za-zÁ-Úá-ú\s]+)/i);
            if (provMatch) setSupplierName(provMatch[1].trim());
        }

        const results: ParsedLine[] = [];
        for (const line of lines) {
            const parsed = parsePurchaseLine(line);
            if (!parsed) continue;

            let bestMatch: InventoryItem | null = null;
            let bestScore = 0;
            const alternatives: InventoryItem[] = [];

            for (const item of allItems) {
                const score = Math.max(fuzzyScore(parsed.productName, item.name), fuzzyScore(parsed.productName, item.sku || ''));
                if (score > bestScore) {
                    if (bestMatch) alternatives.push(bestMatch);
                    bestScore = score;
                    bestMatch = item;
                } else if (score > 0.25) {
                    alternatives.push(item);
                }
            }

            if (bestScore < 0.4) bestMatch = null;

            results.push({
                id: genId(),
                raw: line.trim(),
                quantity: parsed.quantity,
                productName: parsed.productName,
                matchedItem: bestMatch,
                matchScore: bestScore,
                alternatives: alternatives.sort((a, b) => fuzzyScore(parsed.productName, b.name) - fuzzyScore(parsed.productName, a.name)).slice(0, 8),
                notes: parsed.notes,
            });
        }

        setParsedLines(results);
        setIsParsing(false);
    }, [chatText, allItems]);

    const updateMatch = (id: string, item: InventoryItem) => {
        setParsedLines(prev => prev.map(l => l.id === id ? { ...l, matchedItem: item, matchScore: 1 } : l));
    };

    const updateQuantity = (id: string, qty: number) => {
        if (qty <= 0) setParsedLines(prev => prev.filter(l => l.id !== id));
        else setParsedLines(prev => prev.map(l => l.id === id ? { ...l, quantity: qty } : l));
    };

    const removeLine = (id: string) => setParsedLines(prev => prev.filter(l => l.id !== id));

    const addManualProduct = () => {
        if (!manualProductId) return;
        const item = allItems.find(i => i.id === manualProductId);
        if (!item) return;
        setParsedLines(prev => [...prev, {
            id: genId(),
            raw: '(Agregado manualmente)',
            quantity: manualQuantity,
            productName: item.name,
            matchedItem: item,
            matchScore: 1,
            alternatives: [],
            notes: '',
        }]);
        setManualProductId('');
        setManualQuantity(1);
        setShowAddProduct(false);
    };

    const matchedLines = parsedLines.filter(l => l.matchedItem);
    const unmatchedLines = parsedLines.filter(l => !l.matchedItem);

    const handleConfirm = () => {
        const items: PurchaseOrderParsedItem[] = matchedLines.map(l => ({
            inventoryItemId: l.matchedItem!.id,
            name: l.matchedItem!.name,
            category: l.matchedItem!.category,
            quantity: l.quantity,
            unit: l.matchedItem!.baseUnit,
        }));
        onOrderReady(items, supplierName || undefined, extractedNotes || undefined);
    };

    if (isLoading) {
        return (
            <div className="flex justify-center py-12">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto" />
                    <p className="mt-2 text-sm text-gray-500">Cargando insumos...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <span className="text-2xl">💬</span> Pegar Chat de WhatsApp
                    </h3>
                    <span className="text-xs text-gray-400">{allItems.length} insumos disponibles</span>
                </div>

                <textarea
                    value={chatText}
                    onChange={e => setChatText(e.target.value)}
                    placeholder={`Pega aquí el chat del proveedor...\n\nEjemplo:\n2 kg Arroz\n5x Aceite de oliva\n10 unidades Harina\n3 Crema de ajo\nProveedor: Distribuidora Los Andes`}
                    rows={8}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-mono focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white resize-none"
                />

                <div className="flex gap-2 mt-3">
                    <button
                        onClick={parseChat}
                        disabled={!chatText.trim() || isParsing}
                        className="flex-1 min-h-[48px] rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-3 font-semibold text-white shadow-sm hover:shadow-md transition-all disabled:opacity-50"
                    >
                        {isParsing ? '⏳ Analizando...' : '🔍 Analizar Orden'}
                    </button>
                    {parsedLines.length > 0 && (
                        <button
                            onClick={() => { setParsedLines([]); setChatText(''); setSupplierName(''); setExtractedNotes(''); }}
                            className="min-h-[48px] rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
                        >
                            🗑️ Limpiar
                        </button>
                    )}
                </div>
            </div>

            {parsedLines.length > 0 && (
                <div className="space-y-4">
                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                        <h4 className="text-sm font-semibold text-gray-500 mb-3">📋 Datos extraídos</h4>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <input
                                type="text"
                                value={supplierName}
                                onChange={e => setSupplierName(e.target.value)}
                                placeholder="Proveedor"
                                className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white min-h-[44px]"
                            />
                            <input
                                type="text"
                                value={extractedNotes}
                                onChange={e => setExtractedNotes(e.target.value)}
                                placeholder="Notas / Instrucciones"
                                className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white min-h-[44px]"
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-5 py-3 text-white shadow-lg">
                        <div className="flex items-center gap-4">
                            <div>
                                <span className="text-sm opacity-80">Reconocidos</span>
                                <span className="ml-1.5 text-lg font-bold">{matchedLines.length}</span>
                            </div>
                            {unmatchedLines.length > 0 && (
                                <div>
                                    <span className="text-sm opacity-80">Sin match</span>
                                    <span className="ml-1.5 text-lg font-bold text-amber-200">{unmatchedLines.length}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
                        <div className="border-b border-gray-200 px-5 py-3 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800 flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">🛒 Items de la Orden ({parsedLines.length})</h4>
                            <button
                                onClick={() => setShowAddProduct(!showAddProduct)}
                                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            >
                                + Agregar Item
                            </button>
                        </div>

                        {showAddProduct && (
                            <div className="border-b border-gray-200 bg-amber-50/30 px-5 py-3 dark:border-gray-700 flex items-center gap-3">
                                <div className="flex-1">
                                    <Combobox
                                        items={allItems.map(i => ({ value: i.id, label: `${i.name} (${i.baseUnit})` }))}
                                        value={manualProductId}
                                        onChange={setManualProductId}
                                        placeholder="Buscar insumo..."
                                        searchPlaceholder="Arroz, Aceite, Harina..."
                                    />
                                </div>
                                <input
                                    type="number"
                                    min={0.1}
                                    step={0.1}
                                    value={manualQuantity}
                                    onChange={e => setManualQuantity(parseFloat(e.target.value) || 1)}
                                    className="w-20 rounded-lg border border-gray-200 px-2 py-2 text-center text-sm min-h-[40px]"
                                />
                                <button
                                    onClick={addManualProduct}
                                    disabled={!manualProductId}
                                    className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-40 min-h-[40px]"
                                >
                                    ✓ Agregar
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
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            'flex h-8 w-8 items-center justify-center rounded-full text-sm flex-shrink-0',
                                            line.matchedItem ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
                                        )}>
                                            {line.matchedItem ? '✓' : '?'}
                                        </div>

                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            <button
                                                onClick={() => updateQuantity(line.id, line.quantity - 0.1)}
                                                className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 text-sm font-bold"
                                            >−</button>
                                            <input
                                                type="number"
                                                min={0.1}
                                                step={0.1}
                                                value={line.quantity}
                                                onChange={e => updateQuantity(line.id, parseFloat(e.target.value) || 1)}
                                                className="w-14 text-center font-mono font-bold text-sm rounded border border-gray-200 py-1 dark:border-gray-600 dark:bg-gray-700"
                                            />
                                            <button
                                                onClick={() => updateQuantity(line.id, line.quantity + 0.1)}
                                                className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 text-sm font-bold"
                                            >+</button>
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            {line.matchedItem ? (
                                                <div>
                                                    <p className="font-medium text-gray-900 dark:text-white truncate">{line.matchedItem.name}</p>
                                                    <p className="text-[11px] text-gray-400 truncate">&quot;{line.raw}&quot;</p>
                                                </div>
                                            ) : (
                                                <div>
                                                    <p className="text-sm text-gray-700 dark:text-gray-300">
                                                        <span className="font-mono text-amber-600">⚠️</span> &quot;{line.productName}&quot;
                                                    </p>
                                                    <p className="text-[11px] text-gray-400">No se encontró en insumos</p>
                                                </div>
                                            )}
                                        </div>

                                        {line.matchedItem && (
                                            <span className="text-xs text-gray-500 flex-shrink-0">{line.matchedItem.baseUnit}</span>
                                        )}

                                        <div className="flex gap-1 flex-shrink-0">
                                            {!line.matchedItem && line.alternatives.length > 0 && (
                                                <>
                                                    {line.alternatives.slice(0, 3).map(alt => (
                                                        <button
                                                            key={alt.id}
                                                            onClick={() => updateMatch(line.id, alt)}
                                                            className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                                        >
                                                            {alt.name}
                                                        </button>
                                                    ))}
                                                </>
                                            )}
                                            <button
                                                onClick={() => removeLine(line.id)}
                                                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 text-sm"
                                            >✕</button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {matchedLines.length > 0 && (
                        <button
                            onClick={handleConfirm}
                            className="w-full min-h-[56px] rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-4 font-bold text-white shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-3"
                        >
                            <span className="text-lg">✅</span>
                            <span>Cargar {matchedLines.length} items a la orden</span>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
