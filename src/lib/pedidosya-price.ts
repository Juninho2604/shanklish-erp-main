/**
 * Calcula el precio PedidosYA aplicando el descuento de ~33.33% (1/3)
 * y redondeando al $0.50 más cercano.
 */
export function calcPedidosYaPrice(basePrice: number): number {
  const raw = basePrice * (1 - 1 / 3);
  return Math.round(raw * 2) / 2;
}
