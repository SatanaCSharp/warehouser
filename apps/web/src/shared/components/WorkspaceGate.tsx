import { useHasWorkspacePermission } from 'shared/hooks/useWorkspacePermissions';

import type { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import type { ReactElement, ReactNode } from 'react';

export type WorkspaceGateProps = {
  children: ReactNode;
  /** One required Workspace Permission, or several of which any one admits. */
  permission: WorkspacePermissionId | readonly WorkspacePermissionId[];
};

export const WorkspaceGate = ({
  children,
  permission,
}: WorkspaceGateProps): ReactElement => {
  const isAllowed = useHasWorkspacePermission(permission);

  return <>{isAllowed ? children : null}</>;
};
