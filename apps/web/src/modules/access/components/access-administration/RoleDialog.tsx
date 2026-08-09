import {
  Button,
  Checkbox,
  FieldError,
  Input,
  Label,
  Modal,
  TextField,
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
    <Modal.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <Modal.Container size="lg" scroll="inside">
        <Modal.Dialog>
          <form onSubmit={handleSubmit(submit)}>
            <Modal.Header>
              <Modal.Heading>{title}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <TextField
                isRequired
                validationBehavior="aria"
                isInvalid={Boolean(errors.name)}
              >
                <Label>{t('administration.roleEditor.name')}</Label>
                <Controller
                  control={control}
                  name="name"
                  render={({ field }) => (
                    <Input
                      autoFocus
                      name={field.name}
                      value={field.value}
                      onBlur={field.onBlur}
                      onChange={field.onChange}
                    />
                  )}
                />
                <FieldError>{errors.name?.message}</FieldError>
              </TextField>
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
                            onChange={(checked) =>
                              field.onChange(
                                checked
                                  ? [...field.value, permission.id]
                                  : field.value.filter(
                                      (id) => id !== permission.id,
                                    ),
                              )
                            }
                          >
                            <Checkbox.Content>
                              <Checkbox.Control>
                                <Checkbox.Indicator />
                              </Checkbox.Control>
                              {permission.label}
                            </Checkbox.Content>
                          </Checkbox>
                        )}
                      />
                      {reserved ? (
                        <p className="ml-6 text-sm text-muted">
                          {t('administration.roleEditor.reserved')}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </fieldset>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" onPress={onClose}>
                {t('administration.cancel')}
              </Button>
              <Button variant="primary" type="submit">
                {t('administration.roleEditor.save')}
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
};
