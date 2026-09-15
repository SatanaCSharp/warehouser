import type { PermissionId } from '@warehouser/shared-types/enums';
import type { ReactNode } from 'react';
import { Conditional } from 'shared/components/Conditional';
import { useHasPermission } from 'shared/hooks/queries/usePermissions';

export type WarehousePermissionGateProps = {
  children: ReactNode;
  /** One required Warehouse Permission, or several of which any one admits. */
  permission: PermissionId | readonly PermissionId[];
};

/**
 * Offers `children` only to an actor holding the named Warehouse Permission, read
 * from the cached projection of the Warehouse the address names. The
 * Workspace-level twin is `WorkspacePermissionGate`, whose shape this matches exactly; the
 * two never accept each other's vocabulary (AC-31).
 *
 * Withheld means absent, not disabled or empty, and an unresolved projection
 * withholds — never a held-over value from the Warehouse just left. See
 * `docs/system/adr/19-08-2026-declarative-permission-gates.md`.
 */
export const WarehousePermissionGate = ({
  children,
  permission,
}: WarehousePermissionGateProps): ReactNode => {
  const isAllowed = useHasPermission(permission);

  return <Conditional when={isAllowed}>{children}</Conditional>;
};
