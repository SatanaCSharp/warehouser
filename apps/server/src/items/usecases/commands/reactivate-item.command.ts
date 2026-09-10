import { Injectable } from '@nestjs/common';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import { itemTargetUnavailableError } from 'items/domain/errors/item.errors.js';
import { canReactivateItem } from 'items/domain/predicates/item-catalogue.predicates.js';
import type { AccessCurrentUser } from 'shared/access/access-current-user.js';
import { Transactional } from 'shared/decorators/transactional.decorator.js';
import { ItemCatalogueRepository } from 'shared/domain/repositories/item-catalogue.repository.js';

// AC-06d — the same operation inverted: reactivates a deactivated Item of the acting Warehouse by
// clearing `deactivatedAt`, which is exactly the condition `findActiveItemsForPicker` filters on.
// A missing Item, one of a different Warehouse, or one already active are refused the same
// non-enumerating way (openapi.yaml `ItemUnavailable`).
@Injectable()
export class ReactivateItemCommand {
  constructor(
    private readonly itemCatalogueRepository: ItemCatalogueRepository,
  ) {}

  @Transactional()
  async execute(currentUser: AccessCurrentUser, itemId: string): Promise<void> {
    const item = await this.itemCatalogueRepository.findById(itemId);
    assertDefined(item, itemTargetUnavailableError());
    assert(
      item.warehouseId === currentUser.warehouseId,
      itemTargetUnavailableError(),
    );
    assert(canReactivateItem(item.deactivatedAt), itemTargetUnavailableError());

    await this.itemCatalogueRepository.setDeactivatedAt(itemId, null);
  }
}
