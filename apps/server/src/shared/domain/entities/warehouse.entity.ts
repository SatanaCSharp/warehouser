import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'warehouses' })
export class WarehouseEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'workspace_id' })
  workspaceId!: string;

  @Column('text')
  name!: string;

  @Column('timestamptz', { name: 'archived_at', nullable: true })
  archivedAt!: Date | null;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at' })
  updatedAt!: Date;
}
