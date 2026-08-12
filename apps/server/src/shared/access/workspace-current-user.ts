import type { WorkspacePermissionId } from '@warehouser/shared-types/enums';

export interface WorkspaceCurrentUser {
  readonly userId: string;
  readonly workspaceId: string;
  readonly workspaceRoleId: string;
  readonly workspaceRoleKind: 'custom' | 'workspace_owner';
  readonly permissionId: WorkspacePermissionId;
}

export const workspaceCurrentUser = (
  value: WorkspaceCurrentUser,
): WorkspaceCurrentUser => Object.freeze({ ...value });
