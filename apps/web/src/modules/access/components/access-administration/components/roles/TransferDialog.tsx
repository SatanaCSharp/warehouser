import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormSelectField } from 'shared/components/FormSelectField';

import type { AccessProjection } from '@warehouser/contracts/access';
import type {
  AccessMember,
  AccessRole,
} from 'modules/access/types/access-administration.types';
import type { ReactElement } from 'react';

type TransferDialogProps = {
  access: AccessProjection;
  members: AccessMember[];
  roles: AccessRole[];
  onClose: () => void;
  onTransfer: (recipientId: string, replacementRoleId: string) => Promise<void>;
};

type TransferForm = { recipient: string; replacement: string };

export const TransferDialog = ({
  access,
  members,
  roles,
  onClose,
  onTransfer,
}: TransferDialogProps): ReactElement => {
  const { t } = useTranslation('access');
  const currentManager = members.find(
    (member) => member.roleId === access.roleId,
  );
  const { control, handleSubmit } = useForm<TransferForm>({
    defaultValues: { recipient: '', replacement: '' },
  });
  const recipient = useWatch({ control, name: 'recipient' });
  const replacement = useWatch({ control, name: 'replacement' });
  const replacementRole = roles.find((role) => role.id === replacement);

  return (
    <FormModalDialog
      title={t('administration.transfer.title')}
      cancelLabel={t('administration.cancel')}
      submitLabel={t('administration.transfer.save')}
      size="lg"
      onClose={onClose}
      onSubmit={handleSubmit(({ recipient, replacement }) =>
        onTransfer(recipient, replacement),
      )}
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
              .map((member) => ({
                id: member.userId,
                label: member.userId,
              }))}
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
      {recipient ? (
        <p>
          {t('administration.transfer.recipientSummary', {
            userId: recipient,
          })}
        </p>
      ) : null}
      {currentManager && replacementRole ? (
        <p>
          {t('administration.transfer.managerSummary', {
            userId: currentManager.userId,
            role: replacementRole.name,
          })}
        </p>
      ) : null}
    </FormModalDialog>
  );
};
