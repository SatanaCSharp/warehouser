// Pure predicates for Purchase Draft assembly (server-error-handling.md §1). No NestJS, HTTP or
// TypeORM import here — see `purchase-drafts/domain/errors/purchase-draft.errors.ts` for the named
// error factories that pair with these conditions.

// data-model.md `purchase_draft_lines.ordered_quantity` — `> 0`, a positive whole number.
export const isOrderedQuantity = (quantity: number): boolean =>
  Number.isInteger(quantity) && quantity > 0;

// data-model.md `purchase_draft_line_links.stated_quantity` — `> 0`, a positive whole number.
// AC-11a — a link's stated quantity is never reconciled with the line quantity, the Customer Order
// or any other link, so this predicate takes only the value itself.
export const isStatedQuantity = (quantity: number): boolean =>
  Number.isInteger(quantity) && quantity > 0;

// AC-10a/AC-15 — a draft accepts assembly writes only while it is in the `draft` state.
export const isDraftMutable = (state: string): boolean => state === 'draft';

// AC-06d/AC-11 — whether the Item a line names may be named at all is `isSelectableItem` in
// `shared/predicates/item-availability.predicates.ts`, not here: `customer-orders` applies the same
// rule when demand is recorded, and a predicate more than one feature exercises belongs in
// `shared/predicates/` (server-error-handling.md §1).

// AC-13 — a Packaging Type is legal only when it is one of the catalogue's entries.
export const isKnownPackagingType = (
  packagingTypeId: string,
  catalogueIds: readonly string[],
): boolean => catalogueIds.includes(packagingTypeId);
