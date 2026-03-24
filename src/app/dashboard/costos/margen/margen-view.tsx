'use client';

import { useState, useMemo } from 'react';
import type { DishMargin, DishMarginsResult } from '@/app/actions/cost.actions';

// ============================================================================
// HELPERS
// ============================================================================

function fmt(n: number) {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function marginColor(pct: number, status: string) {
  if (status !== 'COMPLETE') return { bar: 'bg-gray-400', text: 'text-muted-foreground', badge: 'bg-gray-500/10 text-gray-400 border-gray-500/20' };
  if (pct < 20)  return { bar: 'bg-red-500',    text: 'text-red-400',    badge: 'bg-red-500/10 text-red-400 border-red-500/30' };
  if (pct < 35)  return { bar: 'bg-orange-500', text: 'text-orange-400', badge: 'bg-orange-500/10 text-orange-400 border-orange-500/30' };
  if (pct < 50)  return { bar: 'bg-amber-500',  text: 'text-amber-400',  badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30' };
  return           { bar: 'bg-emerald-500', text: 'text-emerald-400', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' };
}

function statusLabel(d: DishMargin) {
  if (d.status === 'NO_RECIPE')     return { text: 'Sin receta',          cls: 'text-red-400' };
  if (d.status === 'EMPTY_RECIPE')  return { text: 'Receta vacía',        cls: 'text-amber-400' };
  if (d.status === 'PARTIAL_COSTS') return { text: `${d.missingCostCount} sin costo`, cls: 'text-amber-400' };
  return { text: 'Completo', cls: 'text-emerald-400' };
}

type SortKey = 'marginPct' | 'margin' | 'price' | 'recipeCost' | 'name';
type FilterKey = 'all' | 'at_risk' | 'healthy' | 'incomplete';

// ============================================================================
// COMPONENTE
// ============================================================================

export function MargenView({ result }: { result: DishMarginsResult }) {
  const { data = [], summary } = result;

  const [sort, setSort] = useState<SortKey>('marginPct');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');

  const toggleSort = (key: SortKey) => {
    if (sort === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSort(key); setSortDir('asc'); }
  };

  const filtered = useMemo(() => {
    let rows = [...data];
    if (search) rows = rows.filter(d => d.name.toLowerCase().includes(search.toLowerCase()) || d.categoryName.toLowerCase().includes(search.toLowerCase()));
    if (filter === 'at_risk')    rows = rows.filter(d => d.status === 'COMPLETE' && d.marginPct < 30);
    if (filter === 'healthy')    rows = rows.filter(d => d.status === 'COMPLETE' && d.marginPct >= 50);
    if (filter === 'incomplete') rows = rows.filter(d => d.status !== 'COMPLETE');
    rows.sort((a, b) => {
      let va = a[sort as keyof DishMargin] as number;
      let vb = b[sort as keyof DishMargin] as number;
      if (sort === 'name') { va = a.name.localeCompare(b.name) as any; vb = 0; }
      const diff = typeof va === 'string' ? (a.name < b.name ? -1 : 1) : va - vb;
      return sortDir === 'asc' ? diff : -diff;
    });
    return rows;
  }, [data, sort, sortDir, filter, search]);

  const exportCSV = () => {
    const headers = ['SKU', 'Plato', 'Categoría', 'Precio ($)', 'Costo Receta ($)', 'Margen ($)', 'Margen %', 'Estado'];
    const rows = filtered.map(d => [
      d.sku, d.name, d.categoryName,
      d.price.toFixed(2), d.recipeCost.toFixed(2), d.margin.toFixed(2),
      d.marginPct.toFixed(1) + '%', d.status,
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `margen_platos_${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const SortBtn = ({ col, label }: { col: SortKey; label: string }) => (
    <button onClick={() => toggleSort(col)} className="flex items-center gap-1 hover:text-foreground transition-colors text-left">
      {label}
      <span className="text-[10px]">{sort === col ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
    </button>
  );

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="glass-panel rounded-3xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground">Margen por Plato</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Costo de receta vs precio de venta · En tiempo real</p>
        </div>
        <button onClick={exportCSV} className="capsula-btn capsula-btn-secondary text-sm px-5 py-2 min-h-0">
          📥 Exportar CSV
        </button>
      </div>

      {/* KPI cards */}
      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="glass-panel rounded-2xl p-4 border border-border">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Margen promedio</p>
            <p className={`text-3xl font-black mt-1 ${summary.avgMarginPct < 35 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {summary.avgMarginPct}%
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{summary.withFullData} platos con datos completos</p>
          </div>
          <div className="glass-panel rounded-2xl p-4 border border-red-500/20 bg-red-500/5">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">En riesgo (&lt;30%)</p>
            <p className="text-3xl font-black mt-1 text-red-400">{summary.atRisk}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Margen insuficiente</p>
          </div>
          <div className="glass-panel rounded-2xl p-4 border border-emerald-500/20 bg-emerald-500/5">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Rentables (≥50%)</p>
            <p className="text-3xl font-black mt-1 text-emerald-400">{summary.healthy}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Margen saludable</p>
          </div>
          <div className="glass-panel rounded-2xl p-4 border border-border">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total platos</p>
            <p className="text-3xl font-black mt-1 text-foreground">{summary.total}</p>
            {summary.worstDish && (
              <p className="text-xs text-red-400 mt-0.5 truncate" title={`Menor margen: ${summary.worstDish}`}>
                ↓ {summary.worstDish}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">🔍</span>
          <input
            type="text" placeholder="Buscar plato o categoría..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-secondary/50 border border-border rounded-xl py-2 pl-9 pr-3 text-sm text-foreground focus:outline-none focus:border-primary"
          />
        </div>
        {([
          ['all', 'Todos'],
          ['at_risk', '🔴 En riesgo'],
          ['healthy', '✅ Rentables'],
          ['incomplete', '⚠️ Incompletos'],
        ] as [FilterKey, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${filter === key ? 'bg-primary/10 border-primary text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}
          >
            {label}
          </button>
        ))}
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} platos</span>
      </div>

      {/* Tabla */}
      <div className="glass-panel rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  <SortBtn col="name" label="Plato" />
                </th>
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground hidden sm:table-cell">
                  Categoría
                </th>
                <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  <SortBtn col="price" label="Precio" />
                </th>
                <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground hidden md:table-cell">
                  <SortBtn col="recipeCost" label="Costo receta" />
                </th>
                <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground hidden md:table-cell">
                  <SortBtn col="margin" label="Margen $" />
                </th>
                <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  <SortBtn col="marginPct" label="Margen %" />
                </th>
                <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground hidden lg:table-cell">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(dish => {
                const colors = marginColor(dish.marginPct, dish.status);
                const sl = statusLabel(dish);
                const pctCapped = Math.min(dish.marginPct, 100);
                return (
                  <tr key={dish.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-bold text-foreground">{dish.name}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">{dish.sku}</div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-xs bg-secondary px-2 py-0.5 rounded font-medium text-muted-foreground">{dish.categoryName}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-foreground">
                      ${fmt(dish.price)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground hidden md:table-cell">
                      {dish.status === 'NO_RECIPE' ? '—' : `$${fmt(dish.recipeCost)}`}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-bold hidden md:table-cell ${colors.text}`}>
                      {dish.status === 'NO_RECIPE' ? '—' : `$${fmt(dish.margin)}`}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`text-sm font-black ${colors.text}`}>
                          {dish.status === 'NO_RECIPE' ? '—' : `${dish.marginPct.toFixed(1)}%`}
                        </span>
                        {dish.status === 'COMPLETE' && (
                          <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${colors.bar}`} style={{ width: `${pctCapped}%` }} />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center hidden lg:table-cell">
                      <span className={`text-[10px] font-black ${sl.cls}`}>{sl.text}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">
            <p className="text-3xl mb-2">🍽️</p>
            <p className="font-bold">Sin resultados</p>
            <p className="text-xs mt-1">Prueba cambiando el filtro o la búsqueda</p>
          </div>
        )}
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground px-1">
        {[
          { cls: 'bg-red-500',    label: 'Crítico < 20%' },
          { cls: 'bg-orange-500', label: 'Bajo 20–35%' },
          { cls: 'bg-amber-500',  label: 'Regular 35–50%' },
          { cls: 'bg-emerald-500',label: 'Saludable ≥ 50%' },
        ].map(({ cls, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`h-2.5 w-2.5 rounded-full ${cls}`} />
            {label}
          </div>
        ))}
        <span className="ml-auto italic">Los costos requieren insumos con precio registrado en Módulo Costos</span>
      </div>
    </div>
  );
}
