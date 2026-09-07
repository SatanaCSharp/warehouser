import { countBy, intersection, keys, pickBy, sum, uniq } from 'lodash';
import { type DeliveryMode } from 'purchase-drafts/domain/value-objects/delivery-mode';
import {
  PreReceiptConformanceVerdict,
  REJECTION_DISPOSITIONS,
  RejectionDisposition,
  type RejectionSource,
  requiredSourceFor,
} from 'purchase-drafts/domain/value-objects/line-condition';

// Pure predicates for a line's Condition Split, its Pre-receipt Conformance and a Rejection's
// Disposition (server-error-handling.md §1): every value arrives as an argument, nothing is
// mutated, read from a repository, logged or thrown. Each states **one** rule of sad.md §6.1
// steps 5–6 in isolation — collecting the violations of a whole submission in one pass belongs to
// the ending command — and each pairs with a named violation or error factory in
// `purchase-drafts/domain/errors/purchase-draft.errors.ts`.
//
// No NestJS, HTTP or TypeORM import here (server-architecture.md §Domain), and no reference to any
// seeded identifier that is catalogue **data**: AC-07's description requirement is the catalogue's
// `requires_description` flag, so the flagged Reason is carried in as an argument rather than
// hard-coded (spec.md §6 "Catalogue integrity").

// The Rejection Reason catalogue as a predicate needs it: what it offers, and which of its entries
// always require prose (data-model.md §`rejection_reasons`). Read by the command that already holds
// the catalogue, never fetched here.
export type RejectionReasonCatalogueEntry = {
  id: string;
  requiresDescription: boolean;
};

// AC-14/AC-15b — one bound, shared by a refusal's description and by the Conformance note
// (`chk_purchase_draft_line_rejections_description_length`,
// `chk_purchase_draft_lines_conformance_note_length`, both `char_length`).
export const MAX_PROSE_LENGTH = 1000;

// The two Reasons a Met verdict cannot stand beside, because refusing for either **is** the
// instruction not being met (AC-16). Unlike AC-07's flag these are named by the acceptance criterion
// itself and by openapi.yaml's `met_contradicts_rejection` example; no catalogue column marks them,
// so naming them here is stating the rule rather than freezing data.
const INSTRUCTION_REJECTION_REASON_IDS = [
  'packaging_not_as_instructed',
  'value_adding_note_not_applied',
] as const;

// AC-03 — a refused quantity is a whole number of at least one. `quantity` is INTEGER with
// `chk_purchase_draft_line_rejections_quantity_positive`; stating it in the domain is what lets the
// member be told the rule instead of meeting a constraint violation. `Number.isInteger` refuses NaN
// and both infinities as well as a fraction.
export const isWholeRefusedQuantity = (quantity: number): boolean =>
  Number.isInteger(quantity) && quantity >= 1;

// AC-02 — the line's refusals summed. A cross-row aggregate no `CHECK` can compute
// (data-model.md § "Constraints the model deliberately does not express"), which is why the rule
// lives in the domain at all.
export const totalRefusedQuantity = (quantities: readonly number[]): number =>
  sum(quantities);

// AC-02 — no more can be refused than was presented. Refusing everything presented is legal: the
// whole delivery was unfit.
export const refusalsWithinPresented = (
  receivedQuantity: number,
  rejectedQuantity: number,
): boolean => rejectedQuantity <= receivedQuantity;

// AC-09 — one line carries one refusal per Reason
// (`uq_purchase_draft_line_rejections_line_reason`).
export const hasOneRefusalPerReason = (
  rejectionReasonIds: readonly string[],
): boolean => uniq(rejectionReasonIds).length === rejectionReasonIds.length;

// AC-09 — the Reasons the line repeats, each named once however many times it repeats, so the
// refusal points at the duplicate rather than merely reporting that one exists.
export const duplicatedRejectionReasonIds = (
  rejectionReasonIds: readonly string[],
): readonly string[] =>
  keys(pickBy(countBy(rejectionReasonIds), (occurrences) => occurrences > 1));

// AC-06 — a Reason the catalogue does not offer is refused. The catalogue is extend-only data
// passed in by the command, so what is offered is whatever it holds at that moment.
export const isOfferedRejectionReason = (
  rejectionReasonId: string,
  catalogue: readonly RejectionReasonCatalogueEntry[],
): boolean => catalogue.some((entry) => entry.id === rejectionReasonId);

// AC-07 — "this reason always requires a description of what was wrong", decided from the
// catalogue's `requires_description` flag and from nothing else. Blank prose is no prose: the
// contract trims, and a description of spaces would satisfy a length check while telling the buyer
// nothing.
export const satisfiesDescriptionRequirement = (
  rejectionReason: RejectionReasonCatalogueEntry,
  description: string | null,
): boolean =>
  !rejectionReason.requiresDescription || (description ?? '').trim().length > 0;

// AC-25 and its mirror (sad.md §6.2) — a refusal on goods that came to our own dock carries the
// inspected Source, and only directly delivered goods carry a customer's report. Stated over the
// correspondence in the value object rather than over one branch of it, so both directions refuse
// by the same rule (`chk_purchase_draft_line_rejections_source_matches_mode` is the same statement
// in the schema).
export const sourceMatchesDeliveryMode = (
  deliveryMode: DeliveryMode,
  source: RejectionSource,
): boolean => source === requiredSourceFor(deliveryMode);

// AC-14/AC-15b — prose is bounded at one thousand **characters**. Measured in code points, as
// `char_length` and `proseSchema` in `@warehouser/contracts` both measure it: a `String.length`
// bound would refuse a member's prose at half the stated limit above the BMP.
export const isWithinProseBound = (prose: string): boolean =>
  [...prose].length <= MAX_PROSE_LENGTH;

// AC-04a — a line where nothing was received records neither judgement: no condition breakdown and
// no judgement of the supplier's instruction. This is
// `chk_purchase_draft_lines_conformance_requires_ending` (`ending_quantity > 0`) reached before the
// constraint can surface as an unnamed violation, and it refuses **every** verdict, Not applicable
// included.
export const conditionOnlyWhereSomethingReceived = (
  receivedQuantity: number,
  carriesCondition: boolean,
): boolean => receivedQuantity > 0 || !carriesCondition;

// AC-17/AC-17a — whether the line was frozen carrying an instruction. Both halves live on the line's
// own row, which is what makes the conformance rules decidable without reading anything else
// (data-model.md §`purchase_draft_lines`).
export const lineCarriesFrozenInstruction = (
  frozenPackagingTypeId: string | null,
  frozenValueAddingNote: string | null,
): boolean => frozenPackagingTypeId !== null || frozenValueAddingNote !== null;

// AC-17a — a line frozen carrying an instruction must be judged as honoured or not honoured, so
// "the judgement does not apply" belongs only to a line that was given none. It states this one
// thing: it never refuses a verdict it is not about.
export const notApplicableOnlyOnUninstructedLine = (
  verdict: PreReceiptConformanceVerdict,
  carriesFrozenInstruction: boolean,
): boolean =>
  verdict !== PreReceiptConformanceVerdict.NotApplicable ||
  !carriesFrozenInstruction;

// AC-17 — the mirror: a line frozen carrying no instruction can only record that the judgement does
// not apply. Two predicates rather than one because openapi.yaml names the two violations
// separately, and each refusal tells the member a different thing to change.
export const judgementOnlyOnInstructedLine = (
  verdict: PreReceiptConformanceVerdict,
  carriesFrozenInstruction: boolean,
): boolean =>
  verdict === PreReceiptConformanceVerdict.NotApplicable ||
  carriesFrozenInstruction;

// AC-16 — the refusals on the line that contradict a Met verdict, in the order the line carries
// them, so the refusal names which of the two statements to change.
export const instructionRefusalReasonIdsAmong = (
  rejectionReasonIds: readonly string[],
): readonly string[] =>
  intersection(rejectionReasonIds, INSTRUCTION_REJECTION_REASON_IDS);

// AC-16 — a refusal for packaging not as instructed or a value-adding note not applied **is** the
// instruction not being met, so Met cannot stand beside one. Not met beside such a refusal is the
// two statements agreeing, and Not applicable is AC-17a's rule rather than this one.
export const metAgreesWithRefusals = (
  verdict: PreReceiptConformanceVerdict,
  rejectionReasonIds: readonly string[],
): boolean =>
  verdict !== PreReceiptConformanceVerdict.Met ||
  instructionRefusalReasonIdsAmong(rejectionReasonIds).length === 0;

// AC-19 — a Disposition that is not one the system offers is refused. Takes a `string` because the
// value being judged is the member's submission, which is exactly what has not yet been proven to
// be one.
export const isOfferedDisposition = (
  disposition: string,
): disposition is RejectionDisposition =>
  (REJECTION_DISPOSITIONS as readonly string[]).includes(disposition);

// AC-18a — a Disposition once decided may be corrected to another decision but never returned to
// Undecided. The same statement as sad.md §6.4's conditional update
// `(disposition = 'undecided' OR :disposition <> 'undecided')`, so the rule exists once and can be
// read: Undecided against a still-undecided Rejection changes nothing and is admitted by both.
export const dispositionMayBeRecorded = (
  currentDisposition: RejectionDisposition,
  submittedDisposition: RejectionDisposition,
): boolean =>
  currentDisposition === RejectionDisposition.Undecided ||
  submittedDisposition !== RejectionDisposition.Undecided;
