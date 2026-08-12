import type { WorkspacePermissionEntityKind } from 'shared/domain/entities/workspace-permission.entity';
import type { WorkspaceRoleEntityKind } from 'shared/domain/entities/workspace-role.entity';
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'workspace_role_permissions' })
export class WorkspaceRolePermissionEntity {
  @PrimaryColumn('uuid', { name: 'workspace_role_id' })
  workspaceRoleId!: string;

  @PrimaryColumn('varchar', { name: 'workspace_permission_id', length: 64 })
  workspacePermissionId!: string;

  @Column('varchar', { name: 'workspace_role_kind', length: 24 })
  workspaceRoleKind!: WorkspaceRoleEntityKind;

  @Column('varchar', { name: 'workspace_permission_kind', length: 16 })
  workspacePermissionKind!: WorkspacePermissionEntityKind;
}
