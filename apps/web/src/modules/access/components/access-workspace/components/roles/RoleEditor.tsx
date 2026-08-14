import { Button, FieldError, Input, Label, TextField } from '@heroui/react';
import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { PermissionCheckbox } from 'modules/access/components/access-workspace/components/roles/PermissionCheckbox';
import { useRoleForm } from 'modules/access/hooks/useRoleForm';

import type { RoleWrite } from '@warehouser/contracts/access';
import type {
  AccessPermission,
  AccessRole,
} from 'modules/access/types/access.types';
import type { ReactElement } from 'react';
import type { MutationOutcome } from 'shared/api/mutation-outcome';

type RoleEditorProps = {
  canDelete: boolean;
  canUpdate: boolean;
  permissions: AccessPermission[];
  role: AccessRole;
  onDelete: () => void;
  onSave: (input: RoleWrite) => Promise<MutationOutcome>;
};

const rowClassName = (isGranted: boolean, isDisabled: boolean): string => {
  if (isGranted) {
    return 'rounded-lg bg-accent-soft px-3 py-3';
  }
  return isDisabled
    ? 'rounded-lg bg-surface-secondary/70 px-3 py-3'
    : 'rounded-lg bg-surface-secondary px-3 py-3';
};

/**
 * Editor for one selected Role. It seeds itself from `role` once: the caller
 * keys it by Role id, so selecting another Role mounts a fresh editor instead
 * of resetting this one. The protected Warehouse Manager Role shows every
 * Permission granted and locked — it is never edited from here.
 */
export const RoleEditor = ({
  canDelete,
  canUpdate,
  permissions,
  role,
  onDelete,
  onSave,
}: RoleEditorProps): ReactElement => {
  const { t } = useTranslation('access');
  const { control, errors, isSubmitting, submit } = useRoleForm({
    defaultValues: { name: role.name, permissionIds: role.permissionIds },
    onSave,
  });
  const isProtected = role.kind === 'warehouse_manager';
  const isEditable = canUpdate && !isProtected;

  return (
    <form
      className="rounded-xl border border-border bg-surface p-5 shadow-none sm:p-6"
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
        <div className="flex gap-2">
          {canDelete && !isProtected ? (
            <Button
              variant="ghost"
              size="sm"
              className="bg-danger-soft text-danger-soft-foreground hover:bg-danger-soft-hover"
              onPress={onDelete}
            >
              {t('administration.deleteRole')}
            </Button>
          ) : null}
          {isEditable ? (
            <Button
              variant="primary"
              type="submit"
              size="sm"
              isPending={isSubmitting}
              className="font-semibold"
            >
              {t('administration.roleEditor.saveChanges')}
            </Button>
          ) : null}
        </div>
      </div>

      <TextField
        className="mt-5"
        isDisabled={!isEditable}
        isInvalid={Boolean(errors.name)}
      >
        <Label>{t('administration.roleEditor.name')}</Label>
        <Controller
          control={control}
          name="name"
          render={({ field }) => (
            <Input
              aria-label={t('administration.roleEditor.selectedName')}
              className="h-12 border border-border bg-surface shadow-none"
              name={field.name}
              value={field.value}
              onBlur={field.onBlur}
              onChange={field.onChange}
            />
          )}
        />
        <FieldError>{errors.name?.message}</FieldError>
      </TextField>

      <fieldset className="mt-6 space-y-3">
        <legend className="font-semibold">
          {t('administration.roleEditor.permissions')}
        </legend>
        <p className="pb-2 text-sm text-muted">
          {t('administration.roleEditor.hint')}
        </p>
        <Controller
          control={control}
          name="permissionIds"
          render={({ field }) => (
            <>
              {permissions.map((permission) => {
                const isDisabled =
                  !isEditable || permission.kind === 'reserved';
                const isGranted =
                  isProtected || field.value.includes(permission.id);
                return (
                  <PermissionCheckbox
                    key={permission.id}
                    className={rowClassName(isGranted, isDisabled)}
                    isDisabled={isDisabled}
                    isSelected={isGranted}
                    permission={permission}
                    onChange={(isSelected) =>
                      field.onChange(
                        isSelected
                          ? [...field.value, permission.id]
                          : field.value.filter((id) => id !== permission.id),
                      )
                    }
                  />
                );
              })}
            </>
          )}
        />
      </fieldset>
    </form>
  );
};
