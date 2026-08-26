import { Injectable } from '@nestjs/common';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { ItemCatalogueRepository } from 'shared/domain/repositories/item-catalogue.repository';

export interface PickerItemRead {
  readonly id: string;
  readonly sku: string;
  readonly description: string;
}

// AC-06a — the active Items of the acting Warehouse, projecting only what a member selects from
// when recording demand or assembling a draft.
@Injectable()
export class ListActiveItemsForPickerQuery {
  constructor(
    private readonly itemCatalogueRepository: ItemCatalogueRepository,
  ) {}

  async execute(currentUser: AccessCurrentUser): Promise<PickerItemRead[]> {
    const items = await this.itemCatalogueRepository.findActiveItemsForPicker(
      currentUser.warehouseId,
    );

    return items.map((item) => ({
      id: item.id,
      sku: item.sku,
      description: item.description,
    }));
  }
}
