import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { WorkspaceRefusalAlert } from 'modules/workspace/components/workspace-administration/members/WorkspaceRefusalAlert';
import { useTransferWorkspaceOwner } from 'modules/workspace/hooks/useTransferWorkspaceOwner';
import { useWorkspaceMembers } from 'modules/workspace/hooks/useWorkspaceMembers';
import { useWorkspaceRoles } from 'modules/workspace/hooks/useWorkspaceRoles';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormSelectField } from 'shared/components/FormSelectField';

import type { ReactElement } from 'react';

type TransferWorkspaceOwnershipDialogProps = { onClose: () => void };

type TransferWorkspaceOwnershipForm = {
  formerOwnerWorkspaceRoleId: string;
  recipientUserId: string;
};

/**
 * Transfers Workspace Owner: the recipient becomes the sole Owner and the
 * outgoing Owner receives the chosen custom Workspace Role as one outcome
 * (AC-26). Both choices are required, so nothing is requested until the
 * outgoing Owner has a Role to end the transfer holding.
 *
 * The recipient must already be a Workspace Member (AC-28) and cannot be the
 * current Owner, who is the actor here — a Workspace always has exactly one.
 * Reading the Members and the Roles here rather than receiving them keeps the
 * member row that triggers this workflow free of both datasets
 * (writing-web-components.md §4).
 */
export const TransferWorkspaceOwnershipDialog = ({
  onClose,
}: TransferWorkspaceOwnershipDialogProps): ReactElement => {
  const { t } = useTranslation('workspace');
  const members = useWorkspaceMembers();
  const { customRoles } = useWorkspaceRoles();
  const transferWorkspaceOwner = useTransferWorkspaceOwner();
  const [refusalCode, setRefusalCode] = useState<string>();
  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
  } = useForm<TransferWorkspaceOwnershipForm>({
    defaultValues: { formerOwnerWorkspaceRoleId: '', recipientUserId: '' },
  });

  const recipients = (members ?? []).filter(
    (member) => member.workspaceRoleKind !== 'workspace_owner',
  );

  const submit = async (
    values: TransferWorkspaceOwnershipForm,
  ): Promise<void> => {
    const outcome = await transferWorkspaceOwner(values);
    if (outcome.success) {
      onClose();
      return;
    }
    setRefusalCode(outcome.code);
  };

  return (
    <FormModalDialog
      cancelLabel={t('members.transferOwnership.cancel')}
      isSubmitting={isSubmitting}
      noValidate
      submitLabel={t('members.transferOwnership.submit')}
      title={t('members.transferOwnership.title')}
      onClose={onClose}
      onSubmit={handleSubmit(submit)}
    >
      <p className="text-muted">{t('members.transferOwnership.description')}</p>
      <Controller
        control={control}
        name="recipientUserId"
        rules={{ required: true }}
        render={({ field }) => (
          <FormSelectField
            isRequired
            validationBehavior="aria"
            description={t('members.transferOwnership.newOwnerDescription')}
            label={t('members.transferOwnership.newOwnerLabel')}
            name={field.name}
            options={recipients.map((member) => ({
              id: member.userId,
              label: member.email ?? member.userId,
            }))}
            value={field.value}
            onBlur={field.onBlur}
            onChange={field.onChange}
          />
        )}
      />
      <Controller
        control={control}
        name="formerOwnerWorkspaceRoleId"
        rules={{ required: true }}
        render={({ field }) => (
          <FormSelectField
            isRequired
            validationBehavior="aria"
            description={t('members.transferOwnership.newRoleDescription')}
            label={t('members.transferOwnership.newRoleLabel')}
            name={field.name}
            options={customRoles.map((role) => ({
              id: role.id,
              label: role.name,
            }))}
            value={field.value}
            onBlur={field.onBlur}
            onChange={field.onChange}
          />
        )}
      />
      <div className="rounded-lg border border-border bg-surface-secondary p-3">
        <p className="font-semibold">
          {t('members.transferOwnership.noticeTitle')}
        </p>
        <p className="text-sm text-muted">
          {t('members.transferOwnership.noticeDescription')}
        </p>
      </div>
      <WorkspaceRefusalAlert code={refusalCode} />
    </FormModalDialog>
  );
};
