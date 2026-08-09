import { Button, Modal } from '@heroui/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  AccessMember,
  MutationOutcome,
} from 'modules/access/types/access-administration.types';
import type { ReactElement } from 'react';

type DeleteMemberDialogProps = {
  member: Pick<AccessMember, 'email' | 'userId'>;
  onClose: () => void;
  onDelete: () => Promise<MutationOutcome>;
};

export const DeleteMemberDialog = ({
  member,
  onClose,
  onDelete,
}: DeleteMemberDialogProps): ReactElement => {
  const { t } = useTranslation('access');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const confirm = async (): Promise<void> => {
    setIsSubmitting(true);
    const result = await onDelete();
    setIsSubmitting(false);
    if (result.success) {
      onClose();
    }
  };

  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(open) => (open ? undefined : onClose())}
    >
      <Modal.Container>
        <Modal.Dialog>
          <Modal.Header>
            <Modal.Heading>
              {t('administration.deleteMember.title', {
                email: member.email,
              })}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <p>
              {t('administration.deleteMember.body', {
                email: member.email,
              })}
            </p>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="ghost" isDisabled={isSubmitting} onPress={onClose}>
              {t('administration.cancel')}
            </Button>
            <Button variant="danger" isPending={isSubmitting} onPress={confirm}>
              {t('administration.deleteMember.confirm')}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
};
