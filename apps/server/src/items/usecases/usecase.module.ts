import { Module } from '@nestjs/common';
import { OnHandAdjustmentService } from 'items/domain/services/on-hand-adjustment.service';
import { AdjustItemOnHandCommand } from 'items/usecases/commands/adjust-item-on-hand.command';
import { CorrectItemCommand } from 'items/usecases/commands/correct-item.command';
import { CreateItemCommand } from 'items/usecases/commands/create-item.command';
import { DeactivateItemCommand } from 'items/usecases/commands/deactivate-item.command';
import { ReactivateItemCommand } from 'items/usecases/commands/reactivate-item.command';
import { ListActiveItemsForPickerQuery } from 'items/usecases/queries/list-active-items-for-picker.query';
import { ListItemCatalogueQuery } from 'items/usecases/queries/list-item-catalogue.query';
import { ListWarehouseItemsQuery } from 'items/usecases/queries/list-warehouse-items.query';
import { ReadItemCatalogueEntryQuery } from 'items/usecases/queries/read-item-catalogue-entry.query';
import { ItemCatalogueRepository } from 'shared/domain/repositories/item-catalogue.repository';
import { ItemStockAdjustmentRepository } from 'shared/domain/repositories/item-stock-adjustment.repository';

// `OnHandAdjustmentService` owns the On-hand adjustment rules (AC-08/AC-09/AC-09a) and stays
// unexported: a transport adapter reaches it only through `AdjustItemOnHandCommand`
// (server-architecture.md, "NestJS modules and exports").
const itemServices = [OnHandAdjustmentService];

const itemCommands = [
  CreateItemCommand,
  CorrectItemCommand,
  DeactivateItemCommand,
  ReactivateItemCommand,
  AdjustItemOnHandCommand,
];

const itemQueries = [
  ListItemCatalogueQuery,
  ReadItemCatalogueEntryQuery,
  ListWarehouseItemsQuery,
  ListActiveItemsForPickerQuery,
];

// The application API of `items`. It exports every use case so `items/rest` — and any other
// deliberately coupled module — can invoke it without reaching into the module's internals
// (server-architecture.md, "NestJS modules and exports").
@Module({
  providers: [
    ...itemServices,
    ...itemCommands,
    ...itemQueries,
    ItemCatalogueRepository,
    ItemStockAdjustmentRepository,
  ],
  exports: [...itemCommands, ...itemQueries],
})
export class ItemsUsecaseModule {}
