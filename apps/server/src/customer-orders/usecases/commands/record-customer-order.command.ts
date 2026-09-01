import { randomUUID } from 'node:crypto';

import { Injectable, Optional } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import {
  customerOrderInvalidInputError,
  customerOrderItemUnavailableError,
} from 'customer-orders/domain/errors/customer-order.errors';
import type { CustomerOrder } from 'customer-orders/domain/mappers/customer-order.mapper';
import { toCustomerOrder } from 'customer-orders/domain/mappers/customer-order.mapper';
import {
  isCustomerName,
  isDemandQuantity,
} from 'customer-orders/domain/predicates/customer-order.predicates';
import { assertNeededByStillAhead } from 'customer-orders/domain/services/customer-order-lifecycle.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { CustomerOrderLifecycleRepository } from 'shared/domain/repositories/customer-order-lifecycle.repository';
import { ItemCatalogueRepository } from 'shared/domain/repositories/item-catalogue.repository';
import { isSelectableItem } from 'shared/predicates/item-availability.predicates';

export interface RecordCustomerOrderRuntime {
  readonly customerOrderId: () => string;
  readonly now: () => Date;
}

const defaultRecordCustomerOrderRuntime: RecordCustomerOrderRuntime = {
  customerOrderId: randomUUID,
  now: () => new Date(),
};

export interface RecordCustomerOrderInput {
  readonly itemId: string;
  readonly customerName: string;
  readonly quantity: number;
  readonly neededBy: string;
}

// AC-01/AC-02/AC-02a/AC-03 — recording demand (sad.md §6.4). The REST surface invokes this use
// case, never a repository (server-architecture.md §Dependency direction), and the use case owns
// the rules itself: every bound is checked here and refusals propagate untouched to the global
// exception filter (server-error-handling.md §5).
@Injectable()
export class RecordCustomerOrderCommand {
  constructor(
    private readonly customerOrderLifecycleRepository: CustomerOrderLifecycleRepository,
    private readonly itemCatalogueRepository: ItemCatalogueRepository,
    @Optional()
    private readonly recordCustomerOrderRuntime: RecordCustomerOrderRuntime = defaultRecordCustomerOrderRuntime,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    input: RecordCustomerOrderInput,
  ): Promise<CustomerOrder> {
    const recordedAt = this.recordCustomerOrderRuntime.now();

    // AC-02/AC-02a — each refusal names the value it will not accept, and all of them are decided
    // before any persistence is consulted, so "changes nothing" is a property of the flow rather
    // than of a rollback.
    assert(
      isCustomerName(input.customerName),
      customerOrderInvalidInputError('customerName', 'trimmed_non_empty'),
    );
    assert(
      isDemandQuantity(input.quantity),
      customerOrderInvalidInputError('quantity', 'positive_integer'),
    );
    assertNeededByStillAhead(input.neededBy, recordedAt);

    // AC-03 — the named Item is resolved **within the acting Warehouse**. An Item of another
    // Warehouse resolves to nothing and is refused exactly as a missing one is. An Inactive Item is
    // no longer offered and is refused on the same non-enumerating terms, because this operation
    // records a *new* reference to it (openapi.yaml `ItemUnavailable`, CONTEXT.md §Invariants).
    // The condition itself is `isSelectableItem` in `shared/predicates/`, shared with the draft
    // assembly path that applies the same rule (server-error-handling.md §1). The refusal is this
    // feature's own — `customer_orders.item_unavailable`, not the draft's code.
    const item = await this.itemCatalogueRepository.findById(input.itemId);
    assert(
      isSelectableItem(item, currentUser.warehouseId),
      customerOrderItemUnavailableError(),
    );

    // AC-01 — Unfulfilled, waiting for everything it asked for. Stored trimmed, as
    // `chk_customer_orders_customer_name_stored_trimmed` requires.
    const recorded =
      await this.customerOrderLifecycleRepository.createCustomerOrder({
        id: this.recordCustomerOrderRuntime.customerOrderId(),
        warehouseId: currentUser.warehouseId,
        itemId: input.itemId,
        customerName: input.customerName.trim(),
        quantity: input.quantity,
        outstandingQuantity: input.quantity,
        neededBy: input.neededBy,
        state: 'unfulfilled',
        recordedByUserId: currentUser.userId,
        recordedAt,
      });

    return toCustomerOrder(recorded);
  }
}
