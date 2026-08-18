import { Button } from '@heroui/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AddWorkspaceMemberDialog } from 'modules/access/components/workspace-administration/members/AddWorkspaceMemberDialog';
import { Conditional } from 'shared/components/Conditional';
import { useReturnFocusOnClose } from 'shared/hooks/effects/useReturnFocusOnClose';
import { useHasWorkspacePermission } from 'shared/hooks/queries/useWorkspacePermissions';
import { UserPlusIcon } from 'shared/icons';

import type { ReactElement } from 'react';

/**
 * The add-Workspace-Member workflow, whole: its gate, its trigger and the
 * dialog it opens. An actor without `WORKSPACE_MEMBERS:ADD` is offered no
 * control at all rather than a disabled one (AC-30).
 */
export const AddWorkspaceMemberAction = (): ReactElement | null => {
  const { t } = useTranslation('access');
  const canAddWorkspaceMember = useHasWorkspacePermission(
    WorkspacePermissionId.WORKSPACE_MEMBERS_ADD,
  );
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useReturnFocusOnClose(isOpen);

  const onPress = (): void => setIsOpen(true);

  const onClose = (): void => setIsOpen(false);

  if (!canAddWorkspaceMember) {
    return null;
  }

  return (
    <>
      <Button ref={triggerRef} variant="primary" onPress={onPress}>
        <UserPlusIcon />
        {t('workspaceMembers.add.trigger')}
      </Button>
      <Conditional when={isOpen}>
        <AddWorkspaceMemberDialog onClose={onClose} />
      </Conditional>
    </>
  );
};
