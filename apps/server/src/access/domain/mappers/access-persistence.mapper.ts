import { Permission } from 'access/domain/entities/permission';
import { Role } from 'access/domain/entities/role';
import { WarehouseMembership } from 'access/domain/entities/warehouse-membership';
import { PermissionEntity } from 'shared/domain/entities/permission.entity';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { RolePermissionEntity } from 'shared/domain/entities/role-permission.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';

export const toPermission = (entity: PermissionEntity): Permission =>
  entity.kind === 'assignable'
    ? Permission.assignable(entity.id, entity.label)
    : Permission.reserved(entity.id, entity.label);

export const toRole = (
  entity: RoleEntity,
  permissions: readonly PermissionEntity[],
): Role => {
  const domainPermissions = permissions.map(toPermission);
  return entity.kind === 'custom'
    ? Role.custom(entity.warehouseId, entity.name, domainPermissions, entity.id)
    : Role.warehouseManager(entity.warehouseId, domainPermissions, entity.id);
};

export const toRoleEntity = (role: Role): RoleEntity =>
  Object.assign(new RoleEntity(), {
    id: role.id.value,
    warehouseId: role.warehouseId.value,
    name: role.name.value,
    kind: role.kind,
  });

export const toRolePermissionEntities = (role: Role): RolePermissionEntity[] =>
  role.permissions.map((permission) =>
    Object.assign(new RolePermissionEntity(), {
      roleId: role.id.value,
      permissionId: permission.id,
      roleKind: role.kind,
      permissionKind: permission.kind,
    }),
  );

export const toWarehouseMembershipEntity = (
  membership: WarehouseMembership,
): WarehouseMembershipEntity =>
  Object.assign(new WarehouseMembershipEntity(), {
    userId: membership.memberId.value,
    warehouseId: membership.warehouseId.value,
    roleId: membership.role.id.value,
    roleKind: membership.role.kind,
  });
