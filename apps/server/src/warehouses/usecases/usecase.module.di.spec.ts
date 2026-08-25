import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AccessCurrentUserRepository } from 'shared/domain/repositories/access-current-user.repository';
import { AccessProvisioningRepository } from 'shared/domain/repositories/access-provisioning.repository';
import { AccessReadRepository } from 'shared/domain/repositories/access-read.repository';
import { ManagerTransferRepository } from 'shared/domain/repositories/manager-transfer.repository';
import { RoleLifecycleRepository } from 'shared/domain/repositories/role-lifecycle.repository';
import { WarehouseLifecycleRepository } from 'shared/domain/repositories/warehouse-lifecycle.repository';
import { WarehouseMembershipAssignmentRepository } from 'shared/domain/repositories/warehouse-membership-assignment.repository';
import { WorkspaceCurrentUserRepository } from 'shared/domain/repositories/workspace-current-user.repository';
import { WorkspaceMembershipRepository } from 'shared/domain/repositories/workspace-membership.repository';
import { WorkspaceOwnerTransferRepository } from 'shared/domain/repositories/workspace-owner-transfer.repository';
import { WorkspaceReadRepository } from 'shared/domain/repositories/workspace-read.repository';
import { WorkspaceRoleLifecycleRepository } from 'shared/domain/repositories/workspace-role-lifecycle.repository';
import { ArchiveWarehouseCommand } from 'warehouses/usecases/commands/archive-warehouse.command';
import { CreateWarehouseCommand } from 'warehouses/usecases/commands/create-warehouse.command';
import { RenameWarehouseCommand } from 'warehouses/usecases/commands/rename-warehouse.command';
import { RestoreWarehouseCommand } from 'warehouses/usecases/commands/restore-warehouse.command';
import { ListWorkspaceWarehousesQuery } from 'warehouses/usecases/queries/list-workspace-warehouses.query';
import { WarehousesUsecaseModule } from 'warehouses/usecases/usecase.module';

// Doubles for every `shared/domain/repositories/*` token the real
// `WarehousesUsecaseModule` graph reaches — its own
// `WarehouseLifecycleRepository` and `WorkspaceReadRepository`, plus the
// tokens the `AccessUsecaseModule` it imports needs. Production supplies
// these from the `@Global()` `DomainModule`; this test provides the same
// tokens globally without a database connection, so the graph resolves
// through Nest exactly as it does at boot, without requiring PostgreSQL.
@Global()
@Module({
  providers: [
    { provide: WarehouseLifecycleRepository, useValue: {} },
    { provide: WorkspaceReadRepository, useValue: {} },
    { provide: WorkspaceRoleLifecycleRepository, useValue: {} },
    { provide: WorkspaceMembershipRepository, useValue: {} },
    { provide: WorkspaceOwnerTransferRepository, useValue: {} },
    { provide: WorkspaceCurrentUserRepository, useValue: {} },
    { provide: WarehouseMembershipAssignmentRepository, useValue: {} },
    { provide: AccessProvisioningRepository, useValue: {} },
    { provide: RoleLifecycleRepository, useValue: {} },
    { provide: AccessCurrentUserRepository, useValue: {} },
    { provide: AccessReadRepository, useValue: {} },
    { provide: ManagerTransferRepository, useValue: {} },
  ],
  exports: [
    WarehouseLifecycleRepository,
    WorkspaceReadRepository,
    WorkspaceRoleLifecycleRepository,
    WorkspaceMembershipRepository,
    WorkspaceOwnerTransferRepository,
    WorkspaceCurrentUserRepository,
    WarehouseMembershipAssignmentRepository,
    AccessProvisioningRepository,
    RoleLifecycleRepository,
    AccessCurrentUserRepository,
    AccessReadRepository,
    ManagerTransferRepository,
  ],
})
class TestDomainDoubleModule {}

// The `warehouses` counterpart of `workspaces/usecases/usecase.module.di.spec.ts`
// (CH-S5, CR-AC-09). `CreateWarehouseCommand` is registered through an explicit
// factory because its `ProvisionInitialAccessDelegate` parameter is a structural
// type that erases to `Object`, which Nest cannot resolve from a plain class
// registration and which `module-wiring.spec.ts` deliberately whitelists as an
// `@Optional()` runtime seam. Static wiring checks and the command unit specs
// construct these classes with `new` and so never exercise Nest's injector;
// compiling the real module graph through the DI container is the only way to
// observe that failure without a database.
describe('WarehousesUsecaseModule Nest DI graph', () => {
  it('constructs every exported Warehouse use case through Nest injection', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestDomainDoubleModule, WarehousesUsecaseModule],
    }).compile();

    expect(moduleRef.get(CreateWarehouseCommand)).toBeInstanceOf(
      CreateWarehouseCommand,
    );
    expect(moduleRef.get(RenameWarehouseCommand)).toBeInstanceOf(
      RenameWarehouseCommand,
    );
    expect(moduleRef.get(ArchiveWarehouseCommand)).toBeInstanceOf(
      ArchiveWarehouseCommand,
    );
    expect(moduleRef.get(RestoreWarehouseCommand)).toBeInstanceOf(
      RestoreWarehouseCommand,
    );
    expect(moduleRef.get(ListWorkspaceWarehousesQuery)).toBeInstanceOf(
      ListWorkspaceWarehousesQuery,
    );
  });
});
