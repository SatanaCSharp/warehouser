import { Injectable } from '@nestjs/common';
import type { CustomerOrder } from 'customer-orders/domain/mappers/customer-order.mapper.js';
import { toCustomerOrder } from 'customer-orders/domain/mappers/customer-order.mapper.js';
import type { AccessCurrentUser } from 'shared/access/access-current-user.js';
import { CustomerOrderLifecycleRepository } from 'shared/domain/repositories/customer-order-lifecycle.repository.js';

// `GET /api/v1/warehouses/{warehouseId}/customer-orders?itemId=…&state=unfulfilled` — the Unfulfilled
// Customer Orders a Purchase Draft line linking to this Item may name (sad.md §6.6 step 1). AC-20
// requires demand already linked by another draft to still be offered, so this query never narrows
// by existing Coverage — it is the same Unfulfilled-orders-behind-an-Item read as the Demand
// sub-rows, informational Coverage aside.
@Injectable()
export class ListLinkableCustomerOrdersForItemQuery {
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
