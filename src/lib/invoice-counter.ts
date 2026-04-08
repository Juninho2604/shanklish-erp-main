import prisma from '@/server/db';

export type InvoiceChannel =
  | 'DELIVERY'
  | 'PICKUP'
  | 'RESTAURANT'
  | 'PEDIDOS_YA'
  | 'OPEN_TAB'
  | 'GAME_SESSION';

const PREFIX: Record<InvoiceChannel, string> = {
  DELIVERY:     'DEL',
  PICKUP:       'PKP',
  RESTAURANT:   'REST',
  PEDIDOS_YA:   'PYA',
  OPEN_TAB:     'TAB',
  GAME_SESSION: 'GSN',
};

/**
 * Retorna el siguiente correlativo global para el canal dado.
 * Usa una transacción atómica (upsert + increment) para garantizar
 * unicidad sin reseteo diario.
 *
 * Ejemplos: REST-0101, DEL-0042, PYA-0007
 */
export async function getNextCorrelativo(channel: InvoiceChannel): Promise<string> {
  const counter = await prisma.$transaction(async (tx) => {
    return tx.invoiceCounter.upsert({
      where:  { channel },
      update: { lastValue: { increment: 1 } },
      create: { channel, lastValue: 101 },
    });
  });
  const prefix = PREFIX[channel];
  return `${prefix}-${String(counter.lastValue).padStart(4, '0')}`;
}
