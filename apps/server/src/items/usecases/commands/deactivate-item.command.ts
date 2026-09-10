import { Injectable, Optional } from '@nestjs/common';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import { itemTargetUnavailableError } from 'items/domain/errors/item.errors';
import { canDeactivateItem } from 'items/domain/predicates/item-catalogue.predicates';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { ItemCatalogueRepository } from 'shared/domain/repositories/item-catalogue.repository';

export interface DeactivateItemRuntime {
  readonly now: () => Date;
}

const defaultDeactivateItemRuntime: DeactivateItemRuntime = {
  now: () => new Date(),
};

// AC-06d — deactivates an active Item of the acting Warehouse, writing only `deactivatedAt` so its
// SKU stays taken and every Customer Order and Purchase Draft Line naming it is untouched. A
// missing Item, one of a different Warehouse, or one already Inactive are refused the same
// non-enumerating way (openapi.yaml `ItemUnavailable`).
@Injectable()
export class DeactivateItemCommand {
  constructor(
    private readonly itemCatalogueRepository: ItemCatalogueRepository,
    @Optional()
    private readonly deactivateItemRuntime: DeactivateItemRuntime = defaultDeactivateItemRuntime,
  ) {}

  @Transactional()
  async execute(currentUser: AccessCurrentUser, itemId: string): Promise<void> {
    const item = await this.itemCatalogueRepository.findById(itemId);
    assertDefined(item, itemTargetUnavailableError());
    assert(
      item.warehouseId === currentUser.warehouseId,
      itemTargetUnavailableError(),
    );
    assert(canDeactivateItem(item.deactivatedAt), itemTargetUnavailableError());

    await this.itemCatalogueRepository.setDeactivatedAt(
      itemId,
      this.deactivateItemRuntime.now(),
    );
  }
}
