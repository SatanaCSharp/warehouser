import { useCallback } from 'react';

import { runWorkspaceMutation } from 'modules/workspace/api/workspace-mutation';
import { useSetWarehouseArchivalMutation } from 'modules/workspace/api/workspace-warehouses-api';

import type { MutationOutcome } from 'modules/workspace/types/workspace.types';

export type SetWarehouseArchival = (
  warehouseId: string,
  archived: boolean,
) => Promise<MutationOutcome>;

/** Archives or restores a Warehouse of the Workspace (AC-11, AC-11a). */
export const useSetWarehouseArchival = (): SetWarehouseArchival => {
  const [setWarehouseArchival] = useSetWarehouseArchivalMutation();

  return useCallback(
    (warehouseId, archived) =>
      runWorkspaceMutation(
        archived ? 'archiveWarehouse' : 'restoreWarehouse',
        setWarehouseArchival({ warehouseId, archived }),
      ),
    [setWarehouseArchival],
  );
};
