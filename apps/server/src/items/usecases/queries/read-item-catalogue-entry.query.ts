import { Injectable } from '@nestjs/common';
import type { ItemCatalogueEntryRead } from 'items/domain/mappers/item-catalogue-entry.mapper.js';
import { toItemCatalogueEntry } from 'items/domain/mappers/item-catalogue-entry.mapper.js';
import type { AccessCurrentUser } from 'shared/access/access-current-user.js';
import { ItemCatalogueRepository } from 'shared/domain/repositories/item-catalogue.repository.js';

// Confirms the full `Item` projection openapi.yaml documents for one Item of the acting
// Warehouse, read fresh after a mutating command has committed (mirrors
// `WarehouseController`'s "confirms the full record from the row it locked/wrote"). Scoped to
// `currentUser.warehouseId`, so an Item of another Warehouse resolves to nothing — callers that
// must distinguish that from "missing" (AC-03) do so with their own command's own existence check
// before reaching this read, never here.
@Injectable()
export class ReadItemCatalogueEntryQuery {
  constructor(
    private readonly itemCatalogueRepository: ItemCatalogueRepository,
  ) {}

  async execute(
    currentUser: AccessCurrentUser,
    itemId: string,
  ): Promise<ItemCatalogueEntryRead | null> {
    const [row] =
      await this.itemCatalogueRepository.findItemsWithOnHandAndLatestReason(
        currentUser.warehouseId,
        { itemId },
      );

    return row ? toItemCatalogueEntry(row) : null;
  }
}
