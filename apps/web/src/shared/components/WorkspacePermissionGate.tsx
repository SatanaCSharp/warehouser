import { Conditional } from 'shared/components/Conditional';
import { useHasWorkspacePermission } from 'shared/hooks/queries/useWorkspacePermissions';

import type { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import type { ReactNode } from 'react';

export type WorkspacePermissionGateProps = {
  children: ReactNode;
  /** One required Workspace Permission, or several of which any one admits. */
  permission: WorkspacePermissionId | readonly WorkspacePermissionId[];
};

/**
 * Offers `children` only to an actor holding the named Workspace Permission, read
 * from the cached Workspace context. The Warehouse-level twin is
 * `WarehousePermissionGate`, whose shape this matches exactly; the two never
 * accept each other's vocabulary (AC-31).
 *
 * Withheld means absent, not disabled or empty, and an unresolved context
 * withholds (AC-30). See
 * `docs/system/adr/19-08-2026-declarative-permission-gates.md`.
 */
export const WorkspacePermissionGate = ({
  children,
  permission,
}: WorkspacePermissionGateProps): ReactNode => {
  const isAllowed = useHasWorkspacePermission(permission);

  return <Conditional when={isAllowed}>{children}</Conditional>;
};
