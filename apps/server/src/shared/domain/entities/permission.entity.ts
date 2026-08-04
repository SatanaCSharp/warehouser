import { Column, Entity, PrimaryColumn } from 'typeorm';

export type PermissionEntityKind = 'assignable' | 'reserved';

@Entity({ name: 'permissions' })
export class PermissionEntity {
  @PrimaryColumn('varchar', { length: 64 })
  id!: string;

  @Column('varchar', { length: 100 })
  label!: string;

  @Column('varchar', { length: 16 })
  kind!: PermissionEntityKind;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at' })
  updatedAt!: Date;
}
