import { Injectable } from '@nestjs/common';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import {
  itemSkuFixedError,
  itemSkuTakenError,
  itemTargetUnavailableError,
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
    // AC-03/openapi.yaml `ItemUnavailable` — an Item of another Warehouse is refused exactly as a
    // missing one, disclosing nothing about where it exists.
    const item = await this.itemCatalogueRepository.findById(itemId);
    assertDefined(item, itemTargetUnavailableError());
    assert(
      item.warehouseId === currentUser.warehouseId,
      itemTargetUnavailableError(),
    );

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

    // AC-06b — description and Unit of Measure are always correctable independently of one
    // another; `ItemUpdate` requires only one to be present (openapi.yaml). The repository's
    // `updateItemDetails` writes both columns together, so a field the request left out is carried
    // forward from the row `findById` already confirmed, never silently dropped.
    if (input.description !== undefined || input.unitOfMeasure !== undefined) {
      await this.itemCatalogueRepository.updateItemDetails(itemId, {
        description: input.description ?? item.description,
        unitOfMeasure: input.unitOfMeasure ?? item.unitOfMeasure,
      });
    }
  }
}
