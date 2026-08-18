import { Conditional } from 'shared/components/Conditional';
import {
  hasPermission,
  useHasPermission,
} from 'shared/hooks/queries/usePermissions';

import type { PermissionId } from '@warehouser/shared-types/enums';
import type { ReactNode } from 'react';
import type { PermissionMatch } from 'shared/hooks/queries/usePermissions';

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
}: PermissionGateProps): ReactNode => {
  const cachedIsAllowed = useHasPermission(permission, match);

  const isAllowed =
    permissionIds === undefined
      ? cachedIsAllowed
      : hasPermission(permissionIds, permission, match);

  return (
    <Conditional when={isAllowed} otherwise={fallback}>
      {children}
    </Conditional>
  );
};
