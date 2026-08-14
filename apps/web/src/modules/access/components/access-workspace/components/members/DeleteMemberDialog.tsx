import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormModalDialog } from 'shared/components/FormModalDialog';

import type { AccessMember } from 'modules/access/types/access.types';
import type { ReactElement } from 'react';
import type { MutationOutcome } from 'shared/api/mutation-outcome';

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
  // The confirmation carries no fields, but it submits like every sibling
  // dialog — so the pending state comes from the form, not from a flag this
  // component would have to keep in sync with the mutation itself.
  const {
    formState: { isSubmitting },
    handleSubmit,
  } = useForm();

  const confirm = async (): Promise<void> => {
    const result = await onDelete();
    if (result.success) {
      onClose();
    }
  };

  return (
    <FormModalDialog
      title={t('administration.deleteMember.title', { email: member.email })}
      cancelLabel={t('administration.cancel')}
      submitLabel={t('administration.deleteMember.confirm')}
      submitVariant="danger"
      isSubmitting={isSubmitting}
      onClose={onClose}
      onSubmit={handleSubmit(confirm)}
    >
      <p>{t('administration.deleteMember.body', { email: member.email })}</p>
    </FormModalDialog>
  );
};
