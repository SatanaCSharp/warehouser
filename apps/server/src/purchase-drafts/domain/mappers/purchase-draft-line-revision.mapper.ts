import type { PurchaseDraftLineUpdate } from '@warehouser/contracts/purchase-drafts';
import type { ReviseLineInput } from 'purchase-drafts/usecases/commands/revise-purchase-draft-line.command';

// openapi.yaml `PurchaseDraftLineUpdate` -> `ReviseLineInput` — the payload's two flat destination
// properties folded into the **one** the use-case boundary takes. The contract's `dependentRequired`
// is expressed there as a type, so "an address with no mode" is unrepresentable above this line
// rather than a case every caller has to remember; the payload schema has already refused it at 400
// in any event.
//
// Structural only: the two flat payload fields fold into one `destination`, and a payload that states
// no `deliveryMode` states no destination at all, so the line's own is left exactly as it was.
// Clearing the address when the mode is `via_warehouse` (AC-13, openapi.yaml "setting `via_warehouse`
// clears it") is the *command's* rule and is decided by `statedDestination` inside its transaction —
// a controller holds no business rule (adding-a-server-module.md §4, §"Common failures").
//
// Lives here rather than in `PurchaseDraftsController`, where it was declared: a `to*` mapping
// belongs in `domain/mappers/` (code-review-back-end-2026-09-09.md).
export const toReviseLineInput = (
  input: PurchaseDraftLineUpdate,
): ReviseLineInput => ({
  itemId: input.itemId,
  orderedQuantity: input.orderedQuantity,
  packagingTypeId: input.packagingTypeId,
  valueAddingNote: input.valueAddingNote,
  destination:
    input.deliveryMode === undefined
      ? undefined
      : {
          deliveryMode: input.deliveryMode,
          customerDeliveryAddressId: input.customerDeliveryAddressId ?? null,
        },
});
