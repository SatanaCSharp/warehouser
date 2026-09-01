import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { ArrivalLineFieldset } from 'modules/purchase-draft/components/purchase-draft-transitions/components/confirm-arrival-dialog/components/ArrivalLineFieldset';
import { ArrivalRefusalAlert } from 'modules/purchase-draft/components/purchase-draft-transitions/components/confirm-arrival-dialog/components/ArrivalRefusalAlert';
import {
  arrivalFormDefaults,
  parseArrivalForm,
} from 'modules/purchase-draft/utils/arrival-form';
import { FormModalDialog } from 'shared/components/FormModalDialog';

import type {
  ArrivalConfirmation,
  PurchaseDraftDetail,
} from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

export type ConfirmArrivalDialogProps = {
  draft: PurchaseDraftDetail;
  onSubmit: (input: ArrivalConfirmation) => Promise<MutationResult>;
};

/** What the boundary refused the confirmation with, kept whole for the alert. */
type ArrivalRefusal = { code?: string; details?: Record<string, unknown> };

/**
 * The 720px Arrival Confirmation modal (design-handoff.md `s5EPi`): what
 * arrived on every line, and which named customers it covers (AC-17).
 *
 * Quantities are filled in, so it is a `FormModalDialog`
 * (`docs/system/guides/web-dialogs.md` §1). It is the widest modal this
 * application opens because a line, its assignments and their running total
 * have to be read together; every other modal stays 440px.
 *
 * **The arithmetic bounds are the server's (AC-18).** Nothing here refuses an
 * assignment for being larger than what arrived or than the Customer Order is
 * waiting for. The confirmation is sent as composed and the refusal that comes
 * back is explained where the decision was made, naming every bound it broke
 * and stating that nothing of it was saved — the values the member typed stay
 * in front of them. The one assignment this dialog does not offer at all is one
 * to a Customer Order that has left `Unfulfilled`, which is a fact rather than
 * an arithmetic bound (`ArrivalAssignmentRow`).
 */
export const ConfirmArrivalDialog = ({
  draft,
  onSubmit,
}: ConfirmArrivalDialogProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const { t: translate } = useTranslation('validation');
  const [refusal, setRefusal] = useState<ArrivalRefusal>();
  const form = useForm({ defaultValues: arrivalFormDefaults(draft) });

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

  const parse = parseArrivalForm(draft);
  // BRIEF §A — every field of this form is a quantity, whether it is what
  // arrived on a line or what was assigned from it, so one `validation`
  // section explains all five normalized codes plus this form's own parse code
  // (`web-dialogs.md` §3).
  const translateValidation = (code: string): string =>
    translate(`purchaseDraftArrivalQuantity.${code}`);

  return (
    <FormModalDialog
      title={t('transitions.arrival.title', { reference: draft.reference })}
      cancelLabel={t('transitions.arrival.cancel')}
      submitLabel={t('transitions.arrival.submit')}
      form={form}
      parse={parse}
      scroll="inside"
      size="wide"
      translateValidation={translateValidation}
      onRefusal={onRefusal}
      onSubmit={onSubmit}
    >
      <ArrivalRefusalAlert
        code={refusal?.code}
        details={refusal?.details}
        draft={draft}
        onDismiss={onDismissRefusal}
      />
      <p>{t('transitions.arrival.closesOnce')}</p>
      <ul className="flex flex-col gap-4">
        {draft.lines.map((line, index) => (
          <ArrivalLineFieldset
            key={line.id}
            form={form}
            index={index}
            line={line}
          />
        ))}
      </ul>
      {/*
        AC-18a — the confirmation is one act, and the on-hand quantities it does
        not touch are named here because that is the assumption a member most
        reasonably brings to "confirm what arrived".
      */}
      <p className="text-sm text-muted">{t('transitions.arrival.atomicity')}</p>
    </FormModalDialog>
  );
};
