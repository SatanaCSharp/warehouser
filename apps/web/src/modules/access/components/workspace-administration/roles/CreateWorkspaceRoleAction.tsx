import { Button, Modal } from '@heroui/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { CreateWorkspaceRoleDialog } from 'modules/access/components/workspace-administration/roles/CreateWorkspaceRoleDialog';
import { useWorkspacePermissionCatalogue } from 'modules/access/hooks/queries/useWorkspacePermissionCatalogue';
import { TriggeredDialog } from 'shared/components/TriggeredDialog';
import { WorkspacePermissionGate } from 'shared/components/WorkspacePermissionGate';
import { PlusIcon } from 'shared/icons';

import type { ReactElement } from 'react';

/**
 * The create-Workspace-Role workflow, whole: its gate, its trigger and the
 * dialog it opens. An actor without `WORKSPACE_ROLES:CREATE` is offered no
 * control at all rather than a disabled one (AC-30).
 *
 * The Permission catalogue is read here rather than handed down, because this
 * is the workflow that grants from it. The read owns its own gate and RTK Query
 * serves every caller from one cache entry, so reading it beside the dialog
 * costs no extra request and keeps the Roles tab from threading the catalogue
 * through on its way here.
 */
export const CreateWorkspaceRoleAction = (): ReactElement => {
  const { t } = useTranslation('access');
  const { permissions } = useWorkspacePermissionCatalogue();

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
