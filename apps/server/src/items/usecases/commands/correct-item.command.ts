import { Injectable } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import {
  itemSkuFixedError,
  itemSkuTakenError,
} from 'items/domain/errors/item.errors';
import { isSkuCorrectable } from 'items/domain/predicates/item-catalogue.predicates';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { ItemCatalogueRepository } from 'shared/domain/repositories/item-catalogue.repository';

export interface CorrectItemInput {
  readonly sku?: string;
  readonly description?: string;
  readonly unitOfMeasure?: string;
}

// AC-06b/AC-06c — description and Unit of Measure are always correctable. The SKU is correctable
// only while nothing yet names the Item (`isNamedByDemandOrDraft`); once correctable, it must
// still land on a SKU unused in the acting Warehouse, refused the same way a duplicate SKU is
// refused at creation (AC-07).
@Injectable()
export class CorrectItemCommand {
  constructor(
    private readonly itemCatalogueRepository: ItemCatalogueRepository,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    itemId: string,
    input: CorrectItemInput,
  ): Promise<void> {
    if (input.sku !== undefined) {
      const isNamed =
        await this.itemCatalogueRepository.isNamedByDemandOrDraft(itemId);
      assert(isSkuCorrectable(isNamed), itemSkuFixedError());

      const sku = input.sku;
      const existing = await this.itemCatalogueRepository.findBySku(
        currentUser.warehouseId,
        sku,
      );
      assert(existing === null || existing.id === itemId, () =>
        itemSkuTakenError(existing!.id, sku),
      );

      await this.itemCatalogueRepository.updateSku(itemId, sku);
    }

    if (input.description !== undefined && input.unitOfMeasure !== undefined) {
      await this.itemCatalogueRepository.updateItemDetails(itemId, {
        description: input.description,
        unitOfMeasure: input.unitOfMeasure,
      });
    }
  }
}
