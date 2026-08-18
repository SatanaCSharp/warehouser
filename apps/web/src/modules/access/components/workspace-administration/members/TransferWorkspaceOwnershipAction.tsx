import { Button } from '@heroui/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { TransferWorkspaceOwnershipDialog } from 'modules/access/components/workspace-administration/members/TransferWorkspaceOwnershipDialog';
import { Conditional } from 'shared/components/Conditional';
import { useReturnFocusOnClose } from 'shared/hooks/effects/useReturnFocusOnClose';
import { useHasWorkspacePermission } from 'shared/hooks/queries/useWorkspacePermissions';
import { ArrowRightLeftIcon } from 'shared/icons';

import type { ReactElement } from 'react';

/**
 * The protected owner-transfer workflow, whole: its gate, its trigger and the
 * dialog it opens (AC-26). `WORKSPACE_OWNER_ROLE:REASSIGN` is reserved to the
 * Workspace Owner Role and can never be carried by a custom Role (AC-18), so an
 * actor without it is offered no transfer control anywhere (AC-27, AC-30).
 */
export const TransferWorkspaceOwnershipAction = (): ReactElement | null => {
  const { t } = useTranslation('access');
  const canTransferWorkspaceOwner = useHasWorkspacePermission(
    WorkspacePermissionId.WORKSPACE_OWNER_ROLE_REASSIGN,
  );
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useReturnFocusOnClose(isOpen);

  const onPress = (): void => setIsOpen(true);

  const onClose = (): void => setIsOpen(false);

  if (!canTransferWorkspaceOwner) {
    return null;
  }

  return (
    <>
      <Button ref={triggerRef} size="sm" variant="outline" onPress={onPress}>
        <ArrowRightLeftIcon />
        {t('workspaceMembers.transferOwnership.trigger')}
      </Button>
      <Conditional when={isOpen}>
        <TransferWorkspaceOwnershipDialog onClose={onClose} />
      </Conditional>
    </>
  );
};
