import { Button } from '@heroui/react';
import { useState } from 'react';

import { AddWarehouseDialog } from 'modules/workspace/components/workspace-administration/warehouses/AddWarehouseDialog';
import { PlusIcon } from 'shared/icons';

import type { ReactElement } from 'react';

type AddWarehouseActionProps = {
  canCreateWarehouse: boolean;
  className?: string;
  label: string;
};

/**
 * Adds a Warehouse to the Workspace (AC-06): the gate, the trigger and the
 * dialog it opens. An actor without the creation Permission is offered no
 * control at all rather than a disabled one (AC-30). Reused by the list
 * pane's page action and by the detail pane's "add the alternative" action
 * on the last non-archived Warehouse (AC-11a), which only differ in label.
 * `canCreateWarehouse` is read from the single Workspace context read
 * `WarehousesTab` owns, rather than an independent hook call here, so this
 * tab's Warehouse list request is never preceded by a second, redundant
 * context request from this leaf.
 */
export const AddWarehouseAction = ({
  canCreateWarehouse,
  className,
  label,
}: AddWarehouseActionProps): ReactElement | null => {
  const [isOpen, setIsOpen] = useState(false);

  if (!canCreateWarehouse) {
    return null;
  }

  return (
    <>
      <Button
        className={className}
        variant="primary"
        onPress={() => setIsOpen(true)}
      >
        <PlusIcon />
        {label}
      </Button>
      {isOpen ? <AddWarehouseDialog onClose={() => setIsOpen(false)} /> : null}
    </>
  );
};
