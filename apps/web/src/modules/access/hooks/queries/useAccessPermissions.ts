import { useListAccessPermissionsQuery } from 'modules/access/api/access-api';
import { useAccessCapabilities } from 'modules/access/hooks/projections/useAccessCapabilities';
import { toAccessDataset } from 'modules/access/utils/access-dataset';

import type { AccessPermission } from 'modules/access/types/access.types';
import type { AccessDataset } from 'modules/access/utils/access-dataset';

/** The Permission catalogue every Role form grants from. */
export const useAccessPermissions = (): AccessDataset<AccessPermission> => {
  const { canReadPermissions, warehouseId } = useAccessCapabilities();

  return toAccessDataset(
    useListAccessPermissionsQuery(warehouseId ?? '', {
      skip: warehouseId === undefined || !canReadPermissions,
    }),
  );
};
