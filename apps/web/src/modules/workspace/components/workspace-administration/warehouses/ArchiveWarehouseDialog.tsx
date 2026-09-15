import type { Warehouse } from '@warehouser/contracts/workspaces';
import { useSetWarehouseArchivalMutation } from 'modules/workspace/api/warehouse-api';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { ConfirmAlertDialog } from 'shared/components/ConfirmAlertDialog';

type ArchiveWarehouseDialogProps = {
  warehouse: Warehouse;
};

/**
 * Withdraws a Warehouse from operation (AC-11): names what stops, what is
 * kept, and what the boundary refuses, before committing. Owned exclusively
 * by the Warehouse detail pane's "Archive warehouse" action.
 *
 * Nothing here is filled in or validated, so it is a `ConfirmAlertDialog`
 * (`docs/system/guides/web-dialogs.md`).
 */
export const ArchiveWarehouseDialog = ({
  warehouse,
}: ArchiveWarehouseDialogProps): ReactElement => {
  const { t } = useTranslation('warehouse');
  const [setWarehouseArchival] = useSetWarehouseArchivalMutation();

  const onConfirm = (): Promise<MutationResult> =>
    setWarehouseArchival({ warehouseId: warehouse.id, archived: true });

  return (
    <ConfirmAlertDialog
      title={t('warehouses.archive.title', { name: warehouse.name })}
      cancelLabel={t('warehouses.archive.cancel')}
      confirmLabel={t('warehouses.archive.submit')}
      onConfirm={onConfirm}
    >
      <p className="text-muted">{t('warehouses.archive.description')}</p>
      <div>
        <h3 className="font-semibold">{t('warehouses.archive.stopsTitle')}</h3>
        <p className="text-sm text-muted">
          {t('warehouses.archive.stopsDescription', { name: warehouse.name })}
        </p>
      </div>
      <div>
        <h3 className="font-semibold">{t('warehouses.archive.keptTitle')}</h3>
        <p className="text-sm text-muted">
          {t('warehouses.archive.keptDescription')}
        </p>
      </div>
    </ConfirmAlertDialog>
  );
};
