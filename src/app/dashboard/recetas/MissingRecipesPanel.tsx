'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createRecipeStubForMenuItemAction } from '@/app/actions/menu.actions';

interface MissingItem {
    id: string;
    name: string;
    price: number;
    recipeId: string | null;
    category: { name: string };
}

interface MissingRecipesPanelProps {
    items: MissingItem[];
}

export default function MissingRecipesPanel({ items }: MissingRecipesPanelProps) {
    const router = useRouter();
    const [creating, setCreating] = useState<string | null>(null);
    const [created, setCreated] = useState<Set<string>>(new Set());
    const [isCollapsed, setIsCollapsed] = useState(false);

    const handleCreateStub = async (itemId: string, itemName: string) => {
        setCreating(itemId);
        try {
            const result = await createRecipeStubForMenuItemAction(itemId);
            if (result.success) {
                setCreated(prev => { const next = new Set(prev); next.add(itemId); return next; });
                router.refresh();
            } else {
                alert(result.message);
            }
        } finally {
            setCreating(null);
        }
    };

    const pendingItems = items.filter(i => !created.has(i.id));

    if (pendingItems.length === 0) return null;

    return (
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 overflow-hidden">
            <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-orange-500/10 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <span className="text-2xl">⚠️</span>
                    <div className="text-left">
                        <h3 className="font-bold text-orange-400">
                            {pendingItems.length} Platos del Menú sin Receta
                        </h3>
                        <p className="text-sm text-orange-300/70">
                            Sin receta no se puede descontar el inventario al vender. Crea la receta vacía y luego completa los ingredientes.
                        </p>
                    </div>
                </div>
                <span className="text-orange-400 text-xl">{isCollapsed ? '▼' : '▲'}</span>
            </button>

            {!isCollapsed && (
                <div className="border-t border-orange-500/20 divide-y divide-orange-500/10">
                    {pendingItems.map(item => (
                        <div key={item.id} className="flex items-center justify-between px-5 py-3 hover:bg-orange-500/5">
                            <div>
                                <span className="font-medium text-gray-200">{item.name}</span>
                                <span className="ml-2 text-xs text-gray-500">{item.category.name}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-amber-400 font-mono text-sm">${item.price.toFixed(2)}</span>
                                <button
                                    onClick={() => handleCreateStub(item.id, item.name)}
                                    disabled={creating === item.id}
                                    className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold disabled:opacity-50 transition-colors"
                                >
                                    {creating === item.id ? '⏳ Creando...' : '📋 Crear Receta Vacía'}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
