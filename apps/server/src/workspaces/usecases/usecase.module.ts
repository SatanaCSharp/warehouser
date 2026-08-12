import { Module } from '@nestjs/common';
import { WorkspaceProvisioningService } from 'workspaces/domain/services/workspace-provisioning.service';
import { WorkspaceRoleDeletionService } from 'workspaces/domain/services/workspace-role-deletion.service';
import { AddWorkspaceMemberCommand } from 'workspaces/usecases/commands/add-workspace-member.command';
import { ArchiveWarehouseCommand } from 'workspaces/usecases/commands/archive-warehouse.command';
import { AssignWarehouseMembershipCommand } from 'workspaces/usecases/commands/assign-warehouse-membership.command';
import { AssignWorkspaceRoleCommand } from 'workspaces/usecases/commands/assign-workspace-role.command';
import { CreateWarehouseCommand } from 'workspaces/usecases/commands/create-warehouse.command';
import { CreateWorkspaceRoleCommand } from 'workspaces/usecases/commands/create-workspace-role.command';
import { DeleteWorkspaceRoleCommand } from 'workspaces/usecases/commands/delete-workspace-role.command';
import { RemoveWorkspaceMemberCommand } from 'workspaces/usecases/commands/remove-workspace-member.command';
import { RenameWarehouseCommand } from 'workspaces/usecases/commands/rename-warehouse.command';
import { RenameWorkspaceCommand } from 'workspaces/usecases/commands/rename-workspace.command';
import { RestoreWarehouseCommand } from 'workspaces/usecases/commands/restore-warehouse.command';
import { RevokeWarehouseMembershipCommand } from 'workspaces/usecases/commands/revoke-warehouse-membership.command';
import { SetActiveWarehouseCommand } from 'workspaces/usecases/commands/set-active-warehouse.command';
import { TransferWorkspaceOwnerCommand } from 'workspaces/usecases/commands/transfer-workspace-owner.command';
import { UpdateWorkspaceRoleCommand } from 'workspaces/usecases/commands/update-workspace-role.command';
import { ListAssignableWarehouseRolesQuery } from 'workspaces/usecases/queries/list-assignable-warehouse-roles.query';
import { ListWorkspaceMembersQuery } from 'workspaces/usecases/queries/list-workspace-members.query';
import { ListWorkspacePermissionsQuery } from 'workspaces/usecases/queries/list-workspace-permissions.query';
import { ListWorkspaceRolesQuery } from 'workspaces/usecases/queries/list-workspace-roles.query';
import { ListWorkspaceUsersQuery } from 'workspaces/usecases/queries/list-workspace-users.query';
import { ListWorkspaceWarehousesQuery } from 'workspaces/usecases/queries/list-workspace-warehouses.query';
import { ReadWorkspaceContextQuery } from 'workspaces/usecases/queries/read-workspace-context.query';

const workspaceServices = [
  WorkspaceProvisioningService,
  WorkspaceRoleDeletionService,
];

const workspaceCommands = [
  RenameWorkspaceCommand,
  CreateWorkspaceRoleCommand,
  UpdateWorkspaceRoleCommand,
  DeleteWorkspaceRoleCommand,
  AddWorkspaceMemberCommand,
  RemoveWorkspaceMemberCommand,
  AssignWorkspaceRoleCommand,
  TransferWorkspaceOwnerCommand,
  SetActiveWarehouseCommand,
  CreateWarehouseCommand,
  RenameWarehouseCommand,
  ArchiveWarehouseCommand,
  RestoreWarehouseCommand,
  AssignWarehouseMembershipCommand,
  RevokeWarehouseMembershipCommand,
];

const workspaceQueries = [
  ReadWorkspaceContextQuery,
  ListWorkspaceRolesQuery,
  ListWorkspacePermissionsQuery,
  ListWorkspaceMembersQuery,
  ListWorkspaceUsersQuery,
  ListWorkspaceWarehousesQuery,
  ListAssignableWarehouseRolesQuery,
];

// The application API of `workspaces`. It exports every use case so a
// transport adapter — the REST module here, `auth`'s registration bootstrap
// for provisioning — can invoke it without reaching into the module's
// internals (server-architecture.md, "NestJS modules and exports").
@Module({
  providers: [...workspaceServices, ...workspaceCommands, ...workspaceQueries],
  exports: [...workspaceServices, ...workspaceCommands, ...workspaceQueries],
})
export class WorkspacesUsecaseModule {}
