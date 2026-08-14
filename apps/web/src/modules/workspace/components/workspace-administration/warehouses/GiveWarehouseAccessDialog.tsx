import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { selectCurrentUser } from 'modules/auth/store/auth.selectors';
import { useListAssignableWarehouseRolesQuery } from 'modules/workspace/api/workspace-warehouses-api';
import { useAssignWarehouseMembership } from 'modules/workspace/hooks/useAssignWarehouseMembership';
import { useListWorkspaceUsersQuery } from 'shared/api/workspace-users-api';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormSelectField } from 'shared/components/FormSelectField';
import { useAppSelector } from 'store/hooks';

import type { Warehouse } from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';

type GiveWarehouseAccessDialogProps = {
  warehouse: Warehouse;
  onClose: () => void;
};

type GiveWarehouseAccessForm = { roleId: string; userId: string };

/**
 * Places a User of the Workspace into this Warehouse with one of its
 * assignable custom Roles (AC-23). Owned exclusively by
 * `GiveWarehouseAccessAction`, which is the only trigger for it.
 *
 * Reads exactly the two narrow projections this workflow is scoped to: the
 * Workspace's Users (`WORKSPACE_MEMBERS:WATCH`, already cached by the tab,
 * so mounting this dialog issues no second request for it) and this
 * Warehouse's assignable custom Roles (`WAREHOUSE_MEMBERSHIPS:ASSIGN`,
 * identifiers and names only, requested only while the dialog is open) —
 * never a Warehouse-scoped resource (AC-23a).
 */
export const GiveWarehouseAccessDialog = ({
  warehouse,
  onClose,
}: GiveWarehouseAccessDialogProps): ReactElement => {
  const { t } = useTranslation('workspace');
  const actor = useAppSelector(selectCurrentUser);
  const { data: users = [] } = useListWorkspaceUsersQuery();
  const { data: roles = [] } = useListAssignableWarehouseRolesQuery(
    warehouse.id,
  );
  const assignWarehouseMembership = useAssignWarehouseMembership();
  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
  } = useForm<GiveWarehouseAccessForm>({
    defaultValues: { roleId: '', userId: '' },
  });

  // The candidate is a Workspace User who is not the acting member (AC-25a)
  // and does not already belong to this Warehouse (AC-25).
  const candidates = users.filter(
    (user) =>
      user.userId !== actor?.id &&
      !user.warehouses.some(
        (membership) => membership.warehouseId === warehouse.id,
      ),
  );

  const submit = async ({
    roleId,
    userId,
  }: GiveWarehouseAccessForm): Promise<void> => {
    const result = await assignWarehouseMembership(
      warehouse.id,
      warehouse.name,
      { roleId, userId },
    );
    if (result.success) {
      onClose();
    }
  };

  return (
    <FormModalDialog
      title={t('warehouses.giveAccess.title')}
      cancelLabel={t('warehouses.giveAccess.cancel')}
      submitLabel={t('warehouses.giveAccess.submit')}
      noValidate
      isSubmitting={isSubmitting}
      onClose={onClose}
      onSubmit={handleSubmit(submit)}
    >
      <p className="text-muted">{t('warehouses.giveAccess.description')}</p>
      <Controller
        control={control}
        name="userId"
        rules={{ required: true }}
        render={({ field }) => (
          <FormSelectField
            isRequired
            validationBehavior="aria"
            label={t('warehouses.giveAccess.personLabel')}
            name={field.name}
            options={candidates.map((user) => ({
              id: user.userId,
              label: user.email ?? user.userId,
            }))}
            value={field.value}
            onBlur={field.onBlur}
            onChange={field.onChange}
          />
        )}
      />
      <Controller
        control={control}
        name="roleId"
        rules={{ required: true }}
        render={({ field }) => (
          <FormSelectField
            isRequired
            validationBehavior="aria"
            description={t('warehouses.giveAccess.roleDescription')}
            label={t('warehouses.giveAccess.roleLabel', {
              name: warehouse.name,
            })}
            name={field.name}
            options={roles.map((role) => ({ id: role.id, label: role.name }))}
            value={field.value}
            onBlur={field.onBlur}
            onChange={field.onChange}
          />
        )}
      />
      <div className="rounded-lg border border-border bg-surface-secondary p-3">
        <p className="font-semibold">
          {t('warehouses.giveAccess.noticeTitle')}
        </p>
        <p className="text-sm text-muted">
          {t('warehouses.giveAccess.noticeDescription')}
        </p>
      </div>
    </FormModalDialog>
  );
};
