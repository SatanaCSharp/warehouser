import type { RejectionReasonEntity } from 'shared/domain/entities/rejection-reason.entity.js';

/**
 * AC-06/AC-07 — one Rejection Reason as this feature serves it: what the member picks from, and
 * nothing the catalogue keeps for itself (`createdAt`, `updatedAt`).
 *
 * Feature-owned rather than the persistence entity, because `server-architecture.md` §"Use cases" is
 * explicit that a use case "must not depend on … TypeORM entities" — `ListRejectionReasonsQuery`
 * previously returned `RejectionReasonEntity[]` and the controller mapped the `@Entity`-decorated
 * class in its own body (code-review-back-end-2026-09-09.md).
 */
export interface RejectionReasonCatalogueItem {
  readonly id: string;
  readonly label: string;
  readonly requiresDescription: boolean;
}

// The one place the catalogue's persistence entity becomes the catalogue this feature serves,
// invoked from the query above the repository boundary (server-architecture.md §"Layer
// responsibilities → Domain").
export const toRejectionReasonCatalogueItem = (
  entry: RejectionReasonEntity,
): RejectionReasonCatalogueItem => ({
  id: entry.id,
  label: entry.label,
  requiresDescription: entry.requiresDescription,
});
