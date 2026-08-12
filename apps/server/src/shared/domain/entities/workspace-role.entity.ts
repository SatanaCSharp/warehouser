import { Column, Entity, PrimaryColumn } from 'typeorm';

export type WorkspaceRoleEntityKind = 'custom' | 'workspace_owner';

@Entity({ name: 'workspace_roles' })
export class WorkspaceRoleEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'workspace_id' })
  workspaceId!: string;

  @Column('text')
  name!: string;

  @Column('varchar', { length: 24 })
  kind!: WorkspaceRoleEntityKind;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at' })
  updatedAt!: Date;
}
