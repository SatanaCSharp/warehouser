import type { RoleEntityKind } from 'shared/domain/entities/role.entity.js';
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'warehouse_memberships' })
export class WarehouseMembershipEntity {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId!: string;

  @PrimaryColumn('uuid', { name: 'warehouse_id' })
  warehouseId!: string;

  @Column('uuid', { name: 'workspace_id' })
  workspaceId!: string;

  @Column('uuid', { name: 'role_id' })
  roleId!: string;

  @Column('varchar', { name: 'role_kind', length: 24 })
  roleKind!: RoleEntityKind;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at' })
  updatedAt!: Date;
}
