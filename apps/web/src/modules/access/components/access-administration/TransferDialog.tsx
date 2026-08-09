import { Button, Modal } from '@heroui/react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

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
  const { control, handleSubmit, register } = useForm<TransferForm>({
    defaultValues: { recipient: '', replacement: '' },
  });
  const recipient = useWatch({ control, name: 'recipient' });
  const replacement = useWatch({ control, name: 'replacement' });
  const replacementRole = roles.find((role) => role.id === replacement);

  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(open) => (open ? undefined : onClose())}
    >
      <Modal.Container size="lg">
        <Modal.Dialog>
          <form
            onSubmit={handleSubmit(({ recipient, replacement }) =>
              onTransfer(recipient, replacement),
            )}
          >
            <Modal.Header>
              <Modal.Heading>
                {t('administration.transfer.title')}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <label>
                {t('administration.transfer.recipient')}
                <select
                  required
                  {...register('recipient', { required: true })}
                  className="mt-2 w-full rounded-lg border border-border p-3"
                >
                  <option value="">{t('administration.select')}</option>
                  {members
                    .filter((member) => member.roleKind !== 'warehouse_manager')
                    .map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.userId}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                {t('administration.transfer.replacement')}
                <select
                  required
                  {...register('replacement', { required: true })}
                  className="mt-2 w-full rounded-lg border border-border p-3"
                >
                  <option value="">{t('administration.select')}</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>
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
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" onPress={onClose}>
                {t('administration.cancel')}
              </Button>
              <Button variant="primary" type="submit">
                {t('administration.transfer.save')}
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
};
