import isEmpty from 'lodash/isEmpty.js';
import type { EndingConditionSubmission } from 'purchase-drafts/domain/services/arrival-inspection.service';
import type {
  RecordLineEndingConditionInput,
  RecordLineEndingRejectionInput,
} from 'shared/domain/repositories/arrival-confirmation.repository';

// T10 (post-review) — mappings, not rules (`adding-a-server-module.md` §4, `server-architecture.md`
// §"Mappings between shared persistence entities and feature-owned domain objects"): each function
// below turns a caller's raw shape into the one the rules and the repository already expect, and
// decides nothing a rule has not already decided. Called from a use case above the repository
// boundary, exactly as `toSession`/`toSessionEntity` are.

// T13 — the one shape a caller's Pre-receipt Conformance statement takes once the REST boundary has
// narrowed it (`@warehouser/contracts` `PreReceiptConformanceCreate`). Named and exported so both
// ending commands can re-narrow `preReceiptConformance` to it instead of trusting `unknown`, which
// is what makes `tsc` — rather than a runtime assertion here — enforce that the controller passes
// the parsed DTO (T13 requirement).
export interface EndingPreReceiptConformanceInput {
  readonly verdict: EndingConditionSubmission['preReceiptConformance'];
  readonly note?: string | null;
}

// "Nothing stated" has three spellings at the boundary — the property absent, the object absent, and
// the property present as `null` — and all three mean the same thing to every rule below. Reading
// each side through its own named function is what keeps the mapper a list of fields rather than a
// list of defaults.
const statedVerdict = (
  preReceiptConformance: EndingPreReceiptConformanceInput | null | undefined,
): EndingConditionSubmission['preReceiptConformance'] =>
  preReceiptConformance?.verdict ?? null;

const statedConformanceNote = (
  preReceiptConformance: EndingPreReceiptConformanceInput | null | undefined,
): string | null => preReceiptConformance?.note ?? null;

const statedRejections = (
  rejections: readonly RecordLineEndingRejectionInput[] | undefined,
): readonly RecordLineEndingRejectionInput[] => rejections ?? [];

// T10 (post-review) — a caller's condition statement, already narrowed by the REST boundary to the
// shapes both ending commands declare, folded into the one shape every rule judges. Trivial field
// reads only: the narrowing itself now happens once, at the command's own input type (T13), so this
// function decides nothing beyond defaulting an absent property to "nothing stated".
export const toEndingConditionSubmission = (
  receivedQuantity: number,
  rejections: readonly RecordLineEndingRejectionInput[] | undefined,
  preReceiptConformance: EndingPreReceiptConformanceInput | null | undefined,
): EndingConditionSubmission => ({
  receivedQuantity,
  rejections: statedRejections(rejections),
  preReceiptConformance: statedVerdict(preReceiptConformance),
  preReceiptConformanceNote: statedConformanceNote(preReceiptConformance),
});

// T10 (post-review) — the condition half of what `recordLineEnding` persists, derived from the same
// submission the assertions already judged. `null` exactly where the repository's own contract
// requires it: a caller that judged nothing and refused nothing (AC-04a, or an ending that carries no
// condition at all), so the write never risks `chk_purchase_draft_lines_conformance_requires_ending`
// on a zero-quantity ending. The note is forced to `null` whenever no verdict was stated — never
// merely passed through — because `chk_purchase_draft_lines_conformance_note_shape` refuses a note
// standing without one, and a caller stating `preReceiptConformance: { note }` beside a `null`
// verdict must not turn into an unnamed constraint violation.
export const buildEndingConditionInput = (
  submission: EndingConditionSubmission,
): RecordLineEndingConditionInput | null =>
  submission.preReceiptConformance === null && isEmpty(submission.rejections)
    ? null
    : {
        preReceiptConformance: submission.preReceiptConformance,
        preReceiptConformanceNote:
          submission.preReceiptConformance === null
            ? null
            : submission.preReceiptConformanceNote,
        rejections: submission.rejections,
      };
