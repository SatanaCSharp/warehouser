import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { EndingRefusalAlert } from 'modules/purchase-draft/components/purchase-draft-transitions/components/line-ending-dialog/components/EndingRefusalAlert';
import { LineEndingFieldset } from 'modules/purchase-draft/components/purchase-draft-transitions/components/line-ending-dialog/components/LineEndingFieldset';
import { lineEndingFormDefaults } from 'modules/purchase-draft/utils/line-ending-form';
import { FormModalDialog } from 'shared/components/FormModalDialog';

import type {
  PurchaseDraftDetail,
  PurchaseDraftLine,
} from '@warehouser/contracts/purchase-drafts';
import type { LineEndingForm } from 'modules/purchase-draft/utils/line-ending-form';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import type { FormParse } from 'shared/utils/form-parse';

/** What the boundary refused the ending with, kept whole for the alert. */
type EndingRefusal = { code?: string; details?: Record<string, unknown> };

export type LineEndingDialogProps<TInput> = {
  draft: PurchaseDraftDetail;
  line: PurchaseDraftLine;
  parse: FormParse<LineEndingForm, TInput>;
  /** Which of the two acts this dialog records — the copy, never the payload. */
  kind: 'arrival' | 'directDelivery';
  onSubmit: (input: TInput) => Promise<MutationResult>;
};

/**
 * The 720px per-line ending modal (design-handoff.md `s5EPi`, ADR 0002): what
 * arrived at the dock on **one** line, or what the customer received on one —
 * and which named customers it covers (AC-19).
 *
 * **One component serves both halves, and that is not the kind being a
 * parameter.** The kind is the *route*, chosen by the two callers that own the
 * two endpoints; what varies here is only which copy is read and which parse
 * names the quantity. Nothing in this file decides which act a line admits —
 * that is `LineEndingAction`, which offers only the one the line's Delivery
 * Mode allows (AC-20), so the wrong dialog is unreachable rather than
 * submittable.
 *
 * Quantities are filled in, so it is a `FormModalDialog`
 * (`docs/system/guides/web-dialogs.md` §1). It is the widest modal this
 * application opens because a line, its assignments and their running total
 * have to be read together; every other modal stays 440px. `FormModalDialog`
 * places Cancel before the primary in DOM and keyboard order.
 *
 * **The arithmetic bounds are the server's (AC-18).** Nothing here refuses an
 * assignment for being larger than what arrived or than the Customer Order is
 * waiting for. The ending is sent as composed and the refusal that comes back
 * is explained where the decision was made, naming every bound it broke and
 * stating that nothing of it was saved — the values the member typed stay in
 * front of them. The two refusals this dialog cannot pre-empt either are
 * AC-20's wrong-kind and AC-20a's already-recorded: a line whose ending landed
 * between the draft being read and this submit is refused by the server, and
 * `EndingRefusalAlert` names when and by whom.
 */
export const LineEndingDialog = <TInput,>({
  draft,
  line,
  parse,
  kind,
  onSubmit,
}: LineEndingDialogProps<TInput>): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const { t: translate } = useTranslation('validation');
  const [refusal, setRefusal] = useState<EndingRefusal>();
  const form = useForm({ defaultValues: lineEndingFormDefaults(line) });

  // The refusal's own envelope is kept beside its code: AC-18's bounds travel in
  // it, and the alert names each one rather than restating a sentence covering
  // all three (`web-dialogs.md` §6).
  const onRefusal = (
    code?: string,
    details?: Record<string, unknown>,
  ): void => {
    setRefusal({ code, details });
  };

  const onDismissRefusal = (): void => {
    setRefusal(undefined);
  };

  // BRIEF §A — every field of this form is a quantity, whether it is what ended
  // the line or what was assigned from it, so one `validation` section explains
  // all five normalized codes plus this form's own parse code
  // (`web-dialogs.md` §3).
  const translateValidation = (code: string): string =>
    translate(`purchaseDraftArrivalQuantity.${code}`);

  return (
    <FormModalDialog
      title={t(`transitions.lineEnding.${kind}.title`, {
        reference: draft.reference,
        sku: line.itemSku,
      })}
      cancelLabel={t('transitions.lineEnding.cancel')}
      submitLabel={t(`transitions.lineEnding.${kind}.submit`)}
      form={form}
      parse={parse}
      scroll="inside"
      size="wide"
      translateValidation={translateValidation}
      onRefusal={onRefusal}
      onSubmit={onSubmit}
    >
      <EndingRefusalAlert
        code={refusal?.code}
        details={refusal?.details}
        draft={draft}
        onDismiss={onDismissRefusal}
      />
      {/*
        AC-19 — the draft closes on its **last** line, not on this act, so the
        sentence the whole-draft modal carried ("this closes the draft") would
        now be a lie on every line but one. What replaces it is the fact a
        member cannot see: this line ends once and cannot be recorded again
        (AC-20a).
      */}
      <p>{t(`transitions.lineEnding.${kind}.endsOnce`)}</p>
      <LineEndingFieldset form={form} kind={kind} line={line} />
      {/*
        AC-21 — the on-hand quantity this act does not touch is named here
        because that is the assumption a member most reasonably brings to
        "record what arrived". On the direct half it is the stronger statement:
        the goods were never in the building to be counted.
      */}
      <p className="text-sm text-muted">
        {t(`transitions.lineEnding.${kind}.atomicity`)}
      </p>
    </FormModalDialog>
  );
};
