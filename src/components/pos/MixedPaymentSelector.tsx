'use client';

import { useState, useEffect, useCallback } from 'react';

export interface PaymentLine {
  id: string;
  method: string;
  amountUSD: number;
  amountBS?: number;
  exchangeRate?: number;
  reference?: string;
}

interface Props {
  totalAmount: number;
  exchangeRate?: number | null;
  onChange: (lines: PaymentLine[], totalPaid: number, isComplete: boolean) => void;
  disabled?: boolean;
  /** If true, shows the CORTESIA method button */
  allowCortesia?: boolean;
}

const METHODS = [
  { id: 'CASH',       label: '💵 Efectivo $' },
  { id: 'CASH_BS',    label: '💴 Efectivo Bs' },
  { id: 'ZELLE',      label: '⚡ Zelle' },
  { id: 'CARD',       label: '💳 Punto' },
  { id: 'MOBILE_PAY', label: '📱 P.Móvil' },
  { id: 'TRANSFER',   label: '🏦 Transf.' },
  { id: 'CORTESIA',   label: '🎁 Cortesía' },
] as const;

/** These methods are paid in Bs — show conversion when exchangeRate available */
const BS_METHODS = new Set(['CASH_BS', 'CARD', 'MOBILE_PAY', 'TRANSFER']);

function methodLabel(id: string) {
  return METHODS.find((m) => m.id === id)?.label ?? id;
}

export default function MixedPaymentSelector({
  totalAmount,
  exchangeRate,
  onChange,
  disabled,
  allowCortesia = false,
}: Props) {
  const [lines, setLines] = useState<PaymentLine[]>([]);

  const totalPaid = lines.reduce((s, l) => s + l.amountUSD, 0);
  const remaining = Math.max(0, totalAmount - totalPaid);
  const overpay   = Math.max(0, totalPaid - totalAmount);
  const isComplete = totalPaid >= totalAmount - 0.001;

  // Notify parent whenever lines change
  const notify = useCallback(
    (nextLines: PaymentLine[]) => {
      const paid = nextLines.reduce((s, l) => s + l.amountUSD, 0);
      const complete = paid >= totalAmount - 0.001;
      onChange(nextLines, paid, complete);
    },
    [totalAmount, onChange]
  );

  const addLine = (method: string) => {
    if (disabled) return;
    const autoAmount = remaining > 0.001 ? parseFloat(remaining.toFixed(2)) : 0;
    const newLine: PaymentLine = {
      id: `${method}-${Date.now()}`,
      method,
      amountUSD: autoAmount,
      amountBS: (BS_METHODS.has(method) && exchangeRate && autoAmount > 0)
        ? parseFloat((autoAmount * exchangeRate).toFixed(0))
        : undefined,
      exchangeRate: BS_METHODS.has(method) && exchangeRate ? exchangeRate : undefined,
    };
    const next = [...lines, newLine];
    setLines(next);
    notify(next);
  };

  const updateLine = (id: string, field: 'amountUSD' | 'reference', value: string) => {
    const next = lines.map((l) => {
      if (l.id !== id) return l;
      if (field === 'amountUSD') {
        const usd = parseFloat(value) || 0;
        return {
          ...l,
          amountUSD: usd,
          amountBS: (BS_METHODS.has(l.method) && exchangeRate && usd > 0)
            ? parseFloat((usd * exchangeRate).toFixed(0))
            : undefined,
        };
      }
      return { ...l, reference: value };
    });
    setLines(next);
    notify(next);
  };

  const removeLine = (id: string) => {
    const next = lines.filter((l) => l.id !== id);
    setLines(next);
    notify(next);
  };

  // No auto-reset on totalAmount change — parent controls reset via key prop

  const visibleMethods = allowCortesia
    ? METHODS
    : METHODS.filter((m) => m.id !== 'CORTESIA');

  return (
    <div className="space-y-3">
      {/* Method buttons */}
      <div className="grid grid-cols-3 gap-1.5">
        {visibleMethods.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => addLine(m.id)}
            disabled={disabled}
            className="py-2.5 px-1 rounded-xl text-[10px] font-black uppercase tracking-tight bg-card border border-border text-foreground/60 hover:border-primary/50 hover:text-foreground active:scale-95 transition-all disabled:opacity-40"
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Payment lines */}
      {lines.length > 0 && (
        <div className="space-y-2">
          {lines.map((line) => (
            <div
              key={line.id}
              className="flex items-center gap-2 bg-card border border-border rounded-xl p-2 text-sm"
            >
              <span className="w-20 shrink-0 text-[10px] font-black text-foreground/70 uppercase leading-tight">
                {methodLabel(line.method)}
              </span>

              {/* USD amount */}
              <div className="flex items-center flex-1 bg-background rounded-lg border border-border px-2">
                <span className="text-xs text-muted-foreground mr-1">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.amountUSD || ''}
                  onChange={(e) => updateLine(line.id, 'amountUSD', e.target.value)}
                  disabled={disabled}
                  placeholder="0.00"
                  className="flex-1 bg-transparent text-sm font-black focus:outline-none py-1.5 w-0"
                />
              </div>

              {/* Bs conversion for Bs methods */}
              {BS_METHODS.has(line.method) && exchangeRate && line.amountUSD > 0 && (
                <span className="text-[10px] text-emerald-400 shrink-0 font-bold">
                  Bs&nbsp;{(line.amountUSD * exchangeRate).toLocaleString('es-VE', { maximumFractionDigits: 0 })}
                </span>
              )}

              {/* Remove */}
              <button
                type="button"
                onClick={() => removeLine(line.id)}
                disabled={disabled}
                className="text-muted-foreground hover:text-destructive transition-colors text-xl leading-none px-0.5"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Balance footer */}
      {lines.length > 0 && (
        <div
          className={`flex justify-between items-center text-sm px-3 py-2 rounded-xl font-bold ${
            isComplete
              ? overpay > 0.001
                ? 'bg-amber-500/10 text-amber-400'
                : 'bg-emerald-500/10 text-emerald-400'
              : 'bg-secondary text-muted-foreground'
          }`}
        >
          {overpay > 0.001 ? (
            <>
              <span>Vuelto</span>
              <span className="font-black">${overpay.toFixed(2)}</span>
            </>
          ) : isComplete ? (
            <>
              <span>Completado</span>
              <span>✓</span>
            </>
          ) : (
            <>
              <span>Pendiente</span>
              <span className="font-black text-amber-400">${remaining.toFixed(2)}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
