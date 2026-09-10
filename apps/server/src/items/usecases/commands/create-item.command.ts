import { randomUUID } from 'node:crypto';

import { Injectable, Optional } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import { itemSkuTakenError } from 'items/domain/errors/item.errors';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { ItemCatalogueRepository } from 'shared/domain/repositories/item-catalogue.repository';

export interface CreateItemRuntime {
  readonly itemId: () => string;
}

const defaultCreateItemRuntime: CreateItemRuntime = { itemId: randomUUID };

export interface CreateItemInput {
  readonly sku: string;
  readonly description: string;
  readonly unitOfMeasure: string;
}

export interface ItemWriteProjection {
  readonly id: string;
  readonly warehouseId: string;
  readonly sku: string;
  readonly description: string;
  readonly unitOfMeasure: string;
  readonly onHandQuantity: number;
  readonly deactivatedAt: Date | null;
}

// AC-06/AC-07/AC-07a — creates an Item active with nothing on hand, scoped to the acting
// Warehouse. A SKU already held by another Item in the same Warehouse is refused naming that
// Item; the same SKU in a different Warehouse is an unrelated Item, so `findBySku` is scoped to
// `currentUser.warehouseId` and never consulted across Warehouses.
@Injectable()
export class CreateItemCommand {
  constructor(
    private readonly itemCatalogueRepository: ItemCatalogueRepository,
    @Optional()
    private readonly createItemRuntime: CreateItemRuntime = defaultCreateItemRuntime,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    input: CreateItemInput,
  ): Promise<ItemWriteProjection> {
    const warehouseId = currentUser.warehouseId;

    const existing = await this.itemCatalogueRepository.findBySku(
      warehouseId,
      input.sku,
    );
    assert(existing === null, () => itemSkuTakenError(existing!.id, input.sku));

    const id = this.createItemRuntime.itemId();
    await this.itemCatalogueRepository.createItem({
      id,
      warehouseId,
      sku: input.sku,
      description: input.description,
      unitOfMeasure: input.unitOfMeasure,
      onHandQuantity: 0,
      deactivatedAt: null,
    });

    return {
      id,
      warehouseId,
      sku: input.sku,
      description: input.description,
      unitOfMeasure: input.unitOfMeasure,
      onHandQuantity: 0,
      deactivatedAt: null,
    };
  }
}
