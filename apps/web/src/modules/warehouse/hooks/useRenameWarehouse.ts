import { useCallback } from 'react';

import { useRenameWarehouseMutation } from 'modules/warehouse/api/warehouse-api';
import { warehouseNameValidationKey } from 'modules/warehouse/hooks/warehouse-name-validation';
import { runWorkspaceMutation } from 'shared/api/workspace/workspace-mutation';

import type { WarehouseWrite } from '@warehouser/contracts/workspaces';
import type { MutationOutcome } from 'shared/api/client/mutation-outcome';

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
