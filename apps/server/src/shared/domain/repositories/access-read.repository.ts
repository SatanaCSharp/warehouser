import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { PermissionEntity } from 'shared/domain/entities/permission.entity';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { paginationBuilder } from 'shared/pagination/pagination-builder';
import { DataSource } from 'typeorm';

export interface AccessRoleRead {
  readonly id: string;
  readonly warehouseId: string;
  readonly name: string;
  readonly kind: 'custom' | 'warehouse_manager';
  readonly permissionIds: readonly string[];
  readonly assignedMemberCount: number;
}
export interface AccessMemberRead {
  readonly userId: string;
  readonly warehouseId: string;
  readonly roleId: string;
  readonly roleName: string;
  readonly roleKind: 'custom' | 'warehouse_manager';
  readonly email: string;
}
export interface AccessPermissionRead {
  readonly id: string;
  readonly label: string;
  readonly kind: 'assignable' | 'reserved';
}

@Injectable()
export class AccessReadRepository {
  constructor(private readonly dataSource: DataSource) {}

  listRolesAndPermissions(
    warehouseId: string,
    limit: number,
    after?: string,
    before?: string,
  ): Promise<AccessRoleRead[]> {
    const builder = getEntityManager(this.dataSource)
      .getRepository(RoleEntity)
      .createQueryBuilder('role')
      .leftJoin('role_permissions', 'grantRow', 'grantRow.role_id = role.id')
      .leftJoin(
        'warehouse_memberships',
        'membership',
        'membership.role_id = role.id',
      )
      .select('role.id', 'id')
      .addSelect('role.warehouseId', 'warehouseId')
      .addSelect('role.name', 'name')
      .addSelect('role.kind', 'kind')
      .addSelect(
        'COUNT(DISTINCT membership.user_id)::int',
        'assignedMemberCount',
      )
      .addSelect(
        "COALESCE(array_agg(grantRow.permission_id ORDER BY grantRow.permission_id) FILTER (WHERE grantRow.permission_id IS NOT NULL), '{}')",
        'permissionIds',
      )
      .where('role.warehouseId = :warehouseId', { warehouseId })
      .groupBy('role.id')
      .orderBy('role.name', 'ASC')
      .addOrderBy('role.id', 'ASC')
      .limit(limit);
    return paginationBuilder(
      builder,
      'role.id',
      after,
      before,
    ).getRawMany<AccessRoleRead>();
  }

  listPermissions(
    limit: number,
    after?: string,
    before?: string,
  ): Promise<AccessPermissionRead[]> {
    const builder = getEntityManager(this.dataSource)
      .getRepository(PermissionEntity)
      .createQueryBuilder('permission')
      .select(['permission.id', 'permission.label', 'permission.kind'])
      .orderBy('permission.kind', 'ASC')
      .addOrderBy('permission.id', 'ASC')
      .take(limit);
    return paginationBuilder(builder, 'permission.id', after, before).getMany();
  }

  listMembersAndAssignments(
    warehouseId: string,
    limit: number,
    after?: string,
    before?: string,
  ): Promise<AccessMemberRead[]> {
    const builder = getEntityManager(this.dataSource)
      .getRepository(WarehouseMembershipEntity)
      .createQueryBuilder('membership')
      .innerJoin(
        RoleEntity,
        'role',
        'role.id = membership.roleId AND role.warehouseId = membership.warehouseId',
      )
      .innerJoin(AccountEntity, 'account', 'account.userId = membership.userId')
      .select('membership.userId', 'userId')
      .addSelect('membership.warehouseId', 'warehouseId')
      .addSelect('membership.roleId', 'roleId')
      .addSelect('role.name', 'roleName')
      .addSelect('membership.roleKind', 'roleKind')
      .addSelect('account.normalizedEmail', 'email')
      .where('membership.warehouseId = :warehouseId', { warehouseId })
      .orderBy('membership.userId', 'ASC')
      .take(limit);

    return paginationBuilder(
      builder,
      'membership.userId',
      after,
      before,
    ).getRawMany<AccessMemberRead>();
  }
}
