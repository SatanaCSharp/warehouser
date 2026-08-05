import { Column, Entity, PrimaryColumn } from 'typeorm';

export type RoleEntityKind = 'custom' | 'warehouse_manager';

@Entity({ name: 'roles' })
export class RoleEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'warehouse_id' })
  warehouseId!: string;

  @Column('text')
  name!: string;

  @Column('varchar', { length: 24 })
  kind!: RoleEntityKind;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at' })
  updatedAt!: Date;
}
