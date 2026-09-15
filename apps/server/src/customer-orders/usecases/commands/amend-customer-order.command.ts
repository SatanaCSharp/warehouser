import { Injectable } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import { isDefined } from '@warehouser/utils/predicates';
import {
  customerOrderInvalidInputError,
  customerOrderQuantityBelowAllocatedError,
} from 'customer-orders/domain/errors/customer-order.errors';
import type { CustomerOrder } from 'customer-orders/domain/mappers/customer-order.mapper';
import { toCustomerOrder } from 'customer-orders/domain/mappers/customer-order.mapper';
import {
  canAmendCustomerOrder,
  isDemandQuantity,
  isQuantityAtOrAboveAllocated,
} from 'customer-orders/domain/predicates/customer-order.predicates';
import {
  amendedValue,
  demandStateOf,
} from 'customer-orders/domain/services/customer-order-amendment.service';
import {
  assertNeededByStillAhead,
  CustomerOrderLifecycleService,
} from 'customer-orders/domain/services/customer-order-lifecycle.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { CustomerOrderLifecycleRepository } from 'shared/domain/repositories/customer-order-lifecycle.repository';

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
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    customerOrderId: string,
    input: AmendCustomerOrderInput,
  ): Promise<CustomerOrder> {
    const amendedAt = new Date();

    if (isDefined(input.quantity)) {
      assert(
        isDemandQuantity(input.quantity),
        customerOrderInvalidInputError('quantity', 'positive_integer'),
      );
    }
    if (isDefined(input.neededBy)) {
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
    const quantity = amendedValue(input.quantity, locked.order.quantity);
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
    const state = demandStateOf(outstandingQuantity);

    const amended =
      await this.customerOrderLifecycleRepository.amendCustomerOrder(
        customerOrderId,
        {
          quantity,
          outstandingQuantity,
          neededBy: amendedValue(input.neededBy, locked.order.neededBy),
          state,
          amendedAt,
        },
      );

    // Nothing is written to any linked frozen draft: its next read compares its Demand Snapshot
    // against these new values and reports the Drift Signal (sad.md §6.8, AC-16, AC-19).
    return toCustomerOrder(amended);
  }
}
