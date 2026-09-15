import type { WorkspacePermission } from '@warehouser/contracts/workspaces';
import compact from 'lodash/compact';

export type WorkspacePermissionGroup = {
  id: string;
  permissions: WorkspacePermission[];
};

// The catalogue reads as five subjects plus the reserved one. The subject is
// the identifier's prefix, which is what makes a Permission's level and target
// legible (`WAREHOUSE_MEMBERSHIPS:*` grants access **to** a Warehouse; it
// grants nothing **inside** one — AC-31).
const groupIdsBySubject: Record<string, string> = {
  WORKSPACE: 'workspace',
  WORKSPACE_ROLES: 'workspaceRoles',
  WORKSPACE_MEMBERS: 'workspaceMembers',
  WAREHOUSES: 'warehouses',
  WAREHOUSE_MEMBERSHIPS: 'warehouseAccess',
};

const groupOrder = [
  'workspace',
  'workspaceRoles',
  'workspaceMembers',
  'warehouses',
  'warehouseAccess',
  'reserved',
];

const groupIdFor = (permission: WorkspacePermission): string =>
  permission.kind === 'reserved'
    ? 'reserved'
    : (groupIdsBySubject[permission.id.split(':')[0] ?? ''] ?? 'workspace');

/**
 * Splits the Permission catalogue into the subjects it reads as, keeping the
 * reserved Permission in its own group so its classification is structural
 * rather than a chip a reader has to notice (AC-18, AC-32). A group with no
 * entry is dropped rather than rendered empty.
 */
export const groupWorkspacePermissions = (
  permissions: WorkspacePermission[],
): WorkspacePermissionGroup[] =>
  compact(
    groupOrder.map((id) => {
      const grouped = permissions.filter(
        (permission) => groupIdFor(permission) === id,
      );
      return grouped.length > 0 ? { id, permissions: grouped } : undefined;
    }),
  );
