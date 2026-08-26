import { uniq } from 'lodash';

// Pure predicates behind Arrival Confirmation's payload guards (server-error-handling.md §1:
// arguments only, boolean return, no I/O, no error construction).

// AC-15/spec.md §6.1 "Allocation as a back door onto a frozen record" and the "Cross-Warehouse
// demand reach" abuse case — a confirmation may record a received quantity only against the lines
// of the draft it names. This is what `lockDraftForArrival` reads the lines *for*: without it the
// submitted identifiers reach the UPDATE unchecked, and a member holding `PURCHASE_DRAFTS:RECEIVE`
// in one Warehouse can write a received quantity onto another Warehouse's frozen line, or onto an
// already Closed draft of their own, bypassing the AC-17b guard that protects it.
export const namesOnlyLinesOfTheDraft = (
  submittedLineIds: readonly string[],
  draftLineIds: ReadonlySet<string>,
): boolean => submittedLineIds.every((id) => draftLineIds.has(id));

// AC-18 — "assigns across the linked Customer Orders of one line more than the quantity they
// recorded as arrived for that line" is a bound on the *line*, not on one entry of the payload.
// Naming a line twice would split its assignments across two entries, each passing the bound alone
// while together they allocate more than arrived, and would leave the line's received quantity
// decided by whichever entry was written last.
export const namesEachLineOnce = (
  submittedLineIds: readonly string[],
): boolean => uniq(submittedLineIds).length === submittedLineIds.length;

// AC-17/AC-17b and openapi.yaml `ArrivalConfirmation.lines` (`minItems: 1`) — a confirmation states
// what arrived. Both predicates above are vacuously true on an empty array, so without this one an
// empty payload closes the draft with its arrival attribution set and every `received_quantity`
// still `null`: a Closed draft recording that nothing arrived, which is not the same statement as
// a line explicitly recording `0` (data-model.md `received_quantity`). The contract's `minItems`
// is a transport-tier guard; this is the domain invariant behind it.
export const recordsAtLeastOneLine = (
  submittedLineIds: readonly string[],
): boolean => submittedLineIds.length > 0;
