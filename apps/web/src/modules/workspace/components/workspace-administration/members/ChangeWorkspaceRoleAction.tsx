import { Button } from '@heroui/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChangeWorkspaceRoleDialog } from 'modules/workspace/components/workspace-administration/members/ChangeWorkspaceRoleDialog';
import { useReturnFocusOnClose } from 'modules/workspace/hooks/useReturnFocusOnClose';
import { useHasWorkspacePermission } from 'shared/hooks/useWorkspacePermissions';

import type { WorkspaceMember } from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';

type ChangeWorkspaceRoleActionProps = { member: WorkspaceMember };

/**
 * The change-Workspace-Role workflow, whole: its gate, its trigger and the
 * dialog it opens (AC-19b). An actor without `WORKSPACE_ROLES:ASSIGN` is
 * offered no control at all (AC-30). The Workspace Owner's row never renders
 * this action, because that Role changes only through the transfer (AC-22).
 */
export const ChangeWorkspaceRoleAction = ({
  member,
}: ChangeWorkspaceRoleActionProps): ReactElement | null => {
  const { t } = useTranslation('workspace');
  const canAssignWorkspaceRole = useHasWorkspacePermission(
    WorkspacePermissionId.WORKSPACE_ROLES_ASSIGN,
  );
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useReturnFocusOnClose(isOpen);

  if (!canAssignWorkspaceRole) {
    return null;
  }

  return (
    <>
      <Button
        ref={triggerRef}
        size="sm"
        variant="outline"
        onPress={() => setIsOpen(true)}
      >
        {t('members.changeRole.trigger')}
      </Button>
      {isOpen ? (
        <ChangeWorkspaceRoleDialog
          member={member}
          onClose={() => setIsOpen(false)}
        />
      ) : null}
    </>
  );
};
