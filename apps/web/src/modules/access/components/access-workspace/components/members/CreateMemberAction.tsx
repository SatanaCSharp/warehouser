import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CreateActionButton } from 'modules/access/components/access-workspace/components/CreateActionButton';
import { CreateMemberDialog } from 'modules/access/components/access-workspace/components/members/CreateMemberDialog';
import { useCreateMember } from 'modules/access/hooks/mutations/useCreateMember';
import { useAccessCapabilities } from 'modules/access/hooks/projections/useAccessCapabilities';
import { useAccessRoles } from 'modules/access/hooks/queries/useAccessRoles';
import { Conditional } from 'shared/components/Conditional';

import type { ReactElement } from 'react';

/**
 * The Create Member workflow, whole: the trigger, the dialog it opens, and the
 * mutation it runs. An actor without USERS:CREATE gets no trigger at all
 * (AC-03), and the dialog closes itself once the member exists.
 */
export const CreateMemberAction = (): ReactElement | null => {
  const { t } = useTranslation('access');
  const { canCreateMembers, isArchived, warehouseId } = useAccessCapabilities();
  const roles = useAccessRoles();
  const createMember = useCreateMember(warehouseId ?? '');
  const [isOpen, setIsOpen] = useState(false);

  const onPress = (): void => setIsOpen(true);

  const onClose = (): void => setIsOpen(false);

  if (!canCreateMembers) {
    return null;
  }

  return (
    <>
      <CreateActionButton
        isDisabled={isArchived}
        label={t('administration.createMember.open')}
        reason={t('archived.reason')}
        onPress={onPress}
      />
      <Conditional when={isOpen && !isArchived}>
        <CreateMemberDialog
          roles={roles.items}
          onClose={onClose}
          onSave={createMember}
        />
      </Conditional>
    </>
  );
};
