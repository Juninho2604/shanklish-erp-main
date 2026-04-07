'use client';

import { useState, useTransition } from 'react';
import { getFinancialSummaryAction, type FinancialSummary } from '@/app/actions/finance.actions';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

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

interface TrendItem { label: string; sales: number; expenses: number; profit: number }

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">📊 Dashboard Financiero</h1>
        <p className="text-sm text-muted-foreground">Estado de resultados y flujo de caja</p>
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
            <PnLCard label="Ventas Totales" value={`$${fmt(s.income.totalSalesUsd)}`} sub={`${s.income.ordersCount} órdenes`} color="border-emerald-500/30 bg-emerald-500/5" icon="💰" positive />
            <PnLCard label="Costo de Ventas" value={`$${fmt(s.cogs.totalCogsUsd)}`} sub={`${s.income.totalSalesUsd > 0 ? ((s.cogs.totalCogsUsd/s.income.totalSalesUsd)*100).toFixed(1) : 0}% de ventas`} color="border-amber-500/30 bg-amber-500/5" icon="🏭" />
            <PnLCard label="Gastos Operativos" value={`$${fmt(s.expenses.totalExpensesUsd)}`} sub={`${s.expenses.count} gastos`} color="border-red-500/30 bg-red-500/5" icon="💸" />
            <PnLCard
              label="Utilidad Operativa"
              value={`$${fmt(s.profitLoss.operatingProfit)}`}
              sub={`Margen: ${s.profitLoss.operatingMarginPct}%`}
              color={s.profitLoss.operatingProfit >= 0 ? "border-blue-500/30 bg-blue-500/5" : "border-red-500/30 bg-red-500/10"}
              icon={s.profitLoss.operatingProfit >= 0 ? "📈" : "📉"}
              positive={s.profitLoss.operatingProfit >= 0}
            />
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
                    <Bar dataKey="expenses" name="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="profit" name="Utilidad" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Alertas financieras */}
          {(s.accountsPayable.overdueUsd > 0 || s.profitLoss.operatingProfit < 0) && (
            <div className="glass-panel rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
              <h3 className="text-sm font-black uppercase tracking-widest text-red-500 mb-3">⚠️ Alertas Financieras</h3>
              <div className="space-y-2">
                {s.accountsPayable.overdueUsd > 0 && (
                  <AlertItem icon="🚨" text={`Tienes $${fmt(s.accountsPayable.overdueUsd)} en cuentas por pagar vencidas`} href="/dashboard/cuentas-pagar" />
                )}
                {s.profitLoss.operatingProfit < 0 && (
                  <AlertItem icon="📉" text={`El negocio operó con pérdida de $${fmt(Math.abs(s.profitLoss.operatingProfit))} este período`} />
                )}
              </div>
            </div>
          )}

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
        </>
      )}
    </div>
  );
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function PnLCard({ label, value, sub, color, icon, positive }: {
  label: string; value: string; sub?: string; color: string; icon: string; positive?: boolean;
}) {
  return (
    <div className={`glass-panel rounded-2xl p-5 border ${color}`}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
        <span className="text-lg">{icon}</span>
      </div>
      <p className={`text-2xl font-black ${positive === false ? 'text-red-500' : 'text-foreground'}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
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
