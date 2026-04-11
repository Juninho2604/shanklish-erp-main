'use client';

import { useState, useTransition } from 'react';
import { getFinancialSummaryAction, type FinancialSummary } from '@/app/actions/finance.actions';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import ExcelJS from 'exceljs';

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function fmt(n: number) {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtK(n: number) {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${fmt(n)}`;
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  RESTAURANT: 'Restaurante',
  DELIVERY: 'Delivery',
  TAKEOUT: 'Para llevar',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  CASH_USD: 'Efectivo USD',
  CASH_BS: 'Efectivo Bs',
  CARD: 'Tarjeta',
  ZELLE: 'Zelle',
  TRANSFER: 'Transferencia',
  BANK_TRANSFER: 'Transferencia',
  MOBILE_PAY: 'Pago Móvil',
  MULTIPLE: 'Múltiple',
  CORTESIA: 'Cortesía',
};

const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

interface TrendItem { label: string; sales: number; cogs: number; expenses: number; profit: number }

interface Props {
  initialSummary: FinancialSummary | null;
  initialTrend: TrendItem[];
  currentMonth: number;
  currentYear: number;
}

export function FinanzasView({ initialSummary, initialTrend, currentMonth, currentYear }: Props) {
  const [summary, setSummary] = useState<FinancialSummary | null>(initialSummary);
  const [trend] = useState<TrendItem[]>(initialTrend);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [isPending, startTransition] = useTransition();

  const handleMonthChange = (delta: number) => {
    let m = selectedMonth + delta;
    let y = selectedYear;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    setSelectedMonth(m); setSelectedYear(y);
    startTransition(async () => {
      const result = await getFinancialSummaryAction(m, y);
      if (result.success && result.data) setSummary(result.data);
    });
  };

  const s = summary;

  const exportPnLExcel = async () => {
    if (!s) return;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Estado de Resultados');

    // Title
    ws.mergeCells('A1:C1');
    ws.getCell('A1').value = `Estado de Resultados — ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`;
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.getCell('A1').alignment = { horizontal: 'center' };

    // Headers
    ws.getRow(3).values = ['Concepto', 'Monto (USD)', '% sobre Ventas'];
    ws.getRow(3).font = { bold: true };
    ws.getColumn(1).width = 35;
    ws.getColumn(2).width = 18;
    ws.getColumn(3).width = 18;
    ws.getColumn(2).numFmt = '#,##0.00';
    ws.getColumn(3).numFmt = '0.0"%"';

    let row = 4;
    const addRow = (label: string, amount: number, pct?: number, bold?: boolean, indent?: boolean) => {
      ws.getRow(row).values = [indent ? `   ${label}` : label, amount, pct ?? (s.income.totalSalesUsd > 0 ? (amount / s.income.totalSalesUsd) * 100 : 0)];
      if (bold) ws.getRow(row).font = { bold: true };
      row++;
    };

    addRow('(+) Ventas Totales', s.income.totalSalesUsd, 100, true);
    s.income.byType.forEach(t => addRow(`↳ ${t.type}`, t.total, undefined, false, true));
    row++;
    addRow('(−) Costo de Ventas (COGS)', s.cogs.totalCogsUsd, undefined, false);
    addRow('= Utilidad Bruta', s.profitLoss.grossProfit, s.profitLoss.grossMarginPct, true);
    row++;
    addRow('(−) Gastos Operativos', s.expenses.totalExpensesUsd, undefined, false);
    s.expenses.byCategory.forEach(c => addRow(`↳ ${c.name}`, c.total, undefined, false, true));
    row++;
    addRow('= Utilidad Operativa', s.profitLoss.operatingProfit, s.profitLoss.operatingMarginPct, true);
    row += 2;

    // Cash Flow section
    ws.getCell(`A${row}`).value = 'Flujo de Caja';
    ws.getCell(`A${row}`).font = { bold: true, size: 12 };
    row++;
    addRow('Ingresos (Entradas)', s.cashFlow?.inflows ?? 0);
    addRow('Egresos (Salidas)', s.cashFlow?.outflows ?? 0);
    addRow('Flujo Neto', s.cashFlow?.net ?? 0, undefined, true);

    // Generate and download
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PnL_${MONTH_NAMES[selectedMonth - 1]}_${selectedYear}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">📊 Dashboard Financiero</h1>
          <p className="text-sm text-muted-foreground">Estado de resultados y flujo de caja</p>
        </div>
        {s && (
          <button
            onClick={exportPnLExcel}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            📥 Exportar Excel
          </button>
        )}
      </div>

      {/* Navegador período */}
      <div className="flex items-center gap-3">
        <button onClick={() => handleMonthChange(-1)} className="rounded-lg border border-border p-2 hover:bg-accent text-foreground">‹</button>
        <span className="text-base font-semibold text-foreground min-w-[140px] text-center">
          {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
        </span>
        <button onClick={() => handleMonthChange(1)} className="rounded-lg border border-border p-2 hover:bg-accent text-foreground">›</button>
        {isPending && <span className="text-xs text-muted-foreground animate-pulse">Calculando...</span>}
      </div>

      {!s ? (
        <div className="text-center py-20 text-muted-foreground">
          {isPending ? 'Cargando...' : 'Sin datos para este período'}
        </div>
      ) : (
        <>
          {/* P&L Summary */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <PnLCard label="Ventas Totales" value={`$${fmt(s.income.totalSalesUsd)}`} sub={`${s.income.ordersCount} órdenes`} color="border-emerald-500/30 bg-emerald-500/5" icon="💰" positive change={s.mom?.salesChange ?? null} />
            <PnLCard label="Ticket Promedio" value={`$${fmt(s.income.avgTicket ?? 0)}`} sub="Por orden" color="border-amber-500/30 bg-amber-500/5" icon="🎫" />
            <PnLCard label="Gastos Operativos" value={`$${fmt(s.expenses.totalExpensesUsd)}`} sub={`${s.expenses.count} gastos`} color="border-red-500/30 bg-red-500/5" icon="💸" change={s.mom?.expensesChange ?? null} invertChange />
            <PnLCard
              label="Utilidad Operativa"
              value={`$${fmt(s.profitLoss.operatingProfit)}`}
              sub={`Margen: ${s.profitLoss.operatingMarginPct}%`}
              color={s.profitLoss.operatingProfit >= 0 ? "border-blue-500/30 bg-blue-500/5" : "border-red-500/30 bg-red-500/10"}
              icon={s.profitLoss.operatingProfit >= 0 ? "📈" : "📉"}
              positive={s.profitLoss.operatingProfit >= 0}
              change={s.mom?.profitChange ?? null}
            />
          </div>

          {/* Cash Flow Summary */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="glass-panel rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Ingresos (Entradas)</p>
              <p className="text-2xl font-black text-emerald-500 mt-1">+${fmt(s.cashFlow?.inflows ?? 0)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Ventas cobradas</p>
            </div>
            <div className="glass-panel rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Egresos (Salidas)</p>
              <p className="text-2xl font-black text-red-500 mt-1">-${fmt(s.cashFlow?.outflows ?? 0)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Gastos + pagos a proveedores</p>
            </div>
            <div className={`glass-panel rounded-2xl border p-5 ${(s.cashFlow?.net ?? 0) >= 0 ? 'border-blue-500/30 bg-blue-500/5' : 'border-red-500/30 bg-red-500/10'}`}>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Flujo Neto</p>
              <p className={`text-2xl font-black mt-1 ${(s.cashFlow?.net ?? 0) >= 0 ? 'text-blue-500' : 'text-red-500'}`}>
                {(s.cashFlow?.net ?? 0) >= 0 ? '+' : '-'}${fmt(Math.abs(s.cashFlow?.net ?? 0))}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Balance del período</p>
            </div>
          </div>

          {/* Estado de Resultados */}
          <div className="glass-panel rounded-2xl border border-border p-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-5">Estado de Resultados</h3>
            <div className="space-y-3">
              <PnLRow label="(+) Ventas" amount={s.income.totalSalesUsd} positive />
              <div className="pl-4 space-y-1">
                {s.income.byType.map(t => (
                  <PnLRow key={t.type} label={`↳ ${ORDER_TYPE_LABELS[t.type] ?? t.type}`} amount={t.total} indent positive />
                ))}
              </div>
              <div className="border-t border-border pt-2">
                <PnLRow label="(−) Costo de Ventas (COGS)" amount={-s.cogs.totalCogsUsd} />
              </div>
              <div className="border-t border-dashed border-border pt-2 bg-muted/10 rounded-lg px-3 py-2">
                <PnLRow label="= Utilidad Bruta" amount={s.profitLoss.grossProfit} bold positive={s.profitLoss.grossProfit >= 0} />
                <p className="text-xs text-muted-foreground mt-0.5">Margen bruto: {s.profitLoss.grossMarginPct}%</p>
              </div>
              <div className="border-t border-border pt-2">
                <PnLRow label="(−) Gastos Operativos" amount={-s.expenses.totalExpensesUsd} />
              </div>
              <div className="pl-4 space-y-1">
                {s.expenses.byCategory.map(c => (
                  <PnLRow key={c.name} label={`↳ ${c.name}`} amount={-c.total} indent />
                ))}
              </div>
              <div className="border-t-2 border-border pt-2 bg-muted/10 rounded-lg px-3 py-2">
                <PnLRow label="= Utilidad Operativa" amount={s.profitLoss.operatingProfit} bold positive={s.profitLoss.operatingProfit >= 0} />
                <p className="text-xs text-muted-foreground mt-0.5">Margen operativo: {s.profitLoss.operatingMarginPct}%</p>
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Daily Sales Line Chart */}
            <div className="glass-panel rounded-2xl border border-border p-6">
              <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-5">Ventas Diarias del Mes</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={s.income.dailySales ?? []} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={fmtK} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={50} />
                    <Tooltip formatter={(value: number) => [`$${fmt(value)}`, undefined]} contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', fontSize: 12 }} />
                    <Line type="monotone" dataKey="total" name="Ventas" stroke="#10b981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Expense Donut Chart */}
            <div className="glass-panel rounded-2xl border border-border p-6">
              <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-5">Gastos por Categoría</h3>
              {(s.expenses.byCategory?.length ?? 0) > 0 ? (
                <div className="flex items-center gap-4">
                  <div className="h-56 w-56 flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={s.expenses.byCategory} dataKey="total" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2}>
                          {s.expenses.byCategory.map((entry, index) => (
                            <Cell key={entry.name} fill={entry.color || PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => [`$${fmt(value)}`, undefined]} contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-1.5 overflow-hidden">
                    {s.expenses.byCategory.slice(0, 6).map((cat, i) => (
                      <div key={cat.name} className="flex items-center gap-2 text-xs">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color || PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-foreground truncate flex-1">{cat.name}</span>
                        <span className="text-muted-foreground font-semibold">{cat.pct.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-12">Sin gastos registrados</p>
              )}
            </div>
          </div>

          {/* Gráfica de tendencia */}
          {trend.length > 0 && (
            <div className="glass-panel rounded-2xl border border-border p-6">
              <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-5">Tendencia 6 Meses</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trend} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={55} />
                    <Tooltip
                      formatter={(value: number) => [`$${fmt(value)}`, undefined]}
                      contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, color: 'var(--muted-foreground)' }} />
                    <Bar dataKey="sales" name="Ventas" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="cogs" name="COGS" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expenses" name="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="profit" name="Utilidad" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Top Gastos + Métodos de Pago */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Top 5 Expenses */}
            {(s.expenses.topExpenses?.length ?? 0) > 0 && (
              <div className="glass-panel rounded-2xl border border-border p-6">
                <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-4">Top 5 Gastos del Período</h3>
                <div className="space-y-3">
                  {s.expenses.topExpenses.map((exp, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="text-lg font-black text-muted-foreground w-6">{i + 1}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{exp.description}</p>
                          <p className="text-xs text-muted-foreground">{exp.categoryName} · {new Date(exp.paidAt).toLocaleDateString('es-VE')}</p>
                        </div>
                      </div>
                      <span className="text-sm font-black text-red-500 ml-3">${fmt(exp.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Payment Methods */}
            {(s.income.byPaymentMethod?.length ?? 0) > 0 && (
              <div className="glass-panel rounded-2xl border border-border p-6">
                <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-4">Ventas por Método de Pago</h3>
                <div className="space-y-2.5">
                  {s.income.byPaymentMethod.map(pm => {
                    const pct = s.income.totalSalesUsd > 0 ? (pm.total / s.income.totalSalesUsd) * 100 : 0;
                    return (
                      <div key={pm.method} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-foreground font-medium">{PAYMENT_METHOD_LABELS[pm.method] ?? pm.method}</span>
                          <span className="text-foreground font-bold">${fmt(pm.total)} <span className="text-muted-foreground font-normal text-xs">({pm.count})</span></span>
                        </div>
                        <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Alertas financieras */}
          {(() => {
            const alerts: { icon: string; text: string; href?: string; severity: 'critical' | 'warning' | 'info' }[] = [];
            if (s.accountsPayable.overdueUsd > 0) {
              alerts.push({ icon: '🚨', text: `Tienes $${fmt(s.accountsPayable.overdueUsd)} en cuentas por pagar vencidas`, href: '/dashboard/cuentas-pagar', severity: 'critical' });
            }
            if (s.profitLoss.operatingProfit < 0) {
              alerts.push({ icon: '📉', text: `El negocio operó con pérdida de $${fmt(Math.abs(s.profitLoss.operatingProfit))} este período`, severity: 'critical' });
            }
            if (s.profitLoss.grossMarginPct < 30 && s.income.totalSalesUsd > 0) {
              alerts.push({ icon: '⚠️', text: `Margen bruto bajo: ${s.profitLoss.grossMarginPct}% (se recomienda >30%)`, href: '/dashboard/costos/margen', severity: 'warning' });
            }
            if (s.expenses.totalExpensesUsd > 0 && s.income.totalSalesUsd > 0 && (s.expenses.totalExpensesUsd / s.income.totalSalesUsd) > 0.40) {
              alerts.push({ icon: '💸', text: `Gastos operativos representan ${((s.expenses.totalExpensesUsd / s.income.totalSalesUsd) * 100).toFixed(1)}% de las ventas (se recomienda <40%)`, href: '/dashboard/gastos', severity: 'warning' });
            }
            if (s.mom?.salesChange != null && s.mom.salesChange < -15) {
              alerts.push({ icon: '📊', text: `Ventas cayeron ${Math.abs(s.mom.salesChange).toFixed(1)}% vs mes anterior`, severity: 'warning' });
            }
            if ((s.cashFlow?.net ?? 0) < 0) {
              alerts.push({ icon: '🏦', text: `Flujo de caja negativo: -$${fmt(Math.abs(s.cashFlow?.net ?? 0))}. Los egresos superan los ingresos`, severity: 'warning' });
            }
            if (alerts.length === 0) return null;
            const hasCritical = alerts.some(a => a.severity === 'critical');
            return (
              <div className={`glass-panel rounded-2xl border p-5 ${hasCritical ? 'border-red-500/30 bg-red-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
                <h3 className={`text-sm font-black uppercase tracking-widest mb-3 ${hasCritical ? 'text-red-500' : 'text-amber-500'}`}>
                  {hasCritical ? '🚨 Alertas Financieras' : '⚠️ Atención'}
                </h3>
                <div className="space-y-2">
                  {alerts.map((alert, i) => (
                    <AlertItem key={i} icon={alert.icon} text={alert.text} href={alert.href} />
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Cuentas por pagar pendientes */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="glass-panel rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Deudas Pendientes</p>
              <p className="text-3xl font-black text-foreground mt-1">${fmt(s.accountsPayable.totalPendingUsd)}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.accountsPayable.count} facturas activas</p>
            </div>
            <div className={`glass-panel rounded-2xl border p-5 ${s.accountsPayable.overdueUsd > 0 ? 'border-red-500/30 bg-red-500/5' : 'border-border'}`}>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Vencido</p>
              <p className={`text-3xl font-black mt-1 ${s.accountsPayable.overdueUsd > 0 ? 'text-red-500' : 'text-foreground'}`}>
                ${fmt(s.accountsPayable.overdueUsd)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Pendiente de pago urgente</p>
            </div>
            <div className="glass-panel rounded-2xl border border-blue-500/30 bg-blue-500/5 p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Compras del Período</p>
              <p className="text-3xl font-black text-foreground mt-1">${fmt(s.purchases.totalPurchasesUsd)}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.purchases.ordersCount} órdenes recibidas</p>
            </div>
          </div>

          {/* Aging Report */}
          {(s.accountsPayable.aging ?? []).some((a: { range: string; amount: number; count: number }) => a.amount > 0) && (
            <div className="glass-panel rounded-2xl border border-border p-6">
              <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-4">Envejecimiento de Deudas</h3>
              <div className="grid grid-cols-4 gap-3">
                {s.accountsPayable.aging.map((bucket: { range: string; amount: number; count: number }) => (
                  <div key={bucket.range} className={`rounded-xl p-4 text-center ${
                    bucket.range === '90+' ? 'bg-red-500/10 border border-red-500/20' :
                    bucket.range === '61-90' ? 'bg-orange-500/10 border border-orange-500/20' :
                    bucket.range === '31-60' ? 'bg-amber-500/10 border border-amber-500/20' :
                    'bg-blue-500/10 border border-blue-500/20'
                  }`}>
                    <p className="text-xs font-bold text-muted-foreground">{bucket.range} días</p>
                    <p className={`text-lg font-black mt-1 ${
                      bucket.range === '90+' ? 'text-red-500' :
                      bucket.range === '61-90' ? 'text-orange-500' :
                      bucket.range === '31-60' ? 'text-amber-500' : 'text-blue-500'
                    }`}>${fmt(bucket.amount)}</p>
                    <p className="text-[10px] text-muted-foreground">{bucket.count} facturas</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function PnLCard({ label, value, sub, color, icon, positive, change, invertChange }: {
  label: string; value: string; sub?: string; color: string; icon: string; positive?: boolean;
  change?: number | null; invertChange?: boolean;
}) {
  return (
    <div className={`glass-panel rounded-2xl p-5 border ${color}`}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
        <span className="text-lg">{icon}</span>
      </div>
      <p className={`text-2xl font-black ${positive === false ? 'text-red-500' : 'text-foreground'}`}>{value}</p>
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

function PnLRow({ label, amount, bold, indent, positive }: {
  label: string; amount: number; bold?: boolean; indent?: boolean; positive?: boolean;
}) {
  const isPositive = positive !== undefined ? positive : amount >= 0;
  return (
    <div className={`flex items-center justify-between ${indent ? 'text-xs text-muted-foreground' : 'text-sm'}`}>
      <span className={bold ? 'font-bold text-foreground' : ''}>{label}</span>
      <span className={`${bold ? 'font-black text-base' : 'font-semibold'} ${amount < 0 ? 'text-red-500' : amount > 0 && isPositive ? 'text-emerald-500' : 'text-foreground'}`}>
        {amount >= 0 ? `+$${fmt(amount)}` : `-$${fmt(Math.abs(amount))}`}
      </span>
    </div>
  );
}

function AlertItem({ icon, text, href }: { icon: string; text: string; href?: string }) {
  return (
    <div className="flex items-start gap-2 text-sm text-foreground">
      <span>{icon}</span>
      <span>{text}</span>
      {href && <a href={href} className="ml-auto text-xs text-blue-500 hover:underline whitespace-nowrap">Ver →</a>}
    </div>
  );
}
