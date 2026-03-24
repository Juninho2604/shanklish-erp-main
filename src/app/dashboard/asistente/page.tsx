'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  createRawMaterialAction,
  suggestSkuAction,
  getMenuRecipeStatusAction,
  getRawMaterialsListAction,
  type MenuRecipeStatus,
} from '@/app/actions/asistente.actions';

// ============================================================================
// ESTÁNDARES POR CATEGORÍA
// ============================================================================

interface Category {
  id: string;
  label: string;
  icon: string;
  description: string;
  type: 'RAW_MATERIAL' | 'SUB_RECIPE';
  skuPrefix: string;
  baseUnit: string;
  purchaseUnit: string;
  conversionRate: number;
  isBeverage: boolean;
  isAlcoholic: boolean;
  beverageCategory?: string;
  examples: string[];
  unitNote: string;
}

const CATEGORIES: Category[] = [
  {
    id: 'proteinas', label: 'Proteínas / Carnes', icon: '🥩',
    description: 'Res, pollo, cordero, cerdo, mariscos',
    type: 'RAW_MATERIAL', skuPrefix: 'CARN',
    baseUnit: 'KG', purchaseUnit: 'KG', conversionRate: 1,
    isBeverage: false, isAlcoholic: false,
    examples: ['Pollo Pechuga Fresca', 'Carne Molida 80/20', 'Cordero Pierna', 'Camarones Medianos'],
    unitNote: 'Se registran en KG. Para cortes específicos, incluir el nombre del corte.',
  },
  {
    id: 'lacteos', label: 'Lácteos / Quesos', icon: '🧀',
    description: 'Quesos, cremas, yogurt, mantequilla',
    type: 'RAW_MATERIAL', skuPrefix: 'LACT',
    baseUnit: 'KG', purchaseUnit: 'KG', conversionRate: 1,
    isBeverage: false, isAlcoholic: false,
    examples: ['Queso Blanco Duro', 'Queso Amarillo Rebanado', 'Crema de Leche 200ml', 'Mantequilla Sin Sal'],
    unitNote: 'Quesos sólidos en KG. Cremas y líquidos en LT o ML.',
  },
  {
    id: 'bebidas_alc', label: 'Bebidas Alcohólicas', icon: '🍾',
    description: 'Licores, vinos, cervezas para cócteles',
    type: 'RAW_MATERIAL', skuPrefix: 'BEB',
    baseUnit: 'ML', purchaseUnit: 'BOTELLA', conversionRate: 750,
    isBeverage: true, isAlcoholic: true, beverageCategory: 'ALCOHOL',
    examples: ['Ron Añejo Santa Teresa 1796 750ml', 'Vodka Absolut 750ml', 'Gin Hendricks 700ml', 'Cerveza Polar Lata'],
    unitNote: 'Base: ML. Compra: BOTELLA. Conversión = ml por botella (ej: 750). Así las recetas se definen en ML.',
  },
  {
    id: 'bebidas_noalc', label: 'Bebidas No Alcohólicas', icon: '🥤',
    description: 'Jugos, refrescos, agua, siropes',
    type: 'RAW_MATERIAL', skuPrefix: 'BEV',
    baseUnit: 'ML', purchaseUnit: 'LT', conversionRate: 1000,
    isBeverage: true, isAlcoholic: false, beverageCategory: 'SOFT_DRINK',
    examples: ['Jugo de Naranja Natural', 'Agua Mineral Botella 500ml', 'Refresco Cola 2L', 'Sirope de Menta'],
    unitNote: 'Base: ML. Compra: LT con conversión 1000. Para botellas individuales, usar BOTELLA.',
  },
  {
    id: 'especias', label: 'Especias / Secos', icon: '🌿',
    description: 'Condimentos, harinas, azúcares, aceites',
    type: 'RAW_MATERIAL', skuPrefix: 'SPEC',
    baseUnit: 'GR', purchaseUnit: 'KG', conversionRate: 1000,
    isBeverage: false, isAlcoholic: false,
    examples: ['Comino Molido', 'Pimienta Negra Molida', 'Harina de Trigo Todo Uso', 'Azúcar Blanca'],
    unitNote: 'Base: GR. Compra: KG con conversión 1000. Aceites en ML.',
  },
  {
    id: 'panaderia', label: 'Pan / Masas', icon: '🫓',
    description: 'Panes, tortillas, masas, wraps',
    type: 'RAW_MATERIAL', skuPrefix: 'PAN',
    baseUnit: 'UNIDAD', purchaseUnit: 'UNIDAD', conversionRate: 1,
    isBeverage: false, isAlcoholic: false,
    examples: ['Pan de Pita 22cm', 'Pan Árabe Mediano', 'Tortilla de Trigo 8inch', 'Pan Baguette'],
    unitNote: 'Por unidad si el tamaño es estándar. En KG si se compra al peso.',
  },
  {
    id: 'vegetales', label: 'Vegetales / Frutas', icon: '🥦',
    description: 'Tomates, lechugas, cebollas, limones',
    type: 'RAW_MATERIAL', skuPrefix: 'VEG',
    baseUnit: 'KG', purchaseUnit: 'KG', conversionRate: 1,
    isBeverage: false, isAlcoholic: false,
    examples: ['Tomate Plum', 'Lechuga Romana', 'Cebolla Blanca', 'Limón Tahití', 'Pepino'],
    unitNote: 'KG para todo. Para frutas de tamaño estándar (limones), puedes usar UNIDAD.',
  },
  {
    id: 'salsas', label: 'Salsas / Preparaciones', icon: '🍯',
    description: 'Salsas caseras, marinados, bases de receta',
    type: 'SUB_RECIPE', skuPrefix: 'SALSA',
    baseUnit: 'GR', purchaseUnit: 'KG', conversionRate: 1000,
    isBeverage: false, isAlcoholic: false,
    examples: ['Salsa Shawarma Casera', 'Aderezo de Ajo y Limón', 'Marinado de Pollo', 'Hummus Base'],
    unitNote: 'Tipo SUB_RECETA — se produce internamente con otra receta. Base: GR.',
  },
  {
    id: 'empaques', label: 'Empaques / Descartables', icon: '📦',
    description: 'Cajas, bolsas, vasos, cubiertos',
    type: 'RAW_MATERIAL', skuPrefix: 'EMP',
    baseUnit: 'UNIDAD', purchaseUnit: 'UNIDAD', conversionRate: 1,
    isBeverage: false, isAlcoholic: false,
    examples: ['Caja Kraft 18x12 Delivery', 'Bolsa Térmica L', 'Vaso Plástico 16oz', 'Tenedor Plástico'],
    unitNote: 'Por unidad. Incluir el tamaño/especificación en el nombre.',
  },
  {
    id: 'otros', label: 'Otros Insumos', icon: '📋',
    description: 'Servilletas, limpieza, insumos varios',
    type: 'RAW_MATERIAL', skuPrefix: 'OTR',
    baseUnit: 'UNIDAD', purchaseUnit: 'UNIDAD', conversionRate: 1,
    isBeverage: false, isAlcoholic: false,
    examples: ['Servilleta Blanca', 'Papel Aluminio Rollo 30cm', 'Bolsa de Hielo 2KG'],
    unitNote: 'Por unidad o en KG según corresponda.',
  },
];

const UNITS = ['KG', 'GR', 'LT', 'ML', 'UNIDAD', 'BOTELLA', 'LATA', 'PORCION', 'CAJA', 'PAQUETE'];

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export default function AsistentePage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

  // Formulario
  const [form, setForm] = useState({
    name: '',
    sku: '',
    baseUnit: '',
    purchaseUnit: '',
    conversionRate: 1,
    minimumStock: 0,
    description: '',
    isBeverage: false,
    isAlcoholic: false,
    beverageCategory: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string } | null>(null);
  const [createdItems, setCreatedItems] = useState<{ sku: string; name: string }[]>([]);

  // Estado de recetas
  const [recipeStatus, setRecipeStatus] = useState<MenuRecipeStatus[]>([]);
  const [recipeSummary, setRecipeSummary] = useState<{ total: number; complete: number; stub: number; none: number } | null>(null);
  const [existingMaterials, setExistingMaterials] = useState<{ id: string; sku: string; name: string; category: string }[]>([]);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);

  const loadStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    const [statusResult, materialsResult] = await Promise.all([
      getMenuRecipeStatusAction(),
      getRawMaterialsListAction(),
    ]);
    if (statusResult.success && statusResult.data) {
      setRecipeStatus(statusResult.data);
      setRecipeSummary(statusResult.summary ?? null);
    }
    if (materialsResult.success && materialsResult.data) {
      setExistingMaterials(materialsResult.data);
    }
    setIsLoadingStatus(false);
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleCategorySelect = async (cat: Category) => {
    setSelectedCategory(cat);
    const suggestedSku = await suggestSkuAction(cat.skuPrefix);
    setForm({
      name: '',
      sku: suggestedSku,
      baseUnit: cat.baseUnit,
      purchaseUnit: cat.purchaseUnit,
      conversionRate: cat.conversionRate,
      minimumStock: 0,
      description: '',
      isBeverage: cat.isBeverage,
      isAlcoholic: cat.isAlcoholic,
      beverageCategory: cat.beverageCategory || '',
    });
    setSubmitResult(null);
    setStep(2);
  };

  const handleNameChange = async (name: string) => {
    setForm((prev) => ({ ...prev, name }));
  };

  const handleSubmit = async () => {
    if (!selectedCategory || !form.name.trim()) return;
    setIsSubmitting(true);
    setSubmitResult(null);
    const result = await createRawMaterialAction({
      name: form.name,
      sku: form.sku,
      type: selectedCategory.type,
      category: selectedCategory.id,
      baseUnit: form.baseUnit,
      purchaseUnit: form.purchaseUnit,
      conversionRate: form.conversionRate,
      minimumStock: form.minimumStock,
      description: form.description || undefined,
      isBeverage: form.isBeverage,
      isAlcoholic: form.isAlcoholic,
      beverageCategory: form.beverageCategory || undefined,
    });
    setSubmitResult(result);
    if (result.success && result.data) {
      setCreatedItems((prev) => [{ sku: result.data!.sku, name: result.data!.name }, ...prev]);
      await loadStatus();
      setStep(3);
    }
    setIsSubmitting(false);
  };

  const handleAddAnother = () => {
    setStep(1);
    setSelectedCategory(null);
    setSubmitResult(null);
  };

  const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  // ── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">

      {/* HEADER */}
      <div className="glass-panel p-6 rounded-3xl border-primary/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">
            🧭 <span className="text-primary italic">ASISTENTE</span> de Nomenclatura
          </h1>
          <p className="text-sm text-muted-foreground mt-1 font-medium">
            Crea insumos con los estándares correctos · La base para que el inventario se descuente automáticamente
          </p>
        </div>
        <Link
          href="/dashboard/recetas"
          className="capsula-btn capsula-btn-secondary text-sm py-2 px-4"
        >
          📋 Ir a Recetas →
        </Link>
      </div>

      {/* PANEL DE ESTADO DE RECETAS */}
      <div className="capsula-card p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-black text-base uppercase tracking-tight flex items-center gap-2">
            <span className="text-xl">🔗</span> Estado de Conexión Ventas → Inventario
          </h2>
          <button onClick={loadStatus} className="text-[10px] font-black text-primary hover:underline uppercase tracking-widest">
            Actualizar
          </button>
        </div>

        {isLoadingStatus ? (
          <div className="text-center py-6 text-muted-foreground text-sm">Cargando estado...</div>
        ) : recipeSummary ? (
          <>
            {/* Barra de progreso */}
            <div className="flex gap-2 items-center mb-4">
              <div className="flex-1 h-4 bg-secondary rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-emerald-500 transition-all duration-700"
                  style={{ width: `${pct(recipeSummary.complete, recipeSummary.total)}%` }}
                />
                <div
                  className="h-full bg-amber-400 transition-all duration-700"
                  style={{ width: `${pct(recipeSummary.stub, recipeSummary.total)}%` }}
                />
                <div
                  className="h-full bg-red-500/50 transition-all duration-700"
                  style={{ width: `${pct(recipeSummary.none, recipeSummary.total)}%` }}
                />
              </div>
              <span className="text-sm font-black tabular-nums text-foreground/70">{recipeSummary.total} platos</span>
            </div>

            {/* Leyenda */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-emerald-500/10 rounded-xl p-3 text-center border border-emerald-500/20">
                <div className="text-2xl font-black text-emerald-400">{recipeSummary.complete}</div>
                <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mt-1">✅ Receta completa</div>
                <div className="text-[9px] text-muted-foreground mt-0.5">Descuenta inventario</div>
              </div>
              <div className="bg-amber-400/10 rounded-xl p-3 text-center border border-amber-400/20">
                <div className="text-2xl font-black text-amber-400">{recipeSummary.stub}</div>
                <div className="text-[10px] font-black text-amber-400 uppercase tracking-widest mt-1">🟡 Receta vacía</div>
                <div className="text-[9px] text-muted-foreground mt-0.5">Sin ingredientes aún</div>
              </div>
              <div className="bg-red-500/10 rounded-xl p-3 text-center border border-red-500/20">
                <div className="text-2xl font-black text-red-400">{recipeSummary.none}</div>
                <div className="text-[10px] font-black text-red-400 uppercase tracking-widest mt-1">❌ Sin receta</div>
                <div className="text-[9px] text-muted-foreground mt-0.5">No descuenta</div>
              </div>
            </div>

            {/* Lista de platos con receta incompleta */}
            {(recipeSummary.stub > 0 || recipeSummary.none > 0) && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">
                  Platos que necesitan receta completa
                </p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {recipeStatus
                    .filter((i) => i.recipeStatus !== 'COMPLETE')
                    .map((item) => (
                      <div key={item.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-secondary/30 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span>{item.recipeStatus === 'STUB' ? '🟡' : '❌'}</span>
                          <span className="font-bold text-foreground truncate">{item.name}</span>
                          <span className="text-muted-foreground shrink-0">{item.categoryName}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          {item.recipeStatus === 'STUB' && (
                            <span className="text-[9px] text-amber-400 font-bold">0 ingredientes</span>
                          )}
                          {item.recipeId ? (
                            <Link
                              href={`/dashboard/recetas/${item.recipeId}`}
                              className="text-[9px] font-black text-primary hover:underline uppercase tracking-widest"
                            >
                              Completar →
                            </Link>
                          ) : (
                            <Link
                              href="/dashboard/menu"
                              className="text-[9px] font-black text-red-400 hover:underline uppercase tracking-widest"
                            >
                              Crear receta →
                            </Link>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {recipeSummary.complete === recipeSummary.total && recipeSummary.total > 0 && (
              <div className="text-center py-4">
                <div className="text-3xl mb-2">🎉</div>
                <p className="font-black text-emerald-400">¡Todos los platos tienen receta completa!</p>
                <p className="text-xs text-muted-foreground mt-1">El inventario se descuenta automáticamente en cada venta</p>
              </div>
            )}

            {recipeSummary.total === 0 && (
              <div className="text-center py-4 text-muted-foreground text-sm">
                No hay platos en el menú aún.{' '}
                <Link href="/dashboard/menu" className="text-primary font-bold hover:underline">
                  Ir al Menú →
                </Link>
              </div>
            )}
          </>
        ) : (
          <p className="text-muted-foreground text-sm text-center py-4">Error cargando estado</p>
        )}
      </div>

      {/* WIZARD — CREAR INSUMO */}
      <div className="capsula-card p-6">
        {/* Steps indicator */}
        <div className="flex items-center gap-3 mb-6">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-black transition-all ${
                step === s ? 'bg-primary text-white shadow-lg shadow-primary/20' :
                step > s ? 'bg-emerald-500 text-white' : 'bg-secondary text-muted-foreground'
              }`}>
                {step > s ? '✓' : s}
              </div>
              <span className={`text-xs font-black uppercase tracking-widest hidden sm:block ${step === s ? 'text-primary' : 'text-muted-foreground'}`}>
                {s === 1 ? 'Categoría' : s === 2 ? 'Detalles' : 'Confirmado'}
              </span>
              {s < 3 && <div className="w-8 h-0.5 bg-border" />}
            </div>
          ))}
          <div className="ml-auto">
            <h2 className="font-black text-sm uppercase tracking-widest text-muted-foreground">
              {step === 1 ? 'Nuevo Insumo' : step === 2 ? `${selectedCategory?.icon} ${selectedCategory?.label}` : '✅ Creado'}
            </h2>
          </div>
        </div>

        {/* ── PASO 1: ELEGIR CATEGORÍA ─────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground font-medium">
              Selecciona el tipo de insumo para cargar los estándares correctos automáticamente:
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => handleCategorySelect(cat)}
                  className="capsula-card group p-4 text-center flex flex-col items-center gap-2 hover:border-primary/50 active:scale-95 transition-all"
                >
                  <span className="text-3xl">{cat.icon}</span>
                  <span className="text-xs font-black uppercase tracking-tight text-foreground group-hover:text-primary transition-colors leading-tight">
                    {cat.label}
                  </span>
                  {cat.type === 'SUB_RECIPE' && (
                    <span className="text-[8px] font-black bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded-full">SUB-RECETA</span>
                  )}
                </button>
              ))}
            </div>

            {/* Insumos existentes */}
            {existingMaterials.length > 0 && (
              <div className="mt-4 p-4 bg-secondary/20 rounded-2xl border border-border">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">
                  {existingMaterials.length} insumos ya registrados en el sistema
                </p>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {existingMaterials.map((m) => (
                    <span key={m.id} className="text-[10px] font-bold bg-secondary px-2 py-1 rounded-lg text-foreground/70">
                      {m.sku} · {m.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── PASO 2: FORMULARIO ───────────────────────────────────────────── */}
        {step === 2 && selectedCategory && (
          <div className="space-y-5">
            {/* Info de estándares */}
            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Estándar para {selectedCategory.label}</p>
              <p className="text-xs text-foreground/70 font-medium">{selectedCategory.unitNote}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {selectedCategory.examples.map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => handleNameChange(ex)}
                    className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-1 rounded-lg hover:bg-primary/20 transition-colors"
                  >
                    {ex}
                  </button>
                ))}
              </div>
              <p className="text-[9px] text-muted-foreground mt-2">↑ Haz clic en un ejemplo para usarlo como nombre</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {/* Nombre */}
              <div className="sm:col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1.5">
                  Nombre del insumo *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder={`Ej: ${selectedCategory.examples[0]}`}
                  className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm font-bold focus:border-primary focus:outline-none"
                />
                <p className="text-[9px] text-muted-foreground mt-1 font-medium">
                  Usa el nombre completo y descriptivo. Evita abreviaciones.
                </p>
              </div>

              {/* SKU */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1.5">SKU *</label>
                <input
                  type="text"
                  value={form.sku}
                  onChange={(e) => setForm((p) => ({ ...p, sku: e.target.value.toUpperCase() }))}
                  className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm font-black font-mono focus:border-primary focus:outline-none"
                />
                <p className="text-[9px] text-muted-foreground mt-1 font-medium">Auto-generado con prefijo {selectedCategory.skuPrefix}</p>
              </div>

              {/* Unidad base */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1.5">
                  Unidad Base * <span className="text-primary">(la de las recetas)</span>
                </label>
                <select
                  value={form.baseUnit}
                  onChange={(e) => setForm((p) => ({ ...p, baseUnit: e.target.value }))}
                  className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm font-bold focus:border-primary focus:outline-none"
                >
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>

              {/* Unidad de compra */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1.5">
                  Unidad de Compra <span className="text-muted-foreground">(para entradas)</span>
                </label>
                <select
                  value={form.purchaseUnit}
                  onChange={(e) => setForm((p) => ({ ...p, purchaseUnit: e.target.value }))}
                  className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm font-bold focus:border-primary focus:outline-none"
                >
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>

              {/* Conversión */}
              {form.purchaseUnit !== form.baseUnit && (
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1.5">
                    Conversión: 1 {form.purchaseUnit} = ? {form.baseUnit}
                  </label>
                  <input
                    type="number"
                    value={form.conversionRate}
                    onChange={(e) => setForm((p) => ({ ...p, conversionRate: parseFloat(e.target.value) || 1 }))}
                    min={0.001}
                    step={0.001}
                    className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm font-bold focus:border-primary focus:outline-none"
                  />
                  <p className="text-[9px] text-muted-foreground mt-1">
                    Ej: 1 BOTELLA = 750 ML → escribe 750
                  </p>
                </div>
              )}

              {/* Stock mínimo */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1.5">
                  Stock Mínimo ({form.baseUnit})
                </label>
                <input
                  type="number"
                  value={form.minimumStock}
                  onChange={(e) => setForm((p) => ({ ...p, minimumStock: parseFloat(e.target.value) || 0 }))}
                  min={0}
                  className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm font-bold focus:border-primary focus:outline-none"
                />
                <p className="text-[9px] text-muted-foreground mt-1">Se dispara alerta cuando el stock baje de este valor</p>
              </div>

              {/* Descripción */}
              <div className="sm:col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1.5">
                  Descripción (opcional)
                </label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Especificaciones adicionales, proveedor típico, etc."
                  className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm font-bold focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            {/* Bebidas alcohólicas: campos adicionales */}
            {form.isBeverage && (
              <div className="p-4 bg-blue-500/5 rounded-2xl border border-blue-500/20 flex items-center gap-3">
                <span className="text-2xl">🍾</span>
                <div>
                  <p className="text-xs font-black text-blue-400">Marcado como bebida alcohólica</p>
                  <p className="text-[10px] text-muted-foreground">Las recetas de cócteles usarán ML como unidad en sus ingredientes</p>
                </div>
              </div>
            )}

            {submitResult && !submitResult.success && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm font-bold text-red-400">
                ⚠️ {submitResult.message}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={() => setStep(1)} className="capsula-btn capsula-btn-secondary py-3 flex-1">
                ← Cambiar categoría
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !form.name.trim() || !form.sku.trim()}
                className="capsula-btn capsula-btn-primary py-3 flex-[2] disabled:opacity-40"
              >
                {isSubmitting ? 'Creando...' : `✓ Crear ${selectedCategory.type === 'SUB_RECIPE' ? 'Sub-Receta' : 'Insumo'}`}
              </button>
            </div>
          </div>
        )}

        {/* ── PASO 3: CONFIRMACIÓN ─────────────────────────────────────────── */}
        {step === 3 && submitResult?.success && (
          <div className="space-y-6">
            <div className="text-center py-6">
              <div className="text-5xl mb-4">✅</div>
              <h3 className="text-xl font-black text-emerald-400">{submitResult.message}</h3>
              <p className="text-sm text-muted-foreground mt-2">
                El insumo está listo para usarse en recetas
              </p>
            </div>

            {/* Próximos pasos */}
            <div className="bg-primary/5 rounded-2xl p-5 border border-primary/20">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-4">¿Qué hacer ahora?</p>
              <div className="space-y-3">
                <div className="flex gap-3 items-start">
                  <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-black shrink-0">1</div>
                  <div>
                    <p className="text-sm font-bold text-foreground">Registrar stock inicial</p>
                    <p className="text-xs text-muted-foreground">
                      Ve a <Link href="/dashboard/inventario/entrada" className="text-primary font-bold hover:underline">Inventario → Entrada</Link> y carga el stock actual con su costo
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 items-start">
                  <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-black shrink-0">2</div>
                  <div>
                    <p className="text-sm font-bold text-foreground">Agregar a recetas</p>
                    <p className="text-xs text-muted-foreground">
                      Ve a <Link href="/dashboard/recetas" className="text-primary font-bold hover:underline">Recetas</Link> y agrega este insumo como ingrediente en los platos que lo usan
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 items-start">
                  <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-black shrink-0">3</div>
                  <div>
                    <p className="text-sm font-bold text-foreground">Crear más insumos</p>
                    <p className="text-xs text-muted-foreground">Continúa agregando todos los ingredientes base del restaurante</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Items creados en esta sesión */}
            {createdItems.length > 0 && (
              <div className="p-4 bg-secondary/20 rounded-2xl border border-border">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Creados en esta sesión</p>
                <div className="flex flex-wrap gap-1.5">
                  {createdItems.map((item) => (
                    <span key={item.sku} className="text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded-lg">
                      {item.sku} · {item.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={handleAddAnother} className="capsula-btn capsula-btn-primary py-3 flex-1">
                + Agregar otro insumo
              </button>
              <Link href="/dashboard/recetas" className="capsula-btn capsula-btn-secondary py-3 flex-1 text-center">
                Ir a Recetas →
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* GUÍA RÁPIDA DE NOMENCLATURA */}
      <div className="capsula-card p-6">
        <h2 className="font-black text-base uppercase tracking-tight flex items-center gap-2 mb-4">
          <span>📐</span> Estándares de Nomenclatura CAPSULA
        </h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { icon: '🥩', cat: 'Proteínas', rule: 'Nombre descriptivo + tipo + estado', ex: '"Pollo Pechuga Fresca", "Carne Molida 80/20"' },
            { icon: '🍾', cat: 'Licores', rule: 'Marca + tipo + volumen en ML', ex: '"Ron Añejo Santa Teresa 750ml"' },
            { icon: '🧀', cat: 'Lácteos', rule: 'Tipo + característica', ex: '"Queso Blanco Duro", "Crema de Leche"' },
            { icon: '🌿', cat: 'Especias', rule: 'Nombre + presentación', ex: '"Comino Molido", "Pimienta Negra Entera"' },
            { icon: '🫓', cat: 'Pan', rule: 'Tipo + tamaño', ex: '"Pan de Pita 22cm", "Pan Árabe Mediano"' },
            { icon: '📦', cat: 'Empaques', rule: 'Tipo + tamaño + uso', ex: '"Caja Kraft 18x12 Delivery"' },
          ].map((s) => (
            <div key={s.cat} className="p-3 bg-secondary/30 rounded-xl border border-border">
              <div className="flex items-center gap-2 mb-1">
                <span>{s.icon}</span>
                <span className="text-xs font-black text-foreground uppercase">{s.cat}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">{s.rule}</p>
              <p className="text-[10px] font-mono text-primary/80 mt-1">{s.ex}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
