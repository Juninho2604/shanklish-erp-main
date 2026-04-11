import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getEstadisticasAction } from '@/app/actions/estadisticas.actions';

export const dynamic = 'force-dynamic';

// ============================================================================
// HELPERS
// ============================================================================

const PAYMENT_LABELS: Record<string, string> = {
  CASH: '💵 Efectivo $',
  CARD: '💳 Tarjeta',
  MOBILE_PAY: '📱 Pago Móvil',
  TRANSFER: '🏦 Transferencia',
  ZELLE: '⚡ Zelle',
};

const PRODUCTION_STATUS: Record<string, { label: string; color: string }> = {
  COMPLETED: { label: 'Completado', color: 'text-emerald-400' },
  IN_PROGRESS: { label: 'En proceso', color: 'text-amber-400' },
  DRAFT: { label: 'Borrador', color: 'text-muted-foreground' },
  APPROVED: { label: 'Aprobado', color: 'text-blue-400' },
  CANCELLED: { label: 'Cancelado', color: 'text-red-400' },
};

const DISCOUNT_LABELS: Record<string, string> = {
  DIVISAS_33: '💱 Divisas -33%',
  CORTESIA_100: '🎁 Cortesía 100%',
  CORTESIA_PERCENT: '🎁 Cortesía parcial',
  NONE: 'Sin descuento',
};

function fmt(n: number) {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(current: number, previous: number) {
  if (previous === 0) return null;
  const diff = ((current - previous) / previous) * 100;
  return diff;
}

// ============================================================================
// SUB-COMPONENTES
// ============================================================================

function StatCard({
  label,
  value,
  sub,
  icon,
  trend,
  color = 'primary',
}: {
  label: string;
  value: string;
  sub?: string;
  icon: string;
  trend?: number | null;
  color?: 'primary' | 'emerald' | 'blue' | 'amber' | 'red' | 'purple';
}) {
  const colors = {
    primary: 'text-primary bg-primary/10',
    emerald: 'text-emerald-400 bg-emerald-400/10',
    blue: 'text-blue-400 bg-blue-400/10',
    amber: 'text-amber-400 bg-amber-400/10',
    red: 'text-red-400 bg-red-400/10',
    purple: 'text-purple-400 bg-purple-400/10',
  };
  const textColor = colors[color].split(' ')[0];
  const bgColor = colors[color].split(' ')[1];

  return (
    <div className="capsula-card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</span>
        <div className={`h-9 w-9 rounded-xl flex items-center justify-center text-lg ${bgColor}`}>{icon}</div>
      </div>
      <div>
        <div className={`text-2xl font-black ${textColor} tabular-nums`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5 font-medium">{sub}</div>}
      </div>
      {trend !== null && trend !== undefined && (
        <div className={`text-[10px] font-black flex items-center gap-1 ${trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}% vs ayer
        </div>
      )}
    </div>
  );
}

function SectionTitle({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center text-xl">{icon}</div>
      <div>
        <h2 className="text-base font-black uppercase tracking-tight text-foreground">{title}</h2>
        {sub && <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">{sub}</p>}
      </div>
    </div>
  );
}

// ============================================================================
// PÁGINA PRINCIPAL
// ============================================================================

export default async function EstadisticasPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const result = await getEstadisticasAction();

  if (!result.success || !result.data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center gap-4">
        <div className="text-5xl">📊</div>
        <p className="font-black text-xl text-foreground">Error cargando estadísticas</p>
        <p className="text-sm text-muted-foreground">{result.message}</p>
      </div>
    );
  }

  const d = result.data;
  const role = d.role;
  const isAdmin = ['OWNER', 'ADMIN_MANAGER'].includes(role);
  const isOps = ['OPS_MANAGER', 'AREA_LEAD'].includes(role);
  const isCashier = ['CASHIER', 'WAITER'].includes(role);
  const isChef = ['CHEF', 'KITCHEN_CHEF'].includes(role);
  const isAuditor = role === 'AUDITOR';
  const revenueTrend = pct(d.today.revenue, d.yesterday.revenue);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <div className="glass-panel p-6 rounded-3xl border-primary/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">
            📊 <span className="text-primary italic">ESTADÍSTICAS</span>
          </h1>
          <p className="text-sm text-muted-foreground font-medium mt-1">
            Vista personalizada para{' '}
            <span className="text-foreground font-black">{d.userName}</span>
            {' · '}
            {new Date().toLocaleDateString('es-VE', {
              weekday: 'long', day: 'numeric', month: 'long',
              timeZone: 'America/Caracas',
            })}
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-secondary/50 rounded-xl border border-border">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-black text-muted-foreground uppercase tracking-widest">En vivo</span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* VISTA: DUEÑO / GERENTE ADMINISTRATIVO                            */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {(isAdmin) && (
        <>
          {/* KPIs principales */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Ventas hoy"
              value={`$${fmt(d.today.revenue)}`}
              sub={`${d.today.orders} órdenes`}
              icon="💰"
              trend={revenueTrend}
              color="primary"
            />
            <StatCard
              label="Ticket promedio"
              value={`$${fmt(d.today.avgTicket)}`}
              sub="Por orden hoy"
              icon="🧾"
              color="blue"
            />
            <StatCard
              label="Descuentos hoy"
              value={`$${fmt(d.today.discounts)}`}
              sub={d.discountBreakdown.length > 0 ? `${d.discountBreakdown.reduce((s, r) => s + r.count, 0)} aplicados` : 'Ninguno'}
              icon="🎁"
              color="amber"
            />
            <StatCard
              label="Mes en curso"
              value={`$${fmt(d.month.revenue)}`}
              sub={`${d.month.orders} órdenes`}
              icon="📅"
              color="emerald"
            />
          </div>

          {/* Segunda fila: cuentas abiertas + anulaciones */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Cuentas abiertas"
              value={String(d.openTabs.count)}
              sub={`$${fmt(d.openTabs.totalExposed)} expuesto`}
              icon="🪑"
              color="emerald"
            />
            <StatCard
              label="Anulaciones hoy"
              value={String(d.today.voided)}
              sub={d.today.voided > 0 ? '⚠️ Revisar log' : 'Sin novedad'}
              icon="🚫"
              color={d.today.voided > 0 ? 'red' : 'emerald'}
            />
            <StatCard
              label="Stock bajo"
              value={String(d.lowStockAlerts.length)}
              sub={d.lowStockAlerts.length > 0 ? 'items bajo mínimo' : 'Todo en orden'}
              icon="📦"
              color={d.lowStockAlerts.length > 0 ? 'amber' : 'emerald'}
            />
            <StatCard
              label="Ayer"
              value={`$${fmt(d.yesterday.revenue)}`}
              sub={`${d.yesterday.orders} órdenes`}
              icon="📆"
              color="blue"
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Métodos de pago */}
            <div className="capsula-card p-6">
              <SectionTitle icon="💳" title="Métodos de Pago" sub="Distribución de hoy" />
              {d.paymentBreakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Sin ventas registradas hoy</p>
              ) : (
                <div className="space-y-3">
                  {d.paymentBreakdown
                    .sort((a, b) => b.total - a.total)
                    .map((p) => {
                      const totalAll = d.paymentBreakdown.reduce((s, r) => s + r.total, 0);
                      const pctVal = totalAll > 0 ? (p.total / totalAll) * 100 : 0;
                      return (
                        <div key={p.method}>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-black text-foreground/80">
                              {PAYMENT_LABELS[p.method] || p.method}
                            </span>
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] text-muted-foreground font-bold">{p.count} orden{p.count !== 1 ? 'es' : ''}</span>
                              <span className="text-sm font-black text-primary tabular-nums">${fmt(p.total)}</span>
                            </div>
                          </div>
                          <div className="h-2 bg-secondary rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all duration-700"
                              style={{ width: `${pctVal}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Top productos */}
            <div className="capsula-card p-6">
              <SectionTitle icon="🏆" title="Top Productos Hoy" sub="Por unidades vendidas" />
              {d.topItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Sin ventas registradas hoy</p>
              ) : (
                <div className="space-y-3">
                  {d.topItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className={`h-7 w-7 rounded-lg flex items-center justify-center text-xs font-black ${
                        i === 0 ? 'bg-amber-400/20 text-amber-400' :
                        i === 1 ? 'bg-zinc-400/20 text-zinc-400' :
                        i === 2 ? 'bg-amber-700/20 text-amber-700' :
                        'bg-secondary text-muted-foreground'
                      }`}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-black text-foreground truncate uppercase">{item.name}</div>
                        <div className="text-[10px] text-muted-foreground font-bold">{item.quantity} unidades</div>
                      </div>
                      <div className="text-sm font-black text-primary tabular-nums">${fmt(item.revenue)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Descuentos + Anulaciones */}
          {(d.discountBreakdown.length > 0 || d.voidedOrders.length > 0) && (
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Descuentos */}
              {d.discountBreakdown.length > 0 && (
                <div className="capsula-card p-6 border-amber-500/10">
                  <SectionTitle icon="🎁" title="Descuentos Aplicados" sub="Solo hoy — requieren revisión" />
                  <div className="space-y-2">
                    {d.discountBreakdown.map((disc, i) => (
                      <div key={i} className="flex justify-between items-center p-3 bg-amber-500/5 rounded-xl border border-amber-500/10">
                        <div>
                          <div className="text-xs font-black text-foreground">{DISCOUNT_LABELS[disc.type] || disc.type}</div>
                          {disc.authorizedBy && (
                            <div className="text-[10px] text-muted-foreground">Autorizado: {disc.authorizedBy}</div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-black text-amber-400">-${fmt(disc.total)}</div>
                          <div className="text-[10px] text-muted-foreground">{disc.count} aplicacion{disc.count !== 1 ? 'es' : ''}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Anulaciones */}
              {d.voidedOrders.length > 0 && (
                <div className="capsula-card p-6 border-red-500/10">
                  <SectionTitle icon="🚫" title="Órdenes Anuladas" sub="Hoy — log de auditoría" />
                  <div className="space-y-2">
                    {d.voidedOrders.map((v, i) => (
                      <div key={i} className="flex justify-between items-center p-3 bg-red-500/5 rounded-xl border border-red-500/10">
                        <div>
                          <div className="text-xs font-black text-red-400">#{v.orderNumber}</div>
                          <div className="text-[10px] text-muted-foreground truncate max-w-[160px]">{v.reason}</div>
                          <div className="text-[9px] text-muted-foreground/60">Por: {v.voidedBy} · {v.time}</div>
                        </div>
                        <div className="text-sm font-black text-red-400">-${fmt(v.total)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Stock bajo */}
          {d.lowStockAlerts.length > 0 && (
            <div className="capsula-card p-6 border-amber-500/10">
              <SectionTitle icon="⚠️" title="Alertas de Stock" sub="Items bajo el mínimo establecido" />
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {d.lowStockAlerts.map((item, i) => (
                  <div key={i} className="p-3 bg-amber-500/5 rounded-xl border border-amber-500/10">
                    <div className="text-xs font-black text-foreground uppercase truncate">{item.name}</div>
                    <div className="text-[9px] text-muted-foreground font-bold mt-0.5">{item.sku}</div>
                    <div className="mt-2 flex justify-between items-end">
                      <div>
                        <div className="text-lg font-black text-amber-400 tabular-nums">{item.currentStock.toFixed(1)}</div>
                        <div className="text-[9px] text-muted-foreground">Min: {item.minimumStock} {item.unit}</div>
                      </div>
                      <div className="text-[9px] font-black text-amber-400 bg-amber-400/10 px-2 py-1 rounded-lg">
                        BAJO
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* VISTA: GERENTE OPERATIVO / ÁREA LÍDER                            */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {isOps && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Ventas hoy" value={`$${fmt(d.today.revenue)}`} sub={`${d.today.orders} órdenes`} icon="💰" color="primary" />
            <StatCard label="Cuentas abiertas" value={String(d.openTabs.count)} sub={`$${fmt(d.openTabs.totalExposed)} por cobrar`} icon="🪑" color="emerald" />
            <StatCard label="Anulaciones" value={String(d.today.voided)} sub={d.today.voided > 0 ? 'Revisar log' : 'Sin novedad'} icon="🚫" color={d.today.voided > 0 ? 'red' : 'emerald'} />
            <StatCard label="Stock bajo" value={String(d.lowStockAlerts.length)} sub="items bajo mínimo" icon="📦" color={d.lowStockAlerts.length > 0 ? 'amber' : 'emerald'} />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="capsula-card p-6">
              <SectionTitle icon="💳" title="Métodos de Pago" sub="Hoy" />
              {d.paymentBreakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Sin ventas hoy</p>
              ) : (
                <div className="space-y-3">
                  {d.paymentBreakdown.sort((a, b) => b.total - a.total).map((p) => (
                    <div key={p.method} className="flex justify-between items-center p-3 bg-secondary/30 rounded-xl">
                      <span className="text-xs font-black">{PAYMENT_LABELS[p.method] || p.method}</span>
                      <span className="text-sm font-black text-primary">${fmt(p.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {d.lowStockAlerts.length > 0 && (
              <div className="capsula-card p-6 border-amber-500/10">
                <SectionTitle icon="⚠️" title="Stock Bajo" sub="Requiere atención" />
                <div className="space-y-2">
                  {d.lowStockAlerts.map((item, i) => (
                    <div key={i} className="flex justify-between items-center p-3 bg-amber-500/5 rounded-xl border border-amber-500/10">
                      <div>
                        <div className="text-xs font-black text-foreground uppercase">{item.name}</div>
                        <div className="text-[9px] text-muted-foreground">Mínimo: {item.minimumStock} {item.unit}</div>
                      </div>
                      <div className="text-sm font-black text-amber-400 tabular-nums">{item.currentStock.toFixed(1)} {item.unit}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* VISTA: CAJERO / MESONERO                                         */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {isCashier && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Mi turno hoy" value={`$${fmt(d.myStats.revenue)}`} sub={`${d.myStats.orders} órdenes`} icon="💰" color="primary" />
            <StatCard label="Ticket promedio" value={`$${fmt(d.myStats.avgTicket)}`} sub="Por orden" icon="🧾" color="blue" />
          </div>

          <div className="capsula-card p-6">
            <SectionTitle icon="📋" title="Mi Resumen de Turno" sub="Solo mis operaciones de hoy" />
            {d.myStats.orders === 0 ? (
              <div className="text-center py-10">
                <div className="text-4xl mb-3">🕐</div>
                <p className="font-black text-foreground">Sin ventas registradas aún</p>
                <p className="text-sm text-muted-foreground mt-1">Las ventas que proceses aparecerán aquí</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-secondary/30 rounded-xl p-4 text-center">
                    <div className="text-2xl font-black text-primary">{d.myStats.orders}</div>
                    <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-1">Órdenes</div>
                  </div>
                  <div className="bg-secondary/30 rounded-xl p-4 text-center">
                    <div className="text-2xl font-black text-emerald-400">${fmt(d.myStats.revenue)}</div>
                    <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-1">Total</div>
                  </div>
                  <div className="bg-secondary/30 rounded-xl p-4 text-center">
                    <div className="text-2xl font-black text-blue-400">${fmt(d.myStats.avgTicket)}</div>
                    <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-1">Promedio</div>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest text-center">
                  Para el arqueo completo ve a Historial de Ventas
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* VISTA: CHEF / COCINA                                             */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {isChef && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="En cocina ahora" value={String(d.kitchenPending.length)} sub="órdenes pendientes" icon="🔥" color={d.kitchenPending.length > 0 ? 'amber' : 'emerald'} />
            <StatCard label="Producciones hoy" value={String(d.productionToday.length)} sub="órdenes creadas" icon="🏭" color="blue" />
            <StatCard label="Stock bajo" value={String(d.lowStockAlerts.length)} sub="ingredientes bajo mínimo" icon="⚠️" color={d.lowStockAlerts.length > 0 ? 'red' : 'emerald'} />
            <StatCard label="Top producto" value={d.topItems[0]?.name?.substring(0, 12) || '—'} sub={d.topItems[0] ? `${d.topItems[0].quantity} uds` : 'Sin datos'} icon="🏆" color="primary" />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Pedidos en cocina */}
            <div className="capsula-card p-6">
              <SectionTitle icon="🔥" title="Pedidos en Cocina" sub="Enviados y esperando preparación" />
              {d.kitchenPending.length === 0 ? (
                <div className="text-center py-10">
                  <div className="text-4xl mb-3">✅</div>
                  <p className="font-black text-emerald-400">Cocina al día</p>
                  <p className="text-sm text-muted-foreground mt-1">No hay pedidos pendientes</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {d.kitchenPending.map((o, i) => (
                    <div key={i} className="flex justify-between items-center p-3 bg-amber-500/5 rounded-xl border border-amber-500/10">
                      <div>
                        <div className="text-xs font-black text-amber-400">#{o.orderNumber}</div>
                        <div className="text-[10px] text-foreground font-bold">{o.tableName}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-black text-foreground">{o.itemCount} item{o.itemCount !== 1 ? 's' : ''}</div>
                        <div className="text-[9px] text-muted-foreground">Enviado: {o.sentAt}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Producción hoy */}
            <div className="capsula-card p-6">
              <SectionTitle icon="🏭" title="Producción de Hoy" sub="Órdenes de producción del día" />
              {d.productionToday.length === 0 ? (
                <div className="text-center py-10">
                  <div className="text-4xl mb-3">📋</div>
                  <p className="font-black text-foreground">Sin producciones hoy</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {d.productionToday.map((p, i) => (
                    <div key={i} className="flex justify-between items-center p-3 bg-secondary/30 rounded-xl">
                      <div>
                        <div className="text-xs font-black text-foreground uppercase">{p.recipe}</div>
                        <div className="text-[10px] text-muted-foreground">{p.quantity} {p.unit}</div>
                      </div>
                      <span className={`text-[10px] font-black ${PRODUCTION_STATUS[p.status]?.color || 'text-muted-foreground'}`}>
                        {PRODUCTION_STATUS[p.status]?.label || p.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Stock bajo para chef */}
          {d.lowStockAlerts.length > 0 && (
            <div className="capsula-card p-6 border-red-500/10">
              <SectionTitle icon="🚨" title="Ingredientes Bajo Mínimo" sub="Notifica a gerencia para reabastecimiento" />
              <div className="grid sm:grid-cols-2 gap-3">
                {d.lowStockAlerts.map((item, i) => (
                  <div key={i} className="flex justify-between items-center p-3 bg-red-500/5 rounded-xl border border-red-500/10">
                    <div>
                      <div className="text-xs font-black text-foreground uppercase">{item.name}</div>
                      <div className="text-[9px] text-muted-foreground">Mínimo: {item.minimumStock} {item.unit}</div>
                    </div>
                    <div className="text-sm font-black text-red-400 tabular-nums">{item.currentStock.toFixed(1)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* VISTA: AUDITOR                                                   */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {isAuditor && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Ventas hoy" value={`$${fmt(d.today.revenue)}`} sub={`${d.today.orders} órdenes`} icon="💰" color="primary" />
            <StatCard label="Descuentos hoy" value={`$${fmt(d.today.discounts)}`} sub={`${d.discountBreakdown.reduce((s, r) => s + r.count, 0)} aplicados`} icon="🎁" color="amber" />
            <StatCard label="Anulaciones hoy" value={String(d.today.voided)} sub={d.today.voided > 0 ? '⚠️ Revisar abajo' : 'Sin novedad'} icon="🚫" color={d.today.voided > 0 ? 'red' : 'emerald'} />
            <StatCard label="Ajustes del mes" value={String(d.inventoryVariances.length)} sub="movimientos tipo AJUSTE" icon="📝" color="purple" />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Descuentos del día */}
            <div className="capsula-card p-6 border-amber-500/10">
              <SectionTitle icon="🎁" title="Descuentos Aplicados" sub="Solo hoy — todas las sesiones" />
              {d.discountBreakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Sin descuentos hoy ✅</p>
              ) : (
                <div className="space-y-2">
                  {d.discountBreakdown.map((disc, i) => (
                    <div key={i} className="p-3 bg-amber-500/5 rounded-xl border border-amber-500/10">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-black">{DISCOUNT_LABELS[disc.type] || disc.type}</span>
                        <span className="text-sm font-black text-amber-400">-${fmt(disc.total)}</span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-[9px] text-muted-foreground">{disc.count} veces · {disc.authorizedBy ? `Auth: ${disc.authorizedBy}` : 'Sin gerente'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Anulaciones del día */}
            <div className="capsula-card p-6 border-red-500/10">
              <SectionTitle icon="🚫" title="Órdenes Anuladas" sub="Log completo de hoy" />
              {d.voidedOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Sin anulaciones hoy ✅</p>
              ) : (
                <div className="space-y-2">
                  {d.voidedOrders.map((v, i) => (
                    <div key={i} className="p-3 bg-red-500/5 rounded-xl border border-red-500/10">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-black text-red-400">#{v.orderNumber}</span>
                        <span className="text-sm font-black text-red-400">-${fmt(v.total)}</span>
                      </div>
                      <div className="text-[9px] text-muted-foreground mt-1">{v.reason}</div>
                      <div className="text-[9px] text-muted-foreground/60 mt-0.5">Por: {v.voidedBy} · {v.time}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Variaciones de inventario */}
          {d.inventoryVariances.length > 0 && (
            <div className="capsula-card p-6 border-purple-500/10">
              <SectionTitle icon="📝" title="Ajustes de Inventario" sub="Movimientos tipo AJUSTE del mes" />
              <div className="space-y-2">
                {d.inventoryVariances.map((v, i) => (
                  <div key={i} className="flex justify-between items-center p-3 bg-purple-500/5 rounded-xl border border-purple-500/10">
                    <div>
                      <div className="text-xs font-black text-foreground uppercase">{v.name}</div>
                      <div className="text-[9px] text-muted-foreground">{v.date}</div>
                    </div>
                    <span className={`text-sm font-black tabular-nums ${v.variance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {v.variance >= 0 ? '+' : ''}{v.variance.toFixed(2)} {v.unit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Pie de página */}
      <div className="text-center py-4">
        <p className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">
          CAPSULA ERP · Datos en tiempo real · Actualiza la página para refrescar
        </p>
      </div>
    </div>
  );
}
