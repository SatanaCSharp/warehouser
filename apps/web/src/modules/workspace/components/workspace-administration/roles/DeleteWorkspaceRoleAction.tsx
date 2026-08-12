import { Button } from '@heroui/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DeleteWorkspaceRoleDialog } from 'modules/workspace/components/workspace-administration/roles/DeleteWorkspaceRoleDialog';
import { useDeleteWorkspaceRole } from 'modules/workspace/hooks/useDeleteWorkspaceRole';
import { useReturnFocusOnClose } from 'modules/workspace/hooks/useReturnFocusOnClose';
import { useHasWorkspacePermission } from 'shared/hooks/useWorkspacePermissions';

import type { WorkspaceRole } from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';

type DeleteWorkspaceRoleActionProps = {
  replacements: WorkspaceRole[];
  role: WorkspaceRole;
};

/**
 * The delete-Workspace-Role workflow, whole: its gate, its trigger, the dialog
 * it opens and the mutation it runs. An actor without `WORKSPACE_ROLES:DELETE`
 * is offered no control at all (AC-30), and the protected Workspace Owner Role
 * offers none to anybody (AC-16).
 */
export const DeleteWorkspaceRoleAction = ({
  replacements,
  role,
}: DeleteWorkspaceRoleActionProps): ReactElement | null => {
  const { t } = useTranslation('workspace');
  const canDeleteWorkspaceRole = useHasWorkspacePermission(
    WorkspacePermissionId.WORKSPACE_ROLES_DELETE,
  );
  const deleteWorkspaceRole = useDeleteWorkspaceRole();
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useReturnFocusOnClose(isOpen);

  if (!canDeleteWorkspaceRole || role.kind !== 'custom') {
    return null;
  }

  return (
    <>
      <Button
        ref={triggerRef}
        className="bg-danger-soft text-danger-soft-foreground hover:bg-danger-soft-hover"
        size="sm"
        variant="ghost"
        onPress={() => setIsOpen(true)}
      >
        {t('workspaceRoles.delete.trigger')}
      </Button>
      {isOpen ? (
        <DeleteWorkspaceRoleDialog
          replacements={replacements}
          role={role}
          onClose={() => setIsOpen(false)}
          onDelete={async (replacementWorkspaceRoleId) => {
            const outcome = await deleteWorkspaceRole(
              role.id,
              replacementWorkspaceRoleId,
            );
            if (outcome.success) {
              setIsOpen(false);
            }
          }}
        />
      ) : null}
    </>
  );
};
