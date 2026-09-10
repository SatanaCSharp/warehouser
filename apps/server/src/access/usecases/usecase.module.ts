import { Module } from '@nestjs/common';
import { RoleDeletionService } from 'access/domain/services/role-deletion.service.js';
import { WorkspaceRoleDeletionService } from 'access/domain/services/workspace-role-deletion.service.js';
import { AddWorkspaceMemberCommand } from 'access/usecases/commands/add-workspace-member.command.js';
import { AssignMemberRoleCommand } from 'access/usecases/commands/assign-member-role.command.js';
import { AssignWarehouseMembershipCommand } from 'access/usecases/commands/assign-warehouse-membership.command.js';
import { AssignWorkspaceRoleCommand } from 'access/usecases/commands/assign-workspace-role.command.js';
import { CreateRoleCommand } from 'access/usecases/commands/create-role.command.js';
import { CreateWorkspaceRoleCommand } from 'access/usecases/commands/create-workspace-role.command.js';
import { DeleteRoleCommand } from 'access/usecases/commands/delete-role.command.js';
import { DeleteWorkspaceRoleCommand } from 'access/usecases/commands/delete-workspace-role.command.js';
import { ProvisionInitialAccessCommand } from 'access/usecases/commands/provision-initial-access.command.js';
import { RemoveWorkspaceMemberCommand } from 'access/usecases/commands/remove-workspace-member.command.js';
import { RevokeWarehouseMembershipCommand } from 'access/usecases/commands/revoke-warehouse-membership.command.js';
import { TransferWarehouseManagerCommand } from 'access/usecases/commands/transfer-warehouse-manager.command.js';
import { TransferWorkspaceOwnerCommand } from 'access/usecases/commands/transfer-workspace-owner.command.js';
import { UpdateRoleCommand } from 'access/usecases/commands/update-role.command.js';
import { UpdateWorkspaceRoleCommand } from 'access/usecases/commands/update-workspace-role.command.js';
import { ListAccessMembersQuery } from 'access/usecases/queries/list-access-members.query.js';
import { ListAccessPermissionsQuery } from 'access/usecases/queries/list-access-permissions.query.js';
import { ListAccessRolesQuery } from 'access/usecases/queries/list-access-roles.query.js';
import { ListAssignableWarehouseRolesQuery } from 'access/usecases/queries/list-assignable-warehouse-roles.query.js';
import { ListWorkspaceMembersQuery } from 'access/usecases/queries/list-workspace-members.query.js';
import { ListWorkspacePermissionsQuery } from 'access/usecases/queries/list-workspace-permissions.query.js';
import { ListWorkspaceRolesQuery } from 'access/usecases/queries/list-workspace-roles.query.js';
import { ListWorkspaceUsersQuery } from 'access/usecases/queries/list-workspace-users.query.js';
import { ReadCurrentAccessQuery } from 'access/usecases/queries/read-current-access.query.js';

// Access is one capability exercised at two scopes, so this module carries the
// use cases for both: the Warehouse-scoped ones it always had, and the
// Workspace-scoped role, member, owner-transfer and Warehouse-membership ones
// moved here from `workspaces` (CR-AC-06, CH-S2, CH-S3). The scope stays in the
// symbol name (`AssignWorkspaceRoleCommand` beside `AssignMemberRoleCommand`),
// never in a second module (adding-a-server-module.md §1).
//
// It imports no feature module and must stay the leaf of the feature graph
// (CR-AC-09), which is why the error factories these use cases throw moved with
// them into `access/domain/errors/workspace-access.errors.ts`.
// Domain services are registered so the commands that own the rule can inject
// them, and are deliberately not exported: a transport adapter reaches the rule
// only through the use case (server-architecture.md, "NestJS modules and
// exports"). `RoleDeletionService` already followed this convention.
const accessServices = [RoleDeletionService, WorkspaceRoleDeletionService];

const accessCommands = [
  ProvisionInitialAccessCommand,
  CreateRoleCommand,
  UpdateRoleCommand,
  AssignMemberRoleCommand,
  DeleteRoleCommand,
  TransferWarehouseManagerCommand,
  CreateWorkspaceRoleCommand,
  UpdateWorkspaceRoleCommand,
  DeleteWorkspaceRoleCommand,
  AssignWorkspaceRoleCommand,
  AddWorkspaceMemberCommand,
  RemoveWorkspaceMemberCommand,
  TransferWorkspaceOwnerCommand,
  AssignWarehouseMembershipCommand,
  RevokeWarehouseMembershipCommand,
];

const accessQueries = [
  ReadCurrentAccessQuery,
  ListAccessRolesQuery,
  ListAccessPermissionsQuery,
  ListAccessMembersQuery,
  ListWorkspaceRolesQuery,
  ListWorkspacePermissionsQuery,
  ListWorkspaceMembersQuery,
  ListWorkspaceUsersQuery,
  ListAssignableWarehouseRolesQuery,
];

@Module({
  providers: [...accessServices, ...accessCommands, ...accessQueries],
  exports: [...accessCommands, ...accessQueries],
})
export class AccessUsecaseModule {}
