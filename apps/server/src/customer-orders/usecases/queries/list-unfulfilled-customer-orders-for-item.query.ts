import { Injectable } from '@nestjs/common';
import type { CustomerOrder } from 'customer-orders/domain/mappers/customer-order.mapper.js';
import { toCustomerOrder } from 'customer-orders/domain/mappers/customer-order.mapper.js';
import type { AccessCurrentUser } from 'shared/access/access-current-user.js';
import { CustomerOrderLifecycleRepository } from 'shared/domain/repositories/customer-order-lifecycle.repository.js';

// `GET /api/v1/warehouses/{warehouseId}/customer-orders?itemId=…&state=unfulfilled` — the
// Unfulfilled Customer Orders behind one Demand Line's Item, the expandable sub-rows of the Demand
// destination (sad.md §5 `customer-orders/usecases`). Scoped to the acting Warehouse, this Item,
// and forced to `state: 'unfulfilled'`, so a Fulfilled or cancelled order never appears (AC-04,
// AC-17a).
@Injectable()
export class ListUnfulfilledCustomerOrdersForItemQuery {
  constructor(
    private readonly customerOrderLifecycleRepository: CustomerOrderLifecycleRepository,
  ) {}

  async execute(
    currentUser: AccessCurrentUser,
    itemId: string,
  ): Promise<CustomerOrder[]> {
    const orders =
      await this.customerOrderLifecycleRepository.listCustomerOrders(
        currentUser.warehouseId,
        { itemId, state: 'unfulfilled' },
      );

    return orders.map(toCustomerOrder);
  }
}
