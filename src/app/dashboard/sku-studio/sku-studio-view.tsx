'use client';

import { useState, useTransition } from 'react';
import { createSkuItemAction, createProductFamily, getProductFamilies } from '@/app/actions/sku-studio.actions';

// ── Chip helper ──────────────────────────────────────────────────────────────
function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
        selected
          ? 'bg-primary/20 border-primary text-primary'
          : 'border-border text-muted-foreground hover:border-primary/50'
      }`}
    >
      {label}
    </button>
  );
}

type Tab = 'nuevo' | 'familias' | 'plantillas';
type ItemType = 'RAW_MATERIAL' | 'SUB_RECIPE' | 'FINISHED_GOOD';

const ITEM_TYPES: { value: ItemType; label: string }[] = [
  { value: 'RAW_MATERIAL',  label: 'Materia prima' },
  { value: 'SUB_RECIPE',    label: 'Sub receta / compuesto' },
  { value: 'FINISHED_GOOD', label: 'Producto final' },
];
const OPERATIVE_ROLES = ['Ninguno', 'Insumo base', 'Intermedio', 'Compuesto', 'Final venta', 'Se transforma'];
const BASE_UNITS      = ['KG', 'G', 'L', 'ML', 'UNIT', 'PORTION'];
const TRACKING_MODES  = ['Por unidad', 'Receta', 'Compuesto', 'Solo display'];

interface Family { id: string; code: string; name: string; icon: string | null; _count: { items: number; templates: number } }
interface Template { id: string; name: string; productFamily: { id: string; code: string; name: string } | null }

export default function SkuStudioView({ families: initFamilies, templates }: { families: Family[]; templates: Template[] }) {
  const [tab, setTab] = useState<Tab>('nuevo');
  const [families, setFamilies] = useState<Family[]>(initFamilies);

  // ── Nuevo SKU state ──────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [skuPrefix, setSkuPrefix] = useState('');
  const [itemType, setItemType] = useState<ItemType>('RAW_MATERIAL');
  const [operRole, setOperRole] = useState('Ninguno');
  const [unit, setUnit] = useState('KG');
  const [tracking, setTracking] = useState('Por unidad');
  const [isBeverage, setIsBeverage] = useState(false);
  const [familyId, setFamilyId] = useState('');
  const [initialCost, setInitialCost] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [lastCreated, setLastCreated] = useState<{ sku: string; name: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // ── Familia state ────────────────────────────────────────────────────────
  const [famCode, setFamCode] = useState('');
  const [famName, setFamName] = useState('');
  const [famIcon, setFamIcon] = useState('');
  const [famFeedback, setFamFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleCreate = () => {
    if (!name.trim()) { setFeedback({ ok: false, msg: 'El nombre es obligatorio' }); return; }
    startTransition(async () => {
      const r = await createSkuItemAction({
        name,
        skuPrefix: skuPrefix || undefined,
        type: itemType,
        baseUnit: unit,
        productFamilyId: familyId || undefined,
        operativeRole: operRole,
        trackingMode: tracking,
        isBeverage,
        initialCost: initialCost ? parseFloat(initialCost) : undefined,
      });
      setFeedback({ ok: r.success, msg: r.message });
      if (r.success && r.data) {
        setLastCreated({ sku: r.data.sku, name: r.data.name });
        setName(''); setSkuPrefix(''); setItemType('RAW_MATERIAL');
        setOperRole('Ninguno'); setUnit('KG'); setTracking('Por unidad');
        setIsBeverage(false); setFamilyId(''); setInitialCost('');
      }
    });
  };

  const handleCreateFamily = () => {
    if (!famCode.trim() || !famName.trim()) { setFamFeedback({ ok: false, msg: 'Código y nombre son obligatorios' }); return; }
    startTransition(async () => {
      try {
        await createProductFamily({ code: famCode, name: famName, icon: famIcon || undefined });
        const updated = await getProductFamilies();
        setFamilies(updated);
        setFamCode(''); setFamName(''); setFamIcon('');
        setFamFeedback({ ok: true, msg: 'Familia creada correctamente' });
      } catch (e: any) {
        setFamFeedback({ ok: false, msg: e.message || 'Error al crear familia' });
      }
    });
  };

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      {/* Header */}
      <div className="glass-panel rounded-3xl p-6">
        <h1 className="text-2xl font-black text-foreground">SKU Studio</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Creación guiada de productos con familias y plantillas. Pensado para alta rotación de carta.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-secondary/50 rounded-2xl p-1">
        {([['nuevo', 'Nuevo SKU'], ['familias', 'Familias'], ['plantillas', 'Plantillas']] as [Tab, string][]).map(([t, l]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${tab === t ? 'bg-background text-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* ── TAB: Nuevo SKU ────────────────────────────────────────────────── */}
      {tab === 'nuevo' && (
        <div className="glass-panel rounded-2xl p-5 border border-border space-y-5">
          {lastCreated && (
            <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3">
              <span className="text-emerald-400 text-lg">✅</span>
              <div>
                <p className="text-sm font-bold text-emerald-400">{lastCreated.name}</p>
                <p className="text-xs font-mono text-muted-foreground">SKU: {lastCreated.sku}</p>
              </div>
            </div>
          )}

          {/* Nombre */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Nombre del Ítem</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ej. Pechuga deshuesada MAP"
              className="w-full bg-secondary/50 border border-border rounded-xl py-2 px-3 text-sm text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          {/* Familia */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Familia / Categoría</label>
            <select
              value={familyId}
              onChange={e => setFamilyId(e.target.value)}
              className="w-full bg-secondary/50 border border-border rounded-xl py-2 px-3 text-sm text-foreground focus:outline-none focus:border-primary"
            >
              <option value="">— Sin familia —</option>
              {families.map(f => (
                <option key={f.id} value={f.id}>{f.icon ? `${f.icon} ` : ''}{f.name} ({f.code})</option>
              ))}
            </select>
          </div>

          {/* Tipo de inventario */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Tipo de Inventario</label>
            <div className="flex flex-wrap gap-2">
              {ITEM_TYPES.map(t => (
                <Chip key={t.value} label={t.label} selected={itemType === t.value} onClick={() => setItemType(t.value)} />
              ))}
            </div>
          </div>

          {/* Rol operativo */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Rol Operativo <span className="normal-case font-normal">(opcional)</span></label>
            <div className="flex flex-wrap gap-2">
              {OPERATIVE_ROLES.map(r => (
                <Chip key={r} label={r} selected={operRole === r} onClick={() => setOperRole(r)} />
              ))}
            </div>
          </div>

          {/* Unidad base */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Unidad Base</label>
            <div className="flex flex-wrap gap-2">
              {BASE_UNITS.map(u => (
                <Chip key={u} label={u} selected={unit === u} onClick={() => setUnit(u)} />
              ))}
            </div>
          </div>

          {/* Seguimiento de stock */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Seguimiento de Stock</label>
            <div className="flex flex-wrap gap-2">
              {TRACKING_MODES.map(m => (
                <Chip key={m} label={m} selected={tracking === m} onClick={() => setTracking(m)} />
              ))}
            </div>
          </div>

          {/* Bebida + Prefijo SKU + Costo inicial */}
          <div className="flex items-center gap-2">
            <input type="checkbox" id="beverage" checked={isBeverage} onChange={e => setIsBeverage(e.target.checked)} className="rounded" />
            <label htmlFor="beverage" className="text-sm text-muted-foreground">Bebida (marca para reportes de bar)</label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Prefijo SKU <span className="normal-case font-normal">(opcional)</span></label>
              <input
                type="text"
                value={skuPrefix}
                onChange={e => setSkuPrefix(e.target.value.toUpperCase())}
                placeholder="Ej. CARN"
                maxLength={8}
                className="w-full bg-secondary/50 border border-border rounded-xl py-2 px-3 text-sm font-mono text-foreground focus:outline-none focus:border-primary uppercase"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Costo Inicial $ <span className="normal-case font-normal">(opcional)</span></label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={initialCost}
                onChange={e => setInitialCost(e.target.value)}
                placeholder="0.00"
                className="w-full bg-secondary/50 border border-border rounded-xl py-2 px-3 text-sm text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {feedback && (
            <p className={`text-xs px-3 py-2 rounded-lg ${feedback.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              {feedback.msg}
            </p>
          )}

          <button
            onClick={handleCreate}
            disabled={isPending}
            className="capsula-btn capsula-btn-primary text-sm px-6 py-2.5 min-h-0 w-full disabled:opacity-50"
          >
            {isPending ? 'Creando...' : 'Crear Ítem en Inventario'}
          </button>
        </div>
      )}

      {/* ── TAB: Familias ────────────────────────────────────────────────── */}
      {tab === 'familias' && (
        <div className="space-y-4">
          {/* Crear familia */}
          <div className="glass-panel rounded-2xl p-5 border border-border space-y-3">
            <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Nueva Familia</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Código *</label>
                <input type="text" value={famCode} onChange={e => setFamCode(e.target.value.toUpperCase())} placeholder="Ej. CARNE"
                  className="w-full bg-secondary/50 border border-border rounded-xl py-2 px-3 text-sm font-mono text-foreground focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Nombre *</label>
                <input type="text" value={famName} onChange={e => setFamName(e.target.value)} placeholder="Ej. Carnes y proteínas"
                  className="w-full bg-secondary/50 border border-border rounded-xl py-2 px-3 text-sm text-foreground focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Ícono</label>
                <input type="text" value={famIcon} onChange={e => setFamIcon(e.target.value)} placeholder="Ej. 🥩"
                  className="w-full bg-secondary/50 border border-border rounded-xl py-2 px-3 text-sm text-foreground focus:outline-none focus:border-primary" />
              </div>
            </div>
            {famFeedback && (
              <p className={`text-xs px-3 py-2 rounded-lg ${famFeedback.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                {famFeedback.msg}
              </p>
            )}
            <button onClick={handleCreateFamily} disabled={isPending} className="capsula-btn capsula-btn-primary text-sm px-5 py-2 min-h-0 disabled:opacity-50">
              {isPending ? 'Creando...' : 'Crear Familia'}
            </button>
          </div>

          {/* Lista familias */}
          <div className="glass-panel rounded-2xl border border-border overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-secondary/30">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Familias ({families.length})</span>
            </div>
            {families.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">Sin familias — crea la primera arriba</div>
            ) : (
              <div className="divide-y divide-border">
                {families.map(f => (
                  <div key={f.id} className="flex items-center gap-3 px-5 py-3 hover:bg-secondary/20">
                    <span className="text-xl">{f.icon || '📦'}</span>
                    <div className="flex-1">
                      <p className="font-bold text-sm text-foreground">{f.name}</p>
                      <p className="text-[10px] font-mono text-muted-foreground">{f.code} · {f._count.items} ítems · {f._count.templates} plantillas</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: Plantillas ──────────────────────────────────────────────── */}
      {tab === 'plantillas' && (
        <div className="glass-panel rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-secondary/30">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Plantillas ({templates.length})</span>
          </div>
          {templates.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <p className="text-2xl mb-1">📋</p>
              <p className="text-sm font-bold">Sin plantillas</p>
              <p className="text-xs mt-1">Las plantillas permiten pre-rellenar chips al crear nuevos SKUs</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {templates.map(t => (
                <div key={t.id} className="flex items-center gap-3 px-5 py-3 hover:bg-secondary/20">
                  <div className="flex-1">
                    <p className="font-bold text-sm text-foreground">{t.name}</p>
                    {t.productFamily && (
                      <p className="text-[10px] font-mono text-muted-foreground">{t.productFamily.name}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
