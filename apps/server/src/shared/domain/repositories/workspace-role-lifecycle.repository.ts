import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { WorkspaceMembershipEntity } from 'shared/domain/entities/workspace-membership.entity';
import { WorkspacePermissionEntity } from 'shared/domain/entities/workspace-permission.entity';
import { WorkspaceRoleEntity } from 'shared/domain/entities/workspace-role.entity';
import { WorkspaceRolePermissionEntity } from 'shared/domain/entities/workspace-role-permission.entity';
import { DataSource } from 'typeorm';

export interface WorkspaceCustomRoleWrite {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
}

const permissionRows = (
  workspaceRoleId: string,
  permissions: readonly WorkspacePermissionEntity[],
) =>
  permissions.map((permission) => ({
    workspaceRoleId,
    workspacePermissionId: permission.id,
    workspaceRoleKind: 'custom' as const,
    workspacePermissionKind: permission.kind,
  }));

@Injectable()
export class WorkspaceRoleLifecycleRepository {
  constructor(private readonly dataSource: DataSource) {}

  async createCustomRole(
    input: WorkspaceCustomRoleWrite,
    permissions: readonly WorkspacePermissionEntity[],
  ): Promise<void> {
    const manager = getEntityManager(this.dataSource);
    await manager.getRepository(WorkspaceRoleEntity).insert({
      id: input.id,
      workspaceId: input.workspaceId,
      name: input.name,
      kind: 'custom',
    });
    const grants = permissionRows(input.id, permissions);
    if (grants.length > 0) {
      await manager.getRepository(WorkspaceRolePermissionEntity).insert(grants);
    }
  }

  findRoleByName(
    workspaceId: string,
    name: string,
  ): Promise<WorkspaceRoleEntity | null> {
    const manager = getEntityManager(this.dataSource);
    return manager
      .getRepository(WorkspaceRoleEntity)
      .findOneBy({ workspaceId, name });
  }

  findCustomRole(
    workspaceId: string,
    roleId: string,
  ): Promise<WorkspaceRoleEntity | null> {
    const manager = getEntityManager(this.dataSource);
    return manager
      .getRepository(WorkspaceRoleEntity)
      .findOneBy({ workspaceId, id: roleId, kind: 'custom' });
  }

  async updateCustomRole(roleId: string, name: string): Promise<void> {
    const manager = getEntityManager(this.dataSource);
    await manager
      .getRepository(WorkspaceRoleEntity)
      .update({ id: roleId, kind: 'custom' }, { name, updatedAt: new Date() });
  }

  async replaceCustomRolePermissions(
    roleId: string,
    permissions: readonly WorkspacePermissionEntity[],
  ): Promise<void> {
    const manager = getEntityManager(this.dataSource);
    await manager
      .getRepository(WorkspaceRolePermissionEntity)
      .delete({ workspaceRoleId: roleId });
    const grants = permissionRows(roleId, permissions);

    if (grants.length) {
      await manager.getRepository(WorkspaceRolePermissionEntity).insert(grants);
    }
  }

  countRoleMembers(workspaceId: string, roleId: string): Promise<number> {
    const manager = getEntityManager(this.dataSource);
    return manager
      .getRepository(WorkspaceMembershipEntity)
      .countBy({ workspaceId, workspaceRoleId: roleId });
  }

  // Moves every affected membership to the replacement Role in one update.
  // Matched by `workspace_id` + `workspace_role_id`, so it uses the same
  // index (`idx_workspace_memberships_role_id`) the deletion below depends
  // on staying uncontended with.
  async replaceRoleAssignments(
    workspaceId: string,
    sourceRoleId: string,
    replacementRoleId: string,
  ): Promise<void> {
    const manager = getEntityManager(this.dataSource);
    await manager.getRepository(WorkspaceMembershipEntity).update(
      { workspaceId, workspaceRoleId: sourceRoleId },
      {
        workspaceRoleId: replacementRoleId,
        workspaceRoleKind: 'custom',
        updatedAt: new Date(),
      },
    );
  }

  async removeCustomRole(workspaceId: string, roleId: string): Promise<void> {
    const manager = getEntityManager(this.dataSource);
    await manager
      .getRepository(WorkspaceRoleEntity)
      .delete({ workspaceId, id: roleId, kind: 'custom' });
  }
}
