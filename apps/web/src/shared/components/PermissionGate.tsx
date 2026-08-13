import { hasPermission, useHasPermission } from 'shared/hooks/usePermissions';

import type { PermissionId } from '@warehouser/shared-types/enums';
import type { ReactElement, ReactNode } from 'react';
import type { PermissionMatch } from 'shared/hooks/usePermissions';

export type PermissionGateProps = {
  children: ReactNode;
  fallback?: ReactNode;
  match?: PermissionMatch;
  permission?: PermissionId | readonly PermissionId[];
  permissionIds?: readonly PermissionId[];
};

export const PermissionGate = ({
  children,
  fallback = null,
  match = 'any',
  permission,
  permissionIds,
}: PermissionGateProps): ReactElement => {
  const cachedIsAllowed = useHasPermission(permission, match);

  const isAllowed =
    permissionIds === undefined
      ? cachedIsAllowed
      : hasPermission(permissionIds, permission, match);

  return <>{isAllowed ? children : fallback}</>;
};
