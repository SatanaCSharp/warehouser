import { Module } from '@nestjs/common';
import { AdjustItemOnHandCommand } from 'items/usecases/commands/adjust-item-on-hand.command.js';
import { CorrectItemCommand } from 'items/usecases/commands/correct-item.command.js';
import { CreateItemCommand } from 'items/usecases/commands/create-item.command.js';
import { DeactivateItemCommand } from 'items/usecases/commands/deactivate-item.command.js';
import { ReactivateItemCommand } from 'items/usecases/commands/reactivate-item.command.js';
import { ListActiveItemsForPickerQuery } from 'items/usecases/queries/list-active-items-for-picker.query.js';
import { ListItemCatalogueQuery } from 'items/usecases/queries/list-item-catalogue.query.js';
import { ListWarehouseItemsQuery } from 'items/usecases/queries/list-warehouse-items.query.js';
import { ReadItemCatalogueEntryQuery } from 'items/usecases/queries/read-item-catalogue-entry.query.js';
import { ItemCatalogueRepository } from 'shared/domain/repositories/item-catalogue.repository.js';
import { ItemStockAdjustmentRepository } from 'shared/domain/repositories/item-stock-adjustment.repository.js';

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
    ...itemCommands,
    ...itemQueries,
    ItemCatalogueRepository,
    ItemStockAdjustmentRepository,
  ],
  exports: [...itemCommands, ...itemQueries],
})
export class ItemsUsecaseModule {}
