import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AccessCurrentUserRepository } from 'shared/domain/repositories/access-current-user.repository.js';
import { AccessProvisioningRepository } from 'shared/domain/repositories/access-provisioning.repository.js';
import { AccessReadRepository } from 'shared/domain/repositories/access-read.repository.js';
import { ManagerTransferRepository } from 'shared/domain/repositories/manager-transfer.repository.js';
import { RoleLifecycleRepository } from 'shared/domain/repositories/role-lifecycle.repository.js';
import { WarehouseLifecycleRepository } from 'shared/domain/repositories/warehouse-lifecycle.repository.js';
import { WarehouseMembershipAssignmentRepository } from 'shared/domain/repositories/warehouse-membership-assignment.repository.js';
import { WorkspaceCurrentUserRepository } from 'shared/domain/repositories/workspace-current-user.repository.js';
import { WorkspaceMembershipRepository } from 'shared/domain/repositories/workspace-membership.repository.js';
import { WorkspaceOwnerTransferRepository } from 'shared/domain/repositories/workspace-owner-transfer.repository.js';
import { WorkspaceReadRepository } from 'shared/domain/repositories/workspace-read.repository.js';
import { WorkspaceRoleLifecycleRepository } from 'shared/domain/repositories/workspace-role-lifecycle.repository.js';
import { describe, expect, it } from 'vitest';
import { ArchiveWarehouseCommand } from 'warehouses/usecases/commands/archive-warehouse.command.js';
import { CreateWarehouseCommand } from 'warehouses/usecases/commands/create-warehouse.command.js';
import { RenameWarehouseCommand } from 'warehouses/usecases/commands/rename-warehouse.command.js';
import { RestoreWarehouseCommand } from 'warehouses/usecases/commands/restore-warehouse.command.js';
import { ListWorkspaceWarehousesQuery } from 'warehouses/usecases/queries/list-workspace-warehouses.query.js';
import { WarehousesUsecaseModule } from 'warehouses/usecases/usecase.module.js';

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
