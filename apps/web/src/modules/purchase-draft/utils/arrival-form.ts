import { z } from 'zod';

import type {
  ArrivalConfirmation,
  PurchaseDraftDetail,
  PurchaseDraftLineLink,
} from '@warehouser/contracts/purchase-drafts';
import type { FormParse, FormParseResult } from 'shared/utils/form-parse';

/**
 * The Arrival Confirmation modal's form session (AC-17). Its two arrays are
 * positional: `lines[i]` is `draft.lines[i]`, and `lines[i].allocations[j]` is
 * that line's `links[j]`, which is what lets the request be rebuilt from the
 * draft the dialog was opened for without every field carrying an identifier.
 *
 * Every quantity is held as the string the field produced. A number field
 * yields `''` while empty and `NaN` for anything unparsable, and neither is a
 * quantity — the transform below is the one place either becomes one.
 */
export type ArrivalForm = {
  lines: {
    allocations: { allocatedQuantity: string }[];
    receivedQuantity: string;
  }[];
};

/** Validation codes this form raises. Never display text (web-error-handling.md §5). */
const INVALID_QUANTITY = 'invalidQuantity';

/**
 * Whether a link may be assigned any of what arrived (AC-18).
 *
 * The bound is the Customer Order's own lifecycle state, read fresh rather than
 * from the Demand Snapshot: an order cancelled or fulfilled since the draft was
 * frozen accepts nothing, and the server refuses the whole confirmation for it
 * (`demand-allocation.service.ts` `customer_order_not_unfulfilled`). This is not
 * the client pre-judging an arithmetic bound — it is the one fact that decides
 * whether the field exists at all, which is why the approved frame draws that
 * row disabled with an em dash rather than empty (`s5EPi`).
 */
export const isAssignableLink = ({ current }: PurchaseDraftLineLink): boolean =>
  current.state === 'unfulfilled';

/**
 * The three bounds AC-18 refuses an Arrival Confirmation against, exactly as
 * the server names them: `demand-allocation.errors.ts` publishes one entry per
 * failing bound and the global filter carries the whole `details` envelope out
 * unchanged, so the dialog can name each broken bound rather than restating one
 * generic sentence for all three.
 *
 * Only the identifiers and figures travel — the customer's name and the line's
 * number are resolved here, from the draft the dialog was opened for.
 */
const arrivalBoundViolationSchema = z.discriminatedUnion('rule', [
  z.object({
    rule: z.literal('allocations_exceed_received_quantity'),
    purchaseDraftLineId: z.string(),
    receivedQuantity: z.number(),
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

export type ArrivalBoundViolation = z.infer<typeof arrivalBoundViolationSchema>;

// A bound this build does not know is dropped rather than failing the whole
// list, so a server that grows a fourth rule still explains the three the member
// can read. The alert falls back to its own sentence when nothing survives.
const arrivalRefusalDetailsSchema = z.object({
  violations: z.array(arrivalBoundViolationSchema.nullable().catch(null)),
});

/**
 * The bounds one refusal reports, or nothing when the refusal carried none —
 * a `purchase_drafts.allocation_out_of_bounds` raised by a path that publishes
 * no breakdown, or an envelope this build cannot read.
 */
export const arrivalBoundViolations = (
  details: Record<string, unknown> | undefined,
): ArrivalBoundViolation[] => {
  const parsed = arrivalRefusalDetailsSchema.safeParse(details);

  return parsed.success
    ? parsed.data.violations.flatMap((violation) =>
        violation === null ? [] : [violation],
      )
    : [];
};

export const arrivalFormDefaults = (
  draft: PurchaseDraftDetail,
): ArrivalForm => ({
  lines: draft.lines.map((line) => ({
    allocations: line.links.map(() => ({ allocatedQuantity: '' })),
    receivedQuantity: String(line.orderedQuantity),
  })),
});

const quantity = (value: string): number => Number.parseInt(value, 10);

/**
 * Turns the form session into the request the endpoint takes.
 *
 * It validates **shape only** — that each line states a whole, non-negative
 * quantity that arrived, which the contract requires of every line. It checks
 * no assignment against what arrived, against another assignment, or against
 * what a Customer Order is still waiting for: those are the AC-18 bounds, and
 * the server re-checks them at the moment the confirmation is recorded rather
 * than when the member composed it. A client that pre-judged them would refuse
 * confirmations the boundary would have accepted, and would still have to
 * handle the refusal it cannot predict.
 *
 * An assignment left blank is not an assignment: it is dropped rather than
 * sent as a zero, so a line may assign nothing at all and still confirm
 * (AC-17b).
 */
export const parseArrivalForm =
  (draft: PurchaseDraftDetail): FormParse<ArrivalForm, ArrivalConfirmation> =>
  (values): FormParseResult<ArrivalForm, ArrivalConfirmation> => {
    const error: Record<string, string> = {};

    const lines = draft.lines.map((line, index) => {
      const received = quantity(values.lines[index]?.receivedQuantity ?? '');
      if (Number.isNaN(received) || received < 0) {
        error[`lines.${index}.receivedQuantity`] = INVALID_QUANTITY;
      }

      return {
        allocations: line.links.flatMap((link, allocationIndex) => {
          const allocated = quantity(
            values.lines[index]?.allocations[allocationIndex]
              ?.allocatedQuantity ?? '',
          );
          return Number.isNaN(allocated) || allocated < 1
            ? []
            : [
                {
                  allocatedQuantity: allocated,
                  purchaseDraftLineLinkId: link.id,
                },
              ];
        }),
        purchaseDraftLineId: line.id,
        receivedQuantity: received,
      };
    });

    return Object.keys(error).length > 0
      ? { error, success: false }
      : { data: { lines }, success: true };
  };
