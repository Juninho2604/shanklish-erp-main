'use client';

import { useState, useTransition } from 'react';
import type { AreaItem } from '@/app/actions/areas.actions';
import { createAreaAction, toggleAreaStatusAction, findDuplicateAreasAction, getAreasAction } from '@/app/actions/areas.actions';

export default function AlmacenesView({ initialData }: { initialData: AreaItem[] }) {
  const [areas, setAreas] = useState<AreaItem[]>(initialData);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [feedback, setFeedback] = useState('');
  const [duplicates, setDuplicates] = useState<string[][] | null>(null);
  const [isPending, startTransition] = useTransition();

  const reload = async () => {
    const r = await getAreasAction();
    if (r.success) setAreas(r.data ?? []);
  };

  const handleCreate = () => {
    if (!name.trim()) { setFeedback('El nombre es obligatorio'); return; }
    startTransition(async () => {
      const r = await createAreaAction(name, description);
      setFeedback(r.message);
      if (r.success) { setName(''); setDescription(''); setShowForm(false); reload(); }
    });
  };

  const handleToggle = (id: string, current: boolean) => {
    startTransition(async () => {
      const r = await toggleAreaStatusAction(id, !current);
      setFeedback(r.message);
      if (r.success) reload();
    });
  };

  const handleDuplicates = () => {
    startTransition(async () => {
      const r = await findDuplicateAreasAction();
      setDuplicates(r.groups ?? []);
    });
  };

  const active = areas.filter(a => a.isActive);
  const inactive = areas.filter(a => !a.isActive);

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="glass-panel rounded-3xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground">Almacenes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gestiona las áreas de almacenamiento del sistema. {active.length} activos · {inactive.length} inactivos.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleDuplicates} disabled={isPending} className="capsula-btn capsula-btn-secondary text-sm px-4 py-2 min-h-0">
            🔍 Analizar Duplicados
          </button>
          <button onClick={() => { setShowForm(true); setFeedback(''); }} className="capsula-btn capsula-btn-primary text-sm px-4 py-2 min-h-0">
            + Nuevo Almacén
          </button>
        </div>
      </div>

      {/* Resultado duplicados */}
      {duplicates !== null && (
        <div className={`glass-panel rounded-2xl p-4 border ${duplicates.length === 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
          {duplicates.length === 0 ? (
            <p className="text-sm text-emerald-400 font-bold">✅ No se encontraron duplicados</p>
          ) : (
            <>
              <p className="text-sm text-amber-400 font-bold mb-2">⚠️ {duplicates.length} grupo(s) con nombres similares:</p>
              {duplicates.map((group, i) => (
                <div key={i} className="text-xs text-muted-foreground mb-1">
                  <span className="font-mono">{group.join(' · ')}</span>
                </div>
              ))}
            </>
          )}
          <button onClick={() => setDuplicates(null)} className="text-xs text-muted-foreground mt-2 hover:text-foreground">Cerrar</button>
        </div>
      )}

      {/* Formulario crear */}
      {showForm && (
        <div className="glass-panel rounded-2xl p-5 border border-primary/30 space-y-4">
          <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Nuevo Almacén</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Nombre *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value.toUpperCase())}
                placeholder="Ej: DEPOSITO PRINCIPAL"
                className="w-full bg-secondary/50 border border-border rounded-xl py-2 px-3 text-sm font-mono text-foreground focus:outline-none focus:border-primary uppercase"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Descripción</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Ej: Almacén de insumos secos"
                className="w-full bg-secondary/50 border border-border rounded-xl py-2 px-3 text-sm text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>
          {feedback && <p className="text-xs text-red-400">{feedback}</p>}
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={isPending} className="capsula-btn capsula-btn-primary text-sm px-5 py-2 min-h-0 disabled:opacity-50">
              {isPending ? 'Creando...' : 'Crear Almacén'}
            </button>
            <button onClick={() => { setShowForm(false); setFeedback(''); }} className="capsula-btn capsula-btn-secondary text-sm px-4 py-2 min-h-0">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {feedback && !showForm && (
        <p className="text-xs px-3 py-2 rounded-lg bg-secondary text-muted-foreground">{feedback}</p>
      )}

      {/* Tabla */}
      <div className="glass-panel rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nombre</th>
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground hidden sm:table-cell">Descripción</th>
                <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground hidden md:table-cell">Registros</th>
                <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">Estado</th>
                <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {areas.length === 0 && (
                <tr><td colSpan={5} className="py-10 text-center text-muted-foreground text-sm">No hay almacenes registrados</td></tr>
              )}
              {areas.map(area => (
                <tr key={area.id} className="hover:bg-secondary/20 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono font-bold text-foreground">{area.name}</span>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="text-xs text-muted-foreground">{area.description || '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-center hidden md:table-cell">
                    <span className="text-xs text-muted-foreground">{area.stockCount}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${area.isActive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
                      {area.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleToggle(area.id, area.isActive)}
                      disabled={isPending}
                      className={`text-xs font-bold transition-colors disabled:opacity-50 ${area.isActive ? 'text-red-400 hover:text-red-300' : 'text-emerald-400 hover:text-emerald-300'}`}
                    >
                      {area.isActive ? 'Desactivar' : 'Activar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
