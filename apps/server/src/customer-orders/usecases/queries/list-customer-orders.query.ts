import { Injectable } from '@nestjs/common';
import type { CustomerOrderProjection } from 'customer-orders/domain/mappers/customer-order-projection.mapper';
import {
  toIdentifiedCustomerOrder,
  toRedactedCustomerOrder,
} from 'customer-orders/domain/mappers/customer-order-projection.mapper';
import { map } from 'lodash';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import type { ListCustomerOrdersFilter } from 'shared/domain/repositories/customer-order-lifecycle.repository';
import { CustomerOrderLifecycleRepository } from 'shared/domain/repositories/customer-order-lifecycle.repository';
import { readsCustomerIdentity } from 'shared/predicates/observed-permission.predicates';

// `GET /api/v1/warehouses/{warehouseId}/customer-orders` (openapi.yaml `listCustomerOrders`) — the
// Warehouse's Customer Orders, optionally narrowed to one Item and/or one lifecycle state. Both
// narrowings are optional and omitting them returns every state, which is what distinguishes this
// read from `ListUnfulfilledCustomerOrdersForItemQuery` and
// `ListLinkableCustomerOrdersForItemQuery`: those two answer a specific destination's question and
// force `state: 'unfulfilled'` with a required Item, while this one answers the endpoint itself.
//
// AC-09a — **what the response carries is decided here**, from the observed Permissions the guard
// resolved onto the principal. The handler declares `@ObservedPermission(CUSTOMERS:WATCH)`, which
// can neither admit nor deny the request (ADR 0001); this query reads the granted subset and issues
// the read whose statement selects only what that actor may see. The redacted form is built by
// **not selecting** the withheld columns rather than by fetching them and dropping them afterwards
// (server-request-authorization.md § "Consume the observed set"), so widening a mapping downstream
// cannot put a customer name on the wire.
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
  ): Promise<CustomerOrderProjection[]> {
    if (!readsCustomerIdentity(currentUser.observedPermissionIds)) {
      const redacted =
        await this.customerOrderLifecycleRepository.listRedactedCustomerOrders(
          currentUser.warehouseId,
          filter,
          'needed_by',
        );

      return map(redacted, toRedactedCustomerOrder);
    }

    const identified =
      await this.customerOrderLifecycleRepository.listIdentifiedCustomerOrders(
        currentUser.warehouseId,
        filter,
        'needed_by',
      );

    return map(identified, toIdentifiedCustomerOrder);
  }
}
