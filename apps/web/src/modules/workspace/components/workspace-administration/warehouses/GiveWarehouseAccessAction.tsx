import { Button, Modal } from '@heroui/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { GiveWarehouseAccessDialog } from 'modules/workspace/components/workspace-administration/warehouses/GiveWarehouseAccessDialog';
import { TriggeredDialog } from 'shared/components/TriggeredDialog';
import { WorkspacePermissionGate } from 'shared/components/WorkspacePermissionGate';
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
 * disabled one (AC-30). The gate names that Permission where the control it
 * protects is written, so nothing above has to know
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 */
export const GiveWarehouseAccessAction = ({
  warehouse,
}: GiveWarehouseAccessActionProps): ReactElement => {
  const { t } = useTranslation('warehouse');

  return (
    <WorkspacePermissionGate
      permission={WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_ASSIGN}
    >
      <Modal>
        <Button variant="outline">
          <UserPlusIcon />
          {t('warehouses.giveAccess.trigger')}
        </Button>
        <TriggeredDialog>
          <GiveWarehouseAccessDialog warehouse={warehouse} />
        </TriggeredDialog>
      </Modal>
    </WorkspacePermissionGate>
  );
};
