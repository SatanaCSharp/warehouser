import { Injectable, Optional } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import { customerOrderInvalidDeliveryAddressError } from 'customer-orders/domain/errors/customer-order.errors.js';
import type { CustomerOrder } from 'customer-orders/domain/mappers/customer-order.mapper.js';
import { toCustomerOrder } from 'customer-orders/domain/mappers/customer-order.mapper.js';
import { isRedirectableCustomerOrder } from 'customer-orders/domain/predicates/customer-order.predicates.js';
import { CustomerOrderDestinationService } from 'customer-orders/domain/services/customer-order-destination.service.js';
import { CustomerOrderLifecycleService } from 'customer-orders/domain/services/customer-order-lifecycle.service.js';
import type { AccessCurrentUser } from 'shared/access/access-current-user.js';
import { Transactional } from 'shared/decorators/transactional.decorator.js';
import { CustomerOrderLifecycleRepository } from 'shared/domain/repositories/customer-order-lifecycle.repository.js';

export interface RedirectCustomerOrderRuntime {
  readonly now: () => Date;
}

const defaultRedirectCustomerOrderRuntime: RedirectCustomerOrderRuntime = {
  now: () => new Date(),
};

export interface RedirectCustomerOrderInput {
  readonly customerDeliveryAddressId: string;
}

// AC-11b/AC-11c — redirecting an outstanding Customer Order (sad.md §6.5). Its own use case rather
// than a widening of the amendment, because its rules are its own: the same Customer, an active
// address, an outstanding order. A shared payload would let the amendment's validation stand in for
// these (openapi.yaml `amendCustomerOrder`, sad.md §7).
//
// The eligibility is decided over the row this transaction locked, never over the values the member
// composed against, which is why the order is resolved through the shared locking read and the
// address book is read inside the same boundary.
//
// Nothing on any frozen Purchase Draft is touched: the Address Drift this causes is derived on the
// next read of the affected drafts (AC-11b, AC-18) and is never written here.
@Injectable()
export class RedirectCustomerOrderCommand {
  constructor(
    private readonly customerOrderLifecycleRepository: CustomerOrderLifecycleRepository,
    private readonly customerOrderLifecycleService: CustomerOrderLifecycleService,
    private readonly customerOrderDestinationService: CustomerOrderDestinationService,
    @Optional()
    private readonly redirectCustomerOrderRuntime: RedirectCustomerOrderRuntime = defaultRedirectCustomerOrderRuntime,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    customerOrderId: string,
    input: RedirectCustomerOrderInput,
  ): Promise<CustomerOrder> {
    const redirectedAt = this.redirectCustomerOrderRuntime.now();

    // AC-11c/AC-12 — the locking read is scoped to the acting Warehouse, so an order of another
    // Warehouse and one that does not exist are one non-enumerating refusal; a Fulfilled or
    // cancelled order is the different refusal `orderNotOutstanding` names, decided against the
    // state the locked row carries now.
    const locked = await this.customerOrderLifecycleService.lockAmendableOrder(
      currentUser,
      customerOrderId,
      isRedirectableCustomerOrder,
    );

    // AC-11a/AC-11c — an order recorded by typed name names no Customer, so there is no address
    // book it could be redirected within. It surfaces as the one refusal the redirection has for a
    // destination it cannot accept (openapi.yaml `CustomerOrderRedirectConflict`).
    const { customerId } = locked.order;
    assert(customerId !== null, customerOrderInvalidDeliveryAddressError());

    // AC-11c — the address is one of that same Customer's, and active. The read is scoped to the
    // Customer the order already names, so an address of another Customer is refused exactly as a
    // missing one is — the rule `fk_customer_orders_delivery_address (id, customer_id)` also holds
    // structurally, which is why nothing here compares owners a second time.
    const customerDeliveryAddressId =
      await this.customerOrderDestinationService.resolveDestination(
        customerId,
        input.customerDeliveryAddressId,
      );

    // AC-11b — one column on one Customer Order, keeping the order against the same Customer.
    const redirected =
      await this.customerOrderLifecycleRepository.redirectCustomerOrder(
        customerOrderId,
        customerId,
        customerDeliveryAddressId,
        redirectedAt,
      );

    return toCustomerOrder(redirected);
  }
}
