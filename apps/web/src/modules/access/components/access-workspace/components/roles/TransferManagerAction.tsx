import { Button, Modal } from '@heroui/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { useTransferWarehouseManagerMutation } from 'modules/access/api/access-api';
import { TransferManagerDialog } from 'modules/access/components/access-workspace/components/roles/TransferManagerDialog';
import { useAccessScope } from 'modules/access/hooks/projections/useAccessScope';
import { useAccessMembers } from 'modules/access/hooks/queries/useAccessMembers';
import { useAccessRoles } from 'modules/access/hooks/queries/useAccessRoles';
import { TriggeredDialog } from 'shared/components/TriggeredDialog';
import { WarehousePermissionGate } from 'shared/components/WarehousePermissionGate';
import { useCurrentPermissions } from 'shared/hooks/queries/usePermissions';

import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

/**
 * The Transfer Warehouse Manager workflow, whole: its gate, the trigger, the
 * dialog it opens, and the mutation it runs. Only the acting manager sees it,
 * and the dialog closes once the role has actually moved.
 */
export const TransferManagerAction = (): ReactElement => {
  const { t } = useTranslation('access');
  const { warehouseId } = useAccessScope();
  const { access } = useCurrentPermissions();
  const members = useAccessMembers();
  const roles = useAccessRoles();
  const [transferManager] = useTransferWarehouseManagerMutation();

  const onTransfer = (
    recipientUserId: string,
    formerManagerRoleId: string,
  ): Promise<MutationResult> =>
    transferManager({
      warehouseId: warehouseId ?? '',
      input: { recipientUserId, formerManagerRoleId },
    });

  return (
    <WarehousePermissionGate
      permission={PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN}
    >
      <Modal>
        <Button variant="outline">{t('administration.transfer.open')}</Button>
        <TriggeredDialog>
          <TransferManagerDialog
            currentManager={members.items.find(
              (member) => member.roleId === access?.roleId,
            )}
            members={members.items}
            roles={roles.items.filter((role) => role.kind === 'custom')}
            onTransfer={onTransfer}
          />
        </TriggeredDialog>
      </Modal>
    </WarehousePermissionGate>
  );
};
