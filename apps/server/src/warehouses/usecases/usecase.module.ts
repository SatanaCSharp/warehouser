import { Module } from '@nestjs/common';
import { ProvisionInitialAccessCommand } from 'access/usecases/commands/provision-initial-access.command';
import { AccessUsecaseModule } from 'access/usecases/usecase.module';
import { WarehouseLifecycleRepository } from 'shared/domain/repositories/warehouse-lifecycle.repository';
import { ArchiveWarehouseCommand } from 'warehouses/usecases/commands/archive-warehouse.command';
import { CreateWarehouseCommand } from 'warehouses/usecases/commands/create-warehouse.command';
import { RenameWarehouseCommand } from 'warehouses/usecases/commands/rename-warehouse.command';
import { RestoreWarehouseCommand } from 'warehouses/usecases/commands/restore-warehouse.command';
import { ListWorkspaceWarehousesQuery } from 'warehouses/usecases/queries/list-workspace-warehouses.query';

const warehouseCommands = [
  RenameWarehouseCommand,
  ArchiveWarehouseCommand,
  RestoreWarehouseCommand,
];

const warehouseQueries = [ListWorkspaceWarehousesQuery];

// `CreateWarehouseCommand` depends on `access`'s exported
// `ProvisionInitialAccessCommand` through the narrower
// `ProvisionInitialAccessDelegate` structural type, which erases to a token
// Nest cannot resolve from a plain class registration (`design:paramtypes`
// emits `Object` for an interface). Wiring it with an explicit factory +
// `inject` supplies the concrete `ProvisionInitialAccessCommand` instance
// without changing the class's deliberately structural constructor type.
// This is the only edge this module has, and it points *into*
// `AccessUsecaseModule`, which imports no feature module and stays the leaf
// of the feature graph (CR-AC-09) — so no forward reference is required.
const warehouseFactoryProviders = [
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

// The application API of `warehouses`. It exports every use case so a
// transport adapter — and `workspaces`, whose `WarehouseController` still
// serves the Warehouse-record routes until that controller moves — can
// invoke it without reaching into the module's internals
// (server-architecture.md, "NestJS modules and exports").
@Module({
  imports: [AccessUsecaseModule],
  providers: [
    ...warehouseCommands,
    ...warehouseQueries,
    ...warehouseFactoryProviders,
  ],
  exports: [...warehouseCommands, ...warehouseQueries, CreateWarehouseCommand],
})
export class WarehousesUsecaseModule {}
