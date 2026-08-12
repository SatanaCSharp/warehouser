import { useCallback } from 'react';

import { runWorkspaceMutation } from 'modules/workspace/api/workspace-mutation';
import { useCreateWarehouseMutation } from 'modules/workspace/api/workspace-warehouses-api';
import { warehouseNameValidationKey } from 'modules/workspace/hooks/warehouse-name-validation';

import type { WarehouseWrite } from '@warehouser/contracts/workspaces';
import type { MutationOutcome } from 'modules/workspace/types/workspace.types';

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
