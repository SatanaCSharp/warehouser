import { useListAccessRolesQuery } from 'modules/access/api/access-api';
import { useAccessScope } from 'modules/access/hooks/projections/useAccessScope';
import { toAccessDataset } from 'modules/access/utils/access-dataset';
import { rolesReadPermissions } from 'modules/access/utils/access-permission-sets';
import { useHasPermission } from 'shared/hooks/queries/usePermissions';

import type { AccessRole } from 'modules/access/types/access.types';
import type { AccessDataset } from 'modules/access/utils/access-dataset';

/**
 * Roles, loaded once for whoever asks. Members (read-only Role-name lookup) and
 * Create Member (Role selection) both need Roles even for an actor who holds no
 * role-admin Permission at all (US-07's exact persona), so the query fires
 * wider than the Roles tab is visible — an actor entitled to none of it never
 * requests it.
 *
 * The gate stays here, beside the read it gates; only the set it names is
 * declared once, in `utils/access-permission-sets.ts`, so the access loader
 * reproducing this condition cannot drift from it (CR-RG-02).
 */
export const useAccessRoles = (): AccessDataset<AccessRole> => {
  const { warehouseId } = useAccessScope();
  const isAllowed = useHasPermission(rolesReadPermissions);

  return toAccessDataset(
    useListAccessRolesQuery(warehouseId ?? '', {
      skip: warehouseId === undefined || !isAllowed,
    }),
  );
};
