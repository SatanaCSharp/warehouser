import { Injectable } from '@nestjs/common';
import type { CustomerOrder } from 'customer-orders/domain/mappers/customer-order.mapper';
import { toCustomerOrder } from 'customer-orders/domain/mappers/customer-order.mapper';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import type { ListCustomerOrdersFilter } from 'shared/domain/repositories/customer-order-lifecycle.repository';
import { CustomerOrderLifecycleRepository } from 'shared/domain/repositories/customer-order-lifecycle.repository';

// `GET /api/v1/warehouses/{warehouseId}/customer-orders` (openapi.yaml `listCustomerOrders`) — the
// Warehouse's Customer Orders, optionally narrowed to one Item and/or one lifecycle state. Both
// narrowings are optional and omitting them returns every state, which is what distinguishes this
// read from `ListUnfulfilledCustomerOrdersForItemQuery` and
// `ListLinkableCustomerOrdersForItemQuery`: those two answer a specific destination's question and
// force `state: 'unfulfilled'` with a required Item, while this one answers the endpoint itself.
//
// Ordering is the contract's — "ordered by needed-by date then creation time" — asked for
// explicitly at the repository so the two existing callers keep the creation ordering they read.
// Returned whole; nothing is paged at the spec.md §1 scale.
@Injectable()
export class ListCustomerOrdersQuery {
  constructor(
    private readonly customerOrderLifecycleRepository: CustomerOrderLifecycleRepository,
  ) {}

  async execute(
    currentUser: AccessCurrentUser,
    filter: ListCustomerOrdersFilter = {},
  ): Promise<CustomerOrder[]> {
    const orders =
      await this.customerOrderLifecycleRepository.listCustomerOrders(
        currentUser.warehouseId,
        filter,
        'needed_by',
      );

    return orders.map(toCustomerOrder);
  }
}
