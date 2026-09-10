import { Injectable, Optional } from '@nestjs/common';
import type { Customer } from 'customers/domain/mappers/customer.mapper';
import { toCustomer } from 'customers/domain/mappers/customer.mapper';
import {
  assertCustomerWriteApplied,
  assertDeliveryAddressUsable,
  CustomerAddressBookService,
} from 'customers/domain/services/customer-address-book.service';
import find from 'lodash/find.js';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { CustomerAddressBookRepository } from 'shared/domain/repositories/customer-address-book.repository';

export interface SetMainCustomerDeliveryAddressRuntime {
  readonly now: () => Date;
}

const defaultSetMainCustomerDeliveryAddressRuntime: SetMainCustomerDeliveryAddressRuntime =
  {
    now: () => new Date(),
  };

// AC-04/AC-05/AC-12 — "a member changes which by marking another as Main". One repository operation
// clears the previous flag and sets this one, because
// `uq_customer_delivery_addresses_customer_main` admits one Main row per Customer and would reject
// both flags standing at once.
//
// Idempotent, which is why openapi.yaml serves it as `PUT` with no body: marking the address that
// is already Main clears its own flag and sets it again, and the Customer comes back unchanged.
//
// **It moves no Customer Order.** An order names an address, not "the Main one"; the Main address
// is resolved and stored as a reference at record time (data-model.md `customer_orders`).
@Injectable()
export class SetMainCustomerDeliveryAddressCommand {
  constructor(
    private readonly customerAddressBookRepository: CustomerAddressBookRepository,
    private readonly customerAddressBookService: CustomerAddressBookService,
    @Optional()
    private readonly setMainCustomerDeliveryAddressRuntime: SetMainCustomerDeliveryAddressRuntime = defaultSetMainCustomerDeliveryAddressRuntime,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    customerId: string,
    deliveryAddressId: string,
  ): Promise<Customer> {
    const customer = await this.customerAddressBookService.resolveCustomer(
      customerId,
      currentUser.warehouseId,
    );

    // AC-12 and `chk_customer_delivery_addresses_main_is_active` in one resolution: an address of
    // another Customer or a missing one is the non-enumerating refusal, and an Inactive one of this
    // Customer is the different, disclosing-nothing refusal that an Inactive address is never Main.
    //
    // Read the whole address book rather than the row, because "belongs to this Customer" and "is
    // active" are the two conditions and both are answered from the same set. This is the command's
    // own rule, held next to the boundary that decides it (server-architecture.md §Use cases).
    const addressBook =
      await this.customerAddressBookRepository.listDeliveryAddresses(
        customerId,
      );

    assertDeliveryAddressUsable(
      find(addressBook, (candidate) => candidate.id === deliveryAddressId) ??
        null,
      customerId,
    );

    const changedAt = this.setMainCustomerDeliveryAddressRuntime.now();
    const outcome =
      await this.customerAddressBookRepository.setMainDeliveryAddress(
        deliveryAddressId,
        customerId,
        changedAt,
      );

    // The write carries the address's own condition, so a concurrent deactivation between the
    // resolution and here moves no row.
    assertCustomerWriteApplied(outcome);

    const deliveryAddresses =
      await this.customerAddressBookRepository.listDeliveryAddresses(
        customerId,
      );

    return toCustomer(customer, deliveryAddresses);
  }
}
