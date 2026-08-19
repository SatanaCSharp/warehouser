import {
  hasWorkspacePermission,
  useCurrentWorkspaceContext,
} from 'shared/hooks/queries/useWorkspacePermissions';

import type { WorkspacePermissionId } from '@warehouser/shared-types/enums';

/** What a descriptor must carry for this hook to decide whether it is offered. */
export type WorkspacePermissionScopedItem = {
  /**
   * The Workspace Permissions that offer this item; holding any one of them is
   * enough. Never a Warehouse-level `PermissionId` — the two authorization
   * vocabularies never meet (AC-31).
   */
  permission: WorkspacePermissionId | readonly WorkspacePermissionId[];
};

/**
 * `WorkspacePermissionGate`'s collection form, for the same reason `usePermittedItems` is
 * `WarehousePermissionGate`'s: a React Aria collection reads its own children, so
 * a gate element cannot sit between `Dropdown.Menu` and its items. The Workspace
 * context is read once here rather than once per descriptor.
 *
 * See `docs/system/adr/19-08-2026-declarative-permission-gates.md`.
 */
export const useWorkspacePermittedItems = <
  TItem extends WorkspacePermissionScopedItem,
>(
  items: readonly TItem[],
): TItem[] => {
  const { workspacePermissionIds } = useCurrentWorkspaceContext();

  return items.filter((item) =>
    hasWorkspacePermission(workspacePermissionIds, item.permission),
  );
};
