import { Column, Entity, PrimaryColumn } from 'typeorm';

export type WorkspacePermissionEntityKind = 'assignable' | 'reserved';

@Entity({ name: 'workspace_permissions' })
export class WorkspacePermissionEntity {
  @PrimaryColumn('varchar', { length: 64 })
  id!: string;

  @Column('varchar', { length: 100 })
  label!: string;

  @Column('varchar', { length: 16 })
  kind!: WorkspacePermissionEntityKind;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at' })
  updatedAt!: Date;
}
