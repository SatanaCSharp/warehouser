import type { RoleWrite } from '@warehouser/contracts/access';
import type { RoleFormValues } from 'modules/access/schemas/role-form';
import { parseRoleFormValues } from 'modules/access/schemas/role-form';
import type { SubmitEvent } from 'react';
import type {
  Control,
  FieldErrors,
  UseFormRegister,
  UseFormReset,
} from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { mutationOutcome } from 'shared/api/client/mutation-outcome';
import { useFormFieldErrors } from 'shared/hooks/forms/useFormFieldErrors';

type RoleFormOptions = {
  defaultValues: RoleFormValues;
  onSave: (input: RoleWrite) => Promise<MutationResult>;
};

type RoleFormSession = {
  control: Control<RoleFormValues>;
  errors: FieldErrors<RoleFormValues>;
  isSubmitting: boolean;
  register: UseFormRegister<RoleFormValues>;
  /** Returns the fields to the Role they were seeded from, discarding edits. */
  reset: UseFormReset<RoleFormValues>;
  submit: (event: SubmitEvent<HTMLFormElement>) => Promise<void>;
};

/**
 * The Role name-and-grants form of the inline Role editor: it validates
 * against the Role contract before the request leaves the browser, and turns a
 * rejection the server explains on the name into the same inline message.
 *
 * The create dialog runs the same validation through `FormModalDialog`, which
 * owns the submit sequence for every dialog
 * (`docs/system/guides/web-dialogs.md`). This hook exists for the editor,
 * which is an inline form and has no dialog to close.
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
    reset,
    setError,
  } = useForm<RoleFormValues>({ defaultValues });
  const { setFieldError } = useFormFieldErrors<RoleFormValues>(setError);
  const translateValidation = (code: string): string =>
    t(`administration.roleEditor.validation.${code}`);

  const submit = handleSubmit(async (values) => {
    const parsed = parseRoleFormValues(values);
    if (!parsed.success) {
      setFieldError('name', parsed.error.name, translateValidation);
      return;
    }

    // Not a `FormModalDialog`: the editor stays on the page rather than
    // closing, so it normalizes the settled request itself.
    const outcome = mutationOutcome(await onSave(parsed.data));
    if (!outcome.success && outcome.fieldErrors?.name) {
      setFieldError('name', 'server', translateValidation);
    }
  });

  return { control, errors, isSubmitting, register, reset, submit };
};
