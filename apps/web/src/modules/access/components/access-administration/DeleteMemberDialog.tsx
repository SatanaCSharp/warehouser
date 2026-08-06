import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@heroui/react';
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
    <Modal isOpen onOpenChange={(open) => (open ? undefined : onClose())}>
      <ModalContent>
        <ModalHeader>
          {t('administration.deleteMember.title', { email: member.email })}
        </ModalHeader>
        <ModalBody>
          <p>
            {t('administration.deleteMember.body', { email: member.email })}
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" isDisabled={isSubmitting} onPress={onClose}>
            {t('administration.cancel')}
          </Button>
          <Button color="danger" isLoading={isSubmitting} onPress={confirm}>
            {t('administration.deleteMember.confirm')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
