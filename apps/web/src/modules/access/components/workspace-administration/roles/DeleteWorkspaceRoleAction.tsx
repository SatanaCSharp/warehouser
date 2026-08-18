import { Button } from '@heroui/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DeleteWorkspaceRoleDialog } from 'modules/access/components/workspace-administration/roles/DeleteWorkspaceRoleDialog';
import { useDeleteWorkspaceRole } from 'modules/access/hooks/mutations/useDeleteWorkspaceRole';
import { Conditional } from 'shared/components/Conditional';
import { useReturnFocusOnClose } from 'shared/hooks/effects/useReturnFocusOnClose';
import { useHasWorkspacePermission } from 'shared/hooks/queries/useWorkspacePermissions';

import type { WorkspaceRole } from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';
import type { MutationOutcome } from 'shared/api/client/mutation-outcome';

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
  const { t } = useTranslation('access');
  const canDeleteWorkspaceRole = useHasWorkspacePermission(
    WorkspacePermissionId.WORKSPACE_ROLES_DELETE,
  );
  const deleteWorkspaceRole = useDeleteWorkspaceRole();
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useReturnFocusOnClose(isOpen);

  const onPress = (): void => setIsOpen(true);

  const onClose = (): void => setIsOpen(false);

  const onDelete = async (
    replacementWorkspaceRoleId?: string,
  ): Promise<MutationOutcome> => {
    const outcome = await deleteWorkspaceRole(
      role.id,
      replacementWorkspaceRoleId,
    );
    if (outcome.success) {
      onClose();
    }
    // The refusal is explained inside the dialog, where the choice that
    // provoked it was made (AC-17c, AC-17d).
    return outcome;
  };

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
        onPress={onPress}
      >
        {t('workspaceRoles.delete.trigger')}
      </Button>
      <Conditional when={isOpen}>
        <DeleteWorkspaceRoleDialog
          replacements={replacements}
          role={role}
          onClose={onClose}
          onDelete={onDelete}
        />
      </Conditional>
    </>
  );
};
