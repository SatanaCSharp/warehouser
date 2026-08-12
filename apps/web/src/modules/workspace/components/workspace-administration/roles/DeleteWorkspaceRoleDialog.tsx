import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormSelectField } from 'shared/components/FormSelectField';

import type { WorkspaceRole } from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';

type DeleteWorkspaceRoleDialogProps = {
  replacements: WorkspaceRole[];
  role: WorkspaceRole;
  onClose: () => void;
  onDelete: (replacementWorkspaceRoleId?: string) => Promise<void>;
};

type DeleteWorkspaceRoleForm = { replacementWorkspaceRoleId: string };

/**
 * Deletes a custom Workspace Role. An assigned Role asks for the replacement
 * every member holding it moves to, and says that both happen as one outcome
 * (AC-17); an unassigned one states that no Workspace Role assignment changes
 * and takes no replacement at all (AC-17a).
 */
export const DeleteWorkspaceRoleDialog = ({
  replacements,
  role,
  onClose,
  onDelete,
}: DeleteWorkspaceRoleDialogProps): ReactElement => {
  const { t } = useTranslation('workspace');
  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
  } = useForm<DeleteWorkspaceRoleForm>({
    defaultValues: { replacementWorkspaceRoleId: '' },
  });
  const isAssigned = role.assignedMemberCount > 0;

  return (
    <FormModalDialog
      cancelLabel={t('workspaceRoles.delete.cancel')}
      isSubmitting={isSubmitting}
      noValidate
      submitLabel={
        isAssigned
          ? t('workspaceRoles.delete.submit')
          : t('workspaceRoles.delete.trigger')
      }
      submitVariant="danger"
      title={t('workspaceRoles.delete.title', { name: role.name })}
      onClose={onClose}
      onSubmit={handleSubmit(({ replacementWorkspaceRoleId }) =>
        onDelete(isAssigned ? replacementWorkspaceRoleId : undefined),
      )}
    >
      {isAssigned ? (
        <>
          <p className="text-muted">
            {t('workspaceRoles.delete.description', {
              count: role.assignedMemberCount,
            })}
          </p>
          <Controller
            control={control}
            name="replacementWorkspaceRoleId"
            rules={{ required: true }}
            render={({ field }) => (
              <FormSelectField
                isRequired
                validationBehavior="aria"
                description={t('workspaceRoles.delete.replacementDescription')}
                label={t('workspaceRoles.delete.replacementLabel', {
                  count: role.assignedMemberCount,
                })}
                name={field.name}
                options={replacements.map((candidate) => ({
                  id: candidate.id,
                  label: candidate.name,
                }))}
                value={field.value}
                onBlur={field.onBlur}
                onChange={field.onChange}
              />
            )}
          />
          <div className="rounded-lg border border-border bg-surface-secondary p-3">
            <p className="font-semibold">
              {t('workspaceRoles.delete.noticeTitle')}
            </p>
            <p className="text-sm text-muted">
              {t('workspaceRoles.delete.noticeDescription')}
            </p>
          </div>
        </>
      ) : (
        <p className="text-muted">
          {t('workspaceRoles.delete.unassignedDescription')}
        </p>
      )}
    </FormModalDialog>
  );
};
