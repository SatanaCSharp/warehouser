import { Button, Modal } from '@heroui/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { AddWorkspaceMemberDialog } from 'modules/access/components/workspace-administration/members/AddWorkspaceMemberDialog';
import { TriggeredDialog } from 'shared/components/TriggeredDialog';
import { WorkspacePermissionGate } from 'shared/components/WorkspacePermissionGate';
import { UserPlusIcon } from 'shared/icons';

import type { ReactElement } from 'react';

/**
 * The add-Workspace-Member workflow, whole: its gate, its trigger and the
 * dialog it opens. An actor without `WORKSPACE_MEMBERS:ADD` is offered no
 * control at all rather than a disabled one (AC-30). The `Modal` around the
 * pair owns whether the dialog is open, and returns focus to the trigger once
 * it closes (design-handoff.md §Accessibility).
 */
export const AddWorkspaceMemberAction = (): ReactElement => {
  const { t } = useTranslation('access');

  return (
    <WorkspacePermissionGate
      permission={WorkspacePermissionId.WORKSPACE_MEMBERS_ADD}
    >
      <Modal>
        <Button variant="primary">
          <UserPlusIcon />
          {t('workspaceMembers.add.trigger')}
        </Button>
        <TriggeredDialog>
          <AddWorkspaceMemberDialog />
        </TriggeredDialog>
      </Modal>
    </WorkspacePermissionGate>
  );
};
