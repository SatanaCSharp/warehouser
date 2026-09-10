import { Injectable } from '@nestjs/common';
import type { ItemCatalogueEntryRead } from 'items/domain/mappers/item-catalogue-entry.mapper';
import { toItemCatalogueEntry } from 'items/domain/mappers/item-catalogue-entry.mapper';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { ItemCatalogueRepository } from 'shared/domain/repositories/item-catalogue.repository';

export interface ListItemCatalogueOptions {
  /** AC-06a — the picker read: only Items that are not deactivated. Omitted returns every Item,
   * Inactive ones included (AC-06d). */
  readonly activeOnly?: boolean;
}

// `GET /api/v1/warehouses/:warehouseId/items` (AC-06a, AC-23) — the full `Item` projection
// openapi.yaml documents, ordered by SKU. Archived-tolerant by the REST handler's
// `@ArchivedTolerantRead()`, not by anything here.
@Injectable()
export class ListItemCatalogueQuery {
  constructor(
    private readonly itemCatalogueRepository: ItemCatalogueRepository,
  ) {}

  async execute(
    currentUser: AccessCurrentUser,
    options: ListItemCatalogueOptions = {},
  ): Promise<ItemCatalogueEntryRead[]> {
    const rows =
      await this.itemCatalogueRepository.findItemsWithOnHandAndLatestReason(
        currentUser.warehouseId,
        { activeOnly: options.activeOnly },
      );

    return rows.map(toItemCatalogueEntry);
  }
}
