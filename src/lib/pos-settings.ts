/**
 * Configuración POS - almacenada en localStorage (por estación de trabajo).
 * Permite activar/desactivar impresión de comanda y factura en cada módulo.
 */

const STORAGE_KEY = 'shanklish_pos_config';

export interface POSConfig {
  /** Imprimir comanda cocina al confirmar Delivery */
  printComandaOnDelivery: boolean;
  /** Imprimir factura automáticamente al confirmar Delivery */
  printReceiptOnDelivery: boolean;
  /** Imprimir comanda cocina al enviar a mesa (Restaurante) */
  printComandaOnRestaurant: boolean;
  /** Imprimir factura al cerrar cuenta (Restaurante) */
  printReceiptOnRestaurant: boolean;
}

const DEFAULTS: POSConfig = {
  printComandaOnDelivery: false,
  printReceiptOnDelivery: true,
  printComandaOnRestaurant: true,
  printReceiptOnRestaurant: true,
};

export function getPOSConfig(): POSConfig {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<POSConfig>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

export function setPOSConfig(updates: Partial<POSConfig>): POSConfig {
  const current = getPOSConfig();
  const next = { ...current, ...updates };
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}
