import {
  hasPermission,
  useCurrentPermissions,
} from 'shared/hooks/queries/usePermissions';

import type { PermissionId } from '@warehouser/shared-types/enums';

/** What a descriptor must carry for this hook to decide whether it is offered. */
export type PermissionScopedItem = {
  /** The Permissions that offer this item; holding any one of them is enough. */
  permission: PermissionId | readonly PermissionId[];
};

/**
 * `WarehousePermissionGate`'s collection form: keeps the descriptors whose
 * Permissions the actor holds.
 *
 * A React Aria collection — `Tabs.List`, `Dropdown.Menu` — reads its own
 * children, so a gate element cannot sit between the collection and its items.
 * Those surfaces build a descriptor list instead, and each descriptor names its
 * Permissions in a `permission` field exactly as it would in a gate's prop. The
 * projection is read once here rather than once per item, so a menu of eight
 * actions still resolves from the one cached read.
 *
 * See `docs/system/adr/19-08-2026-declarative-permission-gates.md`.
 */
export const usePermittedItems = <TItem extends PermissionScopedItem>(
  items: readonly TItem[],
): TItem[] => {
  const { permissionIds } = useCurrentPermissions();

  return items.filter((item) => hasPermission(permissionIds, item.permission));
};
