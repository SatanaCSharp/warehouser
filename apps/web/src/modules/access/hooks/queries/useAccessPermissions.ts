import { useListAccessPermissionsQuery } from 'modules/access/api/access-api';
import { useAccessScope } from 'modules/access/hooks/projections/useAccessScope';
import type { AccessPermission } from 'modules/access/types/access.types';
import type { AccessDataset } from 'modules/access/utils/access-dataset';
import { toAccessDataset } from 'modules/access/utils/access-dataset';
import { rolesTabPermissions } from 'modules/access/utils/access-permission-sets';
import { useHasPermission } from 'shared/hooks/queries/usePermissions';

/**
 * The Permission catalogue every Role form grants from, read by the Permissions
 * tab and by every Role form.
 *
 * Its set is the Roles tab's own admission set, so every actor admitted to that
 * tab receives the catalogue — the one intended widening of this change request
 * (CR-RG-02). It widens `baseline_revision`'s three (`ROLES:WATCH`,
 * `ROLES:CREATE`, `ROLES:UPDATE`) by `ROLES:ASSIGN`, `ROLES:DELETE` and
 * `WAREHOUSE_MANAGER_ROLE:REASSIGN`, and by nothing else. The catalogue carries
 * Permission names only, and the server independently authorizes the request.
 */
export const useAccessPermissions = (): AccessDataset<AccessPermission> => {
  const { warehouseId } = useAccessScope();
  const isAllowed = useHasPermission(rolesTabPermissions);

  return toAccessDataset(
    useListAccessPermissionsQuery(warehouseId ?? '', {
      skip: warehouseId === undefined || !isAllowed,
    }),
  );
};
