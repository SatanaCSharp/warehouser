import type { Warehouse } from '@warehouser/contracts/workspaces';
import { selectCurrentUser } from 'modules/auth/store/auth.selectors';
import {
  useAssignWarehouseMembershipMutation,
  useListAssignableWarehouseRolesQuery,
} from 'modules/workspace/api/warehouse-api';
import type { ReactElement } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { useListWorkspaceUsersQuery } from 'shared/api/workspace/workspace-users-api';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormSelectField } from 'shared/components/FormSelectField';
import { useAppSelector } from 'store/hooks';

type GiveWarehouseAccessDialogProps = {
  warehouse: Warehouse;
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
}: GiveWarehouseAccessDialogProps): ReactElement => {
  const { t } = useTranslation('warehouse');
  const actor = useAppSelector(selectCurrentUser);
  const { data: users = [] } = useListWorkspaceUsersQuery();
  const { data: roles = [] } = useListAssignableWarehouseRolesQuery(
    warehouse.id,
  );
  const [assignWarehouseMembership] = useAssignWarehouseMembershipMutation();
  const form = useForm<GiveWarehouseAccessForm>({
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

  const onSubmit = (values: GiveWarehouseAccessForm): Promise<MutationResult> =>
    assignWarehouseMembership({
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      ...values,
    });

  return (
    <FormModalDialog
      title={t('warehouses.giveAccess.title')}
      cancelLabel={t('warehouses.giveAccess.cancel')}
      submitLabel={t('warehouses.giveAccess.submit')}
      form={form}
      onSubmit={onSubmit}
    >
      <p className="text-muted">{t('warehouses.giveAccess.description')}</p>
      <Controller
        control={form.control}
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
        control={form.control}
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
