import {
  Button,
  Checkbox,
  FieldError,
  Input,
  Label,
  TextField,
} from '@heroui/react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useFormFieldErrors } from 'modules/access/hooks/useFormFieldErrors';
import { parseRoleForm } from 'modules/access/schemas/role-form';

import type { RoleWrite } from '@warehouser/contracts/access';
import type {
  AccessPermission,
  AccessRole,
  MutationOutcome,
} from 'modules/access/types/access-administration.types';
import type { ReactElement } from 'react';

type RoleEditorProps = {
  canDelete: boolean;
  canUpdate: boolean;
  permissions: AccessPermission[];
  role: AccessRole;
  onDelete: () => void;
  onSave: (input: RoleWrite) => Promise<MutationOutcome>;
};

type RoleForm = { name: string; permissionIds: string[] };

/**
 * Editor for one selected role. It seeds itself from `role` once: the caller
 * keys it by role id, so selecting another role mounts a fresh editor instead
 * of resetting this one.
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
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    setError,
  } = useForm<RoleForm>({
    defaultValues: { name: role.name, permissionIds: role.permissionIds },
  });
  const { setFieldError } = useFormFieldErrors<RoleForm>(setError);
  const translateValidation = (code: string): string =>
    t(`administration.roleEditor.validation.${code}`);
  const protectedRole = role.kind === 'warehouse_manager';

  const submit = async ({ name, permissionIds }: RoleForm): Promise<void> => {
    const parsed = parseRoleForm(name, permissionIds);
    if (!parsed.success) {
      setFieldError('name', parsed.error, translateValidation);
      return;
    }

    const result = await onSave(parsed.data);
    if (!result.success && result.fieldErrors?.name) {
      setFieldError('name', 'server', translateValidation);
    }
  };

  return (
    <form
      className="rounded-xl border border-border bg-surface p-5 shadow-none sm:p-6"
      onSubmit={handleSubmit(submit)}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{role.name}</h2>
          <p className="mt-1 text-sm text-muted">
            {protectedRole
              ? t('roles.protected')
              : t('administration.roleEditor.subtitle', {
                  count: role.assignedMemberCount,
                })}
          </p>
        </div>
        <div className="flex gap-2">
          {canDelete && !protectedRole ? (
            <Button
              variant="ghost"
              size="sm"
              className="bg-danger-soft text-danger-soft-foreground hover:bg-danger-soft-hover"
              onPress={onDelete}
            >
              {t('administration.deleteRole')}
            </Button>
          ) : null}
          {canUpdate && !protectedRole ? (
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
        isDisabled={protectedRole || !canUpdate}
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
                const disabled =
                  protectedRole || !canUpdate || permission.kind === 'reserved';
                const checked =
                  protectedRole || field.value.includes(permission.id);
                return (
                  <div
                    className={`rounded-lg px-3 py-3 ${checked ? 'bg-accent-soft' : disabled ? 'bg-surface-secondary/70' : 'bg-surface-secondary'}`}
                    key={permission.id}
                  >
                    <Checkbox
                      isDisabled={disabled}
                      isSelected={checked}
                      onChange={(value) =>
                        field.onChange(
                          value
                            ? [...field.value, permission.id]
                            : field.value.filter((id) => id !== permission.id),
                        )
                      }
                    >
                      <Checkbox.Content>
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                        <span className="font-medium">
                          {t(
                            `permissions.items.${permission.id.replace(':', '_')}`,
                            permission.label,
                          )}
                        </span>
                      </Checkbox.Content>
                    </Checkbox>
                    {permission.kind === 'reserved' ? (
                      <p className="ml-7 text-sm text-muted">
                        {t('administration.roleEditor.reserved')}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </>
          )}
        />
      </fieldset>
    </form>
  );
};
