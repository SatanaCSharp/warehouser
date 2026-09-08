import { z } from 'zod';

import type {
  PreReceiptConformanceCreate,
  PurchaseDraftLine,
  PurchaseDraftLineArrival,
  PurchaseDraftLineDirectDelivery,
  PurchaseDraftLineLink,
  RejectionCreate,
  RejectionSource,
} from '@warehouser/contracts/purchase-drafts';
import type { FormParse, FormParseResult } from 'shared/utils/form-parse';

/**
 * One refusal row of the condition block (T15, AC-05/AC-08). `ConditionBlock`
 * appends and removes these through `useFieldArray`; the Rejection Source is
 * never one of its fields (AC-24) because it is derived from the line's
 * Delivery Mode at parse time, below.
 */
export type RejectionRow = {
  description: string;
  quantity: string;
  rejectionReasonId: string;
};

/**
 * The Pre-receipt Conformance judgement's own field shape (T16, AC-15/AC-17a).
 * `''` is not a verdict — it is the un-defaulted opening state a member must
 * move away from before the ending can be submitted (AC-15, AC-17a). Shared by
 * `ConformanceBlock`'s own `ConformanceBlockForm` and by `LineEndingForm`
 * below, exactly the way `RejectionRow` is shared with `ConditionBlockForm`.
 */
export type ConformanceVerdict = '' | 'met' | 'not_applicable' | 'not_met';

/**
 * One line ending's form session (T17, AC-19). Its `allocations` array is
 * positional — `allocations[j]` is the line's `links[j]` — which is what lets
 * the request be rebuilt from the line the dialog was opened for without every
 * field carrying an identifier.
 *
 * There is **one** quantity because there is one line: the whole-draft form
 * that held an array of them was withdrawn with the whole-draft act (ADR 0002).
 * It is held as the string the field produced. A number field yields `''` while
 * empty and `NaN` for anything unparsable, and neither is a quantity — the
 * transform below is the one place either becomes one.
 *
 * `rejections` is the Condition Split (T15) `ConditionBlock` owns. Its shape is
 * exactly `ConditionBlockForm`'s own `rejections` field, which is what lets
 * `LineEndingFieldset` hand this whole form to `ConditionBlock` as one.
 *
 * `preReceiptConformance` is the judgement `ConformanceBlock` owns (T16),
 * shaped exactly like its own `ConformanceBlockForm`. `finalityAcknowledged`
 * is the direct-delivery-only acknowledgement `FinalityAcknowledgementAlert`
 * owns — an interaction, never a state (sad.md §6.2): it exists only in this
 * form session and is never itself sent to the server.
 */
export type LineEndingForm = {
  allocations: { allocatedQuantity: string }[];
  finalityAcknowledged: boolean;
  preReceiptConformance: { note: string; verdict: ConformanceVerdict };
  quantity: string;
  rejections: RejectionRow[];
};

/** Validation codes this form raises. Never display text (web-error-handling.md §5). */
const INVALID_QUANTITY = 'invalidQuantity';

/**
 * Whether a link may be assigned any of what arrived (AC-18).
 *
 * The bound is the Customer Order's own lifecycle state, read fresh rather than
 * from the Demand Snapshot: an order cancelled or fulfilled since the draft was
 * frozen accepts nothing, and the server refuses the whole ending for it
 * (`demand-allocation.service.ts` `customer_order_not_unfulfilled`). This is not
 * the client pre-judging an arithmetic bound — it is the one fact that decides
 * whether the field exists at all, which is why the approved frame draws that
 * row disabled with an em dash rather than empty (`s5EPi`).
 */
export const isAssignableLink = ({ current }: PurchaseDraftLineLink): boolean =>
  current.state === 'unfulfilled';

/**
 * The three bounds AC-18 refuses a line ending against, exactly as
 * the server names them: `demand-allocation.errors.ts` publishes one entry per
 * failing bound and the global filter carries the whole `details` envelope out
 * unchanged, so the dialog can name each broken bound rather than restating one
 * generic sentence for all three.
 *
 * Only the identifiers and figures travel — the customer's name and the line's
 * number are resolved here, from the draft the dialog was opened for.
 */
const endingBoundViolationSchema = z.discriminatedUnion('rule', [
  z.object({
    rule: z.literal('allocations_exceed_received_quantity'),
    purchaseDraftLineId: z.string(),
    receivedQuantity: z.number(),
    allocatedQuantity: z.number(),
  }),
  // AC-11 — the bound narrowed from what arrived to what was accepted, once the
  // line's own condition split has a figure to subtract. `receivedQuantity` and
  // `rejectedQuantity` travel alongside `acceptedQuantity` so the bullet can
  // state the shortfall in words rather than leaving the member to subtract it.
  z.object({
    rule: z.literal('allocations_exceed_accepted_quantity'),
    purchaseDraftLineId: z.string(),
    receivedQuantity: z.number(),
    rejectedQuantity: z.number(),
    acceptedQuantity: z.number(),
    allocatedQuantity: z.number(),
  }),
  z.object({
    rule: z.literal('exceeds_outstanding_quantity'),
    purchaseDraftLineLinkId: z.string(),
    outstandingQuantity: z.number(),
    allocatedQuantity: z.number(),
  }),
  z.object({
    rule: z.literal('customer_order_not_unfulfilled'),
    purchaseDraftLineLinkId: z.string(),
    customerOrderState: z.string(),
    // AC-18/AC-16 — when the refused order moved, so the bullet reads "cancelled on 24 Aug"
    // (`s5EPi`). `.catch(null)` rather than a plain `.nullable()`: the whole violation is dropped
    // when its shape does not parse, and a refusal that cannot be dated is still a refusal the
    // member is owed the name of.
    customerOrderLastChangedAt: z.string().nullable().catch(null),
  }),
]);

export type EndingBoundViolation = z.infer<typeof endingBoundViolationSchema>;

// A bound this build does not know is dropped rather than failing the whole
// list, so a server that grows a fourth rule still explains the three the member
// can read. The alert falls back to its own sentence when nothing survives.
const endingRefusalDetailsSchema = z.object({
  violations: z.array(endingBoundViolationSchema.nullable().catch(null)),
});

/**
 * The bounds one refusal reports, or nothing when the refusal carried none —
 * a `purchase_drafts.allocation_out_of_bounds` raised by a path that publishes
 * no breakdown, or an envelope this build cannot read.
 */
export const endingBoundViolations = (
  details: Record<string, unknown> | undefined,
): EndingBoundViolation[] => {
  const parsed = endingRefusalDetailsSchema.safeParse(details);

  return parsed.success
    ? parsed.data.violations.flatMap((violation) =>
        violation === null ? [] : [violation],
      )
    : [];
};

/** A line's links, or none — the redacted form of a line serves an empty list (AC-09a). */
const linksOf = (line: PurchaseDraftLine): readonly PurchaseDraftLineLink[] =>
  line.links;

export const lineEndingFormDefaults = (
  line: PurchaseDraftLine,
): LineEndingForm => ({
  allocations: linksOf(line).map(() => ({ allocatedQuantity: '' })),
  // T16 — never ticked, and never pre-answered: both cost a member's own act
  // (AC-15, AC-17a; design-handoff.md § States and interactions).
  finalityAcknowledged: false,
  preReceiptConformance: { note: '', verdict: '' },
  quantity: String(line.orderedQuantity),
  // T15 — opens with no refusal at all: refusing costs one click, never a
  // default row (design-handoff.md § States and interactions).
  rejections: [],
});

const quantity = (value: string): number => Number.parseInt(value, 10);

/**
 * A field's raw string as a whole number, or `0` for anything that is not one
 * yet — `''` while a number field is empty, `NaN` for anything unparsable.
 * Shared by `LineEndingFieldset`'s running total and `ConditionBlock`'s
 * derived accepted figure, so the two summaries can never read a blank field
 * two different ways.
 */
export const quantityOf = (value: string | undefined): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? 0 : parsed;
};

/**
 * The Condition Split as the ending endpoints take it (T15, AC-02/AC-05/AC-08).
 *
 * **Only a row nobody has touched is dropped** — no quantity typed and no
 * Reason chosen. That is genuinely nothing, the same way a blank allocation
 * above is genuinely "assign nothing". A row a member has started, even
 * incompletely, states an intent: an ending is recorded once and cannot be
 * revisited (AC-04), so silently discarding a half-typed refusal here would
 * lose it for good, where the server would instead have named the rule it
 * broke (`quantity_out_of_range`, `unknown_rejection_reason`) and explained
 * it through the normal refusal path. This function does not pre-judge that
 * outcome; it only decides what "the member expressed something" means
 * (2026-09-08 review).
 *
 * The Rejection Source is never one of `ConditionBlock`'s own fields (AC-24)
 * — it is the one argument this function takes beyond the form, because it
 * is the line's Delivery Mode read at the two call sites below, not a value
 * the member can express.
 */
const buildRejections = (
  rejections: RejectionRow[],
  source: RejectionSource,
): RejectionCreate[] =>
  rejections.flatMap((rejection) => {
    const isWhollyEmpty =
      rejection.quantity.trim() === '' && rejection.rejectionReasonId === '';
    if (isWhollyEmpty) {
      return [];
    }

    const description = rejection.description.trim();

    return [
      {
        rejectionReasonId: rejection.rejectionReasonId,
        quantity: quantityOf(rejection.quantity),
        source,
        ...(description === '' ? {} : { description }),
      },
    ];
  });

/**
 * The two-arm contract shape (T16, `preReceiptConformanceWithoutNoteCreateSchema`
 * vs `...NotMetCreateSchema`) built from the form's own field, never restated
 * as a second parallel shape. `''` — the un-defaulted opening state — becomes
 * no property at all: a line where nothing was received never had the block
 * rendered at all (AC-04a), and the property is contract-optional for exactly
 * that reason. `Met`/`Not applicable` never carry a `note` — not even an empty
 * one, which is what would happen if this instead always sent
 * `{ verdict, note: values.note }` — and `Not met` carries one only once the
 * member has actually typed something (2026-09-08 review pattern: the RED
 * pins `.toEqual`, not `.objectContaining`, on this exact shape).
 */
/**
 * Which payload each verdict carries, as a total lookup: a fourth
 * `ConformanceVerdict` does not compile until it is answered here. The guards
 * this replaced ended in a trailing `return { verdict }`, so a new verdict would
 * have fallen through it silently and dropped whatever it needed to carry
 * (`writing-web-components.md` §6).
 *
 * `''` — the un-defaulted opening state — answers `undefined`: no property at
 * all, which is why the contract makes it optional (AC-04a).
 */
const PRE_RECEIPT_CONFORMANCE_BY_VERDICT: Record<
  ConformanceVerdict,
  (note: string) => PreReceiptConformanceCreate | undefined
> = {
  '': () => undefined,
  met: () => ({ verdict: 'met' }),
  not_applicable: () => ({ verdict: 'not_applicable' }),
  // `Not met` carries the member's own note, and only once they have actually
  // typed one — a whitespace-only note is no note.
  not_met: (note) => {
    const trimmed = note.trim();
    return trimmed === ''
      ? { verdict: 'not_met' }
      : { verdict: 'not_met', note: trimmed };
  },
};

const buildPreReceiptConformance = ({
  note,
  verdict,
}: LineEndingForm['preReceiptConformance']):
  PreReceiptConformanceCreate | undefined =>
  PRE_RECEIPT_CONFORMANCE_BY_VERDICT[verdict](note);

/**
 * Turns the form session into the request one of the two ending endpoints
 * takes. The **kind is the route**, not a field, so the only difference between
 * the two payloads is the name of the quantity — which is exactly what the two
 * parse functions below express, and nothing else about them differs (ADR 0002).
 *
 * Both validate **shape only**: that the line states a whole, non-negative
 * quantity, which the contract requires. Neither checks an assignment against
 * what arrived, against another assignment, or against what a Customer Order is
 * still waiting for. Those are the AC-18 bounds, and the server re-checks them
 * at the moment the ending is recorded rather than when the member composed it.
 * A client that pre-judged them would refuse endings the boundary would have
 * accepted, and would still have to handle the refusal it cannot predict.
 *
 * An assignment left blank is not an assignment: it is dropped rather than sent
 * as a zero, so a line may assign nothing at all and still end (AC-19).
 */
const parseQuantityAndAllocations = (
  line: PurchaseDraftLine,
  values: LineEndingForm,
  source: RejectionSource,
):
  | { error: Record<string, string>; success: false }
  | {
      data: {
        allocations: {
          allocatedQuantity: number;
          purchaseDraftLineLinkId: string;
        }[];
        preReceiptConformance: PreReceiptConformanceCreate | undefined;
        quantity: number;
        rejections: RejectionCreate[];
      };
      success: true;
    } => {
  const stated = quantity(values.quantity);
  if (Number.isNaN(stated) || stated < 0) {
    return { error: { quantity: INVALID_QUANTITY }, success: false };
  }

  const allocations = linksOf(line).flatMap((link, index) => {
    const allocated = quantity(
      values.allocations[index]?.allocatedQuantity ?? '',
    );
    return Number.isNaN(allocated) || allocated < 1
      ? []
      : [{ allocatedQuantity: allocated, purchaseDraftLineLinkId: link.id }];
  });

  return {
    data: {
      allocations,
      // `?? { note: '', verdict: '' }` — the un-defaulted opening shape —
      // matches every other optional array on this form (`values.rejections`,
      // `values.allocations` elsewhere): a caller that never touched the
      // conformance judgement is read the same as one that opened at it.
      preReceiptConformance: buildPreReceiptConformance(
        values.preReceiptConformance ?? { note: '', verdict: '' },
      ),
      quantity: stated,
      rejections: buildRejections(values.rejections, source),
    },
    success: true,
  };
};

/** The Via Warehouse half — what arrived at the dock. Every refusal on it is
 * recorded `inspected`: it is the acting member's own dock, so nobody else
 * could have reported it (AC-24, AC-25). */
export const parseLineArrivalForm =
  (
    line: PurchaseDraftLine,
  ): FormParse<LineEndingForm, PurchaseDraftLineArrival> =>
  (values): FormParseResult<LineEndingForm, PurchaseDraftLineArrival> => {
    const parsed = parseQuantityAndAllocations(line, values, 'inspected');
    return parsed.success
      ? {
          data: {
            allocations: parsed.data.allocations,
            receivedQuantity: parsed.data.quantity,
            // Send only what the member expressed: `rejections` is contract-optional
            // (`purchase-drafts-mutations.ts` `.optional()`) and the server's own
            // `assertRejectionCapability` returns early on an empty array, so an empty
            // one would carry no different meaning — omitting it is simply not stating
            // a Condition Split the member never opened (AC-01a is unaffected either way).
            ...(parsed.data.rejections.length > 0
              ? { rejections: parsed.data.rejections }
              : {}),
            ...(parsed.data.preReceiptConformance
              ? { preReceiptConformance: parsed.data.preReceiptConformance }
              : {}),
          },
          success: true,
        }
      : parsed;
  };

/** The Direct to Customer half — what the customer received. Every refusal on
 * it is recorded `customer_reported`: these goods never came to this
 * Warehouse's dock, so nobody here inspected them (AC-24, AC-25). */
export const parseLineDirectDeliveryForm =
  (
    line: PurchaseDraftLine,
  ): FormParse<LineEndingForm, PurchaseDraftLineDirectDelivery> =>
  (
    values,
  ): FormParseResult<LineEndingForm, PurchaseDraftLineDirectDelivery> => {
    const parsed = parseQuantityAndAllocations(
      line,
      values,
      'customer_reported',
    );
    return parsed.success
      ? {
          data: {
            allocations: parsed.data.allocations,
            deliveredQuantity: parsed.data.quantity,
            ...(parsed.data.rejections.length > 0
              ? { rejections: parsed.data.rejections }
              : {}),
            ...(parsed.data.preReceiptConformance
              ? { preReceiptConformance: parsed.data.preReceiptConformance }
              : {}),
          },
          success: true,
        }
      : parsed;
  };
