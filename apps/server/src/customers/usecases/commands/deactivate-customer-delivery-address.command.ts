import { Injectable, Optional } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import type { Customer } from 'customers/domain/mappers/customer.mapper';
import { toCustomer } from 'customers/domain/mappers/customer.mapper';
import { CustomerAddressBookService } from 'customers/domain/services/customer-address-book.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { CustomerAddressBookRepository } from 'shared/domain/repositories/customer-address-book.repository';

export interface DeactivateCustomerDeliveryAddressRuntime {
  readonly now: () => Date;
}

const defaultDeactivateCustomerDeliveryAddressRuntime: DeactivateCustomerDeliveryAddressRuntime =
  {
    now: () => new Date(),
  };

// AC-06a/AC-06b/AC-07/AC-12 — records one Delivery Address Inactive. It stops being offered
// wherever an address is chosen, while every Customer Order and every frozen Purchase Draft Line
// already naming it keeps reading and counting exactly as before: an order dereferences the same
// row, whose text and access notes this command never writes, and a frozen line holds captured text
// and no reference at all (data-model.md `purchase_draft_lines`). That is a property of the model,
// not of anything this command does — which is why nothing here maintains it.
//
// The condition, the deactivation and the AC-06b promotion are one atomic operation and are not
// separable, so they are `CustomerAddressBookService.deactivateDeliveryAddress`'s: AC-07 is decided
// over rows read **under lock** so two concurrent deactivations cannot both see two remaining, and
// the promotion has to land in the same transaction or the Customer is momentarily left without a
// Main address. This command owns that transaction.
@Injectable()
export class DeactivateCustomerDeliveryAddressCommand {
  constructor(
    private readonly customerAddressBookRepository: CustomerAddressBookRepository,
    private readonly customerAddressBookService: CustomerAddressBookService,
    @Optional()
    private readonly deactivateCustomerDeliveryAddressRuntime: DeactivateCustomerDeliveryAddressRuntime = defaultDeactivateCustomerDeliveryAddressRuntime,
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

    const deactivatedAt = this.deactivateCustomerDeliveryAddressRuntime.now();
    const promotedDeliveryAddressId =
      await this.customerAddressBookService.deactivateDeliveryAddress(
        customerId,
        deliveryAddressId,
        deactivatedAt,
      );

    const deliveryAddresses =
      await this.customerAddressBookRepository.listDeliveryAddresses(
        customerId,
      );
    const updated = toCustomer(customer, deliveryAddresses);

    // AC-06b — "tells the member which address is now the Main one". The response says which
    // through `mainDeliveryAddressId`, so the promotion the service decided and the set the read
    // reports have to be the same address; anything else is a broken invariant rather than a
    // member-facing rejection (server-error-handling.md §2).
    assert(
      promotedDeliveryAddressId === null ||
        updated.mainDeliveryAddressId === promotedDeliveryAddressId,
      'The promoted Main Delivery Address is not the one the address book reports',
    );

    return updated;
  }
}
