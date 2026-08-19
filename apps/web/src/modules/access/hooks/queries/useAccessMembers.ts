import { PermissionId } from '@warehouser/shared-types/enums';

import { useListAccessMembersQuery } from 'modules/access/api/access-api';
import { useAccessScope } from 'modules/access/hooks/projections/useAccessScope';
import { toAccessDataset } from 'modules/access/utils/access-dataset';
import { useHasPermission } from 'shared/hooks/queries/usePermissions';

import type { AccessMember } from 'modules/access/types/access.types';
import type { AccessDataset } from 'modules/access/utils/access-dataset';

/**
 * Everyone whose surface names a member: the Members list, Role assignment,
 * manager transfer, and each per-member lifecycle action.
 */
const membersReadPermissions = [
  PermissionId.USERS_WATCH,
  PermissionId.ROLES_ASSIGN,
  PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN,
  PermissionId.USERS_CREATE,
  PermissionId.USERS_DELETE,
  PermissionId.USERS_EMAIL_UPDATE,
  PermissionId.USERS_PASSWORD_CHANGE,
];

/**
 * Members, loaded for whoever asks. Role assignment and manager transfer both
 * pick a member, so the query fires for those actors too — an actor entitled to
 * none of it never requests it.
 */
export const useAccessMembers = (): AccessDataset<AccessMember> => {
  const { warehouseId } = useAccessScope();
  const isAllowed = useHasPermission(membersReadPermissions);

  return toAccessDataset(
    useListAccessMembersQuery(warehouseId ?? '', {
      skip: warehouseId === undefined || !isAllowed,
    }),
  );
};
