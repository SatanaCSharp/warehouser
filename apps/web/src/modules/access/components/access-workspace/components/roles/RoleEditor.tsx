import { Button } from '@heroui/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { PermissionFieldset } from 'modules/access/components/access-workspace/components/roles/PermissionFieldset';
import { useRoleForm } from 'modules/access/hooks/forms/useRoleForm';
import { useAccessScope } from 'modules/access/hooks/projections/useAccessScope';
import { useAccessPermissions } from 'modules/access/hooks/queries/useAccessPermissions';
import { Conditional } from 'shared/components/Conditional';
import { FormTextField } from 'shared/components/FormTextField';
import { WarehousePermissionGate } from 'shared/components/WarehousePermissionGate';
import { useHasPermission } from 'shared/hooks/queries/usePermissions';

import type { RoleWrite } from '@warehouser/contracts/access';
import type { AccessRole } from 'modules/access/types/access.types';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

type RoleEditorProps = {
  role: AccessRole;
  onDelete: () => void;
  onSave: (input: RoleWrite) => Promise<MutationResult>;
};

/**
 * Editor for one selected Role. It seeds itself from `role` once: the caller
 * keys it by Role id, so selecting another Role mounts a fresh editor instead
 * of resetting this one.
 *
 * The protected Warehouse Manager Role shows every Permission granted and
 * locked, offers no rename, no delete and no save, and says that it is
 * protected rather than leaving the missing controls unexplained.
 *
 * Two rules decide the editable surface and they stay separate: whether the
 * actor may update Roles at all, which `useHasPermission` answers here because
 * the answer feeds `isDisabled` rather than deciding whether an element renders,
 * and whether *this* Role in *this* Warehouse can be edited at all, which is
 * record state. Deleting is gated the same way, one rule per gate
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 *
 * The Permission catalogue is read here rather than handed down, because this
 * is the component that grants from it. `useAccessPermissions` owns its own
 * skip condition and RTK Query serves every caller from one cache entry, so
 * reading it beside the fieldset costs no extra request and keeps the Roles
 * tab from threading the catalogue through the directory on its way here.
 */
export const RoleEditor = ({
  role,
  onDelete,
  onSave,
}: RoleEditorProps): ReactElement => {
  const { t } = useTranslation('access');
  const permissions = useAccessPermissions();
  const { control, errors, isSubmitting, register, reset, submit } =
    useRoleForm({
      defaultValues: { name: role.name, permissionIds: role.permissionIds },
      onSave,
    });
  const { isArchived } = useAccessScope();
  const canUpdate = useHasPermission(PermissionId.ROLES_UPDATE);
  const isProtected = role.kind === 'warehouse_manager';
  const isEditable = canUpdate && !isProtected && !isArchived;

  const onDiscard = (): void => reset();

  return (
    <form
      aria-label={t('administration.roleEditor.editTitle')}
      className="rounded-xl border border-border bg-surface p-5 sm:p-6"
      noValidate
      onSubmit={submit}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{role.name}</h2>
          <p className="mt-1 text-sm text-muted">
            {isProtected
              ? t('roles.protected')
              : t('administration.roleEditor.subtitle', {
                  count: role.assignedMemberCount,
                })}
          </p>
        </div>
      </div>

      <Conditional when={isEditable}>
        <FormTextField
          className="mt-5"
          isRequired
          validationBehavior="aria"
          isInvalid={Boolean(errors.name)}
          errorMessage={errors.name?.message}
          defaultValue={role.name}
          isDisabled={isSubmitting}
          label={t('administration.roleEditor.name')}
          {...register('name')}
        />
      </Conditional>

      <div className="mt-6">
        <Controller
          control={control}
          name="permissionIds"
          render={({ field }) => (
            <PermissionFieldset
              isDisabled={!isEditable}
              permissions={permissions.items}
              selectedIds={
                isProtected
                  ? permissions.items.map((permission) => permission.id)
                  : field.value
              }
              onChange={field.onChange}
            />
          )}
        />
      </div>

      {/* Soft-danger delete on the left, Cancel then the primary on the right —
          the same footer the Workspace Role editor uses. */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <div>
          <WarehousePermissionGate permission={PermissionId.ROLES_DELETE}>
            <Conditional when={!isProtected && !isArchived}>
              <Button
                className="bg-danger-soft text-danger-soft-foreground hover:bg-danger-soft-hover"
                size="sm"
                variant="ghost"
                onPress={onDelete}
              >
                {t('administration.deleteRole')}
              </Button>
            </Conditional>
          </WarehousePermissionGate>
        </div>
        <Conditional when={isEditable}>
          <div className="flex gap-2">
            <Button
              isDisabled={isSubmitting}
              size="sm"
              variant="ghost"
              onPress={onDiscard}
            >
              {t('administration.cancel')}
            </Button>
            <Button
              className="font-semibold"
              isPending={isSubmitting}
              size="sm"
              type="submit"
              variant="primary"
            >
              {t('administration.roleEditor.saveChanges')}
            </Button>
          </div>
        </Conditional>
      </div>
    </form>
  );
};
