import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { nameWorkspaceFormSchema } from 'modules/workspace/schemas/name-workspace-form.schema';
import { useRenameWorkspaceMutation } from 'shared/api/workspace/workspace-context-api';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormTextField } from 'shared/components/FormTextField';
import { parseWithSchema } from 'shared/utils/form-parse';

import type { NameWorkspaceFormValues } from 'modules/workspace/schemas/name-workspace-form.schema';
import type { ReactElement } from 'react';

type NameWorkspaceDialogProps = {
  currentName: string | null;
};

/** AC-29a — the browser pre-check the dialog runs before the request leaves. */
const parse = parseWithSchema(nameWorkspaceFormSchema);

/**
 * Names an unnamed Workspace, or changes its existing name (AC-29). Owned
 * exclusively by `NameWorkspaceAction`, which is the only trigger for it.
 */
export const NameWorkspaceDialog = ({
  currentName,
}: NameWorkspaceDialogProps): ReactElement => {
  const { t } = useTranslation('workspace');
  const { t: translateValidation } = useTranslation('validation');
  const [renameWorkspace] = useRenameWorkspaceMutation();
  const form = useForm<NameWorkspaceFormValues>({
    defaultValues: { name: currentName ?? '' },
  });
  const {
    formState: { errors, isSubmitting },
    register,
  } = form;
  const isUnnamed = currentName === null;

  return (
    <FormModalDialog
      title={
        isUnnamed ? t('nameWorkspace.title') : t('nameWorkspace.titleRename')
      }
      cancelLabel={t('nameWorkspace.cancel')}
      submitLabel={t('nameWorkspace.save')}
      form={form}
      parse={parse}
      translateValidation={translateValidation}
      onSubmit={renameWorkspace}
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
