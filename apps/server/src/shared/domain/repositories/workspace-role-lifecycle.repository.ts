import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { WorkspaceMembershipEntity } from 'shared/domain/entities/workspace-membership.entity';
import { WorkspaceRoleEntity } from 'shared/domain/entities/workspace-role.entity';
import { WorkspaceRolePermissionEntity } from 'shared/domain/entities/workspace-role-permission.entity';
import { DataSource } from 'typeorm';

export interface WorkspaceCustomRoleWrite {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
}

// A persistence-oriented shape (not the `WorkspacePermissionEntity` class),
// so callers above the repository boundary — including use cases, which must
// not depend on TypeORM entities (server-architecture.md "Use cases") — can
// pass a plain catalogue read result without importing the entity.
export interface WorkspacePermissionGrant {
  readonly id: string;
  readonly kind: 'assignable' | 'reserved';
}

const permissionRows = (
  workspaceRoleId: string,
  permissions: readonly WorkspacePermissionGrant[],
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
    permissions: readonly WorkspacePermissionGrant[],
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

  // Kind-agnostic lock: unlike `findCustomRole`, this matches a Workspace
  // Role of any `kind` (including the protected `workspace_owner` kind)
  // scoped to the Workspace, so a caller can distinguish "missing/
  // cross-Workspace Role" from "Role exists but is protected" instead of
  // both collapsing to the same outcome. Mirrors
  // `RoleLifecycleRepository.lockRoleById` one level down.
  lockRoleById(
    workspaceId: string,
    roleId: string,
  ): Promise<WorkspaceRoleEntity | null> {
    const manager = getEntityManager(this.dataSource);
    return manager
      .getRepository(WorkspaceRoleEntity)
      .createQueryBuilder('workspaceRole')
      .where({ id: roleId, workspaceId })
      .setLock('pessimistic_write')
      .getOne();
  }

  async updateCustomRole(roleId: string, name: string): Promise<void> {
    const manager = getEntityManager(this.dataSource);
    await manager
      .getRepository(WorkspaceRoleEntity)
      .update({ id: roleId, kind: 'custom' }, { name, updatedAt: new Date() });
  }

  async replaceCustomRolePermissions(
    roleId: string,
    permissions: readonly WorkspacePermissionGrant[],
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
