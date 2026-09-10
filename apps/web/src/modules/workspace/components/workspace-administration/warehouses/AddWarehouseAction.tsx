import { Button, Modal } from '@heroui/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { AddWarehouseDialog } from 'modules/workspace/components/workspace-administration/warehouses/AddWarehouseDialog';
import type { ReactElement } from 'react';
import { TriggeredDialog } from 'shared/components/TriggeredDialog';
import { WorkspacePermissionGate } from 'shared/components/WorkspacePermissionGate';
import { PlusIcon } from 'shared/icons';

type AddWarehouseActionProps = {
  className?: string;
  label: string;
};

/**
 * Adds a Warehouse to the Workspace (AC-06): the gate, the trigger and the
 * dialog it opens. An actor without `WAREHOUSES:CREATE` is offered no control at
 * all rather than a disabled one (AC-30). Reused by the list pane's page action
 * and by the detail pane's "add the alternative" action on the last non-archived
 * Warehouse (AC-11a), which only differ in label.
 *
 * The gate reads the Workspace context itself rather than taking a boolean from
 * `WarehousesTab`. That read is the same cached RTK Query entry the tab already
 * subscribes to, so it costs no second request
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 */
export const AddWarehouseAction = ({
  className,
  label,
}: AddWarehouseActionProps): ReactElement => (
  <WorkspacePermissionGate permission={WorkspacePermissionId.WAREHOUSES_CREATE}>
    <Modal>
      <Button className={className} variant="primary">
        <PlusIcon />
        {label}
      </Button>
      <TriggeredDialog>
        <AddWarehouseDialog />
      </TriggeredDialog>
    </Modal>
  </WorkspacePermissionGate>
);
