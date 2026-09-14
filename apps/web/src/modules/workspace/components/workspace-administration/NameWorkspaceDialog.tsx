import type { NameWorkspaceFormValues } from 'modules/workspace/schemas/name-workspace-form.schema';
import { nameWorkspaceFormSchema } from 'modules/workspace/schemas/name-workspace-form.schema';
import type { ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useRenameWorkspaceMutation } from 'shared/api/workspace/workspace-context-api';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormTextField } from 'shared/components/FormTextField';
import { parseWithSchema } from 'shared/utils/form-parse';

type NameWorkspaceDialogProps = {
  currentName: string | null;
};

/** AC-29a — the browser pre-check the dialog runs before the request leaves. */
const parse = parseWithSchema(nameWorkspaceFormSchema);

/** A Workspace that has never been named has nothing to seed the field with. */
const seedNameOf = (currentName: string | null): string => currentName ?? '';

/**
 * AC-29 — one dialog both names an unnamed Workspace and renames a named one,
 * and its title and description are what say which of the two is happening. The
 * pair is resolved together so the two can never disagree.
 */
const copyOf = (
  currentName: string | null,
  t: (key: string) => string,
): { title: string; description: string } =>
  currentName === null
    ? {
        title: t('nameWorkspace.title'),
        description: t('nameWorkspace.description'),
      }
    : {
        title: t('nameWorkspace.titleRename'),
        description: t('nameWorkspace.descriptionRename'),
      };

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
  const seedName = seedNameOf(currentName);
  const { title, description } = copyOf(currentName, t);
  const form = useForm<NameWorkspaceFormValues>({
    defaultValues: { name: seedName },
  });
  const {
    formState: { errors, isSubmitting },
    register,
  } = form;

  return (
    <FormModalDialog
      title={title}
      cancelLabel={t('nameWorkspace.cancel')}
      submitLabel={t('nameWorkspace.save')}
      form={form}
      parse={parse}
      translateValidation={translateValidation}
      onSubmit={renameWorkspace}
    >
      <p className="text-muted">{description}</p>
      <FormTextField
        autoFocus
        isRequired
        validationBehavior="aria"
        isInvalid={Boolean(errors.name)}
        errorMessage={errors.name?.message}
        defaultValue={seedName}
        label={t('nameWorkspace.nameLabel')}
        description={t('nameWorkspace.nameDescription')}
        isDisabled={isSubmitting}
        {...register('name')}
      />
    </FormModalDialog>
  );
};
