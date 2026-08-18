import { Button } from '@heroui/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { TransferManagerDialog } from 'modules/access/components/access-workspace/components/roles/TransferManagerDialog';
import { useTransferManager } from 'modules/access/hooks/mutations/useTransferManager';
import { useAccessCapabilities } from 'modules/access/hooks/projections/useAccessCapabilities';
import { useAccessMembers } from 'modules/access/hooks/queries/useAccessMembers';
import { useAccessRoles } from 'modules/access/hooks/queries/useAccessRoles';
import { Conditional } from 'shared/components/Conditional';
import { useCurrentPermissions } from 'shared/hooks/queries/usePermissions';

import type { ReactElement } from 'react';

/**
 * The Transfer Warehouse Manager workflow, whole: the trigger, the dialog it
 * opens, and the mutation it runs. Only the acting manager sees it, and the
 * dialog closes once the role has actually moved.
 */
export const TransferManagerAction = (): ReactElement | null => {
  const { t } = useTranslation('access');
  const { canTransferManager, warehouseId } = useAccessCapabilities();
  const { access } = useCurrentPermissions();
  const members = useAccessMembers();
  const roles = useAccessRoles();
  const transferManager = useTransferManager(warehouseId ?? '');
  const [isOpen, setIsOpen] = useState(false);

  const onPress = (): void => setIsOpen(true);

  const onClose = (): void => setIsOpen(false);

  const onTransfer = async (
    recipientId: string,
    replacementRoleId: string,
  ): Promise<void> => {
    const outcome = await transferManager(recipientId, replacementRoleId);
    if (outcome.success) {
      onClose();
    }
  };

  if (!canTransferManager) {
    return null;
  }

  return (
    <>
      <Button variant="outline" onPress={onPress}>
        {t('administration.transfer.open')}
      </Button>
      <Conditional when={isOpen}>
        <TransferManagerDialog
          currentManager={members.items.find(
            (member) => member.roleId === access?.roleId,
          )}
          members={members.items}
          roles={roles.items.filter((role) => role.kind === 'custom')}
          onClose={onClose}
          onTransfer={onTransfer}
        />
      </Conditional>
    </>
  );
};
