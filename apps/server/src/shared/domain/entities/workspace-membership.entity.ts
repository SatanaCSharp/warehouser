import type { WorkspaceRoleEntityKind } from 'shared/domain/entities/workspace-role.entity';
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'workspace_memberships' })
export class WorkspaceMembershipEntity {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId!: string;

  @Column('uuid', { name: 'workspace_id' })
  workspaceId!: string;

  @Column('uuid', { name: 'workspace_role_id' })
  workspaceRoleId!: string;

  @Column('varchar', { name: 'workspace_role_kind', length: 24 })
  workspaceRoleKind!: WorkspaceRoleEntityKind;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at' })
  updatedAt!: Date;
}
