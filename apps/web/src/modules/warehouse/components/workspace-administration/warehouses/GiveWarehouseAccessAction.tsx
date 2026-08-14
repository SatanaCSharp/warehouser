import { Button } from '@heroui/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { GiveWarehouseAccessDialog } from 'modules/warehouse/components/workspace-administration/warehouses/GiveWarehouseAccessDialog';
import { useHasWorkspacePermission } from 'shared/hooks/useWorkspacePermissions';
import { UserPlusIcon } from 'shared/icons';

import type { Warehouse } from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';

type GiveWarehouseAccessActionProps = {
  warehouse: Warehouse;
};

/**
 * Gives a User of the Workspace access to this Warehouse (AC-23): the gate,
 * the trigger and the dialog it opens. An actor without
 * `WAREHOUSE_MEMBERSHIPS:ASSIGN` is offered no control at all rather than a
 * disabled one (AC-30). Reads its own capability instead of one threaded down
 * from `WarehousesTab`, so this action never becomes a second value drilled
 * past the two-hop budget.
 */
export const GiveWarehouseAccessAction = ({
  warehouse,
}: GiveWarehouseAccessActionProps): ReactElement | null => {
  const { t } = useTranslation('warehouse');
  const canGiveAccess = useHasWorkspacePermission(
    WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_ASSIGN,
  );
  const [isOpen, setIsOpen] = useState(false);

  if (!canGiveAccess) {
    return null;
  }

  return (
    <>
      <Button variant="outline" onPress={() => setIsOpen(true)}>
        <UserPlusIcon />
        {t('warehouses.giveAccess.trigger')}
      </Button>
      {isOpen ? (
        <GiveWarehouseAccessDialog
          warehouse={warehouse}
          onClose={() => setIsOpen(false)}
        />
      ) : null}
    </>
  );
};
