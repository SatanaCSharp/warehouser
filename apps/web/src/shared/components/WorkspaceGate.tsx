import { Conditional } from 'shared/components/Conditional';
import { useHasWorkspacePermission } from 'shared/hooks/queries/useWorkspacePermissions';

import type { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import type { ReactNode } from 'react';

export type WorkspaceGateProps = {
  children: ReactNode;
  /** One required Workspace Permission, or several of which any one admits. */
  permission: WorkspacePermissionId | readonly WorkspacePermissionId[];
};

export const WorkspaceGate = ({
  children,
  permission,
}: WorkspaceGateProps): ReactNode => {
  const isAllowed = useHasWorkspacePermission(permission);

  return <Conditional when={isAllowed}>{children}</Conditional>;
};
