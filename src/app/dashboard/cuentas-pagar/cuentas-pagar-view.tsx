'use client';

import { useState, useTransition } from 'react';
import { toast } from 'react-hot-toast';
import {
  getAccountsPayableAction, createAccountPayableAction, registerPaymentAction,
  type AccountPayableData,
} from '@/app/actions/account-payable.actions';

const PAYMENT_METHODS = [
  { value: 'CASH_USD', label: 'Efectivo USD' },
  { value: 'CASH_BS', label: 'Efectivo Bs' },
  { value: 'ZELLE', label: 'Zelle' },
  { value: 'BANK_TRANSFER', label: 'Transferencia Bancaria' },
  { value: 'MOBILE_PAY', label: 'Pago Móvil' },
  { value: 'CHECK', label: 'Cheque' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING:  { label: 'Pendiente',  color: 'bg-amber-500/20 text-amber-500' },
  PARTIAL:  { label: 'Parcial',    color: 'bg-blue-500/20 text-blue-500' },
  PAID:     { label: 'Pagado',     color: 'bg-emerald-500/20 text-emerald-500' },
  OVERDUE:  { label: 'Vencido',    color: 'bg-red-500/20 text-red-500' },
  DISPUTED: { label: 'Disputado',  color: 'bg-purple-500/20 text-purple-500' },
  VOID:     { label: 'Anulado',    color: 'bg-muted text-muted-foreground' },
};

function fmt(n: number) {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Supplier { id: string; name: string; code: string | null }

interface Props {
  initialAccounts: AccountPayableData[];
  suppliers: Supplier[];
  currentUserRole: string;
}

export function CuentasPagarView({ initialAccounts, suppliers, currentUserRole }: Props) {
  const [accounts, setAccounts] = useState<AccountPayableData[]>(initialAccounts);
  const [filter, setFilter] = useState<string>('ACTIVE'); // ACTIVE | ALL | PAID
  const [showForm, setShowForm] = useState(false);
  const [payTarget, setPayTarget] = useState<AccountPayableData | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canManage = ['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER'].includes(currentUserRole);

  const [form, setForm] = useState({
    description: '', invoiceNumber: '', supplierId: '', creditorName: '',
    totalAmountUsd: '', invoiceDate: new Date().toISOString().slice(0, 10), dueDate: '',
  });

  const [payForm, setPayForm] = useState({
    amountUsd: '', paymentMethod: 'BANK_TRANSFER', paymentRef: '',
    paidAt: new Date().toISOString().slice(0, 10), notes: '',
  });

  const reload = () => {
    startTransition(async () => {
      const result = await getAccountsPayableAction();
      if (result.data) setAccounts(result.data);
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description.trim() || !form.totalAmountUsd) { toast.error('Completa los campos requeridos'); return; }
    if (!form.supplierId && !form.creditorName.trim()) { toast.error('Indica el proveedor o acreedor'); return; }
    startTransition(async () => {
      const result = await createAccountPayableAction({
        description: form.description,
        invoiceNumber: form.invoiceNumber || undefined,
        supplierId: form.supplierId || undefined,
        creditorName: form.creditorName || undefined,
        totalAmountUsd: parseFloat(form.totalAmountUsd),
        invoiceDate: form.invoiceDate,
        dueDate: form.dueDate || undefined,
      });
      if (result.success) {
        toast.success('Cuenta por pagar registrada');
        setShowForm(false);
        setForm({ description: '', invoiceNumber: '', supplierId: '', creditorName: '', totalAmountUsd: '', invoiceDate: new Date().toISOString().slice(0, 10), dueDate: '' });
        reload();
      } else {
        toast.error(result.error ?? 'Error');
      }
    });
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payTarget) return;
    if (!payForm.amountUsd || parseFloat(payForm.amountUsd) <= 0) { toast.error('Monto inválido'); return; }
    startTransition(async () => {
      const result = await registerPaymentAction(payTarget.id, {
        amountUsd: parseFloat(payForm.amountUsd),
        paymentMethod: payForm.paymentMethod,
        paymentRef: payForm.paymentRef || undefined,
        paidAt: payForm.paidAt,
        notes: payForm.notes || undefined,
      });
      if (result.success) {
        toast.success('Pago registrado');
        setPayTarget(null);
        setPayForm({ amountUsd: '', paymentMethod: 'BANK_TRANSFER', paymentRef: '', paidAt: new Date().toISOString().slice(0, 10), notes: '' });
        reload();
      } else {
        toast.error(result.error ?? 'Error');
      }
    });
  };

  // Filtrar
  const filtered = accounts.filter(a => {
    if (filter === 'ACTIVE') return !['PAID', 'VOID'].includes(a.status);
    if (filter === 'PAID') return a.status === 'PAID';
    return true;
  });

  // KPIs
  const totalPending = accounts.filter(a => !['PAID', 'VOID'].includes(a.status)).reduce((s, a) => s + a.remainingUsd, 0);
  const overdueCount = accounts.filter(a => a.status === 'OVERDUE').length;
  const overdueAmount = accounts.filter(a => a.status === 'OVERDUE').reduce((s, a) => s + a.remainingUsd, 0);
  const totalPaid = accounts.filter(a => a.status === 'PAID').reduce((s, a) => s + a.totalAmountUsd, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">📄 Cuentas por Pagar</h1>
          <p className="text-sm text-muted-foreground">Control de deudas y facturas pendientes</p>
        </div>
        {canManage && (
          <button onClick={() => setShowForm(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 transition-colors">
            + Nueva Cuenta
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Pendiente" value={`$${fmt(totalPending)}`} color="border-amber-500/30 bg-amber-500/5" icon="⏳" />
        <KpiCard label="Vencido" value={`$${fmt(overdueAmount)}`} sub={`${overdueCount} facturas`} color={overdueCount > 0 ? "border-red-500/30 bg-red-500/5" : "border-border"} icon="🚨" />
        <KpiCard label="Total Pagado" value={`$${fmt(totalPaid)}`} color="border-emerald-500/30 bg-emerald-500/5" icon="✅" />
        <KpiCard label="Acreedores" value={`${new Set(accounts.filter(a=>!['PAID','VOID'].includes(a.status)).map(a=>a.supplierId||a.creditorName)).size}`} color="border-blue-500/30 bg-blue-500/5" icon="🏢" />
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        {[
          { key: 'ACTIVE', label: 'Activas' },
          { key: 'ALL', label: 'Todas' },
          { key: 'PAID', label: 'Pagadas' },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${filter === f.key ? 'bg-blue-600 text-white' : 'border border-border text-foreground hover:bg-accent'}`}>
            {f.label}
          </button>
        ))}
        {isPending && <span className="text-xs text-muted-foreground self-center animate-pulse">Cargando...</span>}
      </div>

      {/* Tabla */}
      <div className="glass-panel rounded-2xl border border-border overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-4xl">📄</p>
            <p className="mt-2 text-muted-foreground font-medium">Sin cuentas en esta vista</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold text-muted-foreground">Descripción / Acreedor</th>
                  <th className="px-5 py-3 text-left font-semibold text-muted-foreground">Estado</th>
                  <th className="px-5 py-3 text-right font-semibold text-muted-foreground">Total</th>
                  <th className="px-5 py-3 text-right font-semibold text-muted-foreground">Pendiente</th>
                  <th className="px-5 py-3 text-left font-semibold text-muted-foreground">Vencimiento</th>
                  {canManage && <th className="px-5 py-3 text-center font-semibold text-muted-foreground">Acción</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(a => {
                  const statusCfg = STATUS_CONFIG[a.status] ?? { label: a.status, color: 'bg-muted text-muted-foreground' };
                  const isExpanded = expandedId === a.id;
                  const isOverdue = a.status === 'OVERDUE';
                  return (
                    <>
                      <tr key={a.id}
                        className={`hover:bg-muted/20 transition-colors cursor-pointer ${isOverdue ? 'bg-red-500/5' : ''}`}
                        onClick={() => setExpandedId(isExpanded ? null : a.id)}>
                        <td className="px-5 py-3">
                          <div className="font-medium text-foreground">{a.description}</div>
                          <div className="text-xs text-muted-foreground">
                            {a.supplierName || a.creditorName}
                            {a.invoiceNumber && ` · Fact. ${a.invoiceNumber}`}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${statusCfg.color}`}>{statusCfg.label}</span>
                        </td>
                        <td className="px-5 py-3 text-right text-foreground font-medium">${fmt(a.totalAmountUsd)}</td>
                        <td className={`px-5 py-3 text-right font-bold ${a.remainingUsd > 0 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                          {a.remainingUsd > 0 ? `$${fmt(a.remainingUsd)}` : '—'}
                        </td>
                        <td className="px-5 py-3">
                          {a.dueDate ? (
                            <span className={isOverdue ? 'text-red-500 font-semibold' : 'text-muted-foreground'}>
                              {new Date(a.dueDate).toLocaleDateString('es-VE')}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        {canManage && (
                          <td className="px-5 py-3 text-center" onClick={e => e.stopPropagation()}>
                            {!['PAID', 'VOID'].includes(a.status) && (
                              <button onClick={() => { setPayTarget(a); setPayForm(f => ({ ...f, amountUsd: a.remainingUsd.toFixed(2) })); }}
                                className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs font-bold px-3 py-1 hover:bg-emerald-500/20">
                                Registrar Pago
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                      {isExpanded && a.payments.length > 0 && (
                        <tr key={`${a.id}-payments`}>
                          <td colSpan={canManage ? 6 : 5} className="px-8 py-3 bg-muted/10">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Pagos realizados</p>
                            <div className="space-y-1">
                              {a.payments.map(p => (
                                <div key={p.id} className="flex items-center gap-4 text-xs text-muted-foreground">
                                  <span className="text-foreground font-semibold">${fmt(p.amountUsd)}</span>
                                  <span>{PAYMENT_METHODS.find(m => m.value === p.paymentMethod)?.label ?? p.paymentMethod}</span>
                                  {p.paymentRef && <span>Ref: {p.paymentRef}</span>}
                                  <span>{new Date(p.paidAt).toLocaleDateString('es-VE')}</span>
                                  <span>{p.createdByName}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Nueva Cuenta */}
      {showForm && (
        <Modal title="Nueva Cuenta por Pagar" onClose={() => setShowForm(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Descripción *</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="input-field w-full" placeholder="Ej: Factura vegetales 15/03/2026" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Proveedor (sistema)</label>
                <select value={form.supplierId} onChange={e => setForm(f => ({ ...f, supplierId: e.target.value, creditorName: '' }))}
                  className="input-field w-full">
                  <option value="">— Seleccionar —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">O nombre del acreedor</label>
                <input value={form.creditorName} onChange={e => setForm(f => ({ ...f, creditorName: e.target.value, supplierId: '' }))}
                  className="input-field w-full" placeholder="Si no está en el sistema" disabled={!!form.supplierId} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Nº de Factura</label>
                <input value={form.invoiceNumber} onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))}
                  className="input-field w-full" placeholder="Opcional" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Monto Total USD *</label>
                <input type="number" step="0.01" min="0.01" value={form.totalAmountUsd}
                  onChange={e => setForm(f => ({ ...f, totalAmountUsd: e.target.value }))}
                  className="input-field w-full" placeholder="0.00" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Fecha Factura *</label>
                <input type="date" value={form.invoiceDate} onChange={e => setForm(f => ({ ...f, invoiceDate: e.target.value }))}
                  className="input-field w-full" required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Fecha Vencimiento</label>
                <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                  className="input-field w-full" />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => setShowForm(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-accent">Cancelar</button>
              <button type="submit" disabled={isPending}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                {isPending ? 'Guardando...' : 'Registrar Cuenta'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Registrar Pago */}
      {payTarget && (
        <Modal title="Registrar Pago" onClose={() => setPayTarget(null)}>
          <form onSubmit={handlePay} className="space-y-4">
            <div className="rounded-xl bg-muted/30 p-4 text-sm space-y-1">
              <p className="font-semibold text-foreground">{payTarget.description}</p>
              <p className="text-muted-foreground">Pendiente: <span className="font-bold text-amber-500">${fmt(payTarget.remainingUsd)}</span></p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Monto USD *</label>
                <input type="number" step="0.01" min="0.01" value={payForm.amountUsd}
                  onChange={e => setPayForm(f => ({ ...f, amountUsd: e.target.value }))}
                  className="input-field w-full" placeholder="0.00" required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Fecha *</label>
                <input type="date" value={payForm.paidAt} onChange={e => setPayForm(f => ({ ...f, paidAt: e.target.value }))}
                  className="input-field w-full" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Método *</label>
                <select value={payForm.paymentMethod} onChange={e => setPayForm(f => ({ ...f, paymentMethod: e.target.value }))} className="input-field w-full">
                  {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Referencia</label>
                <input value={payForm.paymentRef} onChange={e => setPayForm(f => ({ ...f, paymentRef: e.target.value }))}
                  className="input-field w-full" placeholder="Nº transferencia..." />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Notas</label>
              <textarea value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))}
                className="input-field w-full" rows={2} />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => setPayTarget(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-accent">Cancelar</button>
              <button type="submit" disabled={isPending}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                {isPending ? 'Registrando...' : 'Confirmar Pago'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function KpiCard({ label, value, icon, color, sub }: { label: string; value: string; icon: string; color: string; sub?: string }) {
  return (
    <div className={`glass-panel rounded-2xl p-5 border ${color}`}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
        <span className="text-lg">{icon}</span>
      </div>
      <p className="text-2xl font-black text-foreground truncate">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
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
