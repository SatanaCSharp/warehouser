import { Injectable, Optional } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import {
  customerOrderInvalidInputError,
  customerOrderQuantityBelowAllocatedError,
} from 'customer-orders/domain/errors/customer-order.errors.js';
import type { CustomerOrder } from 'customer-orders/domain/mappers/customer-order.mapper.js';
import { toCustomerOrder } from 'customer-orders/domain/mappers/customer-order.mapper.js';
import {
  canAmendCustomerOrder,
  isDemandQuantity,
  isQuantityAtOrAboveAllocated,
} from 'customer-orders/domain/predicates/customer-order.predicates.js';
import {
  assertNeededByStillAhead,
  CustomerOrderLifecycleService,
} from 'customer-orders/domain/services/customer-order-lifecycle.service.js';
import type { AccessCurrentUser } from 'shared/access/access-current-user.js';
import { Transactional } from 'shared/decorators/transactional.decorator.js';
import type { CustomerOrderState } from 'shared/domain/entities/customer-order.entity.js';
import { CustomerOrderLifecycleRepository } from 'shared/domain/repositories/customer-order-lifecycle.repository.js';

export interface AmendCustomerOrderRuntime {
  readonly now: () => Date;
}

const defaultAmendCustomerOrderRuntime: AmendCustomerOrderRuntime = {
  now: () => new Date(),
};

export interface AmendCustomerOrderInput {
  readonly quantity?: number;
  readonly neededBy?: string;
}

// AC-19/AC-19b — amending demand (sad.md §6.10). Every bound is re-checked against the row locked
// in this same transaction rather than against the values the member composed against (sad.md §8),
// which is why the amendment resolves its order through the shared locking read.
@Injectable()
export class AmendCustomerOrderCommand {
  constructor(
    private readonly customerOrderLifecycleRepository: CustomerOrderLifecycleRepository,
    private readonly customerOrderLifecycleService: CustomerOrderLifecycleService,
    @Optional()
    private readonly amendCustomerOrderRuntime: AmendCustomerOrderRuntime = defaultAmendCustomerOrderRuntime,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    customerOrderId: string,
    input: AmendCustomerOrderInput,
  ): Promise<CustomerOrder> {
    const amendedAt = this.amendCustomerOrderRuntime.now();

    if (input.quantity !== undefined) {
      assert(
        isDemandQuantity(input.quantity),
        customerOrderInvalidInputError('quantity', 'positive_integer'),
      );
    }
    if (input.neededBy !== undefined) {
      assertNeededByStillAhead(input.neededBy, amendedAt);
    }

    const locked = await this.customerOrderLifecycleService.lockAmendableOrder(
      currentUser,
      customerOrderId,
      canAmendCustomerOrder,
    );

    // AC-19b — the floor is the total already allocated to this order, read from the locked row in
    // this same transaction. Below it the change is blocked and the order is left exactly as it
    // was, because those goods sit in the Transit Zone under that customer's name.
    const quantity = input.quantity ?? locked.order.quantity;
    assert(
      isQuantityAtOrAboveAllocated(quantity, locked.allocatedQuantity),
      customerOrderQuantityBelowAllocatedError(
        locked.allocatedQuantity,
        quantity,
      ),
    );

    // AC-19 — the Outstanding Quantity is recalculated on every amendment, and a Fulfilled order
    // whose quantity was raised counts as Unfulfilled again so it returns to the consolidated
    // demand. The subtraction cannot go below zero because the floor above already refused that
    // case: the figure is never silently clamped (data-model.md §"Constraints the model
    // deliberately does not express").
    const outstandingQuantity = quantity - locked.allocatedQuantity;
    const state: CustomerOrderState =
      outstandingQuantity > 0 ? 'unfulfilled' : 'fulfilled';

    const amended =
      await this.customerOrderLifecycleRepository.amendCustomerOrder(
        customerOrderId,
        {
          quantity,
          outstandingQuantity,
          neededBy: input.neededBy ?? locked.order.neededBy,
          state,
          amendedAt,
        },
      );

    // Nothing is written to any linked frozen draft: its next read compares its Demand Snapshot
    // against these new values and reports the Drift Signal (sad.md §6.8, AC-16, AC-19).
    return toCustomerOrder(amended);
  }
}
