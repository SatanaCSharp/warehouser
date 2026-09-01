// Pure predicates shared by more than one server feature (server-error-handling.md §1: "multiple
// server features: `apps/server/src/shared/predicates/`"). No NestJS, HTTP or TypeORM import here —
// each feature pairs the condition with its own named error factory.

/** The two columns that decide whether an Item may be named by a *new* reference. Declared here
 * rather than importing `ItemEntity` so this module keeps to arguments and a boolean, with no
 * TypeORM import (server-error-handling.md §1). */
export interface SelectableItemRead {
  readonly warehouseId: string;
  readonly deactivatedAt: Date | null;
}

// AC-03/AC-06d/AC-11 — an Item may be named by a new reference only while it belongs to the acting
// Warehouse and has not been deactivated: AC-06d "stops offering it when demand is recorded **and
// when a draft is assembled**". Both of those are separate features — `customer-orders` recording
// demand and `purchase-drafts` assembling a line — which is exactly why the rule lives here and not
// beside either of them: it was written down twice before, and the two copies are the thing that
// drifts.
//
// It says nothing about references that already exist. AC-06d keeps every Customer Order and every
// Purchase Draft Line that already names a deactivated Item "readable and counting exactly as
// before", so this is only ever consulted for an `itemId` a member has just stated.
//
// A missing Item, one of another Warehouse and a deactivated one are one condition on purpose: all
// three must produce the same non-enumerating refusal (spec.md §6.1). Each caller keeps its own
// error code and status — the two features refuse on their own terms — but they refuse on the same
// condition.
export const isSelectableItem = (
  item: SelectableItemRead | null,
  warehouseId: string,
): boolean =>
  item !== null &&
  item.warehouseId === warehouseId &&
  item.deactivatedAt === null;
