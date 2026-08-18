import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useRenameWorkspace } from 'modules/workspace/hooks/mutations/useRenameWorkspace';
import { nameWorkspaceFormSchema } from 'modules/workspace/schemas/name-workspace-form.schema';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormTextField } from 'shared/components/FormTextField';
import { useFormFieldErrors } from 'shared/hooks/forms/useFormFieldErrors';

import type { ReactElement } from 'react';

type NameWorkspaceForm = { name: string };

type NameWorkspaceDialogProps = {
  currentName: string | null;
  onClose: () => void;
};

/**
 * Names an unnamed Workspace, or changes its existing name (AC-29). Owned
 * exclusively by `NameWorkspaceAction`, which is the only trigger for it.
 */
export const NameWorkspaceDialog = ({
  currentName,
  onClose,
}: NameWorkspaceDialogProps): ReactElement => {
  const { t } = useTranslation('workspace');
  const { t: translateValidation } = useTranslation('validation');
  const renameWorkspace = useRenameWorkspace();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
  } = useForm<NameWorkspaceForm>({
    defaultValues: { name: currentName ?? '' },
  });
  const { setFieldError } = useFormFieldErrors<NameWorkspaceForm>(setError);

  const submit = async ({ name }: NameWorkspaceForm): Promise<void> => {
    const parsedName = nameWorkspaceFormSchema.safeParse({ name });
    if (!parsedName.success) {
      setFieldError(
        'name',
        parsedName.error.issues[0]?.message,
        translateValidation,
      );
      return;
    }

    const result = await renameWorkspace(parsedName.data);
    if (result.success) {
      onClose();
      return;
    }
    if (setFieldError('name', result.fieldErrors?.name, translateValidation)) {
      return;
    }
    onClose();
  };

  const isUnnamed = currentName === null;

  return (
    <FormModalDialog
      title={
        isUnnamed ? t('nameWorkspace.title') : t('nameWorkspace.titleRename')
      }
      cancelLabel={t('nameWorkspace.cancel')}
      submitLabel={t('nameWorkspace.save')}
      noValidate
      isSubmitting={isSubmitting}
      onClose={onClose}
      onSubmit={handleSubmit(submit)}
    >
      <p className="text-muted">
        {isUnnamed
          ? t('nameWorkspace.description')
          : t('nameWorkspace.descriptionRename')}
      </p>
      <FormTextField
        autoFocus
        isRequired
        validationBehavior="aria"
        isInvalid={Boolean(errors.name)}
        errorMessage={errors.name?.message}
        defaultValue={currentName ?? ''}
        label={t('nameWorkspace.nameLabel')}
        description={t('nameWorkspace.nameDescription')}
        isDisabled={isSubmitting}
        {...register('name')}
      />
    </FormModalDialog>
  );
};
