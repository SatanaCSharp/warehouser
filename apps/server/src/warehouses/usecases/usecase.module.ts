import { Module } from '@nestjs/common';
import { AccessUsecaseModule } from 'access/usecases/usecase.module';
import { ArchiveWarehouseCommand } from 'warehouses/usecases/commands/archive-warehouse.command';
import { CreateWarehouseCommand } from 'warehouses/usecases/commands/create-warehouse.command';
import { RenameWarehouseCommand } from 'warehouses/usecases/commands/rename-warehouse.command';
import { RestoreWarehouseCommand } from 'warehouses/usecases/commands/restore-warehouse.command';
import { SetWarehouseDeliveryAddressCommand } from 'warehouses/usecases/commands/set-warehouse-delivery-address.command';
import { ListWorkspaceWarehousesQuery } from 'warehouses/usecases/queries/list-workspace-warehouses.query';
import { ReadWarehouseDeliveryAddressQuery } from 'warehouses/usecases/queries/read-warehouse-delivery-address.query';

// `CreateWarehouseCommand` depends on `access`'s exported
// `ProvisionInitialAccessCommand` through the narrower
// `ProvisionInitialAccessDelegate` structural type; the command names that
// token itself with `@Inject`, so a plain class registration resolves it.
// This is the only edge this module has, and it points *into*
// `AccessUsecaseModule`, which imports no feature module and stays the leaf
// of the feature graph (CR-AC-09) — so no forward reference is required.
const warehouseCommands = [
  CreateWarehouseCommand,
  RenameWarehouseCommand,
  ArchiveWarehouseCommand,
  RestoreWarehouseCommand,
  SetWarehouseDeliveryAddressCommand,
];

const warehouseQueries = [
  ListWorkspaceWarehousesQuery,
  ReadWarehouseDeliveryAddressQuery,
];

// The application API of `warehouses`. It exports every use case so a
// transport adapter — and `workspaces`, whose `WarehouseController` still
// serves the Warehouse-record routes until that controller moves — can
// invoke it without reaching into the module's internals
// (server-architecture.md, "NestJS modules and exports").
@Module({
  imports: [AccessUsecaseModule],
  providers: [...warehouseCommands, ...warehouseQueries],
  exports: [...warehouseCommands, ...warehouseQueries],
})
export class WarehousesUsecaseModule {}
