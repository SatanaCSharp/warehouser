import { AssignmentDialog } from 'modules/access/components/access-administration/components/roles/AssignmentDialog';
import { DeletionDialog } from 'modules/access/components/access-administration/components/roles/DeletionDialog';
import { RoleDialog } from 'modules/access/components/access-administration/components/roles/RoleDialog';
import { TransferDialog } from 'modules/access/components/access-administration/components/roles/TransferDialog';

import type { AccessProjection } from '@warehouser/contracts/access';
import type {
  AccessAdministrationActions,
  AccessMember,
  AccessPermission,
  AccessRole,
  AccessWorkflow,
} from 'modules/access/types/access-administration.types';
import type { ReactElement } from 'react';

type RoleWorkflowDialogsProps = Pick<
  AccessAdministrationActions,
  'onAssignRole' | 'onDeleteRole' | 'onSaveRole' | 'onTransferManager'
> & {
  access: AccessProjection;
  customRoles: AccessRole[];
  members: AccessMember[];
  permissions: AccessPermission[];
  workflow: AccessWorkflow | null;
  onClose: () => void;
};

/**
 * Renders the dialog for the open role workflow, and nothing at all for the
 * member workflows — those belong to `MemberWorkflowDialogs`. A dialog closes
 * only once its mutation succeeded; the success toast the mutation raises is
 * the surface's single feedback channel.
 */
export const RoleWorkflowDialogs = ({
  access,
  customRoles,
  members,
  permissions,
  workflow,
  onAssignRole,
  onClose,
  onDeleteRole,
  onSaveRole,
  onTransferManager,
}: RoleWorkflowDialogsProps): ReactElement | null => {
  if (!workflow) {
    return null;
  }

  switch (workflow.kind) {
    case 'role':
      return (
        <RoleDialog
          permissions={permissions}
          role={workflow.role}
          onClose={onClose}
          onSave={async (input) => {
            const result = await onSaveRole(input, workflow.role?.id);
            if (result.success) {
              onClose();
            }
            return result;
          }}
        />
      );
    case 'assign':
      return (
        <AssignmentDialog
          memberId={workflow.memberId}
          roles={customRoles}
          onClose={onClose}
          onSave={async (roleId) => {
            const result = await onAssignRole(workflow.memberId, roleId);
            if (result.success) {
              onClose();
            }
          }}
        />
      );
    case 'delete':
      return (
        <DeletionDialog
          role={workflow.role}
          roles={customRoles}
          onClose={onClose}
          onDelete={async (replacementRoleId) => {
            const result = await onDeleteRole(
              workflow.role.id,
              replacementRoleId,
            );
            if (result.success) {
              onClose();
            }
          }}
        />
      );
    case 'transfer':
      return (
        <TransferDialog
          access={access}
          members={members}
          roles={customRoles}
          onClose={onClose}
          onTransfer={async (recipientId, replacementRoleId) => {
            const result = await onTransferManager(
              recipientId,
              replacementRoleId,
            );
            if (result.success) {
              onClose();
            }
          }}
        />
      );
    default:
      return null;
  }
};
