'use client';

import { useState, useTransition } from 'react';
import { toast } from 'react-hot-toast';
import {
  getCashRegistersAction, openCashRegisterAction, closeCashRegisterAction,
  updateRegisterOperatorsAction,
  type CashRegisterData,
} from '@/app/actions/cash-register.actions';
import { BillDenominationInput } from '@/components/pos/BillDenominationInput';

const SHIFT_TYPES = [
  { value: 'MORNING', label: 'Mañana' },
  { value: 'DAY', label: 'Día' },
  { value: 'NIGHT', label: 'Noche' },
];

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const BILL_DENOMS = [100, 50, 20, 10, 5, 1] as const;

function fmt(n: number) {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseDenominations(json: string | null): Record<string, number> | null {
  if (!json) return null;
  try { return JSON.parse(json); } catch { return null; }
}

function DenomBreakdown({ json, label }: { json: string | null; label: string }) {
  const data = parseDenominations(json);
  if (!data) return null;
  return (
    <div className="mt-2 text-xs">
      <p className="font-semibold text-muted-foreground mb-1 uppercase tracking-wider">{label}</p>
      {BILL_DENOMS.map(d => {
        const count = data[String(d)] ?? 0;
        if (!count) return null;
        return (
          <div key={d} className="flex justify-between text-foreground/80">
            <span>${d} × {count}</span>
            <span>${fmt(d * count)}</span>
          </div>
        );
      })}
      {data.total != null && (
        <div className="flex justify-between font-bold text-foreground border-t border-border mt-1 pt-1">
          <span>Total</span><span>${fmt(data.total)}</span>
        </div>
      )}
    </div>
  );
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

  const canManage = ['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER', 'CASHIER'].includes(currentUserRole);

  const [openForm, setOpenForm] = useState({ registerName: 'Caja Restaurante', shiftType: 'DAY', openingCashUsd: '', openingCashBs: '', notes: '' });
  const [closeForm, setCloseForm] = useState({ closingCashUsd: '', closingCashBs: '', notes: '' });
  const [openDenom, setOpenDenom] = useState<{ json: string; total: number } | null>(null);
  const [closeDenom, setCloseDenom] = useState<{ json: string; total: number } | null>(null);
  const [showOpenDenom, setShowOpenDenom] = useState(false);
  const [showCloseDenom, setShowCloseDenom] = useState(false);
  const [denomModal, setDenomModal] = useState<CashRegisterData | null>(null);

  // Gestión de operadoras por turno
  const [operatorModal, setOperatorModal] = useState<CashRegisterData | null>(null);
  const [operatorInput, setOperatorInput] = useState('');
  const [operatorMode, setOperatorMode] = useState<'add' | 'replace'>('add');

  const parseOperators = (json: string | null): string[] => {
    if (!json) return [];
    try { return JSON.parse(json); } catch { return []; }
  };

  const handleOperatorUpdate = async (mode: 'add' | 'replace') => {
    if (!operatorModal || !operatorInput.trim()) return;
    startTransition(async () => {
      const result = await updateRegisterOperatorsAction(operatorModal.id, operatorInput.trim(), mode);
      if (result.success) {
        toast.success(mode === 'add' ? 'Cajera agregada' : 'Turno actualizado');
        setOperatorInput('');
        setOperatorModal(null);
        loadPeriod(selectedMonth, selectedYear);
      } else {
        toast.error(result.error ?? 'Error');
      }
    });
  };

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
      const cashUsd = showOpenDenom && openDenom && openDenom.total > 0
        ? openDenom.total
        : parseFloat(openForm.openingCashUsd) || 0;
      const result = await openCashRegisterAction({
        registerName: openForm.registerName,
        shiftType: openForm.shiftType,
        openingCashUsd: cashUsd,
        openingCashBs: parseFloat(openForm.openingCashBs) || 0,
        notes: openForm.notes,
        openingDenominationsJson: showOpenDenom && openDenom?.json ? openDenom.json : undefined,
      });
      if (result.success) {
        toast.success('Caja abierta');
        setShowOpenForm(false);
        setShowOpenDenom(false);
        setOpenDenom(null);
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
      const cashUsd = showCloseDenom && closeDenom && closeDenom.total > 0
        ? closeDenom.total
        : parseFloat(closeForm.closingCashUsd) || 0;
      const result = await closeCashRegisterAction(closeTarget.id, {
        closingCashUsd: cashUsd,
        closingCashBs: parseFloat(closeForm.closingCashBs) || 0,
        notes: closeForm.notes,
        closingDenominationsJson: showCloseDenom && closeDenom?.json ? closeDenom.json : undefined,
      });
      if (result.success) {
        toast.success('Caja cerrada');
        setCloseTarget(null);
        setShowCloseDenom(false);
        setCloseDenom(null);
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
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-foreground">${fmt(r.openingCashUsd)}</span>
                      {r.openingDenominationsJson && (
                        <button onClick={() => setDenomModal(r)} title="Ver desglose de billetes"
                          className="text-emerald-400 hover:text-emerald-300 text-xs">📋</button>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Hora apertura</span>
                    <span className="text-foreground">{new Date(r.openedAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  {/* Cajeras activas en el turno */}
                  <div className="pt-2 border-t border-emerald-500/20 mt-2">
                    <p className="text-xs font-black uppercase tracking-wider text-emerald-400 mb-1.5">Responsables del turno</p>
                    <div className="flex flex-wrap gap-1.5">
                      {parseOperators(r.operatorsJson).map((op, i) => (
                        <span key={i} className="bg-emerald-500/15 text-emerald-300 text-xs font-semibold px-2 py-0.5 rounded-full">
                          {op}
                        </span>
                      ))}
                      {parseOperators(r.operatorsJson).length === 0 && (
                        <span className="text-muted-foreground text-xs">{r.openedByName}</span>
                      )}
                    </div>
                  </div>
                </div>
                {canManage && (
                  <div className="mt-4 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => { setOperatorModal(r); setOperatorInput(''); setOperatorMode('add'); }}
                        className="rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-bold py-2 hover:bg-blue-500/20 transition-colors">
                        + Cajera
                      </button>
                      <button
                        onClick={() => { setOperatorModal(r); setOperatorInput(''); setOperatorMode('replace'); }}
                        className="rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold py-2 hover:bg-amber-500/20 transition-colors">
                        Cambio Turno
                      </button>
                    </div>
                    <button onClick={() => { setCloseTarget(r); setCloseForm({ closingCashUsd: '', closingCashBs: '', notes: '' }); }}
                      className="w-full rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-sm font-bold py-2 hover:bg-red-500/20 transition-colors">
                      Cerrar Caja
                    </button>
                  </div>
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
                      <td className="px-5 py-3">
                        <div className="font-medium text-foreground">{r.registerName}</div>
                        {parseOperators(r.operatorsJson).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {parseOperators(r.operatorsJson).map((op, i) => (
                              <span key={i} className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">{op}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        <div>{new Date(r.shiftDate).toLocaleDateString('es-VE')}</div>
                        <div className="text-xs">{SHIFT_TYPES.find(s => s.value === r.shiftType)?.label}</div>
                      </td>
                      <td className="px-5 py-3 text-right text-foreground">${fmt(r.totalSalesUsd ?? 0)}</td>
                      <td className="px-5 py-3 text-right text-red-500">${fmt(r.totalExpenses ?? 0)}</td>
                      <td className="px-5 py-3 text-right text-foreground">${fmt(r.expectedCash ?? 0)}</td>
                      <td className="px-5 py-3 text-right font-semibold text-foreground">
                        <div className="flex items-center justify-end gap-1">
                          <span>${fmt(r.closingCashUsd ?? 0)}</span>
                          {(r.openingDenominationsJson || r.closingDenominationsJson) && (
                            <button onClick={() => setDenomModal(r)} title="Ver desglose de billetes"
                              className="text-blue-400 hover:text-blue-300 text-xs">📋</button>
                          )}
                        </div>
                      </td>
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
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-muted-foreground">Fondo Inicial USD</label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                  <input type="checkbox" checked={showOpenDenom} onChange={e => setShowOpenDenom(e.target.checked)} className="rounded accent-primary" />
                  Desglosar billetes
                </label>
              </div>
              {showOpenDenom ? (
                <BillDenominationInput
                  label="Billetes apertura"
                  onChange={(json, total) => setOpenDenom({ json, total })}
                />
              ) : (
                <input type="number" step="0.01" min="0" value={openForm.openingCashUsd}
                  onChange={e => setOpenForm(f => ({ ...f, openingCashUsd: e.target.value }))}
                  className="input-field w-full" placeholder="0.00" />
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Fondo Inicial Bs</label>
              <input type="number" step="0.01" min="0" value={openForm.openingCashBs}
                onChange={e => setOpenForm(f => ({ ...f, openingCashBs: e.target.value }))}
                className="input-field w-full" placeholder="0.00" />
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
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-muted-foreground">Efectivo Contado USD</label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                  <input type="checkbox" checked={showCloseDenom} onChange={e => setShowCloseDenom(e.target.checked)} className="rounded accent-primary" />
                  Desglosar billetes
                </label>
              </div>
              {showCloseDenom ? (
                <BillDenominationInput
                  label="Billetes cierre"
                  onChange={(json, total) => setCloseDenom({ json, total })}
                />
              ) : (
                <input type="number" step="0.01" min="0" value={closeForm.closingCashUsd}
                  onChange={e => setCloseForm(f => ({ ...f, closingCashUsd: e.target.value }))}
                  className="input-field w-full" placeholder="0.00" required />
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Efectivo Contado Bs</label>
              <input type="number" step="0.01" min="0" value={closeForm.closingCashBs}
                onChange={e => setCloseForm(f => ({ ...f, closingCashBs: e.target.value }))}
                className="input-field w-full" placeholder="0.00" />
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

      {/* Modal: Desglose de Billetes */}
      {denomModal && (
        <Modal title={`Billetes — ${denomModal.registerName}`} onClose={() => setDenomModal(null)}>
          <div className="space-y-4">
            <DenomBreakdown json={denomModal.openingDenominationsJson} label="Apertura" />
            {denomModal.closingDenominationsJson && (
              <DenomBreakdown json={denomModal.closingDenominationsJson} label="Cierre" />
            )}
            {!denomModal.openingDenominationsJson && !denomModal.closingDenominationsJson && (
              <p className="text-sm text-muted-foreground text-center py-4">Sin desglose de billetes registrado</p>
            )}
          </div>
        </Modal>
      )}

      {/* Modal: Agregar cajera / Cambio de turno */}
      {operatorModal && (
        <Modal
          title={operatorMode === 'add' ? `Agregar cajera — ${operatorModal.registerName}` : `Cambio de turno — ${operatorModal.registerName}`}
          onClose={() => { setOperatorModal(null); setOperatorInput(''); }}
        >
          <div className="space-y-4">
            {operatorMode === 'replace' && (
              <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                El cambio de turno reemplaza todas las cajeras actuales por la nueva responsable.
              </p>
            )}
            <div>
              <p className="text-xs text-muted-foreground mb-1 font-semibold uppercase tracking-wider">
                {operatorMode === 'add' ? 'Nombre de la cajera' : 'Nueva responsable del turno'}
              </p>
              <input
                type="text"
                value={operatorInput}
                onChange={e => setOperatorInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleOperatorUpdate(operatorMode); }}
                placeholder="Nombre completo..."
                autoFocus
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            {operatorMode === 'add' && parseOperators(operatorModal.operatorsJson).length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5 font-semibold uppercase tracking-wider">Actualmente en turno</p>
                <div className="flex flex-wrap gap-1.5">
                  {parseOperators(operatorModal.operatorsJson).map((op, i) => (
                    <span key={i} className="bg-emerald-500/15 text-emerald-300 text-xs font-semibold px-2 py-0.5 rounded-full">{op}</span>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={() => handleOperatorUpdate(operatorMode)}
              disabled={!operatorInput.trim() || isPending}
              className="w-full rounded-xl bg-primary text-white font-bold py-3 text-sm hover:bg-primary/90 disabled:opacity-40 transition-colors">
              {operatorMode === 'add' ? 'Agregar' : 'Confirmar cambio de turno'}
            </button>
          </div>
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
