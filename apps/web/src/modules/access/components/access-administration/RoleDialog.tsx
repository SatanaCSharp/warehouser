import {
  Button,
  Checkbox,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@heroui/react';
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

type RoleDialogProps = {
  permissions: AccessPermission[];
  role?: AccessRole;
  onClose: () => void;
  onSave: (input: RoleWrite) => Promise<MutationOutcome>;
};

type RoleForm = { name: string; permissionIds: string[] };

export const RoleDialog = ({
  permissions,
  role,
  onClose,
  onSave,
}: RoleDialogProps): ReactElement => {
  const { t } = useTranslation('access');
  const {
    control,
    formState: { errors },
    handleSubmit,
    setError,
  } = useForm<RoleForm>({
    defaultValues: {
      name: role?.name ?? '',
      permissionIds: role?.permissionIds ?? [],
    },
  });

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
  const title = role
    ? t('administration.roleEditor.editTitle')
    : t('administration.roleEditor.createTitle');

  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      size="lg"
      scrollBehavior="inside"
    >
      <ModalContent>
        <form onSubmit={handleSubmit(submit)}>
          <ModalHeader>{title}</ModalHeader>
          <ModalBody>
            <Controller
              control={control}
              name="name"
              render={({ field }) => (
                <Input
                  autoFocus
                  isRequired
                  validationBehavior="aria"
                  isInvalid={Boolean(errors.name)}
                  errorMessage={errors.name?.message}
                  label={t('administration.roleEditor.name')}
                  name={field.name}
                  value={field.value}
                  onBlur={field.onBlur}
                  onValueChange={field.onChange}
                />
              )}
            />
            <fieldset className="space-y-3">
              <legend className="font-medium">
                {t('administration.roleEditor.permissions')}
              </legend>
              {permissions.map((permission) => {
                const reserved = permission.kind === 'reserved';
                return (
                  <div key={permission.id}>
                    <Controller
                      control={control}
                      name="permissionIds"
                      render={({ field }) => (
                        <Checkbox
                          isDisabled={reserved}
                          isSelected={field.value.includes(permission.id)}
                          onValueChange={(checked) =>
                            field.onChange(
                              checked
                                ? [...field.value, permission.id]
                                : field.value.filter(
                                    (id) => id !== permission.id,
                                  ),
                            )
                          }
                        >
                          {permission.label}
                        </Checkbox>
                      )}
                    />
                    {reserved ? (
                      <p className="ml-6 text-sm text-foreground-500">
                        {t('administration.roleEditor.reserved')}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </fieldset>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClose}>
              {t('administration.cancel')}
            </Button>
            <Button color="primary" type="submit">
              {t('administration.roleEditor.save')}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};
