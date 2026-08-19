import { PermissionId } from '@warehouser/shared-types/enums';

import { useListAccessPermissionsQuery } from 'modules/access/api/access-api';
import { useAccessScope } from 'modules/access/hooks/projections/useAccessScope';
import { toAccessDataset } from 'modules/access/utils/access-dataset';
import { useHasPermission } from 'shared/hooks/queries/usePermissions';

import type { AccessPermission } from 'modules/access/types/access.types';
import type { AccessDataset } from 'modules/access/utils/access-dataset';

/** The catalogue is read by the Permissions tab and by every Role form. */
const permissionsReadPermissions = [
  PermissionId.ROLES_WATCH,
  PermissionId.ROLES_CREATE,
  PermissionId.ROLES_UPDATE,
];

/** The Permission catalogue every Role form grants from. */
export const useAccessPermissions = (): AccessDataset<AccessPermission> => {
  const { warehouseId } = useAccessScope();
  const isAllowed = useHasPermission(permissionsReadPermissions);

  return toAccessDataset(
    useListAccessPermissionsQuery(warehouseId ?? '', {
      skip: warehouseId === undefined || !isAllowed,
    }),
  );
};
