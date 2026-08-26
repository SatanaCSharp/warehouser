import { Alert } from '@heroui/react';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { ArrivalLineFieldset } from 'modules/purchase-draft/components/purchase-draft-transitions/components/confirm-arrival-dialog/components/ArrivalLineFieldset';
import {
  arrivalFormDefaults,
  parseArrivalForm,
} from 'modules/purchase-draft/utils/arrival-form';
import { Conditional } from 'shared/components/Conditional';
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

/**
 * The 720px Arrival Confirmation modal (design-handoff.md `s5EPi`): what
 * arrived on every line, and which named customers it covers (AC-17).
 *
 * Quantities are filled in, so it is a `FormModalDialog`
 * (`docs/system/guides/web-dialogs.md` §1). It is the widest modal this
 * application opens because a line, its assignments and their running total
 * have to be read together; every other modal stays 440px.
 *
 * **The bounds are the server's (AC-18).** Nothing here refuses an assignment
 * for being larger than what arrived or than the Customer Order is waiting
 * for. The confirmation is sent as composed and the refusal that comes back is
 * explained where the decision was made, stating that nothing of it was saved
 * — the value the member typed stays in front of them.
 */
export const ConfirmArrivalDialog = ({
  draft,
  onSubmit,
}: ConfirmArrivalDialogProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const [refusalCode, setRefusalCode] = useState<string>();
  const form = useForm({ defaultValues: arrivalFormDefaults(draft) });

  // A refusal names the rule the boundary applied; the member is told the rule,
  // never the raw code (web-error-handling.md §5). A lookup rather than a chain
  // of conditionals (`writing-web-components.md` §6).
  const refusalKeyByCode: Record<string, string> = {
    [ErrorCode.PURCHASE_DRAFTS_ALLOCATION_OUT_OF_BOUNDS]:
      'allocationOutOfBounds',
    [ErrorCode.PURCHASE_DRAFTS_ARRIVAL_ALREADY_CONFIRMED]: 'alreadyConfirmed',
    [ErrorCode.PURCHASE_DRAFTS_INVALID_STATE]: 'invalidState',
  };

  const parse = parseArrivalForm(draft);
  const translateValidation = (code: string): string =>
    t(`transitions.arrival.validation.${code}`);

  return (
    <FormModalDialog
      title={t('transitions.arrival.title')}
      cancelLabel={t('transitions.arrival.cancel')}
      submitLabel={t('transitions.arrival.submit')}
      form={form}
      parse={parse}
      scroll="inside"
      size="wide"
      translateValidation={translateValidation}
      onRefusal={setRefusalCode}
      onSubmit={onSubmit}
    >
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
      <Conditional when={refusalCode !== undefined}>
        <Alert role="alert" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              {t(
                `transitions.arrival.refusal.${
                  refusalKeyByCode[refusalCode ?? ''] ?? 'unknown'
                }`,
              )}{' '}
              {t('transitions.arrival.nothingSaved')}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      </Conditional>
    </FormModalDialog>
  );
};
