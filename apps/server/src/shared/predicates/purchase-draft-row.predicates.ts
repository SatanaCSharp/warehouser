import type { PurchaseDraftLineDeliveryMode } from 'shared/domain/entities/purchase-draft-line.entity';

/** Questions a shared repository asks about a Purchase Draft row it has just read.
 *
 * The same question exists in the domain — `purchase-drafts/domain/predicates/` asks
 * `travelsViaWarehouse` over the Delivery Mode value object — and this is deliberately not that
 * import: `shared/domain/repositories/` must not depend on a feature module
 * (server-architecture.md §"Dependency direction", enforced by `repository-boundaries.spec.ts`).
 * What is shared between them is the column's literal, which the entity owns and both sides read. */

/** Whether the row's line travels to the Warehouse's own Delivery Address rather than straight to a
 * Customer's — the branch that decides which address a frozen capture records. */
export const rowTravelsViaWarehouse = (
  deliveryMode: PurchaseDraftLineDeliveryMode,
): boolean => deliveryMode === 'via_warehouse';
