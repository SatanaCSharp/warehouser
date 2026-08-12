import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { WorkspaceMembershipEntity } from 'shared/domain/entities/workspace-membership.entity';
import { WorkspacePermissionEntity } from 'shared/domain/entities/workspace-permission.entity';
import { WorkspaceRoleEntity } from 'shared/domain/entities/workspace-role.entity';
import { WorkspaceRolePermissionEntity } from 'shared/domain/entities/workspace-role-permission.entity';
import { DataSource } from 'typeorm';

export interface WorkspaceIdentityRead {
  readonly id: string;
  readonly name: string | null;
}
export interface WorkspaceRoleWithPermissionsRead {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly kind: 'custom' | 'workspace_owner';
  readonly permissionIds: readonly string[];
}
export interface WorkspacePermissionCatalogueRead {
  readonly id: string;
  readonly label: string;
  readonly kind: 'assignable' | 'reserved';
}
export interface WorkspaceMemberRead {
  readonly userId: string;
  readonly workspaceRoleId: string;
  readonly workspaceRoleName: string;
  readonly workspaceRoleKind: 'custom' | 'workspace_owner';
}
export interface WorkspaceUserWithWarehousesRead {
  readonly userId: string;
  readonly warehouseIds: readonly string[];
}
export interface WorkspaceWarehouseRead {
  readonly id: string;
  readonly name: string;
  readonly archivedAt: Date | null;
}
export interface WorkspaceActorIdentityRead {
  readonly workspaceId: string;
  readonly workspaceName: string | null;
  readonly activeWarehouseId: string | null;
}
export interface WorkspaceActorWarehouseRead {
  readonly warehouseId: string;
  readonly name: string;
  readonly archivedAt: Date | null;
  readonly roleId: string;
  readonly roleKind: 'custom' | 'warehouse_manager';
}

@Injectable()
export class WorkspaceReadRepository {
  constructor(private readonly dataSource: DataSource) {}

  getWorkspace(workspaceId: string): Promise<WorkspaceIdentityRead | null> {
    return getEntityManager(this.dataSource)
      .getRepository(WorkspaceEntity)
      .createQueryBuilder('workspace')
      .select(['workspace.id', 'workspace.name'])
      .where('workspace.id = :workspaceId', { workspaceId })
      .getOne();
  }

  listWorkspaceRolesWithPermissions(
    workspaceId: string,
  ): Promise<WorkspaceRoleWithPermissionsRead[]> {
    return getEntityManager(this.dataSource)
      .getRepository(WorkspaceRoleEntity)
      .createQueryBuilder('role')
      .leftJoin(
        WorkspaceRolePermissionEntity,
        'rolePermission',
        'rolePermission.workspaceRoleId = role.id',
      )
      .select('role.id', 'id')
      .addSelect('role.workspaceId', 'workspaceId')
      .addSelect('role.name', 'name')
      .addSelect('role.kind', 'kind')
      .addSelect(
        "COALESCE(array_agg(rolePermission.workspace_permission_id ORDER BY rolePermission.workspace_permission_id) FILTER (WHERE rolePermission.workspace_permission_id IS NOT NULL), '{}')",
        'permissionIds',
      )
      .where('role.workspaceId = :workspaceId', { workspaceId })
      .groupBy('role.id')
      .orderBy('role.name', 'ASC')
      .addOrderBy('role.id', 'ASC')
      .getRawMany<WorkspaceRoleWithPermissionsRead>();
  }

  listWorkspacePermissionCatalogue(): Promise<
    WorkspacePermissionCatalogueRead[]
  > {
    return getEntityManager(this.dataSource)
      .getRepository(WorkspacePermissionEntity)
      .createQueryBuilder('permission')
      .select(['permission.id', 'permission.label', 'permission.kind'])
      .orderBy('permission.kind', 'ASC')
      .addOrderBy('permission.id', 'ASC')
      .getMany();
  }

  listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberRead[]> {
    return getEntityManager(this.dataSource)
      .getRepository(WorkspaceMembershipEntity)
      .createQueryBuilder('membership')
      .innerJoin(
        WorkspaceRoleEntity,
        'role',
        'role.id = membership.workspaceRoleId',
      )
      .select('membership.userId', 'userId')
      .addSelect('membership.workspaceRoleId', 'workspaceRoleId')
      .addSelect('role.name', 'workspaceRoleName')
      .addSelect('membership.workspaceRoleKind', 'workspaceRoleKind')
      .where('membership.workspaceId = :workspaceId', { workspaceId })
      .orderBy('membership.userId', 'ASC')
      .getRawMany<WorkspaceMemberRead>();
  }

  listWorkspaceUsersWithWarehouses(
    workspaceId: string,
  ): Promise<WorkspaceUserWithWarehousesRead[]> {
    return getEntityManager(this.dataSource)
      .getRepository(UserEntity)
      .createQueryBuilder('user')
      .leftJoin(
        WarehouseMembershipEntity,
        'membership',
        'membership.userId = user.id AND membership.workspaceId = :workspaceId',
        { workspaceId },
      )
      .select('user.id', 'userId')
      .addSelect(
        "COALESCE(array_agg(membership.warehouse_id ORDER BY membership.warehouse_id) FILTER (WHERE membership.warehouse_id IS NOT NULL), '{}')",
        'warehouseIds',
      )
      .where('user.workspaceId = :workspaceId', { workspaceId })
      .groupBy('user.id')
      .orderBy('user.id', 'ASC')
      .getRawMany<WorkspaceUserWithWarehousesRead>();
  }

  listWorkspaceWarehouses(
    workspaceId: string,
  ): Promise<WorkspaceWarehouseRead[]> {
    return getEntityManager(this.dataSource)
      .getRepository(WarehouseEntity)
      .createQueryBuilder('warehouse')
      .select(['warehouse.id', 'warehouse.name', 'warehouse.archivedAt'])
      .where('warehouse.workspaceId = :workspaceId', { workspaceId })
      .orderBy('warehouse.name', 'ASC')
      .addOrderBy('warehouse.id', 'ASC')
      .getMany();
  }

  // The actor's own Workspace identity/name, read through
  // `users.workspace_id` (never re-derived from Workspace membership —
  // spec.md §1's second boundary), together with the raw stored
  // `users.active_warehouse_id` value. Every User row references its
  // Workspace, so this resolves even when the actor holds no Workspace
  // membership at all (AC-30).
  getActorIdentity(userId: string): Promise<WorkspaceActorIdentityRead | null> {
    return getEntityManager(this.dataSource)
      .getRepository(UserEntity)
      .createQueryBuilder('user')
      .innerJoin(
        WorkspaceEntity,
        'workspace',
        'workspace.id = user.workspaceId',
      )
      .select('user.workspaceId', 'workspaceId')
      .addSelect('workspace.name', 'workspaceName')
      .addSelect('user.activeWarehouseId', 'activeWarehouseId')
      .where('user.id = :userId', { userId })
      .getRawOne<WorkspaceActorIdentityRead>()
      .then((row) => row ?? null);
  }

  // Every live Warehouse membership the actor holds, each Warehouse's
  // archived state, and the Role held there (`warehouse_memberships`
  // already carries `role_id`/`role_kind`, so no join to `roles` is
  // needed). A withdrawn membership is simply absent from this list.
  listActorWarehouseMemberships(
    userId: string,
  ): Promise<WorkspaceActorWarehouseRead[]> {
    return getEntityManager(this.dataSource)
      .getRepository(WarehouseMembershipEntity)
      .createQueryBuilder('membership')
      .innerJoin(
        WarehouseEntity,
        'warehouse',
        'warehouse.id = membership.warehouseId',
      )
      .select('membership.warehouseId', 'warehouseId')
      .addSelect('warehouse.name', 'name')
      .addSelect('warehouse.archivedAt', 'archivedAt')
      .addSelect('membership.roleId', 'roleId')
      .addSelect('membership.roleKind', 'roleKind')
      .where('membership.userId = :userId', { userId })
      .orderBy('warehouse.name', 'ASC')
      .addOrderBy('membership.warehouseId', 'ASC')
      .getRawMany<WorkspaceActorWarehouseRead>();
  }

  // The actor's Workspace Permission ids, empty when the actor holds no
  // Workspace membership (AC-30).
  getActorWorkspacePermissionIds(userId: string): Promise<string[]> {
    return getEntityManager(this.dataSource)
      .getRepository(WorkspaceMembershipEntity)
      .createQueryBuilder('membership')
      .innerJoin(
        WorkspaceRolePermissionEntity,
        'rolePermission',
        'rolePermission.workspaceRoleId = membership.workspaceRoleId',
      )
      .select('rolePermission.workspacePermissionId', 'workspacePermissionId')
      .where('membership.userId = :userId', { userId })
      .orderBy('rolePermission.workspacePermissionId', 'ASC')
      .getRawMany<{ workspacePermissionId: string }>()
      .then((rows) => rows.map((row) => row.workspacePermissionId));
  }
}
