import { Injectable } from '@nestjs/common';
import { assertDefined } from '@warehouser/utils/asserts';
import type { CustomerOrderProjection } from 'customer-orders/domain/mappers/customer-order-projection.mapper';
import {
  toIdentifiedCustomerOrder,
  toRedactedCustomerOrder,
} from 'customer-orders/domain/mappers/customer-order-projection.mapper';
import { first } from 'lodash';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { CustomerOrderLifecycleRepository } from 'shared/domain/repositories/customer-order-lifecycle.repository';
import { readsCustomerIdentity } from 'shared/predicates/observed-permission.predicates';

// The projection every Customer Order **mutation** answers with — openapi.yaml
// `recordCustomerOrder` 201, `amendCustomerOrder` 200, `redirectCustomerOrder` 200 and the
// cancellation `ordering` shipped, each of which returns the order "identified or redacted
// according to the observed Permission".
//
// It exists so a Customer Order has exactly **one** projection in the application. Mapping a
// command's own result at the controller instead would be a second place AC-09a's redaction has to
// be remembered, and the fifteen already-shipped surfaces sad.md §11 counts are the argument
// against having two of anything here. The decision is therefore the same one
// `ListCustomerOrdersQuery` takes, over the same observed set, through the same two reads: the
// redacted one selects no identity column at all (ADR 0001,
// server-request-authorization.md § "Consume the observed set").
//
// Scoped to the acting Warehouse by the read itself, so an order of another Warehouse resolves to
// nothing exactly as a missing one does (AC-12). Reaching that after a mutation this same request
// has just applied is a broken invariant rather than a member-facing case, so it is an
// `AssertionError` the global filter reports as an internal error and never explains
// (server-error-handling.md §2, §6).
@Injectable()
export class ReadCustomerOrderQuery {
  constructor(
    private readonly customerOrderLifecycleRepository: CustomerOrderLifecycleRepository,
  ) {}

  async execute(
    currentUser: AccessCurrentUser,
    customerOrderId: string,
  ): Promise<CustomerOrderProjection> {
    if (!readsCustomerIdentity(currentUser.observedPermissionIds)) {
      const redacted = first(
        await this.customerOrderLifecycleRepository.listRedactedCustomerOrders(
          currentUser.warehouseId,
          { customerOrderId },
        ),
      );
      assertDefined(
        redacted,
        'A Customer Order this request has just written did not resolve in the acting Warehouse',
      );

      return toRedactedCustomerOrder(redacted);
    }

    const identified = first(
      await this.customerOrderLifecycleRepository.listIdentifiedCustomerOrders(
        currentUser.warehouseId,
        { customerOrderId },
      ),
    );
    assertDefined(
      identified,
      'A Customer Order this request has just written did not resolve in the acting Warehouse',
    );

    return toIdentifiedCustomerOrder(identified);
  }
}
