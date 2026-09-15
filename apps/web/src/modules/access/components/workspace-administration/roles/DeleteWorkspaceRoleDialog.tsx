import type { WorkspaceRole } from '@warehouser/contracts/workspaces';
import { DeleteWorkspaceRoleRefusal } from 'modules/access/components/workspace-administration/roles/DeleteWorkspaceRoleRefusal';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { Conditional } from 'shared/components/Conditional';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormSelectField } from 'shared/components/FormSelectField';

type DeleteWorkspaceRoleDialogProps = {
  replacements: WorkspaceRole[];
  role: WorkspaceRole;
  onDelete: (replacementWorkspaceRoleId?: string) => Promise<MutationResult>;
};

type DeleteWorkspaceRoleForm = { replacementWorkspaceRoleId: string };

/**
 * Deletes a custom Workspace Role. An assigned Role asks for the replacement
 * every member holding it moves to, and says that both happen as one outcome
 * (AC-17); an unassigned one states that no Workspace Role assignment changes
 * and takes no replacement at all (AC-17a).
 *
 * When the assigned Role is the Workspace's only custom one no replacement can
 * exist — the protected Workspace Owner Role is never assigned this way — so
 * the member is told what has to exist first instead of being asked to choose
 * from an empty required list, and a deletion that cannot succeed is not
 * offered (AC-17c).
 */
export const DeleteWorkspaceRoleDialog = ({
  replacements,
  role,
  onDelete,
}: DeleteWorkspaceRoleDialogProps): ReactElement => {
  const { t } = useTranslation('access');
  const [refusalCode, setRefusalCode] = useState<string>();
  const form = useForm<DeleteWorkspaceRoleForm>({
    defaultValues: { replacementWorkspaceRoleId: '' },
  });
  const isAssigned = role.assignedMemberCount > 0;
  const hasNoReplacement = isAssigned && replacements.length === 0;
  const asksForReplacement = isAssigned && !hasNoReplacement;

  const onSubmit = ({
    replacementWorkspaceRoleId,
  }: DeleteWorkspaceRoleForm): Promise<MutationResult> =>
    onDelete(isAssigned ? replacementWorkspaceRoleId : undefined);

  return (
    <FormModalDialog
      cancelLabel={t('workspaceRoles.delete.cancel')}
      isSubmitDisabled={hasNoReplacement}
      submitLabel={
        isAssigned
          ? t('workspaceRoles.delete.submit')
          : t('workspaceRoles.delete.trigger')
      }
      submitVariant="danger"
      title={t('workspaceRoles.delete.title', { name: role.name })}
      form={form}
      onRefusal={setRefusalCode}
      onSubmit={onSubmit}
    >
      <Conditional when={asksForReplacement}>
        <>
          <p className="text-muted">
            {t('workspaceRoles.delete.description', {
              count: role.assignedMemberCount,
            })}
          </p>
          <Controller
            control={form.control}
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
      </Conditional>

      <Conditional when={!isAssigned}>
        <p className="text-muted">
          {t('workspaceRoles.delete.unassignedDescription')}
        </p>
      </Conditional>

      <DeleteWorkspaceRoleRefusal
        code={refusalCode}
        hasNoReplacement={hasNoReplacement}
      />
    </FormModalDialog>
  );
};
