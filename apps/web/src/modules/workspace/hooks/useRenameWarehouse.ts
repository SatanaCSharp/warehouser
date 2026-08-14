import { useCallback } from 'react';

import { useRenameWarehouseMutation } from 'modules/workspace/api/workspace-warehouses-api';
import { warehouseNameValidationKey } from 'modules/workspace/hooks/warehouse-name-validation';
import { runWorkspaceMutation } from 'shared/api/workspace-mutation';

import type { WarehouseWrite } from '@warehouser/contracts/workspaces';
import type { MutationOutcome } from 'shared/api/mutation-outcome';

export type RenameWarehouse = (
  warehouseId: string,
  input: WarehouseWrite,
) => Promise<MutationOutcome>;

/** Renames a Warehouse of the Workspace (AC-09). */
export const useRenameWarehouse = (): RenameWarehouse => {
  const [renameWarehouse] = useRenameWarehouseMutation();

  return useCallback(
    async (warehouseId, input) =>
      warehouseNameValidationKey(
        await runWorkspaceMutation(
          'renameWarehouse',
          renameWarehouse({ warehouseId, ...input }),
        ),
      ),
    [renameWarehouse],
  );
};
