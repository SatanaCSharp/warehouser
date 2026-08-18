import { Button } from '@heroui/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { NameWorkspaceDialog } from 'modules/workspace/components/workspace-administration/NameWorkspaceDialog';
import { Conditional } from 'shared/components/Conditional';
import {
  useCurrentWorkspaceContext,
  useHasWorkspacePermission,
} from 'shared/hooks/queries/useWorkspacePermissions';
import { PencilIcon } from 'shared/icons';

import type { ReactElement } from 'react';

/**
 * Sets the Workspace's name, or later changes it (AC-29): the gate, the page
 * action and the dialog it opens. An actor without the rename Permission is
 * offered no control at all rather than a disabled one (AC-30).
 */
export const NameWorkspaceAction = (): ReactElement | null => {
  const { t } = useTranslation('workspace');
  const [isOpen, setIsOpen] = useState(false);
  const { workspaceContext } = useCurrentWorkspaceContext();
  const canRenameWorkspace = useHasWorkspacePermission(
    WorkspacePermissionId.WORKSPACE_RENAME,
  );

  const onPress = (): void => setIsOpen(true);

  const onClose = (): void => setIsOpen(false);

  if (!canRenameWorkspace || !workspaceContext) {
    return null;
  }

  const currentName = workspaceContext.workspace.name;

  return (
    <>
      <Button
        variant="secondary"
        className="w-full sm:w-auto"
        onPress={onPress}
      >
        <PencilIcon />
        {currentName === null
          ? t('nameWorkspace.trigger')
          : t('nameWorkspace.triggerRename')}
      </Button>
      <Conditional when={isOpen}>
        <NameWorkspaceDialog currentName={currentName} onClose={onClose} />
      </Conditional>
    </>
  );
};
