import { Button } from '@heroui/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChangeWorkspaceRoleDialog } from 'modules/access/components/workspace-administration/members/ChangeWorkspaceRoleDialog';
import { Conditional } from 'shared/components/Conditional';
import { useReturnFocusOnClose } from 'shared/hooks/effects/useReturnFocusOnClose';
import { useHasWorkspacePermission } from 'shared/hooks/queries/useWorkspacePermissions';

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
  const { t } = useTranslation('access');
  const canAssignWorkspaceRole = useHasWorkspacePermission(
    WorkspacePermissionId.WORKSPACE_ROLES_ASSIGN,
  );
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useReturnFocusOnClose(isOpen);

  const onPress = (): void => setIsOpen(true);

  const onClose = (): void => setIsOpen(false);

  if (!canAssignWorkspaceRole) {
    return null;
  }

  return (
    <>
      <Button ref={triggerRef} size="sm" variant="outline" onPress={onPress}>
        {t('workspaceMembers.changeRole.trigger')}
      </Button>
      <Conditional when={isOpen}>
        <ChangeWorkspaceRoleDialog member={member} onClose={onClose} />
      </Conditional>
    </>
  );
};
