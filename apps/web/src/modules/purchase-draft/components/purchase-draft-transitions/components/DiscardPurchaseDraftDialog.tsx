import { Alert } from '@heroui/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Conditional } from 'shared/components/Conditional';
import { ConfirmAlertDialog } from 'shared/components/ConfirmAlertDialog';

import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

export type DiscardPurchaseDraftDialogProps = {
  onConfirm: () => Promise<MutationResult>;
};

/**
 * Discards a Purchase Draft that was never made ready (AC-24). Nothing is
 * filled in or validated, so it is a `ConfirmAlertDialog`
 * (`docs/system/guides/web-dialogs.md` §1).
 *
 * Whether discarding is offered at all is the draft state's answer, and
 * `PurchaseDraftTransitions` gives it: a draft in Ready for Ordering is never
 * offered this act (AC-24a). That is a UI affordance rather than the boundary,
 * so a refusal the server returns anyway is surfaced here and states that
 * nothing has changed.
 */
export const DiscardPurchaseDraftDialog = ({
  onConfirm,
}: DiscardPurchaseDraftDialogProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const [refusalCode, setRefusalCode] = useState<string>();

  return (
    <ConfirmAlertDialog
      title={t('transitions.discard.title')}
      cancelLabel={t('transitions.discard.cancel')}
      confirmLabel={t('transitions.discard.confirm')}
      onConfirm={onConfirm}
      onRefusal={setRefusalCode}
    >
      <p>{t('transitions.discard.body')}</p>
      <Conditional when={refusalCode !== undefined}>
        <Alert role="alert" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              {t('transitions.discard.refusal')}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      </Conditional>
    </ConfirmAlertDialog>
  );
};
