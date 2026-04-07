'use client';

import { useState, useTransition } from 'react';
import { toast } from 'react-hot-toast';
import {
  getCashRegistersAction, openCashRegisterAction, closeCashRegisterAction,
  type CashRegisterData,
} from '@/app/actions/cash-register.actions';

const SHIFT_TYPES = [
  { value: 'MORNING', label: 'Mañana' },
  { value: 'DAY', label: 'Día' },
  { value: 'NIGHT', label: 'Noche' },
];

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function fmt(n: number) {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props {
  initialRegisters: CashRegisterData[];
  currentUserRole: string;
  currentMonth: number;
  currentYear: number;
}

export function CajaView({ initialRegisters, currentUserRole, currentMonth, currentYear }: Props) {
  const [registers, setRegisters] = useState<CashRegisterData[]>(initialRegisters);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [showOpenForm, setShowOpenForm] = useState(false);
  const [closeTarget, setCloseTarget] = useState<CashRegisterData | null>(null);
  const [isPending, startTransition] = useTransition();

  const canManage = ['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER', 'CASHIER_RESTAURANT', 'CASHIER_DELIVERY'].includes(currentUserRole);

  const [openForm, setOpenForm] = useState({ registerName: 'Caja Restaurante', shiftType: 'DAY', openingCashUsd: '', openingCashBs: '', notes: '' });
  const [closeForm, setCloseForm] = useState({ closingCashUsd: '', closingCashBs: '', notes: '' });

  const loadPeriod = (month: number, year: number) => {
    startTransition(async () => {
      const result = await getCashRegistersAction({ month, year });
      if (result.data) setRegisters(result.data);
    });
  };

  const handleMonthChange = (delta: number) => {
    let m = selectedMonth + delta;
    let y = selectedYear;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    setSelectedMonth(m); setSelectedYear(y);
    loadPeriod(m, y);
  };

  const handleOpen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openForm.registerName.trim()) { toast.error('Nombre de caja requerido'); return; }
    startTransition(async () => {
      const result = await openCashRegisterAction({
        registerName: openForm.registerName,
        shiftType: openForm.shiftType,
        openingCashUsd: parseFloat(openForm.openingCashUsd) || 0,
        openingCashBs: parseFloat(openForm.openingCashBs) || 0,
        notes: openForm.notes,
      });
      if (result.success) {
        toast.success('Caja abierta');
        setShowOpenForm(false);
        setOpenForm({ registerName: 'Caja Restaurante', shiftType: 'DAY', openingCashUsd: '', openingCashBs: '', notes: '' });
        loadPeriod(selectedMonth, selectedYear);
      } else {
        toast.error(result.error ?? 'Error al abrir caja');
      }
    });
  };

  const handleClose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closeTarget) return;
    startTransition(async () => {
      const result = await closeCashRegisterAction(closeTarget.id, {
        closingCashUsd: parseFloat(closeForm.closingCashUsd) || 0,
        closingCashBs: parseFloat(closeForm.closingCashBs) || 0,
        notes: closeForm.notes,
      });
      if (result.success) {
        toast.success('Caja cerrada');
        setCloseTarget(null);
        setCloseForm({ closingCashUsd: '', closingCashBs: '', notes: '' });
        loadPeriod(selectedMonth, selectedYear);
      } else {
        toast.error(result.error ?? 'Error al cerrar caja');
      }
    });
  };

  const openRegisters = registers.filter(r => r.status === 'OPEN');
  const closedRegisters = registers.filter(r => r.status === 'CLOSED');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">🏧 Control de Caja</h1>
          <p className="text-sm text-muted-foreground">Apertura y cierre de caja diaria</p>
        </div>
        {canManage && (
          <button onClick={() => setShowOpenForm(true)}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 transition-colors">
            + Abrir Caja
          </button>
        )}
      </div>

      {/* Cajas abiertas */}
      {openRegisters.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-emerald-500">Cajas Abiertas</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {openRegisters.map(r => (
              <div key={r.id} className="glass-panel rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-bold text-foreground">{r.registerName}</p>
                    <p className="text-xs text-muted-foreground">{SHIFT_TYPES.find(s => s.value === r.shiftType)?.label} · {new Date(r.shiftDate).toLocaleDateString('es-VE')}</p>
                  </div>
                  <span className="rounded-full bg-emerald-500/20 text-emerald-500 text-xs font-bold px-2 py-0.5">ABIERTA</span>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Fondo inicial</span>
                    <span className="font-semibold text-foreground">${fmt(r.openingCashUsd)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Abierta por</span>
                    <span className="text-foreground">{r.openedByName}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Hora apertura</span>
                    <span className="text-foreground">{new Date(r.openedAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
                {canManage && (
                  <button onClick={() => { setCloseTarget(r); setCloseForm({ closingCashUsd: '', closingCashBs: '', notes: '' }); }}
                    className="mt-4 w-full rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-sm font-bold py-2 hover:bg-red-500/20 transition-colors">
                    Cerrar Caja
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navegador de período */}
      <div className="flex items-center gap-3">
        <button onClick={() => handleMonthChange(-1)} className="rounded-lg border border-border p-2 hover:bg-accent transition-colors text-foreground">‹</button>
        <span className="text-base font-semibold text-foreground min-w-[140px] text-center">
          {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
        </span>
        <button onClick={() => handleMonthChange(1)} className="rounded-lg border border-border p-2 hover:bg-accent transition-colors text-foreground">›</button>
        {isPending && <span className="text-xs text-muted-foreground animate-pulse">Cargando...</span>}
      </div>

      {/* Historial de cierres */}
      <div className="glass-panel rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Historial de Cierres</h3>
        </div>
        {closedRegisters.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-3xl">🏧</p>
            <p className="mt-2 text-muted-foreground text-sm">Sin cierres en este período</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold text-muted-foreground">Caja</th>
                  <th className="px-5 py-3 text-left font-semibold text-muted-foreground">Fecha / Turno</th>
                  <th className="px-5 py-3 text-right font-semibold text-muted-foreground">Ventas</th>
                  <th className="px-5 py-3 text-right font-semibold text-muted-foreground">Gastos</th>
                  <th className="px-5 py-3 text-right font-semibold text-muted-foreground">Esperado</th>
                  <th className="px-5 py-3 text-right font-semibold text-muted-foreground">Contado</th>
                  <th className="px-5 py-3 text-right font-semibold text-muted-foreground">Diferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {closedRegisters.map(r => {
                  const diff = r.difference ?? 0;
                  const diffColor = Math.abs(diff) < 1 ? 'text-emerald-500' : diff > 0 ? 'text-blue-500' : 'text-red-500';
                  return (
                    <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3 font-medium text-foreground">{r.registerName}</td>
                      <td className="px-5 py-3 text-muted-foreground">
                        <div>{new Date(r.shiftDate).toLocaleDateString('es-VE')}</div>
                        <div className="text-xs">{SHIFT_TYPES.find(s => s.value === r.shiftType)?.label}</div>
                      </td>
                      <td className="px-5 py-3 text-right text-foreground">${fmt(r.totalSalesUsd ?? 0)}</td>
                      <td className="px-5 py-3 text-right text-red-500">${fmt(r.totalExpenses ?? 0)}</td>
                      <td className="px-5 py-3 text-right text-foreground">${fmt(r.expectedCash ?? 0)}</td>
                      <td className="px-5 py-3 text-right font-semibold text-foreground">${fmt(r.closingCashUsd ?? 0)}</td>
                      <td className={`px-5 py-3 text-right font-bold ${diffColor}`}>
                        {diff >= 0 ? '+' : ''}{fmt(diff)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Abrir Caja */}
      {showOpenForm && (
        <Modal title="Abrir Caja" onClose={() => setShowOpenForm(false)}>
          <form onSubmit={handleOpen} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Nombre de Caja *</label>
              <input value={openForm.registerName} onChange={e => setOpenForm(f => ({ ...f, registerName: e.target.value }))}
                className="input-field w-full" placeholder="Ej: Caja Restaurante" required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Turno</label>
              <select value={openForm.shiftType} onChange={e => setOpenForm(f => ({ ...f, shiftType: e.target.value }))} className="input-field w-full">
                {SHIFT_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Fondo Inicial USD</label>
                <input type="number" step="0.01" min="0" value={openForm.openingCashUsd}
                  onChange={e => setOpenForm(f => ({ ...f, openingCashUsd: e.target.value }))}
                  className="input-field w-full" placeholder="0.00" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Fondo Inicial Bs</label>
                <input type="number" step="0.01" min="0" value={openForm.openingCashBs}
                  onChange={e => setOpenForm(f => ({ ...f, openingCashBs: e.target.value }))}
                  className="input-field w-full" placeholder="0.00" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Notas</label>
              <textarea value={openForm.notes} onChange={e => setOpenForm(f => ({ ...f, notes: e.target.value }))}
                className="input-field w-full" rows={2} />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => setShowOpenForm(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-accent">Cancelar</button>
              <button type="submit" disabled={isPending}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                {isPending ? 'Abriendo...' : 'Abrir Caja'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Cerrar Caja */}
      {closeTarget && (
        <Modal title={`Cerrar: ${closeTarget.registerName}`} onClose={() => setCloseTarget(null)}>
          <form onSubmit={handleClose} className="space-y-4">
            <div className="rounded-xl bg-muted/30 p-4 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Fondo apertura</span><span className="font-semibold text-foreground">${fmt(closeTarget.openingCashUsd)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Apertura</span><span className="text-foreground">{new Date(closeTarget.openedAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}</span></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Efectivo Contado USD *</label>
                <input type="number" step="0.01" min="0" value={closeForm.closingCashUsd}
                  onChange={e => setCloseForm(f => ({ ...f, closingCashUsd: e.target.value }))}
                  className="input-field w-full" placeholder="0.00" required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Efectivo Contado Bs</label>
                <input type="number" step="0.01" min="0" value={closeForm.closingCashBs}
                  onChange={e => setCloseForm(f => ({ ...f, closingCashBs: e.target.value }))}
                  className="input-field w-full" placeholder="0.00" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Observaciones</label>
              <textarea value={closeForm.notes} onChange={e => setCloseForm(f => ({ ...f, notes: e.target.value }))}
                className="input-field w-full" rows={2} />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => setCloseTarget(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-accent">Cancelar</button>
              <button type="submit" disabled={isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
                {isPending ? 'Cerrando...' : 'Cerrar Caja'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="glass-panel w-full max-w-lg rounded-2xl border border-border shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
