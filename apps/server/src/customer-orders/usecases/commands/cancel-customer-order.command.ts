import { Injectable, Optional } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import { customerOrderInvalidInputError } from 'customer-orders/domain/errors/customer-order.errors';
import type { CustomerOrder } from 'customer-orders/domain/mappers/customer-order.mapper';
import { toCustomerOrder } from 'customer-orders/domain/mappers/customer-order.mapper';
import {
  canCancelCustomerOrder,
  isCancellationReason,
} from 'customer-orders/domain/predicates/customer-order.predicates';
import { CustomerOrderLifecycleService } from 'customer-orders/domain/services/customer-order-lifecycle.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { CustomerOrderLifecycleRepository } from 'shared/domain/repositories/customer-order-lifecycle.repository';

export interface CancelCustomerOrderRuntime {
  readonly now: () => Date;
}

const defaultCancelCustomerOrderRuntime: CancelCustomerOrderRuntime = {
  now: () => new Date(),
};

export interface CancelCustomerOrderInput {
  readonly cancellationReason: string;
}

// AC-19a — cancelling demand (sad.md §6.10). The state the cancellation is legal from is decided
// against the row locked in this same transaction, never against what the member composed against
// (sad.md §8).
@Injectable()
export class CancelCustomerOrderCommand {
  constructor(
    private readonly customerOrderLifecycleRepository: CustomerOrderLifecycleRepository,
    private readonly customerOrderLifecycleService: CustomerOrderLifecycleService,
    @Optional()
    private readonly cancelCustomerOrderRuntime: CancelCustomerOrderRuntime = defaultCancelCustomerOrderRuntime,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    customerOrderId: string,
    input: CancelCustomerOrderInput,
  ): Promise<CustomerOrder> {
    const cancelledAt = this.cancelCustomerOrderRuntime.now();

    assert(
      isCancellationReason(input.cancellationReason),
      customerOrderInvalidInputError('cancellationReason', 'trimmed_non_empty'),
    );

    // The cancellation resolves its order through the same locking read the amendment uses, so both
    // take the lock order sad.md §6.10 shares with the arrival flow — "which is where the two flows
    // meet on these rows".
    await this.customerOrderLifecycleService.lockAmendableOrder(
      currentUser,
      customerOrderId,
      canCancelCustomerOrder,
    );

    // AC-19a — the reason, the acting member and the time arrive together
    // (`chk_customer_orders_cancellation_attribution`). Stored trimmed, as
    // `chk_customer_orders_cancellation_reason_stored_trimmed` requires, and stored as text: the
    // reason is rendered as text and never as markup or a link (spec.md §6.1).
    const cancelled =
      await this.customerOrderLifecycleRepository.cancelCustomerOrder(
        customerOrderId,
        {
          cancellationReason: input.cancellationReason.trim(),
          cancelledByUserId: currentUser.userId,
          cancelledAt,
        },
      );

    return toCustomerOrder(cancelled);
  }
}
