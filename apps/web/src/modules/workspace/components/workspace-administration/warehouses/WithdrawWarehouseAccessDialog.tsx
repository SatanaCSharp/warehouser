import { useTranslation } from 'react-i18next';

import { useRevokeWarehouseMembershipMutation } from 'modules/workspace/api/warehouse-api';
import { ConfirmAlertDialog } from 'shared/components/ConfirmAlertDialog';

import type {
  Warehouse,
  WorkspaceUser,
} from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

type WithdrawWarehouseAccessDialogProps = {
  person: Pick<WorkspaceUser, 'userId'>;
  warehouse: Warehouse;
};

/**
 * Withdraws one person's membership in this Warehouse (AC-25b). Owned
 * exclusively by `WarehousePersonRow`, which is the only trigger for it — the
 * CH-W5 split moved that trigger down from `WarehousePeopleList` together with
 * the open-flag that controls it.
 * The server, not this dialog, is what refuses the protected Warehouse
 * Manager's row and the actor's own row (AC-25c) — this confirmation makes
 * the same request regardless of which row opened it.
 *
 * Nothing here is filled in or validated, so it is a `ConfirmAlertDialog`
 * (`docs/system/guides/web-dialogs.md`).
 */
export const WithdrawWarehouseAccessDialog = ({
  person,
  warehouse,
}: WithdrawWarehouseAccessDialogProps): ReactElement => {
  const { t } = useTranslation('warehouse');
  const [revokeWarehouseMembership] = useRevokeWarehouseMembershipMutation();

  const onConfirm = (): Promise<MutationResult> =>
    revokeWarehouseMembership({
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      userId: person.userId,
    });

  return (
    <ConfirmAlertDialog
      title={t('warehouses.withdrawAccess.title', { name: warehouse.name })}
      cancelLabel={t('warehouses.withdrawAccess.cancel')}
      confirmLabel={t('warehouses.withdrawAccess.submit')}
      onConfirm={onConfirm}
    >
      <p>{t('warehouses.withdrawAccess.description')}</p>
    </ConfirmAlertDialog>
  );
};
