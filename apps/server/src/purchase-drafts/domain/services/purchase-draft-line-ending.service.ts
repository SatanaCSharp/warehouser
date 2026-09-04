import { assert } from '@warehouser/utils/asserts';
import {
  purchaseDraftEndingAlreadyRecordedError,
  purchaseDraftEndingModeMismatchError,
  purchaseDraftInvalidStateError,
  purchaseDraftTargetUnavailableError,
} from 'purchase-drafts/domain/errors/purchase-draft.errors';
import {
  endingMatchesDeliveryMode,
  hasEndingRecorded,
} from 'purchase-drafts/domain/predicates/purchase-draft-delivery.predicates';
import { isReadyForOrderingDraft } from 'purchase-drafts/domain/predicates/purchase-draft-freeze.predicates';
import type { EndingKind } from 'purchase-drafts/domain/value-objects/delivery-mode';
import type { LockPurchaseDraftLineForEndingResult } from 'shared/domain/repositories/arrival-confirmation.repository';

// T17/ADR 0002 — the rules a per-line ending must satisfy before anything is written, stated once
// for the two commands that own the two halves.
//
// It is shared because there are exactly **two** callers. The kind of ending is a routing fact, so
// `ConfirmPurchaseDraftLineArrivalCommand` and `RecordPurchaseDraftLineDeliveryCommand` are
// genuinely distinct use cases reached by distinct routes — but the guard sequence they run is one
// rule set, and duplicating it would let the two halves drift into disagreeing about what a line
// admits. Two callers is what earns it a home of its own; needing no collaborator is what keeps it
// a function rather than an injectable service (server-architecture.md §Services).
//
// It is not a wrapper: it does not surround either `execute`, takes no callback and returns no
// result the caller passes through (server-use-case-boundaries.md §1). It answers one question —
// "may this line take this ending?" — over rows the caller has already read, and the caller keeps
// its own transaction, its own writes and its own delegation to `customer-orders`.
// Ordered so that each refusal is only reachable once the more fundamental one has passed, which
// is what keeps them from disclosing each other: a line of another Warehouse must read as
// "unavailable" rather than reaching a mode comparison that would confirm it exists.
//
// A module-level `function` rather than a method on an injectable class: it needs no collaborator,
// so server-architecture.md §Services keeps it out of a service ("stateless helpers stay
// module-level … putting them on the class would force commands that need only them to take the
// whole service"), exactly as `assertApplied` in `purchase-draft-assembly.service.ts` already is.
// `function` and not an arrow const because TypeScript only accepts an assertion signature on a
// declaration or an explicitly annotated name.
export function assertAdmitsEnding(
  locked: LockPurchaseDraftLineForEndingResult,
  endingKind: EndingKind,
): asserts locked is LockPurchaseDraftLineForEndingResult & {
  draft: NonNullable<LockPurchaseDraftLineForEndingResult['draft']>;
  line: NonNullable<LockPurchaseDraftLineForEndingResult['line']>;
} {
  // One refusal for a draft that is not this Warehouse's, a line that is not this draft's, and a
  // line that does not exist — spec.md §6.1, so no refusal enumerates what exists elsewhere.
  assert(
    locked.draft !== null && locked.line !== null,
    purchaseDraftTargetUnavailableError(),
  );

  // sad.md §6.10 step 2 — a draft already Closed, closed with a reason or discarded never reaches
  // the guarded write. A concurrent last ending that closes it between this read and the write is
  // the *other* answer, and `recordLineEnding` reports it separately.
  assert(
    isReadyForOrderingDraft(locked.draft.state),
    purchaseDraftInvalidStateError(),
  );

  // AC-20a before AC-20: a line whose ending is already recorded is refused on that ground
  // whichever route was used, so a member who picked the wrong half of a line they had already
  // ended is told the more useful of the two facts.
  // Passed as a thunk, not a value: `assert` evaluates an error argument eagerly, and this payload
  // dereferences the very columns the condition proves are present — building it on the happy path
  // would throw a `TypeError` on every line that has no ending yet.
  const line = locked.line;
  assert(!hasEndingRecorded(line.endingRecordedAt), () =>
    purchaseDraftEndingAlreadyRecordedError({
      // Safe by `chk_purchase_draft_lines_ending_attribution`: the four ending columns are written
      // as a set, so a recorded instant guarantees the kind and the member beside it.
      endingKind: line.endingKind!,
      endingRecordedByUserId: line.endingRecordedByUserId!,
      endingRecordedAt: line.endingRecordedAt!,
    }),
  );

  // AC-20 — and the refusal names how the goods actually travelled, not which route was called,
  // because that is the fact the member is missing.
  assert(
    endingMatchesDeliveryMode(locked.line.deliveryMode, endingKind),
    purchaseDraftEndingModeMismatchError(locked.line.deliveryMode),
  );
}
