import { Module } from '@nestjs/common';
import { ProvisionInitialAccessCommand } from 'access/usecases/commands/provision-initial-access.command';
import { AccessUsecaseModule } from 'access/usecases/usecase.module';
import { WorkspaceProvisioningRepository } from 'shared/domain/repositories/workspace-provisioning.repository';
import { WorkspaceProvisioningService } from 'workspaces/domain/services/workspace-provisioning.service';
import { RenameWorkspaceCommand } from 'workspaces/usecases/commands/rename-workspace.command';
import { SetActiveWarehouseCommand } from 'workspaces/usecases/commands/set-active-warehouse.command';
import { ReadWorkspaceContextQuery } from 'workspaces/usecases/queries/read-workspace-context.query';

// The Workspace record and the member's position within it. The role, member,
// owner-transfer and Warehouse-membership use cases this module used to carry
// are one capability exercised at two scopes and now live in `access`
// (CR-AC-06, CH-S2, CH-S3); `WorkspaceController` still serves eleven of their
// routes and obtains them from `AccessUsecaseModule`, which
// `WorkspacesRestModule` imports directly until those handlers follow.
const workspaceCommands = [RenameWorkspaceCommand, SetActiveWarehouseCommand];

const workspaceQueries = [ReadWorkspaceContextQuery];

// `WorkspaceProvisioningService` depends on `access`'s exported
// `ProvisionInitialAccessCommand`, which erases to a token Nest cannot
// resolve from a plain class registration, and the provider does not
// otherwise declare where its Access dependency comes from. Wiring it with
// an explicit factory + `inject` (mirroring `auth`'s `AuthUsecaseModule`)
// supplies the concrete `ProvisionInitialAccessCommand` instance without
// changing the class's deliberately structural constructor type.
// `CreateWarehouseCommand`'s equivalent factory moved with it to
// `WarehousesUsecaseModule`.
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
];

// The application API of `workspaces`. It exports every use case so a
// transport adapter — the REST module here, `auth`'s registration bootstrap
// for provisioning — can invoke it without reaching into the module's
// internals (server-architecture.md, "NestJS modules and exports").
@Module({
  imports: [AccessUsecaseModule],
  providers: [
    ...workspaceCommands,
    ...workspaceQueries,
    ...workspaceFactoryProviders,
  ],
  exports: [
    ...workspaceCommands,
    ...workspaceQueries,
    WorkspaceProvisioningService,
  ],
})
export class WorkspacesUsecaseModule {}
