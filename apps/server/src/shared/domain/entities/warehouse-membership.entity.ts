import type { RoleEntityKind } from 'shared/domain/entities/role.entity';
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'warehouse_memberships' })
export class WarehouseMembershipEntity {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId!: string;

  @Column('uuid', { name: 'warehouse_id' })
  warehouseId!: string;

  @Column('uuid', { name: 'role_id' })
  roleId!: string;

  @Column('varchar', { name: 'role_kind', length: 24 })
  roleKind!: RoleEntityKind;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at' })
  updatedAt!: Date;
}
