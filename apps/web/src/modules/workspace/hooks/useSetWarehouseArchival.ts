import { useCallback } from 'react';

import { useSetWarehouseArchivalMutation } from 'modules/workspace/api/workspace-warehouses-api';
import { runWorkspaceMutation } from 'shared/api/workspace-mutation';

import type { MutationOutcome } from 'shared/api/mutation-outcome';

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
