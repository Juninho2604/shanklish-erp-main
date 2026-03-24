'use client';

import { useState, useTransition } from 'react';
import type { BroadcastRecord } from '@/app/actions/notifications.actions';
import { createBroadcastAction, dismissBroadcastAction, getAllBroadcastsAdminAction } from '@/app/actions/notifications.actions';

const TYPE_COLORS: Record<string, string> = {
  INFO:    'bg-blue-500/10 text-blue-400 border-blue-500/30',
  WARNING: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  ALERT:   'bg-red-500/10 text-red-400 border-red-500/30',
  SUCCESS: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
};
const TYPE_LABELS: Record<string, string> = { INFO: 'Info', WARNING: 'Aviso', ALERT: 'Alerta', SUCCESS: 'Éxito' };

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' });
}

export default function AnunciosView({ initialData }: { initialData: BroadcastRecord[] }) {
  const [messages, setMessages] = useState<BroadcastRecord[]>(initialData);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState<'INFO' | 'WARNING' | 'ALERT' | 'SUCCESS'>('INFO');
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState('');

  const reload = async () => {
    const r = await getAllBroadcastsAdminAction();
    if (r.success) setMessages(r.data ?? []);
  };

  const handlePublish = () => {
    if (!title.trim() || !body.trim()) { setFeedback('El título y el mensaje son obligatorios'); return; }
    startTransition(async () => {
      const r = await createBroadcastAction({ title, body, type });
      setFeedback(r.message);
      if (r.success) { setTitle(''); setBody(''); setType('INFO'); reload(); }
    });
  };

  const handleDismiss = (id: string) => {
    startTransition(async () => {
      await dismissBroadcastAction(id);
      reload();
    });
  };

  const active = messages.filter(m => m.isActive);
  const archived = messages.filter(m => !m.isActive);

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* Header */}
      <div className="glass-panel rounded-3xl p-6">
        <h1 className="text-2xl font-black text-foreground">Anuncios a Gerencia</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Los mensajes activos aparecen en 🔔 (esquina superior derecha) para todos los usuarios del dashboard.
        </p>
      </div>

      {/* Formulario nuevo comunicado */}
      <div className="glass-panel rounded-2xl p-5 border border-border space-y-4">
        <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Nuevo comunicado</h2>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Título</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Ej: Cierre de caja anticipado"
              className="w-full bg-secondary/50 border border-border rounded-xl py-2 px-3 text-sm text-foreground focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Mensaje</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Escribe el comunicado aquí..."
              rows={3}
              className="w-full bg-secondary/50 border border-border rounded-xl py-2 px-3 text-sm text-foreground focus:outline-none focus:border-primary resize-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Tipo</label>
            <div className="flex gap-2 flex-wrap">
              {(['INFO', 'WARNING', 'ALERT', 'SUCCESS'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${type === t ? TYPE_COLORS[t] : 'border-border text-muted-foreground hover:border-primary/50'}`}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {feedback && (
          <p className={`text-xs px-3 py-2 rounded-lg ${feedback.startsWith('Error') || feedback.includes('obligatorio') ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
            {feedback}
          </p>
        )}

        <button
          onClick={handlePublish}
          disabled={isPending}
          className="capsula-btn capsula-btn-primary text-sm px-6 py-2 min-h-0 disabled:opacity-50"
        >
          {isPending ? 'Publicando...' : 'Publicar'}
        </button>
      </div>

      {/* Mensajes activos */}
      <div className="glass-panel rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-secondary/30 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">
            Activos ({active.length})
          </h2>
        </div>
        {active.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">
            <p className="text-2xl mb-1">📭</p>
            <p className="text-sm font-bold">Sin mensajes activos</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {active.map(m => (
              <div key={m.id} className="flex items-start gap-3 px-5 py-4 hover:bg-secondary/20 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${TYPE_COLORS[m.type]}`}>{TYPE_LABELS[m.type]}</span>
                    <span className="font-bold text-sm text-foreground truncate">{m.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{m.body}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{fmtDate(m.createdAt)}{m.expiresAt ? ` · Expira: ${fmtDate(m.expiresAt)}` : ''}</p>
                </div>
                <button
                  onClick={() => handleDismiss(m.id)}
                  disabled={isPending}
                  className="text-xs text-red-400 hover:text-red-300 font-bold shrink-0 mt-0.5"
                >
                  Archivar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Historial archivado */}
      {archived.length > 0 && (
        <div className="glass-panel rounded-2xl border border-border overflow-hidden opacity-70">
          <div className="px-5 py-3 border-b border-border bg-secondary/30">
            <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">
              Historial ({archived.length})
            </h2>
          </div>
          <div className="divide-y divide-border">
            {archived.slice(0, 20).map(m => (
              <div key={m.id} className="flex items-start gap-3 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${TYPE_COLORS[m.type]} opacity-60`}>{TYPE_LABELS[m.type]}</span>
                    <span className="font-bold text-sm text-muted-foreground truncate line-through">{m.title}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{fmtDate(m.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
