import { Button, Modal } from '@heroui/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { useDeleteWorkspaceRoleMutation } from 'modules/access/api/workspace-roles-api';
import { DeleteWorkspaceRoleDialog } from 'modules/access/components/workspace-administration/roles/DeleteWorkspaceRoleDialog';
import { Conditional } from 'shared/components/Conditional';
import { TriggeredDialog } from 'shared/components/TriggeredDialog';
import { WorkspacePermissionGate } from 'shared/components/WorkspacePermissionGate';

import type { WorkspaceRole } from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

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
}: DeleteWorkspaceRoleActionProps): ReactElement => {
  const { t } = useTranslation('access');
  const [deleteWorkspaceRole] = useDeleteWorkspaceRoleMutation();

  // The refusal is explained inside the dialog, where the choice that provoked
  // it was made (AC-17c, AC-17d), and the dialog closes itself on success.
  const onDelete = (
    replacementWorkspaceRoleId?: string,
  ): Promise<MutationResult> =>
    deleteWorkspaceRole({
      workspaceRoleId: role.id,
      replacementWorkspaceRoleId,
    });

  // Two rules, two gates: the actor's Workspace Permission, and the protected
  // Workspace Owner Role that offers deletion to nobody (AC-16).
  return (
    <WorkspacePermissionGate
      permission={WorkspacePermissionId.WORKSPACE_ROLES_DELETE}
    >
      <Conditional when={role.kind === 'custom'}>
        <Modal>
          <Button
            className="bg-danger-soft text-danger-soft-foreground hover:bg-danger-soft-hover"
            size="sm"
            variant="ghost"
          >
            {t('workspaceRoles.delete.trigger')}
          </Button>
          <TriggeredDialog>
            <DeleteWorkspaceRoleDialog
              replacements={replacements}
              role={role}
              onDelete={onDelete}
            />
          </TriggeredDialog>
        </Modal>
      </Conditional>
    </WorkspacePermissionGate>
  );
};
