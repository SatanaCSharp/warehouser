import { useListAccessRolesQuery } from 'modules/access/api/access-api';
import { toAccessDataset } from 'modules/access/hooks/access-dataset';
import { useAccessCapabilities } from 'modules/access/hooks/useAccessCapabilities';

import type { AccessDataset } from 'modules/access/hooks/access-dataset';
import type { AccessRole } from 'modules/access/types/access.types';

/**
 * Roles, loaded once for whoever asks. Members (read-only Role-name lookup) and
 * Create Member (Role selection) both need Roles even for an actor who holds no
 * role-admin Permission at all (US-07's exact persona), so the query fires
 * wider than the Roles tab is visible — an actor entitled to none of it never
 * requests it.
 */
export const useAccessRoles = (): AccessDataset<AccessRole> => {
  const { canCreateMembers, canManageRoles, canReadMembers, canReadRoles } =
    useAccessCapabilities();

  return toAccessDataset(
    useListAccessRolesQuery(undefined, {
      skip: !(
        canReadRoles ||
        canManageRoles ||
        canReadMembers ||
        canCreateMembers
      ),
    }),
  );
};
