import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service.js';
import { WorkspaceMembershipEntity } from 'shared/domain/entities/workspace-membership.entity.js';
import { WorkspaceRolePermissionEntity } from 'shared/domain/entities/workspace-role-permission.entity.js';
import { DataSource } from 'typeorm';

export interface WorkspaceCurrentUserPersistenceResult {
  readonly userId: string;
  readonly workspaceId: string;
  readonly workspaceRoleId: string;
  readonly workspaceRoleKind: 'custom' | 'workspace_owner';
  readonly permissionId: string;
  readonly granted: boolean;
}

@Injectable()
export class WorkspaceCurrentUserRepository {
  constructor(private readonly dataSource: DataSource) {}

  async resolveRequiredWorkspacePermission(
    userId: string,
    permissionId: string,
  ): Promise<WorkspaceCurrentUserPersistenceResult | null> {
    const manager = getEntityManager(this.dataSource);
    const membership = await manager
      .getRepository(WorkspaceMembershipEntity)
      .findOneBy({ userId });
    if (!membership) {
      return null;
    }
    const granted = await manager
      .getRepository(WorkspaceRolePermissionEntity)
      .existsBy({
        workspaceRoleId: membership.workspaceRoleId,
        workspacePermissionId: permissionId,
      });
    return {
      userId: membership.userId,
      workspaceId: membership.workspaceId,
      workspaceRoleId: membership.workspaceRoleId,
      workspaceRoleKind: membership.workspaceRoleKind,
      permissionId,
      granted,
    };
  }
}
