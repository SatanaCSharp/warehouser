import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useTransferWorkspaceOwnerMutation } from 'modules/access/api/workspace-members-api';
import { WorkspaceRefusalAlert } from 'modules/access/components/workspace-administration/members/WorkspaceRefusalAlert';
import { useWorkspaceMembers } from 'modules/access/hooks/queries/useWorkspaceMembers';
import { useWorkspaceRoles } from 'modules/access/hooks/queries/useWorkspaceRoles';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormSelectField } from 'shared/components/FormSelectField';

import type { ReactElement } from 'react';

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
export const TransferWorkspaceOwnershipDialog = (): ReactElement => {
  const { t } = useTranslation('access');
  const members = useWorkspaceMembers();
  const { customRoles } = useWorkspaceRoles();
  const [transferWorkspaceOwner] = useTransferWorkspaceOwnerMutation();
  const [refusalCode, setRefusalCode] = useState<string>();
  const form = useForm<TransferWorkspaceOwnershipForm>({
    defaultValues: { formerOwnerWorkspaceRoleId: '', recipientUserId: '' },
  });

  const recipients = (members ?? []).filter(
    (member) => member.workspaceRoleKind !== 'workspace_owner',
  );

  return (
    <FormModalDialog
      cancelLabel={t('workspaceMembers.transferOwnership.cancel')}
      submitLabel={t('workspaceMembers.transferOwnership.submit')}
      title={t('workspaceMembers.transferOwnership.title')}
      form={form}
      onRefusal={setRefusalCode}
      onSubmit={transferWorkspaceOwner}
    >
      <p className="text-muted">
        {t('workspaceMembers.transferOwnership.description')}
      </p>
      <Controller
        control={form.control}
        name="recipientUserId"
        rules={{ required: true }}
        render={({ field }) => (
          <FormSelectField
            isRequired
            validationBehavior="aria"
            description={t(
              'workspaceMembers.transferOwnership.newOwnerDescription',
            )}
            label={t('workspaceMembers.transferOwnership.newOwnerLabel')}
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
        control={form.control}
        name="formerOwnerWorkspaceRoleId"
        rules={{ required: true }}
        render={({ field }) => (
          <FormSelectField
            isRequired
            validationBehavior="aria"
            description={t(
              'workspaceMembers.transferOwnership.newRoleDescription',
            )}
            label={t('workspaceMembers.transferOwnership.newRoleLabel')}
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
          {t('workspaceMembers.transferOwnership.noticeTitle')}
        </p>
        <p className="text-sm text-muted">
          {t('workspaceMembers.transferOwnership.noticeDescription')}
        </p>
      </div>
      <WorkspaceRefusalAlert code={refusalCode} />
    </FormModalDialog>
  );
};
