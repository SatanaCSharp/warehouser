import { useListAccessRolesQuery } from 'modules/access/api/access-api';
import { useAccessCapabilities } from 'modules/access/hooks/projections/useAccessCapabilities';
import { toAccessDataset } from 'modules/access/utils/access-dataset';

import type { AccessRole } from 'modules/access/types/access.types';
import type { AccessDataset } from 'modules/access/utils/access-dataset';

/**
 * Roles, loaded once for whoever asks. Members (read-only Role-name lookup) and
 * Create Member (Role selection) both need Roles even for an actor who holds no
 * role-admin Permission at all (US-07's exact persona), so the query fires
 * wider than the Roles tab is visible — an actor entitled to none of it never
 * requests it.
 */
export const useAccessRoles = (): AccessDataset<AccessRole> => {
  const {
    canCreateMembers,
    canManageRoles,
    canReadMembers,
    canReadRoles,
    warehouseId,
  } = useAccessCapabilities();

  return toAccessDataset(
    useListAccessRolesQuery(warehouseId ?? '', {
      skip:
        warehouseId === undefined ||
        !(canReadRoles || canManageRoles || canReadMembers || canCreateMembers),
    }),
  );
};
