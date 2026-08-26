import { Alert } from '@heroui/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Conditional } from 'shared/components/Conditional';
import { ConfirmAlertDialog } from 'shared/components/ConfirmAlertDialog';

import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

export type ReadyPurchaseDraftDialogProps = {
  /** Whether the draft says what is being ordered yet (AC-14a). */
  hasLines: boolean;
  onConfirm: () => Promise<MutationResult>;
};

/**
 * Freezes a Purchase Draft as the record of what the supplier was told
 * (AC-14). There is one decision and nothing to fill in, so it is a
 * `ConfirmAlertDialog` rather than a form
 * (`docs/system/guides/web-dialogs.md` §1).
 *
 * A draft holding no lines cannot be made ready (AC-14a). The confirmation is
 * offered and **disabled with its reason stated**, never hidden — the member
 * who came here to freeze a draft learns why they cannot, which is the
 * treatment `hWFRW` uses for every refused-but-visible control. The rule is
 * still the server's: the draft may lose its last line between this render and
 * the press, so the refusal that comes back is surfaced here too rather than
 * assumed impossible.
 */
export const ReadyPurchaseDraftDialog = ({
  hasLines,
  onConfirm,
}: ReadyPurchaseDraftDialogProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const [refusalCode, setRefusalCode] = useState<string>();

  return (
    <ConfirmAlertDialog
      title={t('transitions.ready.title')}
      cancelLabel={t('transitions.ready.cancel')}
      confirmLabel={t('transitions.ready.confirm')}
      confirmVariant="primary"
      isConfirmDisabled={!hasLines}
      status="warning"
      onConfirm={onConfirm}
      onRefusal={setRefusalCode}
    >
      <p>{t('transitions.ready.body')}</p>
      <p>{t('transitions.ready.snapshot')}</p>
      <Conditional when={!hasLines}>
        <p className="text-sm text-danger">{t('transitions.ready.noLines')}</p>
      </Conditional>
      <Conditional when={refusalCode !== undefined}>
        <Alert role="alert" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              {t('transitions.ready.refusal')}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      </Conditional>
    </ConfirmAlertDialog>
  );
};
