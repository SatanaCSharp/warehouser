import { Button } from '@heroui/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AddWorkspaceMemberDialog } from 'modules/access/components/workspace-administration/members/AddWorkspaceMemberDialog';
import { useReturnFocusOnClose } from 'shared/hooks/useReturnFocusOnClose';
import { useHasWorkspacePermission } from 'shared/hooks/useWorkspacePermissions';
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

  if (!canAddWorkspaceMember) {
    return null;
  }

  return (
    <>
      <Button
        ref={triggerRef}
        variant="primary"
        onPress={() => setIsOpen(true)}
      >
        <UserPlusIcon />
        {t('workspaceMembers.add.trigger')}
      </Button>
      {isOpen ? (
        <AddWorkspaceMemberDialog onClose={() => setIsOpen(false)} />
      ) : null}
    </>
  );
};
