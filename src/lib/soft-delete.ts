// ============================================================================
// SOFT DELETE HELPERS
// ============================================================================
// Usar en TODAS las queries para filtrar registros eliminados.
// Política: Nunca usar prisma.model.delete(). Siempre soft delete.
// ============================================================================

/**
 * Filtro estándar para excluir registros soft-deleted.
 * Usar en el `where` de findMany, findFirst, count, etc.
 *
 * @example
 * const items = await prisma.inventoryItem.findMany({
 *   where: { ...notDeleted, isActive: true }
 * });
 */
export const notDeleted = { deletedAt: null } as const;

/**
 * Realiza un soft delete en cualquier modelo que tenga deletedAt/deletedById.
 *
 * @example
 * await softDelete(prisma.inventoryItem, itemId, currentUserId);
 */
export async function softDelete<T extends { update: Function }>(
  model: T,
  id: string,
  deletedById: string
) {
  return (model as any).update({
    where: { id },
    data: {
      deletedAt: new Date(),
      deletedById,
    },
  });
}

/**
 * Restaura un registro soft-deleted.
 *
 * @example
 * await restoreSoftDelete(prisma.inventoryItem, itemId);
 */
export async function restoreSoftDelete<T extends { update: Function }>(
  model: T,
  id: string
) {
  return (model as any).update({
    where: { id },
    data: {
      deletedAt: null,
      deletedById: null,
    },
  });
}
