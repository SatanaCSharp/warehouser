import { Button } from '@heroui/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CreateWorkspaceRoleDialog } from 'modules/access/components/workspace-administration/roles/CreateWorkspaceRoleDialog';
import { useHasWorkspacePermission } from 'shared/hooks/useWorkspacePermissions';
import { PlusIcon } from 'shared/icons';

import type { WorkspacePermission } from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';

type CreateWorkspaceRoleActionProps = {
  permissions: WorkspacePermission[];
};

/**
 * The create-Workspace-Role workflow, whole: its gate, its trigger and the
 * dialog it opens. An actor without `WORKSPACE_ROLES:CREATE` is offered no
 * control at all rather than a disabled one (AC-30).
 */
export const CreateWorkspaceRoleAction = ({
  permissions,
}: CreateWorkspaceRoleActionProps): ReactElement | null => {
  const { t } = useTranslation('workspace');
  const canCreateWorkspaceRole = useHasWorkspacePermission(
    WorkspacePermissionId.WORKSPACE_ROLES_CREATE,
  );
  const [isOpen, setIsOpen] = useState(false);

  if (!canCreateWorkspaceRole) {
    return null;
  }

  return (
    <>
      <Button variant="primary" onPress={() => setIsOpen(true)}>
        <PlusIcon />
        {t('workspaceRoles.create.trigger')}
      </Button>
      {isOpen ? (
        <CreateWorkspaceRoleDialog
          permissions={permissions}
          onClose={() => setIsOpen(false)}
        />
      ) : null}
    </>
  );
};
