import { useTranslation } from 'react-i18next';

import { ConfirmAlertDialog } from 'shared/components/ConfirmAlertDialog';

import type { AccessMember } from 'modules/access/types/access.types';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

type DeleteMemberDialogProps = {
  member: Pick<AccessMember, 'email' | 'userId'>;
  onDelete: () => Promise<MutationResult>;
};

/**
 * Confirms deleting a member (AC-08). There is nothing to fill in and nothing
 * to validate, so it is a `ConfirmAlertDialog` rather than a form
 * (`docs/system/guides/web-dialogs.md`).
 */
export const DeleteMemberDialog = ({
  member,
  onDelete,
}: DeleteMemberDialogProps): ReactElement => {
  const { t } = useTranslation('access');

  return (
    <ConfirmAlertDialog
      title={t('administration.deleteMember.title', { email: member.email })}
      cancelLabel={t('administration.cancel')}
      confirmLabel={t('administration.deleteMember.confirm')}
      onConfirm={onDelete}
    >
      <p>{t('administration.deleteMember.body', { email: member.email })}</p>
    </ConfirmAlertDialog>
  );
};
