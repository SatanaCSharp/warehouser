import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useRevokeWarehouseMembership } from 'modules/warehouse/hooks/useRevokeWarehouseMembership';
import { FormModalDialog } from 'shared/components/FormModalDialog';

import type {
  Warehouse,
  WorkspaceUser,
} from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';

type WithdrawWarehouseAccessDialogProps = {
  person: Pick<WorkspaceUser, 'userId'>;
  warehouse: Warehouse;
  onClose: () => void;
};

/**
 * Withdraws one person's membership in this Warehouse (AC-25b). Owned
 * exclusively by `WarehousePeopleList`, which is the only trigger for it.
 * The server, not this dialog, is what refuses the protected Warehouse
 * Manager's row and the actor's own row (AC-25c) — this confirmation makes
 * the same request regardless of which row opened it.
 */
export const WithdrawWarehouseAccessDialog = ({
  person,
  warehouse,
  onClose,
}: WithdrawWarehouseAccessDialogProps): ReactElement => {
  const { t } = useTranslation('workspace');
  const revokeWarehouseMembership = useRevokeWarehouseMembership();
  const {
    formState: { isSubmitting },
    handleSubmit,
  } = useForm();

  const confirm = async (): Promise<void> => {
    const result = await revokeWarehouseMembership(
      warehouse.id,
      warehouse.name,
      person.userId,
    );
    if (result.success) {
      onClose();
    }
  };

  return (
    <FormModalDialog
      title={t('warehouses.withdrawAccess.title', { name: warehouse.name })}
      cancelLabel={t('warehouses.withdrawAccess.cancel')}
      submitLabel={t('warehouses.withdrawAccess.submit')}
      submitVariant="danger"
      isSubmitting={isSubmitting}
      onClose={onClose}
      onSubmit={handleSubmit(confirm)}
    >
      <p>{t('warehouses.withdrawAccess.description')}</p>
    </FormModalDialog>
  );
};
