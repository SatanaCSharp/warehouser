import type { PermissionEntityKind } from 'shared/domain/entities/permission.entity';
import type { RoleEntityKind } from 'shared/domain/entities/role.entity';
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'role_permissions' })
export class RolePermissionEntity {
  @PrimaryColumn('uuid', { name: 'role_id' })
  roleId!: string;

  @PrimaryColumn('varchar', { name: 'permission_id', length: 64 })
  permissionId!: string;

  @Column('varchar', { name: 'role_kind', length: 24 })
  roleKind!: RoleEntityKind;

  @Column('varchar', { name: 'permission_kind', length: 16 })
  permissionKind!: PermissionEntityKind;
}
