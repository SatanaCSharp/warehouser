import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service.js';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity.js';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity.js';
import { WorkspaceMembershipEntity } from 'shared/domain/entities/workspace-membership.entity.js';
import { WorkspacePermissionEntity } from 'shared/domain/entities/workspace-permission.entity.js';
import type { WorkspaceRoleEntityKind } from 'shared/domain/entities/workspace-role.entity.js';
import { WorkspaceRoleEntity } from 'shared/domain/entities/workspace-role.entity.js';
import { WorkspaceRolePermissionEntity } from 'shared/domain/entities/workspace-role-permission.entity.js';
import { DataSource, In } from 'typeorm';

export interface WorkspacePersistenceInput {
  readonly id: string;
  readonly name: string | null;
}
export interface WorkspaceRolePersistenceInput {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly kind: WorkspaceRoleEntityKind;
}
export interface WorkspaceMembershipPersistenceInput {
  readonly userId: string;
  readonly workspaceId: string;
  readonly workspaceRoleId: string;
  readonly workspaceRoleKind: WorkspaceRoleEntityKind;
}
export interface WorkspaceProvisioningInput {
  readonly workspace: WorkspacePersistenceInput;
  readonly ownerRole: WorkspaceRolePersistenceInput;
  readonly ownerMembership: WorkspaceMembershipPersistenceInput;
  readonly permissionIds: readonly string[];
}
export interface WarehouseProvisioningInput {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
}

@Injectable()
export class WorkspaceProvisioningRepository {
  constructor(private readonly dataSource: DataSource) {}

  async provisionWorkspace(input: WorkspaceProvisioningInput): Promise<void> {
    const manager = getEntityManager(this.dataSource);
    const permissions = await manager
      .getRepository(WorkspacePermissionEntity)
      .find({
        select: { id: true, kind: true },
        where: { id: In([...input.permissionIds]) },
        order: { id: 'ASC' },
      });
    if (permissions.length !== input.permissionIds.length) {
      throw new Error(
        'One or more required Workspace Permission identifiers are absent from the catalogue.',
      );
    }
    await manager.getRepository(WorkspaceEntity).insert(input.workspace);
    await manager.getRepository(WorkspaceRoleEntity).insert(input.ownerRole);
    await manager.getRepository(WorkspaceRolePermissionEntity).insert(
      permissions.map((permission) => ({
        workspaceRoleId: input.ownerRole.id,
        workspacePermissionId: permission.id,
        workspaceRoleKind: input.ownerRole.kind,
        workspacePermissionKind: permission.kind,
      })),
    );
    await manager
      .getRepository(WorkspaceMembershipEntity)
      .insert(input.ownerMembership);
  }

  // sad.md §6.1: registration bootstrap creates the first Warehouse of the
  // Workspace before delegating its protected Manager Role and membership to
  // `access`. A separate method (rather than folding this into
  // `provisionWorkspace`) keeps that method's existing single-purpose shape
  // and lets a caller that only needs the Workspace/Owner-Role outcome avoid
  // an unrelated Warehouse row.
  async provisionWarehouse(input: WarehouseProvisioningInput): Promise<void> {
    const manager = getEntityManager(this.dataSource);
    await manager.getRepository(WarehouseEntity).insert({
      id: input.id,
      workspaceId: input.workspaceId,
      name: input.name,
      archivedAt: null,
    });
  }
}
