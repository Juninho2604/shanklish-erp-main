'use client';

import { useState, useTransition } from 'react';
import { MODULE_REGISTRY, MODULE_ROLE_ACCESS } from '@/lib/constants/modules-registry';
import { updateUserModules } from '@/app/actions/user.actions';
import { ROLE_INFO } from '@/lib/constants/roles';
import { UserRole } from '@/types';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  isActive: boolean;
  allowedModules: string | null;
}

interface Props {
  users: User[];
  enabledModuleIds: string[];
  currentUserId: string;
}

function parseModules(raw: string | null): string[] | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export default function ModulosUsuarioView({ users, enabledModuleIds, currentUserId }: Props) {
  const [selected, setSelected] = useState<User | null>(null);
  const [moduleState, setModuleState] = useState<string[] | null>(null);
  const [feedback, setFeedback] = useState('');
  const [isPending, startTransition] = useTransition();

  const activeUsers = users.filter(u => u.isActive);

  const selectUser = (u: User) => {
    setSelected(u);
    setModuleState(parseModules(u.allowedModules));
    setFeedback('');
  };

  // Módulos que el rol del usuario tiene acceso por defecto
  const roleDefaultModules = selected
    ? MODULE_REGISTRY.filter(m => {
        const roles = MODULE_ROLE_ACCESS[m.id];
        return !roles || roles.includes(selected.role);
      }).map(m => m.id)
    : [];

  // Módulos habilitados en la instancia + accesibles por rol
  const availableModules = MODULE_REGISTRY.filter(m =>
    (enabledModuleIds.includes(m.id) || m.id === 'module_config') &&
    roleDefaultModules.includes(m.id)
  );

  const isChecked = (modId: string) => {
    if (moduleState === null) return true; // null = usa rol por defecto (todos)
    return moduleState.includes(modId);
  };

  const toggleModule = (modId: string) => {
    if (moduleState === null) {
      // Primera vez editando: partir desde rol completo
      setModuleState(roleDefaultModules.filter(id => id !== modId));
    } else {
      if (moduleState.includes(modId)) {
        setModuleState(moduleState.filter(id => id !== modId));
      } else {
        setModuleState([...moduleState, modId]);
      }
    }
  };

  const resetToRole = () => setModuleState(null);

  const handleSave = () => {
    if (!selected) return;
    startTransition(async () => {
      const r = await updateUserModules(selected.id, moduleState);
      setFeedback(r.success ? '✅ Módulos guardados' : `❌ ${r.message}`);
    });
  };

  const bySection = (section: string) => availableModules.filter(m => m.section === section);

  const roleInfo = (role: string) => ROLE_INFO[role as UserRole] || { labelEs: role, color: '#6b7280' };

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="glass-panel rounded-3xl p-6">
        <h1 className="text-2xl font-black text-foreground">Módulos por Usuario</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Selecciona un usuario para configurar qué módulos puede ver en su menú. Si usas acceso por rol, el sistema aplica las reglas predeterminadas del rol.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        {/* Columna izquierda — lista de usuarios */}
        <div className="glass-panel rounded-2xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/30">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Usuarios Activos ({activeUsers.length})
            </span>
          </div>
          <div className="divide-y divide-border max-h-[70vh] overflow-y-auto">
            {activeUsers.map(u => {
              const mods = parseModules(u.allowedModules);
              const isSelected = selected?.id === u.id;
              const ri = roleInfo(u.role);
              return (
                <button
                  key={u.id}
                  onClick={() => selectUser(u)}
                  className={`w-full text-left px-4 py-3 transition-colors hover:bg-secondary/30 ${isSelected ? 'bg-primary/10 border-l-2 border-primary' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-foreground truncate">{u.firstName} {u.lastName}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
                    </div>
                    {mods !== null && (
                      <span className="text-[9px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded shrink-0">
                        personalizado
                      </span>
                    )}
                  </div>
                  <div className="mt-1">
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: `${ri.color}20`, color: ri.color }}
                    >
                      {ri.labelEs}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Columna derecha — panel de edición */}
        {!selected ? (
          <div className="glass-panel rounded-2xl border-2 border-dashed border-border flex items-center justify-center min-h-[300px]">
            <p className="text-muted-foreground text-sm">Selecciona un usuario de la lista</p>
          </div>
        ) : (
          <div className="glass-panel rounded-2xl border border-border overflow-hidden">
            {/* User header */}
            <div className="px-5 py-4 border-b border-border bg-secondary/30 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-black text-foreground">{selected.firstName} {selected.lastName}</p>
                <p className="text-xs text-muted-foreground">{selected.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {moduleState !== null && (
                  <button onClick={resetToRole} className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5">
                    Restablecer a rol
                  </button>
                )}
                <span className={`text-xs px-2 py-0.5 rounded font-bold ${moduleState === null ? 'bg-secondary text-muted-foreground' : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'}`}>
                  {moduleState === null ? 'Por rol' : `${moduleState.length} personalizado(s)`}
                </span>
              </div>
            </div>

            {/* Module checkboxes by section */}
            <div className="p-5 space-y-5 max-h-[65vh] overflow-y-auto">
              {['operations', 'sales', 'admin', 'games'].map(section => {
                const mods = bySection(section);
                if (mods.length === 0) return null;
                const sectionLabel: Record<string, string> = { operations: 'Operaciones', sales: 'Ventas / POS', admin: 'Administración', games: 'Juegos' };
                return (
                  <div key={section}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">{sectionLabel[section]}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {mods.map(m => (
                        <label key={m.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-border hover:bg-secondary/30 cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            checked={isChecked(m.id)}
                            onChange={() => toggleModule(m.id)}
                            className="rounded"
                          />
                          <span className="text-sm">{m.icon}</span>
                          <span className="text-sm text-foreground font-medium">{m.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-border bg-secondary/10 flex items-center justify-between gap-3">
              {feedback ? (
                <p className={`text-xs ${feedback.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>{feedback}</p>
              ) : <span />}
              <button
                onClick={handleSave}
                disabled={isPending}
                className="capsula-btn capsula-btn-primary text-sm px-6 py-2 min-h-0 disabled:opacity-50"
              >
                {isPending ? 'Guardando...' : 'Guardar módulos'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
