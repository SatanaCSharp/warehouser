import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FormModalDialog } from 'modules/access/components/access-administration/FormModalDialog';

import type {
  AccessMember,
  MutationOutcome,
} from 'modules/access/types/access-administration.types';
import type { FormEvent, ReactElement } from 'react';

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

  const confirm = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setIsSubmitting(true);
    const result = await onDelete();
    setIsSubmitting(false);
    if (result.success) {
      onClose();
    }
  };

  return (
    <FormModalDialog
      title={t('administration.deleteMember.title', { email: member.email })}
      cancelLabel={t('administration.cancel')}
      submitLabel={t('administration.deleteMember.confirm')}
      submitColor="danger"
      isSubmitting={isSubmitting}
      onClose={onClose}
      onSubmit={(event) => void confirm(event)}
    >
      <p>{t('administration.deleteMember.body', { email: member.email })}</p>
    </FormModalDialog>
  );
};
