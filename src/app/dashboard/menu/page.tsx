'use client';

import { useState, useEffect } from 'react';
import {
    getFullMenuAction,
    updateMenuItemPriceAction,
    updateMenuItemNameAction,
    createMenuItemAction,
    toggleMenuItemStatusAction,
    ensureBasicCategoriesAction,
    getCategoriesAction,
    createRecipeStubForMenuItemAction
} from '@/app/actions/menu.actions';

export default function MenuManagementPage() {
    const [categories, setCategories] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Estado para Modal Nuevo Producto
    const [showModal, setShowModal] = useState(false);
    const [newItem, setNewItem] = useState({
        name: '',
        price: '',
        categoryId: '',
        description: ''
    });
    const [isSaving, setIsSaving] = useState(false);

    // Estado para edición inline de nombre
    const [editingNameId, setEditingNameId] = useState<string | null>(null);
    const [editingNameValue, setEditingNameValue] = useState('');

    // Filtro sin receta
    const [showOnlyNoRecipe, setShowOnlyNoRecipe] = useState(false);
    const [creatingRecipeFor, setCreatingRecipeFor] = useState<string | null>(null);

    // Cargar datos
    const loadData = async () => {
        setIsLoading(true);
        // Intentar asegurar categorías primero
        await ensureBasicCategoriesAction();

        const result = await getFullMenuAction();
        if (result.success && result.data) {
            setCategories(result.data);
            // Pre-seleccionar primera categoría para el modal
            if (result.data.length > 0 && !newItem.categoryId) {
                setNewItem(prev => ({ ...prev, categoryId: result.data[0].id }));
            }
        }
        setIsLoading(false);
    };

    useEffect(() => {
        loadData();
    }, []);

    // Manejadores
    const handlePriceChange = async (itemId: string, newPrice: string) => {
        const price = parseFloat(newPrice);
        if (isNaN(price)) return;

        // Actualización optimista
        const newCats = categories.map(cat => ({
            ...cat,
            items: cat.items.map((item: any) =>
                item.id === itemId ? { ...item, price } : item
            )
        }));
        setCategories(newCats); // Reflejar en UI inmediato

        // Persistir (debounce idealmente, pero directo por ahora)
        await updateMenuItemPriceAction(itemId, price);
    };

    const handleNameChange = async (itemId: string, newName: string) => {
        if (!newName.trim()) return;
        setEditingNameId(null);

        // Actualización optimista
        const newCats = categories.map(cat => ({
            ...cat,
            items: cat.items.map((item: any) =>
                item.id === itemId ? { ...item, name: newName.trim() } : item
            )
        }));
        setCategories(newCats);

        await updateMenuItemNameAction(itemId, newName.trim());
    };

    const handleCreateItem = async () => {
        if (!newItem.name || !newItem.price || !newItem.categoryId) {
            alert('Por favor completa nombre, precio y categoría');
            return;
        }

        setIsSaving(true);
        const result = await createMenuItemAction({
            name: newItem.name,
            price: parseFloat(newItem.price),
            categoryId: newItem.categoryId,
            description: newItem.description
        });

        if (result.success) {
            setShowModal(false);
            setNewItem({ name: '', price: '', categoryId: categories[0]?.id || '', description: '' });
            loadData(); // Recargar todo
        } else {
            alert('Error al crear producto');
        }
        setIsSaving(false);
    };

    const handleToggleStatus = async (itemId: string, currentStatus: boolean) => {
        await toggleMenuItemStatusAction(itemId, !currentStatus);
        loadData();
    };

    const handleCreateRecipeStub = async (itemId: string) => {
        setCreatingRecipeFor(itemId);
        const result = await createRecipeStubForMenuItemAction(itemId);
        if (result.success) {
            loadData();
        } else {
            alert(result.message);
        }
        setCreatingRecipeFor(null);
    };

    // Conteo de items sin receta
    const itemsWithoutRecipe = categories.flatMap(c => c.items).filter((i: any) => !i.recipeId).length;

    // Filtrado de búsqueda + filtro sin receta
    const filteredCategories = categories.map(cat => ({
        ...cat,
        items: cat.items.filter((item: any) => {
            const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesRecipeFilter = !showOnlyNoRecipe || !item.recipeId;
            return matchesSearch && matchesRecipeFilter;
        })
    })).filter(cat => cat.items.length > 0);

    if (isLoading) {
        return <div className="p-8 text-center text-white">Cargando menú...</div>;
    }

    return (
        <div className="p-6 max-w-7xl mx-auto text-white">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
                        Gestión de Menú
                    </h1>
                    <p className="text-gray-400">Administra precios, productos y disponibilidad</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2"
                >
                    <span className="text-xl">+</span> Nuevo Plato
                </button>
            </div>

            {/* Barra de búsqueda + filtros */}
            <div className="mb-6 flex gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                    <span className="absolute left-4 top-3 text-gray-500">🔍</span>
                    <input
                        type="text"
                        placeholder="Buscar plato..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-amber-500 transition-colors"
                    />
                </div>
                <button
                    onClick={() => setShowOnlyNoRecipe(!showOnlyNoRecipe)}
                    className={`px-4 py-3 rounded-xl font-bold text-sm flex items-center gap-2 transition-all border ${showOnlyNoRecipe ? 'bg-red-500/20 border-red-500 text-red-300' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-red-500/50'}`}
                >
                    ⚠️ Sin Receta
                    <span className={`px-2 py-0.5 rounded-full text-xs ${itemsWithoutRecipe > 0 ? 'bg-red-500 text-white' : 'bg-gray-600 text-gray-300'}`}>
                        {itemsWithoutRecipe}
                    </span>
                </button>
            </div>

            {/* Lista por Categorías */}
            <div className="space-y-8">
                {filteredCategories.map(category => (
                    <div key={category.id} className="bg-gray-800/50 border border-gray-700 rounded-2xl overflow-hidden">
                        <div className="px-6 py-4 bg-gray-800 border-b border-gray-700 flex items-center gap-3">
                            <span className="text-2xl">{category.name.includes('Bebida') ? '🥤' : '🍽️'}</span>
                            <h2 className="text-xl font-bold text-gray-200">{category.name}</h2>
                            <span className="text-gray-500 text-sm ml-auto">{category.items.length} items</span>
                        </div>

                        <div className="divide-y divide-gray-700">
                            {category.items.map((item: any) => (
                                <div key={item.id} className={`flex items-center justify-between p-4 hover:bg-gray-700/50 transition-colors ${!item.isActive ? 'opacity-50 grayscale' : ''}`}>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            {editingNameId === item.id ? (
                                                <input
                                                    autoFocus
                                                    type="text"
                                                    value={editingNameValue}
                                                    onChange={e => setEditingNameValue(e.target.value)}
                                                    onBlur={() => handleNameChange(item.id, editingNameValue)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') handleNameChange(item.id, editingNameValue);
                                                        if (e.key === 'Escape') setEditingNameId(null);
                                                    }}
                                                    className="bg-gray-900 border border-amber-500 rounded px-2 py-1 text-lg font-semibold text-white focus:outline-none w-full max-w-md"
                                                />
                                            ) : (
                                                <>
                                                    <div className="font-semibold text-lg">{item.name}</div>
                                                    <button
                                                        onClick={() => {
                                                            setEditingNameId(item.id);
                                                            setEditingNameValue(item.name);
                                                        }}
                                                        className="text-gray-500 hover:text-amber-400 transition-colors text-sm"
                                                        title="Editar nombre"
                                                    >
                                                        ✏️
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                        <div className="text-sm text-gray-400">{item.description || 'Sin descripción'}</div>
                                    </div>

                                    <div className="flex items-center gap-3 flex-wrap justify-end">
                                        {/* Receta Status */}
                                        {item.recipeId ? (
                                            <span className="px-2 py-1 rounded-full text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30 flex items-center gap-1">
                                                📋 Receta ✓
                                            </span>
                                        ) : (
                                            <button
                                                onClick={() => handleCreateRecipeStub(item.id)}
                                                disabled={creatingRecipeFor === item.id}
                                                className="px-2 py-1 rounded-full text-xs font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30 transition-colors disabled:opacity-50 flex items-center gap-1"
                                                title="Crear receta vacía para este plato"
                                            >
                                                {creatingRecipeFor === item.id ? '⏳' : '⚠️'} Sin Receta
                                            </button>
                                        )}

                                        {/* Precio Editable */}
                                        <div className="flex items-center bg-gray-900 rounded-lg border border-gray-600 px-3 py-1">
                                            <span className="text-amber-500 font-bold mr-1">$</span>
                                            <input
                                                type="number"
                                                defaultValue={item.price}
                                                onBlur={(e) => handlePriceChange(item.id, e.target.value)}
                                                className="bg-transparent w-20 text-white font-mono font-bold focus:outline-none"
                                            />
                                        </div>

                                        {/* Switch Activo/Inactivo */}
                                        <button
                                            onClick={() => handleToggleStatus(item.id, item.isActive)}
                                            className={`px-3 py-1 rounded-full text-xs font-bold ${item.isActive ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}
                                        >
                                            {item.isActive ? 'ACTIVO' : 'INACTIVO'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {category.items.length === 0 && (
                                <div className="p-8 text-center text-gray-500">
                                    No hay productos en esta categoría
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal Nuevo Producto */}
            {showModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-800 rounded-2xl w-full max-w-md p-6 border border-gray-700 shadow-2xl">
                        <h2 className="text-2xl font-bold mb-6">Nuevo Producto</h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Nombre</label>
                                <input
                                    autoFocus
                                    className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 focus:border-amber-500 focus:outline-none"
                                    value={newItem.name}
                                    onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                                    placeholder="Ej. Shawarma Mixto"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Precio ($)</label>
                                    <input
                                        type="number"
                                        className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 focus:border-amber-500 focus:outline-none font-mono"
                                        value={newItem.price}
                                        onChange={e => setNewItem({ ...newItem, price: e.target.value })}
                                        placeholder="0.00"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Categoría</label>
                                    <select
                                        className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 focus:border-amber-500 focus:outline-none"
                                        value={newItem.categoryId}
                                        onChange={e => setNewItem({ ...newItem, categoryId: e.target.value })}
                                    >
                                        {categories.map(cat => (
                                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Descripción (Opcional)</label>
                                <textarea
                                    className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 focus:border-amber-500 focus:outline-none resize-none h-24"
                                    value={newItem.description}
                                    onChange={e => setNewItem({ ...newItem, description: e.target.value })}
                                    placeholder="Ingredientes..."
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <button
                                onClick={() => setShowModal(false)}
                                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl font-medium"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleCreateItem}
                                disabled={isSaving}
                                className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 rounded-xl font-bold flex justify-center items-center"
                            >
                                {isSaving ? 'Guardando...' : 'Crear Plato'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
