import {
  type DeliveryMode,
  type EndingKind,
  endingKindFor,
} from 'purchase-drafts/domain/value-objects/delivery-mode';

// Pure predicates for a line's destination, its ending and the draft's closure
// (server-error-handling.md §1). No NestJS, HTTP or TypeORM import here — see
// `purchase-drafts/domain/errors/purchase-draft.errors.ts` for the named error factories that pair
// with these conditions, and the commands that own each write for their enforcement via `assert`.

// Named for the rule it states, not for one branch of it: a Via Warehouse line satisfies it
// vacuously, because naming no customer address is the whole meaning of that mode.
// AC-14 — "goods shipped to their own site are travelling Via Warehouse, so a Direct to Customer
// line names a customer's address".
//
// This is a rule about the member's **submitted intent**, not a string comparison against the
// Warehouse's address and not an identifier for it: the Warehouse's own Delivery Address is columns
// on `warehouses` and has none that `customer_delivery_address_id` could hold (data-model.md
// §`purchase_draft_lines`, openapi.yaml `PurchaseDraftLineUpdate.customerDeliveryAddressId`). So the
// only way to state "travelling Direct to Customer, to my own site" is to name no Customer Delivery
// Address, and that is what this refuses. A Via Warehouse line never trips it — naming no address is
// the whole meaning of the mode (AC-13) — and whether such a line may nonetheless carry one is
// `chk_purchase_draft_lines_delivery_mode_address`, a schema fact rather than a rule a command
// remembers.
export const directLineNamesACustomerAddress = (
  deliveryMode: DeliveryMode,
  customerDeliveryAddressId: string | null,
): boolean =>
  deliveryMode !== 'direct_to_customer' || customerDeliveryAddressId !== null;

// AC-20 — an Arrival Confirmation belongs to a Via Warehouse line and a Direct Delivery to a Direct
// to Customer one. Both directions refuse: a dock arrival against a directly-shipped line, and a
// delivery to the customer against a line that came to the dock. Stated over the correspondence in
// the value object so the rule exists once (`chk_purchase_draft_lines_ending_matches_mode` is the
// same statement in the schema).
export const endingMatchesDeliveryMode = (
  deliveryMode: DeliveryMode,
  endingKind: EndingKind,
): boolean => endingKind === endingKindFor(deliveryMode);

// AC-20a — a line's ending is recorded at most once. The quantity, the kind, the member and the
// time "arrive together or not at all" (`chk_purchase_draft_lines_ending_attribution`), so the
// recorded instant alone decides whether there is an ending. The quantity cannot serve: a line where
// nothing arrived records `0`, which is an ending, while `null` would read as none.
export const hasEndingRecorded = (endingRecordedAt: Date | null): boolean =>
  endingRecordedAt !== null;

// AC-19/sad.md §6.10 step 5 — the draft stays in Ready for Ordering while any of its lines has no
// ending, and moves to Closed with the ending of its last one. The length check is not defensive
// padding: `every` is vacuously true on an empty array, and a draft holding no lines would then
// close on the strength of nothing. Such a draft cannot be frozen at all (AC-14a), so "every line
// has an ending" is false for it rather than true.
export const everyLineHasAnEnding = (
  lineEndingRecordedAts: readonly (Date | null)[],
): boolean =>
  lineEndingRecordedAts.length > 0 &&
  lineEndingRecordedAts.every(hasEndingRecorded);
