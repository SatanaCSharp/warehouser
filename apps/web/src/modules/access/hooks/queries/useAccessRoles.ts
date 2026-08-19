import { PermissionId } from '@warehouser/shared-types/enums';

import { useListAccessRolesQuery } from 'modules/access/api/access-api';
import { useAccessScope } from 'modules/access/hooks/projections/useAccessScope';
import { toAccessDataset } from 'modules/access/utils/access-dataset';
import { useHasPermission } from 'shared/hooks/queries/usePermissions';

import type { AccessRole } from 'modules/access/types/access.types';
import type { AccessDataset } from 'modules/access/utils/access-dataset';

/**
 * Every actor whose surface names a Role: the Roles tab (read or administer),
 * the Members list's Role-name lookup, and Create Member's Role selection.
 */
const rolesReadPermissions = [
  PermissionId.ROLES_WATCH,
  PermissionId.ROLES_ASSIGN,
  PermissionId.ROLES_CREATE,
  PermissionId.ROLES_DELETE,
  PermissionId.ROLES_UPDATE,
  PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN,
  PermissionId.USERS_WATCH,
  PermissionId.USERS_CREATE,
];

/**
 * Roles, loaded once for whoever asks. Members (read-only Role-name lookup) and
 * Create Member (Role selection) both need Roles even for an actor who holds no
 * role-admin Permission at all (US-07's exact persona), so the query fires
 * wider than the Roles tab is visible — an actor entitled to none of it never
 * requests it.
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
