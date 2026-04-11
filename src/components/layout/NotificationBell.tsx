'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { getNotificationsAction, dismissBroadcastAction, createBroadcastAction } from '@/app/actions/notifications.actions';
import type { SystemNotification, StockAlert } from '@/app/actions/notifications.actions';
import { useAuthStore } from '@/stores/auth.store';

// ============================================================================
// TIPOS
// ============================================================================

type TabType = 'stock' | 'system';

const TYPE_STYLES: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  ALERT:   { bg: 'bg-red-500/10',    border: 'border-red-500/30',    text: 'text-red-400',    icon: '🚨' },
  WARNING: { bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  text: 'text-amber-400',  icon: '⚠️' },
  INFO:    { bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   text: 'text-blue-400',   icon: 'ℹ️' },
  SUCCESS: { bg: 'bg-emerald-500/10',border: 'border-emerald-500/30',text: 'text-emerald-400',icon: '✅' },
};

const SEVERITY_STYLES = {
  critical: { bg: 'bg-red-500/10',   border: 'border-red-500/30',   text: 'text-red-400',   badge: 'bg-red-500',   icon: '🔴' },
  warning:  { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', badge: 'bg-amber-500', icon: '🟡' },
};

const DISMISS_KEY = 'capsula_dismissed_stock_alerts';

function getDismissedAlerts(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return new Set();
    const data = JSON.parse(raw) as { id: string; date: string }[];
    const today = new Date().toDateString();
    // Only keep dismissals from today
    const valid = data.filter((d) => d.date === today);
    localStorage.setItem(DISMISS_KEY, JSON.stringify(valid));
    return new Set(valid.map((d) => d.id));
  } catch {
    return new Set();
  }
}

function dismissStockAlert(id: string) {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    const data: { id: string; date: string }[] = raw ? JSON.parse(raw) : [];
    data.push({ id, date: new Date().toDateString() });
    localStorage.setItem(DISMISS_KEY, JSON.stringify(data));
  } catch {}
}

// ============================================================================
// COMPONENTE
// ============================================================================

const ADMIN_ROLES = ['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER'];

const MSG_TYPE_OPTIONS = [
  { value: 'INFO', label: '📘 Info' },
  { value: 'WARNING', label: '⚠️ Aviso' },
  { value: 'ALERT', label: '🚨 Alerta' },
  { value: 'SUCCESS', label: '✅ Éxito' },
] as const;

export function NotificationBell() {
  const { user } = useAuthStore();
  const isAdmin = user ? ADMIN_ROLES.includes(user.role) : false;

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('stock');
  const [systemMessages, setSystemMessages] = useState<SystemNotification[]>([]);
  const [stockAlerts, setStockAlerts] = useState<StockAlert[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Formulario crear broadcast (solo admin)
  const [showForm, setShowForm] = useState(false);
  const [newMsg, setNewMsg] = useState({ title: '', body: '', type: 'INFO' as 'INFO' | 'WARNING' | 'ALERT' | 'SUCCESS', expiresInHours: '' });
  const [isSaving, setIsSaving] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    const result = await getNotificationsAction();
    if (result.success) {
      setSystemMessages(result.systemMessages);
      setStockAlerts(result.stockAlerts);
    }
    setIsLoading(false);
  }, []);

  // Load on mount and every 90 seconds
  useEffect(() => {
    setDismissedIds(getDismissedAlerts());
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 90_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Refresh when panel opens
  useEffect(() => {
    if (isOpen) {
      setDismissedIds(getDismissedAlerts());
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  const visibleStockAlerts = stockAlerts.filter((a) => !dismissedIds.has(a.id));
  const unreadCount = visibleStockAlerts.length + systemMessages.length;

  const handleDismissStock = (id: string) => {
    dismissStockAlert(id);
    setDismissedIds((prev) => {
      const next = new Set(Array.from(prev));
      next.add(id);
      return next;
    });
  };

  const handleDismissAllStock = () => {
    visibleStockAlerts.forEach((a) => dismissStockAlert(a.id));
    setDismissedIds(new Set(stockAlerts.map((a) => a.id)));
  };

  const handleDismissBroadcast = (id: string) => {
    startTransition(async () => {
      await dismissBroadcastAction(id);
      setSystemMessages((prev) => prev.filter((m) => m.id !== id));
    });
  };

  const criticalCount = visibleStockAlerts.filter((a) => a.severity === 'critical').length;

  const handleCreateBroadcast = async () => {
    if (!newMsg.title.trim() || !newMsg.body.trim()) return;
    setIsSaving(true);
    const result = await createBroadcastAction({
      title: newMsg.title,
      body: newMsg.body,
      type: newMsg.type,
      expiresInHours: newMsg.expiresInHours ? Number(newMsg.expiresInHours) : undefined,
    });
    if (result.success) {
      setNewMsg({ title: '', body: '', type: 'INFO', expiresInHours: '' });
      setShowForm(false);
      await fetchNotifications();
    }
    setIsSaving(false);
  };

  return (
    <>
      {/* ── Botón campana ──────────────────────────────────────────────────── */}
      <button
        onClick={() => setIsOpen(true)}
        className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        title="Notificaciones del sistema"
        aria-label="Abrir notificaciones"
      >
        <span className="text-xl">🔔</span>
        {unreadCount > 0 && (
          <span
            className={`absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black text-white ${
              criticalCount > 0 ? 'bg-red-500 animate-pulse' : 'bg-amber-500'
            }`}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* ── Modal centrado con backdrop oscuro ────────────────────────────── */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-card w-full max-w-sm rounded-2xl flex flex-col max-h-[90vh] shadow-2xl border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between bg-amber-500/15">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-2xl">
              🔔
            </div>
            <div>
              <h2 className="font-black text-base text-foreground">Notificaciones</h2>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                {unreadCount > 0 ? `${unreadCount} sin atender` : 'Todo en orden'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchNotifications}
              disabled={isLoading}
              className="h-8 w-8 rounded-xl hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-sm"
              title="Actualizar"
            >
              {isLoading ? '⏳' : '🔄'}
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="h-9 w-9 rounded-xl hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-lg"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('stock')}
            className={`flex-1 py-2.5 text-xs font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'stock' ? 'text-amber-500 border-b-2 border-amber-500 bg-amber-500/10' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            📦 Stock
            {visibleStockAlerts.length > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black text-white ${criticalCount > 0 ? 'bg-red-500' : 'bg-amber-500'}`}>
                {visibleStockAlerts.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('system')}
            className={`flex-1 py-2.5 text-xs font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'system' ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-500/10' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            📣 Sistema
            {systemMessages.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black text-white bg-blue-500">
                {systemMessages.length}
              </span>
            )}
          </button>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'stock' ? (
            <div className="p-4 space-y-3">
              {isLoading && visibleStockAlerts.length === 0 && (
                <div className="py-12 text-center text-muted-foreground text-sm">Actualizando...</div>
              )}

              {!isLoading && visibleStockAlerts.length === 0 && (
                <div className="py-12 text-center flex flex-col items-center gap-3">
                  <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center text-4xl">💎</div>
                  <p className="font-black text-foreground">¡Inventario OK!</p>
                  <p className="text-xs text-muted-foreground max-w-[200px]">
                    No hay insumos por debajo del stock mínimo en este momento.
                  </p>
                </div>
              )}

              {visibleStockAlerts.length > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      {criticalCount > 0 && `${criticalCount} crítico${criticalCount > 1 ? 's' : ''} · `}
                      {visibleStockAlerts.length} alerta{visibleStockAlerts.length > 1 ? 's' : ''}
                    </p>
                    <button
                      onClick={handleDismissAllStock}
                      className="text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Descartar todas
                    </button>
                  </div>

                  {visibleStockAlerts.map((alert) => {
                    const s = SEVERITY_STYLES[alert.severity];
                    return (
                      <div
                        key={alert.id}
                        className={`p-4 rounded-2xl border ${s.bg} ${s.border} flex items-start gap-3`}
                      >
                        <span className="text-lg shrink-0 mt-0.5">{s.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`font-black text-sm ${s.text}`}>{alert.name}</p>
                            <span className="text-[9px] font-black text-muted-foreground bg-secondary px-1.5 py-0.5 rounded uppercase">
                              {alert.sku}
                            </span>
                          </div>
                          <p className="text-xs text-foreground/70 font-medium mt-0.5">
                            {alert.currentStock <= 0
                              ? '⛔ Sin stock'
                              : `${alert.currentStock.toFixed(2)} ${alert.unit} — mín. ${alert.minimumStock} ${alert.unit}`}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDismissStock(alert.id)}
                          className="h-6 w-6 rounded-lg hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-xs shrink-0"
                          title="Descartar hoy"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}

                  <a
                    href="/dashboard/inventario"
                    className="block w-full mt-2 py-2.5 text-center text-xs font-black uppercase tracking-widest rounded-xl border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-colors"
                  >
                    Ver Inventario completo →
                  </a>
                </>
              )}
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {systemMessages.length === 0 && (
                <div className="py-12 text-center flex flex-col items-center gap-3">
                  <div className="h-16 w-16 rounded-full bg-blue-500/10 flex items-center justify-center text-4xl">📭</div>
                  <p className="font-black text-foreground">Sin mensajes</p>
                  <p className="text-xs text-muted-foreground max-w-[200px]">
                    No hay anuncios activos del sistema en este momento.
                  </p>
                </div>
              )}

              {systemMessages.map((msg) => {
                const s = TYPE_STYLES[msg.type] ?? TYPE_STYLES.INFO;
                const ts = new Date(msg.createdAt).toLocaleDateString('es-VE', {
                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  timeZone: 'America/Caracas',
                });
                return (
                  <div
                    key={msg.id}
                    className={`p-4 rounded-2xl border ${s.bg} ${s.border}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-base shrink-0">{s.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`font-black text-sm ${s.text}`}>{msg.title}</p>
                        <p className="text-xs text-foreground/70 font-medium mt-1 leading-snug">{msg.body}</p>
                        <p className="text-[9px] text-muted-foreground mt-2 font-bold">{ts}</p>
                      </div>
                      <button
                        onClick={() => handleDismissBroadcast(msg.id)}
                        disabled={isPending}
                        className="h-6 w-6 rounded-lg hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-xs shrink-0 disabled:opacity-50"
                        title="Desactivar mensaje"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer — formulario crear notificación (solo admin) */}
        {isAdmin && activeTab === 'system' && (
          <div className="border-t border-border p-4">
            {!showForm ? (
              <button
                onClick={() => setShowForm(true)}
                className="w-full py-2 text-xs font-black uppercase tracking-widest rounded-xl border border-border text-muted-foreground hover:border-blue-400 hover:text-blue-400 transition-colors"
              >
                + Crear anuncio al equipo
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Nuevo anuncio</p>
                <input
                  type="text"
                  placeholder="Título"
                  value={newMsg.title}
                  onChange={(e) => setNewMsg({ ...newMsg, title: e.target.value })}
                  className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-blue-400"
                />
                <textarea
                  placeholder="Mensaje..."
                  value={newMsg.body}
                  onChange={(e) => setNewMsg({ ...newMsg, body: e.target.value })}
                  rows={2}
                  className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-blue-400 resize-none"
                />
                <div className="flex gap-2">
                  <select
                    value={newMsg.type}
                    onChange={(e) => setNewMsg({ ...newMsg, type: e.target.value as typeof newMsg.type })}
                    className="flex-1 bg-secondary/50 border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none"
                  >
                    {MSG_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="Expira en h"
                    value={newMsg.expiresInHours}
                    onChange={(e) => setNewMsg({ ...newMsg, expiresInHours: e.target.value })}
                    className="w-24 bg-secondary/50 border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowForm(false)}
                    className="flex-1 py-1.5 text-xs font-bold rounded-lg border border-border text-muted-foreground hover:bg-secondary transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleCreateBroadcast}
                    disabled={isSaving || !newMsg.title.trim() || !newMsg.body.trim()}
                    className="flex-1 py-1.5 text-xs font-black rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
                  >
                    {isSaving ? '...' : 'Publicar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="p-4 border-t border-border bg-secondary/40">
          <p className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest text-center">
            CAPSULA ERP · Alertas en tiempo real · Actualiza cada 90 seg
          </p>
        </div>
          </div>
        </div>
      )}
    </>
  );
}
