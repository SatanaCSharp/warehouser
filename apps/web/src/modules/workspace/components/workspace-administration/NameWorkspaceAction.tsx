import { Button, Modal } from '@heroui/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { NameWorkspaceDialog } from 'modules/workspace/components/workspace-administration/NameWorkspaceDialog';
import { Conditional } from 'shared/components/Conditional';
import { TriggeredDialog } from 'shared/components/TriggeredDialog';
import { WorkspacePermissionGate } from 'shared/components/WorkspacePermissionGate';
import { useCurrentWorkspaceContext } from 'shared/hooks/queries/useWorkspacePermissions';
import { PencilIcon } from 'shared/icons';

import type { ReactElement } from 'react';

/**
 * Sets the Workspace's name, or later changes it (AC-29): the gate, the page
 * action and the dialog it opens. An actor without `WORKSPACE:RENAME` is offered
 * no control at all rather than a disabled one (AC-30)
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 *
 * Whether the context has arrived is a separate rule from what the actor may do,
 * so it stays its own gate: the dialog seeds itself from the current name, which
 * does not exist until the read lands.
 */
export const NameWorkspaceAction = (): ReactElement => {
  const { t } = useTranslation('workspace');
  const { workspaceContext } = useCurrentWorkspaceContext();
  const currentName = workspaceContext?.workspace.name ?? null;

  return (
    <WorkspacePermissionGate
      permission={WorkspacePermissionId.WORKSPACE_RENAME}
    >
      <Conditional when={workspaceContext}>
        <Modal>
          <Button variant="secondary" className="w-full sm:w-auto">
            <PencilIcon />
            {currentName === null
              ? t('nameWorkspace.trigger')
              : t('nameWorkspace.triggerRename')}
          </Button>
          <TriggeredDialog>
            <NameWorkspaceDialog currentName={currentName} />
          </TriggeredDialog>
        </Modal>
      </Conditional>
    </WorkspacePermissionGate>
  );
};
