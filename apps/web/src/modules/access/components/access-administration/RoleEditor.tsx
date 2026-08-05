import { Button, Checkbox, Input } from '@heroui/react';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

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
    reset,
    setError,
  } = useForm<RoleForm>({
    defaultValues: { name: role.name, permissionIds: role.permissionIds },
  });
  const protectedRole = role.kind === 'warehouse_manager';

  useEffect(() => {
    reset({ name: role.name, permissionIds: role.permissionIds });
  }, [reset, role]);

  const submit = async ({ name, permissionIds }: RoleForm): Promise<void> => {
    const parsed = parseRoleForm(name, permissionIds);
    if (!parsed.success) {
      setError('name', {
        message: t(`administration.roleEditor.validation.${parsed.error}`),
      });
      return;
    }

    const result = await onSave(parsed.data);
    if (!result.success && result.fieldErrors?.name) {
      setError('name', {
        message: t('administration.roleEditor.validation.server'),
      });
    }
  };

  return (
    <form
      className="rounded-large border border-divider bg-content1 p-5 shadow-none sm:p-6"
      onSubmit={handleSubmit(submit)}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{role.name}</h2>
          <p className="mt-1 text-sm text-foreground-500">
            {protectedRole
              ? t('roles.protected')
              : t('administration.roleEditor.subtitle', {
                  count: role.assignedMemberCount,
                })}
          </p>
        </div>
        <div className="flex gap-2">
          {canDelete && !protectedRole ? (
            <Button color="danger" variant="light" onPress={onDelete}>
              {t('administration.deleteRole', { name: role.name })}
            </Button>
          ) : null}
          {canUpdate && !protectedRole ? (
            <Button
              color="primary"
              size="lg"
              type="submit"
              isLoading={isSubmitting}
              className="min-w-40 font-semibold"
            >
              {t('administration.roleEditor.saveChanges')}
            </Button>
          ) : null}
        </div>
      </div>
      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <Input
            className="mt-5"
            aria-label={t('administration.roleEditor.selectedName')}
            isDisabled={protectedRole || !canUpdate}
            isInvalid={Boolean(errors.name)}
            errorMessage={errors.name?.message}
            label={t('administration.roleEditor.name')}
            labelPlacement="outside"
            name={field.name}
            value={field.value}
            onBlur={field.onBlur}
            onValueChange={field.onChange}
            classNames={{
              inputWrapper:
                'h-12 border border-divider bg-content1 shadow-none',
            }}
          />
        )}
      />
      <fieldset className="mt-6 space-y-3">
        <legend className="font-semibold">
          {t('administration.roleEditor.permissions')}
        </legend>
        <p className="pb-2 text-sm text-foreground-500">
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
                    className={`rounded-medium px-3 py-3 ${checked ? 'bg-primary-50' : disabled ? 'bg-content2/70' : 'bg-content2'}`}
                    key={permission.id}
                  >
                    <Checkbox
                      isDisabled={disabled}
                      isSelected={checked}
                      onValueChange={(value) =>
                        field.onChange(
                          value
                            ? [...field.value, permission.id]
                            : field.value.filter((id) => id !== permission.id),
                        )
                      }
                    >
                      <span className="font-medium">{permission.label}</span>
                    </Checkbox>
                    {permission.kind === 'reserved' ? (
                      <p className="ml-7 text-sm text-foreground-400">
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
