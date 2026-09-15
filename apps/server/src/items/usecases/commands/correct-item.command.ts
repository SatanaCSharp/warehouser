import { Injectable } from '@nestjs/common';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import { isDefined } from '@warehouser/utils/predicates';
import {
  itemSkuFixedError,
  itemSkuTakenError,
  itemTargetUnavailableError,
} from 'items/domain/errors/item.errors';
import { isSkuCorrectable } from 'items/domain/predicates/item-catalogue.predicates';
import {
  correctsItemDetails,
  isSkuFree,
} from 'items/domain/predicates/item-correction.predicates';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { ItemCatalogueRepository } from 'shared/domain/repositories/item-catalogue.repository';
import { scopedToWarehouse } from 'shared/predicates/tenancy.predicates';

export interface CorrectItemInput {
  readonly sku?: string;
  readonly description?: string;
  readonly unitOfMeasure?: string;
}

// The three conditions this command decides for itself. Each is used once, here, so each stays next
// to that one implementation rather than in `items/domain/predicates/` (server-error-handling.md §1).

// A field the request left out is carried forward from the row `findById` already confirmed, never
// silently dropped.
const correctedValue = (stated: string | undefined, current: string): string =>
  stated ?? current;

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
      scopedToWarehouse(item.warehouseId, currentUser.warehouseId),
      itemTargetUnavailableError(),
    );

    if (isDefined(input.sku)) {
      const isNamed =
        await this.itemCatalogueRepository.isNamedByDemandOrDraft(itemId);
      assert(isSkuCorrectable(isNamed), itemSkuFixedError());

      const sku = input.sku;
      const existing = await this.itemCatalogueRepository.findBySku(
        currentUser.warehouseId,
        sku,
      );
      assert(isSkuFree(existing, itemId), () =>
        itemSkuTakenError(existing!.id, sku),
      );

      await this.itemCatalogueRepository.updateSku(itemId, sku);
    }

    // AC-06b — description and Unit of Measure are always correctable independently of one
    // another; `ItemUpdate` requires only one to be present (openapi.yaml). The repository's
    // `updateItemDetails` writes both columns together, so a field the request left out is carried
    // forward from the row `findById` already confirmed, never silently dropped.
    if (correctsItemDetails(input)) {
      await this.itemCatalogueRepository.updateItemDetails(itemId, {
        description: correctedValue(input.description, item.description),
        unitOfMeasure: correctedValue(input.unitOfMeasure, item.unitOfMeasure),
      });
    }
  }
}
