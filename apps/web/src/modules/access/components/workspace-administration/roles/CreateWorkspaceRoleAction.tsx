import { Button, Modal } from '@heroui/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { CreateWorkspaceRoleDialog } from 'modules/access/components/workspace-administration/roles/CreateWorkspaceRoleDialog';
import { TriggeredDialog } from 'shared/components/TriggeredDialog';
import { WorkspacePermissionGate } from 'shared/components/WorkspacePermissionGate';
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
}: CreateWorkspaceRoleActionProps): ReactElement => {
  const { t } = useTranslation('access');

  return (
    <WorkspacePermissionGate
      permission={WorkspacePermissionId.WORKSPACE_ROLES_CREATE}
    >
      <Modal>
        <Button variant="primary">
          <PlusIcon />
          {t('workspaceRoles.create.trigger')}
        </Button>
        <TriggeredDialog>
          <CreateWorkspaceRoleDialog permissions={permissions} />
        </TriggeredDialog>
      </Modal>
    </WorkspacePermissionGate>
  );
};
