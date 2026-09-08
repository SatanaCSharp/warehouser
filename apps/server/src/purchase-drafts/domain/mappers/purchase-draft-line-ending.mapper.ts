import { isEmpty } from 'lodash';
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

// T10 — a caller's raw condition statement, narrowed to the one shape every rule judges. The two
// ending commands accept `rejections`/`preReceiptConformance` loosely (`unknown`) because narrowing
// a request body to these shapes belongs to the REST boundary (`@warehouser/contracts`), not to a
// second, duplicate narrowing here; this is the one place that trust is spent, exactly as far as
// `EndingConditionSubmission` itself already goes.
export const toEndingConditionSubmission = (
  receivedQuantity: number,
  rejections: readonly unknown[] | undefined,
  preReceiptConformance: unknown,
): EndingConditionSubmission => {
  const parsedConformance = preReceiptConformance as
    | {
        readonly verdict: EndingConditionSubmission['preReceiptConformance'];
        readonly note?: string | null;
      }
    | null
    | undefined;

  return {
    receivedQuantity,
    rejections: (rejections ?? []) as readonly RecordLineEndingRejectionInput[],
    preReceiptConformance: parsedConformance?.verdict ?? null,
    preReceiptConformanceNote: parsedConformance?.note ?? null,
  };
};

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
