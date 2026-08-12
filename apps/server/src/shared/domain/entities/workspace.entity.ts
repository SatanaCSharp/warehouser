import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'workspaces' })
export class WorkspaceEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('text', { nullable: true })
  name!: string | null;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at' })
  updatedAt!: Date;
}
