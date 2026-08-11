import {
  useListAccessMembersQuery,
  useListAccessPermissionsQuery,
  useListAccessRolesQuery,
} from 'modules/access/api/access-api';
import { deriveAccessCapabilities } from 'modules/access/components/access-workspace/access-capabilities';
import { useAccessAdministrationActions } from 'modules/access/hooks/useAccessAdministrationActions';

import type {
  AccessProjection,
  MemberPage,
  PermissionPage,
  RolePage,
} from '@warehouser/contracts/access';
import type { AccessCapabilities } from 'modules/access/components/access-workspace/access-capabilities';
import type { AccessAdministrationActions } from 'modules/access/types/access-administration.types';

/** The part of a query result the workspace renders from. */
export type AccessDatasetQuery<TPage> = {
  data?: TPage;
  isError: boolean;
  isFetching: boolean;
  isLoading: boolean;
};

/** Everything a tab may need. A tab reads only the parts it uses. */
export type AccessWorkspaceContext = {
  access: AccessProjection;
  actions: AccessAdministrationActions;
  capabilities: AccessCapabilities;
  members: AccessDatasetQuery<MemberPage>;
  permissions: AccessDatasetQuery<PermissionPage>;
  roles: AccessDatasetQuery<RolePage>;
};

/**
 * Members (read-only Role-name lookup) and Create Member (Role selection) both
 * need Roles loaded even for an actor who holds no role-admin Permission at all
 * (US-07's exact persona) — this only widens when the Roles *query* fires, not
 * which tabs the actor sees.
 */
const needsRoles = ({
  canCreateMembers,
  canManageRoles,
  canReadMembers,
  canReadRoles,
}: AccessCapabilities): boolean =>
  canReadRoles || canManageRoles || canReadMembers || canCreateMembers;

const needsMembers = ({
  canAssignRoles,
  canManageMemberLifecycle,
  canReadMembers,
}: AccessCapabilities): boolean =>
  canReadMembers || canAssignRoles || canManageMemberLifecycle;

/**
 * Loads what the acting user is allowed to load and hands the workspace one
 * context its tabs read from. A dataset an actor may not see is never
 * requested.
 */
export const useAccessWorkspace = (
  access: AccessProjection,
): AccessWorkspaceContext => {
  const capabilities = deriveAccessCapabilities(access.permissionIds);
  const actions = useAccessAdministrationActions();
  const roles = useListAccessRolesQuery(undefined, {
    skip: !needsRoles(capabilities),
  });
  const permissions = useListAccessPermissionsQuery(undefined, {
    skip: !capabilities.canReadPermissions,
  });
  const members = useListAccessMembersQuery(undefined, {
    skip: !needsMembers(capabilities),
  });

  return { access, actions, capabilities, members, permissions, roles };
};
