import { SetMetadata } from '@nestjs/common';
import type { WorkspacePermissionId } from '@warehouser/shared-types/enums';

export const REQUIRED_WORKSPACE_PERMISSION_KEY =
  'workspace-access.required-workspace-permission';

export const RequiredWorkspacePermission = (
  ...permissionIds: WorkspacePermissionId[]
) => SetMetadata(REQUIRED_WORKSPACE_PERMISSION_KEY, permissionIds);
