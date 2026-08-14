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
import { CreateWarehouseCommand } from 'warehouses/usecases/commands/create-warehouse.command';
import { WarehousesUsecaseModule } from 'warehouses/usecases/usecase.module';
import { WorkspaceProvisioningService } from 'workspaces/domain/services/workspace-provisioning.service';
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

// `CreateWarehouseCommand` moved to `WarehousesUsecaseModule` with the rest
// of the Warehouse record; both modules are compiled together below because
// the graph they form is the one production boots (`WorkspacesRestModule`
// imports both until `WarehouseController` follows the commands). The
// assertions themselves are unchanged.
//
// T42: `CreateWarehouseCommand` and `WorkspaceProvisioningService` are
// registered as plain-class providers whose constructors depend on
// `AccessUsecaseModule`'s exports (`ProvisionInitialAccessCommand`, and — for
// `CreateWarehouseCommand` — a structural interface no real provider ever
// satisfies). Static wiring checks and command unit specs that construct
// these classes with `new` never exercise Nest's actual injector, so the
// boot-time failure went undetected (module-wiring.spec.ts explicitly
// whitelists interface-typed, `Object`-erased parameters as `@Optional()`
// runtime seams, which this parameter is not). This spec compiles the real
// `WorkspacesUsecaseModule` graph through Nest's DI container — the only way
// to observe this failure without a database.
describe('WorkspacesUsecaseModule Nest DI graph', () => {
  it('constructs CreateWarehouseCommand and WorkspaceProvisioningService through Nest injection', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TestDomainDoubleModule,
        WorkspacesUsecaseModule,
        WarehousesUsecaseModule,
      ],
    }).compile();

    expect(moduleRef.get(CreateWarehouseCommand)).toBeInstanceOf(
      CreateWarehouseCommand,
    );
    expect(moduleRef.get(WorkspaceProvisioningService)).toBeInstanceOf(
      WorkspaceProvisioningService,
    );
  });
});
