import { randomUUID } from 'node:crypto';

import { Injectable, Optional } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import {
  itemAdjustmentReasonRequiredError,
  itemInvalidOnHandQuantityError,
  itemTargetUnavailableError,
} from 'items/domain/errors/item.errors';
import {
  isCountedQuantity,
  isStatedReason,
} from 'items/domain/predicates/on-hand-adjustment.predicates';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { ItemCatalogueRepository } from 'shared/domain/repositories/item-catalogue.repository';
import { ItemStockAdjustmentRepository } from 'shared/domain/repositories/item-stock-adjustment.repository';

export interface AdjustItemOnHandRuntime {
  readonly adjustmentId: () => string;
  readonly now: () => Date;
}

const defaultAdjustItemOnHandRuntime: AdjustItemOnHandRuntime = {
  adjustmentId: randomUUID,
  now: () => new Date(),
};

export interface AdjustOnHandQuantityInput {
  readonly countedQuantity: number;
  readonly reason: string;
}

export interface OnHandAdjustmentProjection {
  readonly id: string;
  readonly itemId: string;
  readonly countedQuantity: number;
  readonly reason: string;
  readonly adjustedByUserId: string;
  readonly createdAt: Date;
}

// AC-08/AC-09/AC-09a — the one operation that writes an Item's On-hand Quantity (sad.md §6.3). The
// figure is a count the member made, never an increase or a decrease applied to the figure already
// stored (CONTEXT.md §Invariants), and it never moves without a reason, which is what keeps AC-18a
// true: nothing else in this release writes it, Arrival Confirmation included.
@Injectable()
export class AdjustItemOnHandCommand {
  constructor(
    private readonly itemCatalogueRepository: ItemCatalogueRepository,
    private readonly itemStockAdjustmentRepository: ItemStockAdjustmentRepository,
    @Optional()
    private readonly adjustItemOnHandRuntime: AdjustItemOnHandRuntime = defaultAdjustItemOnHandRuntime,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    itemId: string,
    input: AdjustOnHandQuantityInput,
  ): Promise<OnHandAdjustmentProjection> {
    // Both refusals are decided before any persistence is consulted, so AC-09's and AC-09a's
    // "changes nothing" is a property of the flow rather than of a rollback.
    assert(
      isCountedQuantity(input.countedQuantity),
      itemInvalidOnHandQuantityError(),
    );
    assert(isStatedReason(input.reason), itemAdjustmentReasonRequiredError());

    // AC-03 — the Item is resolved within the acting Warehouse. One of another Warehouse resolves
    // to nothing and is refused exactly as a missing one is, disclosing nothing about where it
    // exists. An Inactive Item still holds a figure that may be corrected, so deactivation is not
    // consulted here — unlike the operations that record a *new* reference to an Item.
    const item = await this.itemCatalogueRepository.findById(itemId);
    assert(
      item !== null && item.warehouseId === currentUser.warehouseId,
      itemTargetUnavailableError(),
    );

    const adjustmentId = this.adjustItemOnHandRuntime.adjustmentId();
    const adjustedAt = this.adjustItemOnHandRuntime.now();
    // Stored trimmed, as `chk_item_stock_adjustments_reason_stored_trimmed` requires, and stored as
    // text: the reason is rendered as text and never as markup or a link (spec.md §6.1).
    const reason = input.reason.trim();

    await this.itemStockAdjustmentRepository.recordAdjustment({
      adjustmentId,
      itemId,
      warehouseId: currentUser.warehouseId,
      countedQuantity: input.countedQuantity,
      reason,
      adjustedByUserId: currentUser.userId,
      adjustedAt,
    });

    return {
      id: adjustmentId,
      itemId,
      countedQuantity: input.countedQuantity,
      reason,
      adjustedByUserId: currentUser.userId,
      createdAt: adjustedAt,
    };
  }
}
