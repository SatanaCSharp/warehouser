import { useHasWorkspacePermission } from 'shared/hooks/useWorkspacePermissions';

import type { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import type { ReactElement, ReactNode } from 'react';

export type WorkspaceGateProps = {
  children: ReactNode;
  permission: WorkspacePermissionId;
};

export const WorkspaceGate = ({
  children,
  permission,
}: WorkspaceGateProps): ReactElement => {
  const isAllowed = useHasWorkspacePermission(permission);

  return <>{isAllowed ? children : null}</>;
};
