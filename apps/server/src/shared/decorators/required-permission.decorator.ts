import { SetMetadata } from '@nestjs/common';
import type { PermissionId } from '@warehouser/shared-types/enums';

export const REQUIRED_PERMISSION_KEY = 'access.required-permission';

export const RequiredPermission = (...permissionIds: PermissionId[]) =>
  SetMetadata(REQUIRED_PERMISSION_KEY, permissionIds);
