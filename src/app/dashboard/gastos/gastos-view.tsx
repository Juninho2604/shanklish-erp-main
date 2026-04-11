'use client';

import { useState, useTransition, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import {
  getExpensesAction, createExpenseAction, voidExpenseAction,
  createExpenseCategoryAction,
  type ExpenseData, type ExpenseSummary, type ExpenseCategoryData,
} from '@/app/actions/expense.actions';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import ExcelJS from 'exceljs';

// ─── CONSTANTES ──────────────────────────────────────────────────────────────

const PAYMENT_METHODS = [
  { value: 'CASH_USD', label: 'Efectivo USD' },
  { value: 'CASH_BS', label: 'Efectivo Bs' },
  { value: 'ZELLE', label: 'Zelle' },
  { value: 'BANK_TRANSFER', label: 'Transferencia Bancaria' },
  { value: 'MOBILE_PAY', label: 'Pago Móvil' },
  { value: 'CHECK', label: 'Cheque' },
  { value: 'OTHER', label: 'Otro' },
];

const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function fmt(n: number) {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function paymentLabel(method: string) {
  return PAYMENT_METHODS.find(m => m.value === method)?.label ?? method;
}

// ─── PROPS ───────────────────────────────────────────────────────────────────

interface Props {
  initialExpenses: ExpenseData[];
  initialSummary: ExpenseSummary;
  categories: ExpenseCategoryData[];
  currentUserRole: string;
  currentMonth: number;
  currentYear: number;
}

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────────────────────

export function GastosView({ initialExpenses, initialSummary, categories: initialCategories, currentUserRole, currentMonth, currentYear }: Props) {
  const [expenses, setExpenses] = useState<ExpenseData[]>(initialExpenses);
  const [summary, setSummary] = useState<ExpenseSummary>(initialSummary);
  const [categories, setCategories] = useState<ExpenseCategoryData[]>(initialCategories);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [showForm, setShowForm] = useState(false);
  const [showCatForm, setShowCatForm] = useState(false);
  const [voidTarget, setVoidTarget] = useState<ExpenseData | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [isPending, startTransition] = useTransition();
  const [prevSummary, setPrevSummary] = useState<ExpenseSummary | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterMethod, setFilterMethod] = useState<string>('');
  const [expenseTrend, setExpenseTrend] = useState<{ label: string; total: number }[]>([]);

  const canManage = ['OWNER', 'ADMIN_MANAGER', 'OPS_MANAGER'].includes(currentUserRole);
  const canAdmin = ['OWNER', 'ADMIN_MANAGER'].includes(currentUserRole);

  // Form state
  const [form, setForm] = useState({
    description: '', notes: '', categoryId: '',
    amountUsd: '', amountBs: '', exchangeRate: '',
    paymentMethod: 'CASH_USD', paymentRef: '',
    paidAt: new Date().toISOString().slice(0, 10),
  });
  const [catForm, setCatForm] = useState({ name: '', description: '', color: '#3B82F6', icon: '💸' });

  // ── Cargar período ──────────────────────────────────────────────────────────
  const loadPeriod = (month: number, year: number) => {
    startTransition(async () => {
      const result = await getExpensesAction({ month, year });
      if (result.success && result.data) {
        setExpenses(result.data);
        setSummary(result.summary ?? { totalUsd: 0, countByCategory: [], countByPaymentMethod: [] });
      }
      // Fetch previous month for comparison
      const prevM = month === 1 ? 12 : month - 1;
      const prevY = month === 1 ? year - 1 : year;
      const prevResult = await getExpensesAction({ month: prevM, year: prevY });
      if (prevResult.success) {
        setPrevSummary(prevResult.summary ?? null);
      }
    });
  };

  // Load previous month on initial mount for MoM comparison
  useEffect(() => {
    const prevM = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevY = currentMonth === 1 ? currentYear - 1 : currentYear;
    getExpensesAction({ month: prevM, year: prevY }).then(r => {
      if (r.success) setPrevSummary(r.summary ?? null);
    });
  }, []);

  // Load 6-month trend
  useEffect(() => {
    const loadTrend = async () => {
      const months: { label: string; total: number }[] = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const m = d.getMonth() + 1;
        const y = d.getFullYear();
        const result = await getExpensesAction({ month: m, year: y });
        const monthNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        months.push({
          label: `${monthNames[m - 1]} ${y}`,
          total: result.summary?.totalUsd ?? 0,
        });
      }
      setExpenseTrend(months);
    };
    loadTrend();
  }, []);

  const handleMonthChange = (delta: number) => {
    let m = selectedMonth + delta;
    let y = selectedYear;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    setSelectedMonth(m); setSelectedYear(y);
    loadPeriod(m, y);
  };

  // ── Crear gasto ─────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description.trim() || !form.categoryId || !form.amountUsd || !form.paymentMethod) {
      toast.error('Completa todos los campos requeridos'); return;
    }
    startTransition(async () => {
      const result = await createExpenseAction({
        description: form.description,
        notes: form.notes || undefined,
        categoryId: form.categoryId,
        amountUsd: parseFloat(form.amountUsd),
        amountBs: form.amountBs ? parseFloat(form.amountBs) : undefined,
        exchangeRate: form.exchangeRate ? parseFloat(form.exchangeRate) : undefined,
        paymentMethod: form.paymentMethod,
        paymentRef: form.paymentRef || undefined,
        paidAt: form.paidAt,
      });
      if (result.success) {
        toast.success('Gasto registrado');
        setShowForm(false);
        setForm({ description: '', notes: '', categoryId: '', amountUsd: '', amountBs: '', exchangeRate: '', paymentMethod: 'CASH_USD', paymentRef: '', paidAt: new Date().toISOString().slice(0, 10) });
        loadPeriod(selectedMonth, selectedYear);
      } else {
        toast.error(result.error ?? 'Error al registrar gasto');
      }
    });
  };

  // ── Crear categoría ─────────────────────────────────────────────────────────
  const handleCreateCat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catForm.name.trim()) { toast.error('El nombre es requerido'); return; }
    startTransition(async () => {
      const result = await createExpenseCategoryAction({ name: catForm.name, description: catForm.description, color: catForm.color, icon: catForm.icon });
      if (result.success) {
        toast.success('Categoría creada');
        setShowCatForm(false);
        setCatForm({ name: '', description: '', color: '#3B82F6', icon: '💸' });
        // Refresh categories
        const cats = await import('@/app/actions/expense.actions').then(m => m.getExpenseCategoriesAction());
        if (cats.data) setCategories(cats.data);
      } else {
        toast.error(result.error ?? 'Error');
      }
    });
  };

  // ── Anular gasto ─────────────────────────────────────────────────────────────
  const handleVoid = async () => {
    if (!voidTarget || !voidReason.trim()) { toast.error('Escribe el motivo de anulación'); return; }
    startTransition(async () => {
      const result = await voidExpenseAction(voidTarget.id, voidReason);
      if (result.success) {
        toast.success('Gasto anulado');
        setVoidTarget(null); setVoidReason('');
        loadPeriod(selectedMonth, selectedYear);
      } else {
        toast.error(result.error ?? 'Error');
      }
    });
  };

  // ─── FILTRADO ────────────────────────────────────────────────────────────────
  const filteredExpenses = expenses.filter(e => {
    if (filterCategory && e.categoryId !== filterCategory) return false;
    if (filterMethod && e.paymentMethod !== filterMethod) return false;
    return true;
  });

  // ── Exportar a Excel ────────────────────────────────────────────────────────
  const exportExpensesExcel = async () => {
    if (filteredExpenses.length === 0) return;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Gastos');

    ws.mergeCells('A1:F1');
    ws.getCell('A1').value = `Gastos Operativos — ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`;
    ws.getCell('A1').font = { bold: true, size: 14 };

    ws.getRow(3).values = ['Fecha', 'Descripción', 'Categoría', 'Método de Pago', 'Monto USD', 'Registrado por'];
    ws.getRow(3).font = { bold: true };
    ws.getColumn(1).width = 14;
    ws.getColumn(2).width = 35;
    ws.getColumn(3).width = 20;
    ws.getColumn(4).width = 20;
    ws.getColumn(5).width = 15;
    ws.getColumn(5).numFmt = '#,##0.00';
    ws.getColumn(6).width = 20;

    filteredExpenses.forEach((e, i) => {
      ws.getRow(4 + i).values = [
        new Date(e.paidAt).toLocaleDateString('es-VE'),
        e.description,
        e.categoryName,
        paymentLabel(e.paymentMethod),
        e.amountUsd,
        e.createdByName,
      ];
    });

    // Total row
    const totalRow = 4 + filteredExpenses.length + 1;
    ws.getCell(`A${totalRow}`).value = 'TOTAL';
    ws.getCell(`A${totalRow}`).font = { bold: true };
    ws.getCell(`E${totalRow}`).value = filteredExpenses.reduce((s: number, e) => s + e.amountUsd, 0);
    ws.getCell(`E${totalRow}`).font = { bold: true };
    ws.getCell(`E${totalRow}`).numFmt = '#,##0.00';

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Gastos_${MONTH_NAMES[selectedMonth - 1]}_${selectedYear}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">💸 Gastos Operativos</h1>
          <p className="text-sm text-muted-foreground">Registro y control de gastos del negocio</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={exportExpensesExcel}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            📥 Exportar Excel
          </button>
          {canManage && (
            <>
              {canAdmin && (
                <button onClick={() => setShowCatForm(true)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors">
                  + Categoría
                </button>
              )}
              <button onClick={() => setShowForm(true)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 transition-colors">
                + Registrar Gasto
              </button>
            </>
          )}
        </div>
      </div>

      {/* Navegador de período */}
      <div className="flex items-center gap-3">
        <button onClick={() => handleMonthChange(-1)} className="rounded-lg border border-border p-2 hover:bg-accent transition-colors text-foreground">‹</button>
        <span className="text-base font-semibold text-foreground min-w-[140px] text-center">
          {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
        </span>
        <button onClick={() => handleMonthChange(1)} className="rounded-lg border border-border p-2 hover:bg-accent transition-colors text-foreground">›</button>
        {isPending && <span className="text-xs text-muted-foreground animate-pulse">Cargando...</span>}
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Gastos"
          value={`$${fmt(summary.totalUsd)}`}
          icon="💸"
          color="border-red-500/30 bg-red-500/5"
          change={prevSummary ? (prevSummary.totalUsd > 0 ? Math.round(((summary.totalUsd - prevSummary.totalUsd) / prevSummary.totalUsd) * 1000) / 10 : null) : null}
          invertChange
        />
        <KpiCard label="Nº de Gastos" value={`${expenses.length}`} icon="📋" color="border-blue-500/30 bg-blue-500/5" />
        <KpiCard
          label="Mayor Categoría"
          value={summary.countByCategory[0]?.categoryName ?? '—'}
          icon={summary.countByCategory[0] ? '📂' : '—'}
          color="border-amber-500/30 bg-amber-500/5"
          sub={summary.countByCategory[0] ? `$${fmt(summary.countByCategory[0].totalUsd)}` : undefined}
        />
        <KpiCard
          label="Método Principal"
          value={summary.countByPaymentMethod[0] ? paymentLabel(summary.countByPaymentMethod[0].method) : '—'}
          icon="💳"
          color="border-purple-500/30 bg-purple-500/5"
          sub={summary.countByPaymentMethod[0] ? `$${fmt(summary.countByPaymentMethod[0].totalUsd)}` : undefined}
        />
      </div>

      {/* Desglose por categoría */}
      {summary.countByCategory.length > 0 && (
        <div className="glass-panel rounded-2xl border border-border p-5">
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">Por Categoría</h3>
          <div className="space-y-2">
            {summary.countByCategory.sort((a, b) => b.totalUsd - a.totalUsd).map(cat => {
              const pct = summary.totalUsd > 0 ? (cat.totalUsd / summary.totalUsd) * 100 : 0;
              return (
                <div key={cat.categoryId} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.categoryColor ?? '#6B7280' }} />
                  <span className="text-sm text-foreground flex-1 truncate">{cat.categoryName}</span>
                  <span className="text-xs text-muted-foreground">{cat.count} gastos</span>
                  <span className="text-sm font-semibold text-foreground w-24 text-right">${fmt(cat.totalUsd)}</span>
                  <div className="w-24 h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Pie Chart */}
        {summary.countByCategory.length > 0 && (
          <div className="glass-panel rounded-2xl border border-border p-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-4">Distribución por Categoría</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={summary.countByCategory}
                    dataKey="totalUsd"
                    nameKey="categoryName"
                    cx="50%" cy="50%"
                    innerRadius={45} outerRadius={80}
                    paddingAngle={2}
                  >
                    {summary.countByCategory.map((entry, index) => (
                      <Cell key={entry.categoryId} fill={entry.categoryColor || PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [`$${fmt(value)}`, undefined]}
                    contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Payment Method Breakdown */}
        {summary.countByPaymentMethod.length > 0 && (
          <div className="glass-panel rounded-2xl border border-border p-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-4">Por Método de Pago</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.countByPaymentMethod} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <XAxis type="number" tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}`} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="method" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={100} tickFormatter={(v: string) => paymentLabel(v)} />
                  <Tooltip formatter={(value: number) => [`$${fmt(value)}`, 'Monto']} contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', fontSize: 12 }} />
                  <Bar dataKey="totalUsd" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Expense Trend */}
      {expenseTrend.length > 0 && (
        <div className="glass-panel rounded-2xl border border-border p-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-4">Tendencia de Gastos (6 Meses)</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={expenseTrend} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v: number) => `$${v >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toFixed(0)}`} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={50} />
                <Tooltip formatter={(value: number) => [`$${value.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Gastos']} contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', fontSize: 12 }} />
                <Bar dataKey="total" name="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground"
        >
          <option value="">Todas las categorías</option>
          {categories.filter(c => c.isActive).map(c => (
            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
          ))}
        </select>
        <select
          value={filterMethod}
          onChange={e => setFilterMethod(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground"
        >
          <option value="">Todos los métodos</option>
          {PAYMENT_METHODS.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        {(filterCategory || filterMethod) && (
          <button
            onClick={() => { setFilterCategory(''); setFilterMethod(''); }}
            className="text-xs text-blue-500 hover:text-blue-400"
          >
            Limpiar filtros
          </button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">{filteredExpenses.length} gastos</span>
      </div>

      {/* Tabla de gastos */}
      <div className="glass-panel rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Detalle de Gastos</h3>
        </div>
        {filteredExpenses.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-4xl">💸</p>
            <p className="mt-2 text-muted-foreground font-medium">Sin gastos en este período</p>
            {canManage && <p className="text-sm text-muted-foreground">Haz clic en "+ Registrar Gasto" para agregar el primero</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold text-muted-foreground">Fecha</th>
                  <th className="px-5 py-3 text-left font-semibold text-muted-foreground">Descripción</th>
                  <th className="px-5 py-3 text-left font-semibold text-muted-foreground">Categoría</th>
                  <th className="px-5 py-3 text-left font-semibold text-muted-foreground">Método</th>
                  <th className="px-5 py-3 text-right font-semibold text-muted-foreground">Monto USD</th>
                  <th className="px-5 py-3 text-left font-semibold text-muted-foreground">Registrado por</th>
                  {canAdmin && <th className="px-5 py-3 text-center font-semibold text-muted-foreground">Acción</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredExpenses.map(e => (
                  <tr key={e.id} className={`hover:bg-muted/20 transition-colors ${e.status === 'VOID' ? 'opacity-40' : ''}`}>
                    <td className="px-5 py-3 text-muted-foreground whitespace-nowrap">
                      {new Date(e.paidAt).toLocaleDateString('es-VE')}
                    </td>
                    <td className="px-5 py-3 text-foreground">
                      <div className="font-medium">{e.description}</div>
                      {e.notes && <div className="text-xs text-muted-foreground">{e.notes}</div>}
                      {e.paymentRef && <div className="text-xs text-muted-foreground">Ref: {e.paymentRef}</div>}
                      {e.status === 'VOID' && <span className="inline-block mt-0.5 text-xs font-bold text-red-500">ANULADO</span>}
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-foreground">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: e.categoryColor ?? '#6B7280' }} />
                        {e.categoryIcon && <span>{e.categoryIcon}</span>}
                        {e.categoryName}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{paymentLabel(e.paymentMethod)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-foreground">${fmt(e.amountUsd)}</td>
                    <td className="px-5 py-3 text-muted-foreground text-xs">{e.createdByName}</td>
                    {canAdmin && (
                      <td className="px-5 py-3 text-center">
                        {e.status !== 'VOID' && (
                          <button onClick={() => setVoidTarget(e)}
                            className="text-xs text-red-500 hover:text-red-700 font-medium">
                            Anular
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal: Nuevo Gasto ── */}
      {showForm && (
        <Modal title="Registrar Gasto" onClose={() => setShowForm(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Descripción *</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="input-field w-full" placeholder="Ej: Pago alquiler local enero" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Categoría *</label>
                <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}
                  className="input-field w-full" required>
                  <option value="">Seleccionar...</option>
                  {categories.filter(c => c.isActive).map(c => (
                    <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Fecha *</label>
                <input type="date" value={form.paidAt} onChange={e => setForm(f => ({ ...f, paidAt: e.target.value }))}
                  className="input-field w-full" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Monto USD *</label>
                <input type="number" step="0.01" min="0.01" value={form.amountUsd}
                  onChange={e => setForm(f => ({ ...f, amountUsd: e.target.value }))}
                  className="input-field w-full" placeholder="0.00" required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Monto Bs (opcional)</label>
                <input type="number" step="0.01" min="0" value={form.amountBs}
                  onChange={e => setForm(f => ({ ...f, amountBs: e.target.value }))}
                  className="input-field w-full" placeholder="0.00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Método de Pago *</label>
                <select value={form.paymentMethod} onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))}
                  className="input-field w-full">
                  {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Referencia (opcional)</label>
                <input value={form.paymentRef} onChange={e => setForm(f => ({ ...f, paymentRef: e.target.value }))}
                  className="input-field w-full" placeholder="Nº transferencia, cheque..." />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Notas (opcional)</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="input-field w-full" rows={2} placeholder="Información adicional..." />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => setShowForm(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-accent">Cancelar</button>
              <button type="submit" disabled={isPending}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                {isPending ? 'Guardando...' : 'Registrar Gasto'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Modal: Nueva Categoría ── */}
      {showCatForm && (
        <Modal title="Nueva Categoría" onClose={() => setShowCatForm(false)}>
          <form onSubmit={handleCreateCat} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Icono</label>
                <input value={catForm.icon} onChange={e => setCatForm(f => ({ ...f, icon: e.target.value }))}
                  className="input-field w-full" placeholder="💸" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Color</label>
                <input type="color" value={catForm.color} onChange={e => setCatForm(f => ({ ...f, color: e.target.value }))}
                  className="h-10 w-full rounded-lg border border-border cursor-pointer" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Nombre *</label>
              <input value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))}
                className="input-field w-full" placeholder="Ej: Alquiler, Servicios Públicos..." required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Descripción</label>
              <input value={catForm.description} onChange={e => setCatForm(f => ({ ...f, description: e.target.value }))}
                className="input-field w-full" placeholder="Descripción breve..." />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => setShowCatForm(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-accent">Cancelar</button>
              <button type="submit" disabled={isPending}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                {isPending ? 'Creando...' : 'Crear Categoría'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Modal: Anular Gasto ── */}
      {voidTarget && (
        <Modal title="Anular Gasto" onClose={() => { setVoidTarget(null); setVoidReason(''); }}>
          <div className="space-y-4">
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4">
              <p className="text-sm font-semibold text-foreground">{voidTarget.description}</p>
              <p className="text-sm text-muted-foreground">${fmt(voidTarget.amountUsd)} — {new Date(voidTarget.paidAt).toLocaleDateString('es-VE')}</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Motivo de anulación *</label>
              <textarea value={voidReason} onChange={e => setVoidReason(e.target.value)}
                className="input-field w-full" rows={3} placeholder="Describe el motivo..." />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { setVoidTarget(null); setVoidReason(''); }}
                className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-accent">Cancelar</button>
              <button onClick={handleVoid} disabled={isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
                {isPending ? 'Anulando...' : 'Confirmar Anulación'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── COMPONENTES AUXILIARES ──────────────────────────────────────────────────

function KpiCard({ label, value, icon, color, sub, change, invertChange }: {
  label: string; value: string; icon: string; color: string; sub?: string;
  change?: number | null; invertChange?: boolean;
}) {
  return (
    <div className={`glass-panel rounded-2xl p-5 border ${color}`}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
        <span className="text-lg">{icon}</span>
      </div>
      <p className="text-2xl font-black text-foreground truncate">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      {change != null && (
        <span className={`inline-flex items-center text-[10px] font-bold mt-1 ${
          (invertChange ? change <= 0 : change >= 0) ? 'text-emerald-500' : 'text-red-500'
        }`}>
          {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}% vs mes ant.
        </span>
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
