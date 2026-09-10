import type {
  PurchaseDraftLineArrival,
  PurchaseDraftLineUpdate,
} from '@warehouser/contracts/purchase-drafts';
import type { EndingPreReceiptConformanceInput } from 'purchase-drafts/domain/mappers/purchase-draft-line-ending.mapper.js';
import type { ReviseLineInput } from 'purchase-drafts/usecases/commands/revise-purchase-draft-line.command.js';
import type { RecordLineEndingRejectionInput } from 'shared/domain/repositories/arrival-confirmation.repository.js';

// Wire shape -> use-case input. `server-architecture.md` §REST assigns this translation to the REST
// layer, which is why these three live here rather than under `domain/mappers/`: the 2026-09-09
// back-end review moved them inward to get them out of the controller body, and the repo-root gate
// `tests/delivery-addresses/identity-coverage.spec.mjs` §"controllers call use cases only" then went
// red because a controller may not name a `<module>/domain/` symbol at all
// (`_review/review-2026-09-09.md`, finding 1). Extracting them from the controller was right; the
// destination was not. `domain/mappers/` keeps the mappings a **use case** calls.
//
// Every import above is type-only, so nothing here reaches into the domain at runtime.

// openapi.yaml `PurchaseDraftLineArrival` -> the shape both ending commands declare, narrowed
// **once**. Typed off the contract rather than off `PurchaseDraftLineArrivalDto` so the mapping
// follows the published contract rather than the DTO class that happens to implement it.
//
// `description ?? null` is the one gap between the wire shape — `proseSchema` optional — and
// `RecordLineEndingRejectionInput`'s own `string | null`; every other field passes through unchanged.
export const toEndingRejectionInputs = (
  rejections: PurchaseDraftLineArrival['rejections'],
): readonly RecordLineEndingRejectionInput[] | undefined =>
  rejections?.map((rejection) => ({
    rejectionReasonId: rejection.rejectionReasonId,
    quantity: rejection.quantity,
    source: rejection.source,
    description: rejection.description ?? null,
  }));

export const toEndingPreReceiptConformanceInput = (
  preReceiptConformance: PurchaseDraftLineArrival['preReceiptConformance'],
): EndingPreReceiptConformanceInput | null | undefined =>
  preReceiptConformance === undefined
    ? undefined
    : {
        verdict: preReceiptConformance.verdict,
        note:
          'note' in preReceiptConformance ? preReceiptConformance.note : null,
      };

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
