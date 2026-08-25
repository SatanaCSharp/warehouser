import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AccessCurrentUserRepository } from 'shared/domain/repositories/access-current-user.repository';
import { AccessProvisioningRepository } from 'shared/domain/repositories/access-provisioning.repository';
import { AccessReadRepository } from 'shared/domain/repositories/access-read.repository';
import { ActiveWarehouseSelectionRepository } from 'shared/domain/repositories/active-warehouse-selection.repository';
import { ManagerTransferRepository } from 'shared/domain/repositories/manager-transfer.repository';
import { RoleLifecycleRepository } from 'shared/domain/repositories/role-lifecycle.repository';
import { WarehouseLifecycleRepository } from 'shared/domain/repositories/warehouse-lifecycle.repository';
import { WarehouseMembershipAssignmentRepository } from 'shared/domain/repositories/warehouse-membership-assignment.repository';
import { WorkspaceCurrentUserRepository } from 'shared/domain/repositories/workspace-current-user.repository';
import { WorkspaceLifecycleRepository } from 'shared/domain/repositories/workspace-lifecycle.repository';
import { WorkspaceMembershipRepository } from 'shared/domain/repositories/workspace-membership.repository';
import { WorkspaceOwnerTransferRepository } from 'shared/domain/repositories/workspace-owner-transfer.repository';
import { WorkspaceProvisioningRepository } from 'shared/domain/repositories/workspace-provisioning.repository';
import { WorkspaceReadRepository } from 'shared/domain/repositories/workspace-read.repository';
import { WorkspaceRoleLifecycleRepository } from 'shared/domain/repositories/workspace-role-lifecycle.repository';
import { WorkspaceProvisioningService } from 'workspaces/domain/services/workspace-provisioning.service';
import { RenameWorkspaceCommand } from 'workspaces/usecases/commands/rename-workspace.command';
import { SetActiveWarehouseCommand } from 'workspaces/usecases/commands/set-active-warehouse.command';
import { ReadWorkspaceContextQuery } from 'workspaces/usecases/queries/read-workspace-context.query';
import { WorkspacesUsecaseModule } from 'workspaces/usecases/usecase.module';

// Doubles for every `shared/domain/repositories/*` token the real
// `WorkspacesUsecaseModule` graph (including the `AccessUsecaseModule` it
// must import) reaches. Production supplies these from the `@Global()`
// `DomainModule`; this test provides the same tokens globally without a
// database connection, so the graph resolves through Nest exactly as it
// does at boot, without requiring PostgreSQL.
@Global()
@Module({
  providers: [
    { provide: WarehouseLifecycleRepository, useValue: {} },
    { provide: WorkspaceProvisioningRepository, useValue: {} },
    { provide: WorkspaceRoleLifecycleRepository, useValue: {} },
    { provide: WorkspaceReadRepository, useValue: {} },
    { provide: WorkspaceMembershipRepository, useValue: {} },
    { provide: WorkspaceLifecycleRepository, useValue: {} },
    { provide: WorkspaceOwnerTransferRepository, useValue: {} },
    { provide: WorkspaceCurrentUserRepository, useValue: {} },
    { provide: ActiveWarehouseSelectionRepository, useValue: {} },
    { provide: WarehouseMembershipAssignmentRepository, useValue: {} },
    { provide: AccessProvisioningRepository, useValue: {} },
    { provide: RoleLifecycleRepository, useValue: {} },
    { provide: AccessCurrentUserRepository, useValue: {} },
    { provide: AccessReadRepository, useValue: {} },
    { provide: ManagerTransferRepository, useValue: {} },
  ],
  exports: [
    WarehouseLifecycleRepository,
    WorkspaceProvisioningRepository,
    WorkspaceRoleLifecycleRepository,
    WorkspaceReadRepository,
    WorkspaceMembershipRepository,
    WorkspaceLifecycleRepository,
    WorkspaceOwnerTransferRepository,
    WorkspaceCurrentUserRepository,
    ActiveWarehouseSelectionRepository,
    WarehouseMembershipAssignmentRepository,
    AccessProvisioningRepository,
    RoleLifecycleRepository,
    AccessCurrentUserRepository,
    AccessReadRepository,
    ManagerTransferRepository,
  ],
})
class TestDomainDoubleModule {}

// `CreateWarehouseCommand` moved to `WarehousesUsecaseModule` with the rest of
// the Warehouse record, and its half of this check moved with it to
// `warehouses/usecases/usecase.module.di.spec.ts` (CH-S5). What is compiled
// here is now the `workspaces` graph alone: this module and the
// `AccessUsecaseModule` it imports. The rule is unchanged.
//
// T42: `WorkspaceProvisioningService` is registered through a provider whose
// constructor depends on `AccessUsecaseModule`'s exported
// `ProvisionInitialAccessCommand`. Static wiring checks and command unit specs
// that construct these classes with `new` never exercise Nest's actual
// injector, so a boot-time resolution failure went undetected
// (module-wiring.spec.ts explicitly whitelists interface-typed,
// `Object`-erased parameters as `@Optional()` runtime seams). This spec
// compiles the real `WorkspacesUsecaseModule` graph through Nest's DI
// container — the only way to observe that failure without a database.
describe('WorkspacesUsecaseModule Nest DI graph', () => {
  it('constructs every exported Workspace use case and WorkspaceProvisioningService through Nest injection', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestDomainDoubleModule, WorkspacesUsecaseModule],
    }).compile();

    expect(moduleRef.get(WorkspaceProvisioningService)).toBeInstanceOf(
      WorkspaceProvisioningService,
    );
    expect(moduleRef.get(RenameWorkspaceCommand)).toBeInstanceOf(
      RenameWorkspaceCommand,
    );
    expect(moduleRef.get(SetActiveWarehouseCommand)).toBeInstanceOf(
      SetActiveWarehouseCommand,
    );
    expect(moduleRef.get(ReadWorkspaceContextQuery)).toBeInstanceOf(
      ReadWorkspaceContextQuery,
    );
  });
});
