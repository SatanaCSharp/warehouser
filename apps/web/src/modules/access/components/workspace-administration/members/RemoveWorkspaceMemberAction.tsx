import { Button } from '@heroui/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { RemoveWorkspaceMemberDialog } from 'modules/access/components/workspace-administration/members/RemoveWorkspaceMemberDialog';
import { useReturnFocusOnClose } from 'shared/hooks/useReturnFocusOnClose';
import { useHasWorkspacePermission } from 'shared/hooks/useWorkspacePermissions';

import type { WorkspaceMember } from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';

type RemoveWorkspaceMemberActionProps = { member: WorkspaceMember };

/**
 * The remove-Workspace-Member workflow, whole: its gate, its trigger and the
 * dialog it opens (AC-19a). An actor without `WORKSPACE_MEMBERS:REMOVE` is
 * offered no control at all (AC-30). The Workspace Owner's row never renders
 * this action: a Workspace is never left without exactly one Owner, so that
 * membership ends only through the transfer (AC-21a).
 */
export const RemoveWorkspaceMemberAction = ({
  member,
}: RemoveWorkspaceMemberActionProps): ReactElement | null => {
  const { t } = useTranslation('workspace');
  const canRemoveWorkspaceMember = useHasWorkspacePermission(
    WorkspacePermissionId.WORKSPACE_MEMBERS_REMOVE,
  );
  const [isOpen, setIsOpen] = useState(false);
  // Escape dismissal both closes the Modal and returns focus to the trigger
  // (design-handoff.md §Accessibility).
  const triggerRef = useReturnFocusOnClose(isOpen);

  if (!canRemoveWorkspaceMember) {
    return null;
  }

  return (
    <>
      <Button
        ref={triggerRef}
        size="sm"
        variant="danger-soft"
        onPress={() => setIsOpen(true)}
      >
        {t('members.remove.trigger')}
      </Button>
      {isOpen ? (
        <RemoveWorkspaceMemberDialog
          member={member}
          onClose={() => setIsOpen(false)}
        />
      ) : null}
    </>
  );
};
