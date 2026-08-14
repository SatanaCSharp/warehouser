import { useCallback } from 'react';

import { useCreateWarehouseMutation } from 'modules/warehouse/api/warehouse-api';
import { warehouseNameValidationKey } from 'modules/warehouse/hooks/warehouse-name-validation';
import { runWorkspaceMutation } from 'shared/api/workspace-mutation';

import type { WarehouseWrite } from '@warehouser/contracts/workspaces';
import type { MutationOutcome } from 'shared/api/mutation-outcome';

export type CreateWarehouse = (
  input: WarehouseWrite,
) => Promise<MutationOutcome>;

/** Adds a Warehouse to the Workspace, becoming its Warehouse Manager (AC-06). */
export const useCreateWarehouse = (): CreateWarehouse => {
  const [createWarehouse] = useCreateWarehouseMutation();

  return useCallback(
    async (input) =>
      warehouseNameValidationKey(
        await runWorkspaceMutation('createWarehouse', createWarehouse(input)),
      ),
    [createWarehouse],
  );
};
