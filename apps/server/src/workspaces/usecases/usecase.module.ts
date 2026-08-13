import { Module } from '@nestjs/common';
import { ProvisionInitialAccessCommand } from 'access/usecases/commands/provision-initial-access.command';
import { AccessUsecaseModule } from 'access/usecases/usecase.module';
import { WarehouseLifecycleRepository } from 'shared/domain/repositories/warehouse-lifecycle.repository';
import { WorkspaceProvisioningRepository } from 'shared/domain/repositories/workspace-provisioning.repository';
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

const workspaceServices = [WorkspaceRoleDeletionService];

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

// `WorkspaceProvisioningService` and `CreateWarehouseCommand` depend on
// `access`'s exported `ProvisionInitialAccessCommand` (`WorkspaceProvisioningService`
// directly; `CreateWarehouseCommand` through the narrower
// `ProvisionInitialAccessDelegate` structural type). Both erase to a token
// Nest cannot resolve from a plain class registration — `ProvisionInitialAccessDelegate`
// is an interface (`design:paramtypes` emits `Object`) and neither provider
// otherwise declares where its Access dependency comes from. Wiring them
// with an explicit factory + `inject` (mirroring `auth`'s
// `AuthUsecaseModule`) supplies the concrete `ProvisionInitialAccessCommand`
// instance without changing either class's deliberately structural
// constructor type.
const workspaceFactoryProviders = [
  {
    provide: WorkspaceProvisioningService,
    inject: [WorkspaceProvisioningRepository, ProvisionInitialAccessCommand],
    useFactory: (
      workspaceProvisioningRepository: WorkspaceProvisioningRepository,
      provisionInitialAccess: ProvisionInitialAccessCommand,
    ) =>
      new WorkspaceProvisioningService(
        workspaceProvisioningRepository,
        provisionInitialAccess,
      ),
  },
  {
    provide: CreateWarehouseCommand,
    inject: [WarehouseLifecycleRepository, ProvisionInitialAccessCommand],
    useFactory: (
      warehouseLifecycleRepository: WarehouseLifecycleRepository,
      provisionInitialAccess: ProvisionInitialAccessCommand,
    ) =>
      new CreateWarehouseCommand(
        warehouseLifecycleRepository,
        provisionInitialAccess,
      ),
  },
];

// The application API of `workspaces`. It exports every use case so a
// transport adapter — the REST module here, `auth`'s registration bootstrap
// for provisioning — can invoke it without reaching into the module's
// internals (server-architecture.md, "NestJS modules and exports").
@Module({
  imports: [AccessUsecaseModule],
  providers: [
    ...workspaceServices,
    ...workspaceCommands,
    ...workspaceQueries,
    ...workspaceFactoryProviders,
  ],
  exports: [
    ...workspaceServices,
    ...workspaceCommands,
    ...workspaceQueries,
    WorkspaceProvisioningService,
    CreateWarehouseCommand,
  ],
})
export class WorkspacesUsecaseModule {}
