import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useFormFieldErrors } from 'modules/access/hooks/useFormFieldErrors';
import { parseRoleForm } from 'modules/access/schemas/role-form';

import type { RoleWrite } from '@warehouser/contracts/access';
import type { MutationOutcome } from 'modules/access/types/access.types';
import type { FormEvent } from 'react';
import type { Control, FieldErrors, UseFormRegister } from 'react-hook-form';

export type RoleFormValues = { name: string; permissionIds: string[] };

type RoleFormOptions = {
  defaultValues: RoleFormValues;
  onSave: (input: RoleWrite) => Promise<MutationOutcome>;
};

type RoleFormSession = {
  control: Control<RoleFormValues>;
  errors: FieldErrors<RoleFormValues>;
  isSubmitting: boolean;
  register: UseFormRegister<RoleFormValues>;
  submit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

/**
 * The Role name-and-grants form, shared by the create dialog and the inline
 * editor: it validates against the Role contract before the request leaves the
 * browser, and turns a rejection the server explains on the name into the same
 * inline message.
 */
export const useRoleForm = ({
  defaultValues,
  onSave,
}: RoleFormOptions): RoleFormSession => {
  const { t } = useTranslation('access');
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
  } = useForm<RoleFormValues>({ defaultValues });
  const { setFieldError } = useFormFieldErrors<RoleFormValues>(setError);
  const translateValidation = (code: string): string =>
    t(`administration.roleEditor.validation.${code}`);

  const submit = handleSubmit(async ({ name, permissionIds }) => {
    const parsed = parseRoleForm(name, permissionIds);
    if (!parsed.success) {
      setFieldError('name', parsed.error, translateValidation);
      return;
    }

    const result = await onSave(parsed.data);
    if (!result.success && result.fieldErrors?.name) {
      setFieldError('name', 'server', translateValidation);
    }
  });

  return { control, errors, isSubmitting, register, submit };
};
