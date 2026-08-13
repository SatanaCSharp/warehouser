import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'account_id' })
  accountId!: string;

  @Column('uuid', { name: 'workspace_id' })
  workspaceId!: string;

  @Column('uuid', { name: 'active_warehouse_id', nullable: true })
  activeWarehouseId!: string | null;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at' })
  updatedAt!: Date;
}
