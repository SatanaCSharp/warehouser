import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ItemRefusalAlert } from 'modules/item/components/item-directory/components/ItemRefusalAlert';
import { useItemNaming } from 'modules/item/hooks/projections/useItemNaming';
import { ConfirmAlertDialog } from 'shared/components/ConfirmAlertDialog';

import type { Item } from '@warehouser/contracts/items';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

type DeactivateItemDialogProps = {
  item: Item;
  onConfirm: () => Promise<MutationResult>;
};

/**
 * Deactivates an Item while keeping its history readable (AC-06d; frame
 * `s5EPi` "Deactivate an item"). There is nothing to fill in or validate, so it
 * is a `ConfirmAlertDialog` rather than a form
 * (`docs/system/guides/web-dialogs.md`).
 *
 * Its title names the subject — `Deactivate WH-100199 · Cable, 3×2.5mm²?` — and
 * its body is the three things AC-06d actually promises, in the frame's order:
 * what stops (it is no longer offered), what does not (the records that already
 * name it keep counting, stated with their real counts), and what stays
 * reversible. Deactivating is not destructive, so its confirm is the primary
 * variant rather than a danger one.
 */
export const DeactivateItemDialog = ({
  item,
  onConfirm,
}: DeactivateItemDialogProps): ReactElement => {
  const { t } = useTranslation('item');
  const { state, orders, lines } = useItemNaming(item);
  const [refusalCode, setRefusalCode] = useState<string>();

  return (
    <ConfirmAlertDialog
      title={t('dialogs.deactivate.title', {
        sku: item.sku,
        description: item.description,
      })}
      cancelLabel={t('dialogs.deactivate.cancel')}
      confirmLabel={t('dialogs.deactivate.submit')}
      confirmVariant="primary"
      status="warning"
      onConfirm={onConfirm}
      onRefusal={setRefusalCode}
    >
      <p className="text-muted">{t('dialogs.deactivate.lede')}</p>
      <p>{t(`dialogs.deactivate.naming.${state}`, { orders, lines })}</p>
      <p>{t('dialogs.deactivate.skuStaysTaken')}</p>
      <p>{t('dialogs.deactivate.reversible')}</p>
      <ItemRefusalAlert code={refusalCode} />
    </ConfirmAlertDialog>
  );
};
