import type { WorkspaceRoleWrite } from '@warehouser/contracts/workspaces';
import type { WorkspaceRoleFormValues } from 'modules/access/schemas/workspace-role-form.schema';
import { workspaceRoleFormSchema } from 'modules/access/schemas/workspace-role-form.schema';
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
import { parseWithSchema } from 'shared/utils/form-parse';

type WorkspaceRoleFormOptions = {
  defaultValues: WorkspaceRoleFormValues;
  onSave: (input: WorkspaceRoleWrite) => Promise<MutationResult>;
};

type WorkspaceRoleFormSession = {
  control: Control<WorkspaceRoleFormValues>;
  errors: FieldErrors<WorkspaceRoleFormValues>;
  isSubmitting: boolean;
  register: UseFormRegister<WorkspaceRoleFormValues>;
  /** Returns the fields to the Role they were seeded from, discarding edits. */
  reset: UseFormReset<WorkspaceRoleFormValues>;
  submit: (event: SubmitEvent<HTMLFormElement>) => Promise<void>;
};

/** AC-15a — the browser pre-check that runs before the request leaves. */
const parse = parseWithSchema(workspaceRoleFormSchema);

/**
 * The name-and-grants form of the inline Workspace Role editor: it validates
 * against the Workspace Role contract before the request leaves the browser,
 * and turns a rejection the server explains on the name into the same inline
 * message.
 *
 * The create dialog runs the same validation through `FormModalDialog`, which
 * owns the submit sequence for every dialog
 * (`docs/system/guides/web-dialogs.md`). This hook exists for the editor, which
 * is an inline form and has no dialog to close — so it normalizes the settled
 * request itself.
 */
export const useWorkspaceRoleForm = ({
  defaultValues,
  onSave,
}: WorkspaceRoleFormOptions): WorkspaceRoleFormSession => {
  const { t: translateValidation } = useTranslation('validation');
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<WorkspaceRoleFormValues>({ defaultValues });
  const { setFieldError } =
    useFormFieldErrors<WorkspaceRoleFormValues>(setError);

  const submit = handleSubmit(async (values) => {
    const parsed = parse(values);
    if (!parsed.success) {
      setFieldError('name', parsed.error.name, translateValidation);
      return;
    }

    const outcome = mutationOutcome(await onSave(parsed.data));
    if (!outcome.success) {
      setFieldError('name', outcome.fieldErrors?.name, translateValidation);
    }
  });

  return { control, errors, isSubmitting, register, reset, submit };
};
