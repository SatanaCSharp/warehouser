import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormSelectField } from 'shared/components/FormSelectField';

import type {
  AccessMember,
  AccessRole,
} from 'modules/access/types/access.types';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

type TransferManagerDialogProps = {
  /** The member holding the Warehouse Manager role today — the acting user. */
  currentManager?: AccessMember;
  members: AccessMember[];
  roles: AccessRole[];
  onTransfer: (
    recipientId: string,
    replacementRoleId: string,
  ) => Promise<MutationResult>;
};

type TransferForm = { recipient: string; replacement: string };

/**
 * Hands the Warehouse Manager role to another member. Both sides of the swap
 * are named before it is confirmed, because the acting user loses the role in
 * the same step.
 */
export const TransferManagerDialog = ({
  currentManager,
  members,
  roles,
  onTransfer,
}: TransferManagerDialogProps): ReactElement => {
  const { t } = useTranslation('access');
  const form = useForm<TransferForm>({
    defaultValues: { recipient: '', replacement: '' },
  });
  const { control } = form;
  const recipient = useWatch({ control, name: 'recipient' });
  const replacement = useWatch({ control, name: 'replacement' });
  const replacementRole = roles.find((role) => role.id === replacement);
  // Both sides of the swap are named by the address people recognize. The
  // member projection carries `email` alongside `userId`, so showing the opaque
  // id here only ever asked a manager to pick their successor out of a list of
  // UUIDs.
  const recipientMember = members.find((member) => member.userId === recipient);
  // `email` is optional in the projection, so the id remains the fallback for
  // the one case that has nothing better to show.
  const nameOf = (member: AccessMember): string =>
    member.email ?? member.userId;

  // The role has only moved once the server says so, and `FormModalDialog`
  // closes on that answer alone — a refusal leaves both choices on screen.
  const onSubmit = (values: TransferForm): Promise<MutationResult> =>
    onTransfer(values.recipient, values.replacement);

  // Each summary names a member the form has selected, so it is resolved here
  // rather than gated inline: `Conditional` evaluates both arms, and neither
  // member exists before the corresponding choice is made.
  const recipientSummary = !recipientMember ? null : (
    <p>
      {t('administration.transfer.recipientSummary', {
        email: nameOf(recipientMember),
      })}
    </p>
  );

  const managerSummary =
    !currentManager || !replacementRole ? null : (
      <p>
        {t('administration.transfer.managerSummary', {
          email: nameOf(currentManager),
          role: replacementRole.name,
        })}
      </p>
    );

  return (
    <FormModalDialog
      title={t('administration.transfer.title')}
      cancelLabel={t('administration.cancel')}
      submitLabel={t('administration.transfer.save')}
      size="lg"
      form={form}
      onSubmit={onSubmit}
    >
      <Controller
        control={control}
        name="recipient"
        rules={{ required: true }}
        render={({ field }) => (
          <FormSelectField
            isRequired
            validationBehavior="aria"
            label={t('administration.transfer.recipient')}
            placeholder={t('administration.select')}
            name={field.name}
            options={members
              .filter((member) => member.roleKind !== 'warehouse_manager')
              .map((member) => ({ id: member.userId, label: nameOf(member) }))}
            value={field.value}
            onBlur={field.onBlur}
            onChange={field.onChange}
          />
        )}
      />
      <Controller
        control={control}
        name="replacement"
        rules={{ required: true }}
        render={({ field }) => (
          <FormSelectField
            isRequired
            validationBehavior="aria"
            label={t('administration.transfer.replacement')}
            placeholder={t('administration.select')}
            name={field.name}
            options={roles.map((role) => ({ id: role.id, label: role.name }))}
            value={field.value}
            onBlur={field.onBlur}
            onChange={field.onChange}
          />
        )}
      />
      {recipientSummary}
      {managerSummary}
    </FormModalDialog>
  );
};
