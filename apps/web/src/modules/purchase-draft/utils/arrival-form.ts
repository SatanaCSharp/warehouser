import type {
  ArrivalConfirmation,
  PurchaseDraftDetail,
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
