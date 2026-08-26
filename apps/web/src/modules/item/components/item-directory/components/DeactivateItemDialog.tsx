import { Alert } from '@heroui/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Conditional } from 'shared/components/Conditional';
import { ConfirmAlertDialog } from 'shared/components/ConfirmAlertDialog';

import type { Item } from '@warehouser/contracts/items';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

type DeactivateItemDialogProps = {
  item: Item;
  onConfirm: () => Promise<MutationResult>;
};

/**
 * Deactivates an Item while keeping its history readable (AC-06d). There is
 * nothing to fill in or validate, so it is a `ConfirmAlertDialog` rather than
 * a form (`docs/system/guides/web-dialogs.md`). A server denial stays open
 * and states that nothing has changed.
 */
export const DeactivateItemDialog = ({
  item,
  onConfirm,
}: DeactivateItemDialogProps): ReactElement => {
  const { t } = useTranslation('item');
  const [refusalCode, setRefusalCode] = useState<string>();

  return (
    <ConfirmAlertDialog
      title={t('dialogs.deactivate.title', { sku: item.sku })}
      cancelLabel={t('dialogs.deactivate.cancel')}
      confirmLabel={t('dialogs.deactivate.submit')}
      onConfirm={onConfirm}
      onRefusal={setRefusalCode}
    >
      <p>{t('dialogs.deactivate.body')}</p>
      <Conditional when={refusalCode !== undefined}>
        <Alert role="alert" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              {t('dialogs.deactivate.refusal')}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      </Conditional>
    </ConfirmAlertDialog>
  );
};
