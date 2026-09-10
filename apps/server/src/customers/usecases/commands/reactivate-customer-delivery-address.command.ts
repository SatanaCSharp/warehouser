import { Injectable, Optional } from '@nestjs/common';
import type { Customer } from 'customers/domain/mappers/customer.mapper';
import { toCustomer } from 'customers/domain/mappers/customer.mapper';
import {
  assertCustomerWriteApplied,
  CustomerAddressBookService,
} from 'customers/domain/services/customer-address-book.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { CustomerAddressBookRepository } from 'shared/domain/repositories/customer-address-book.repository';

export interface ReactivateCustomerDeliveryAddressRuntime {
  readonly now: () => Date;
}

const defaultReactivateCustomerDeliveryAddressRuntime: ReactivateCustomerDeliveryAddressRuntime =
  {
    now: () => new Date(),
  };

// AC-06a inverted, AC-12 — the address is offered again wherever one is chosen. It comes back as an
// **ordinary** address, never as a second Main one, which is
// `chk_customer_delivery_addresses_main_is_active` holding rather than a rule this command
// remembers: the write clears the flag because an Inactive row may not carry it.
//
// The write carries the state the transition starts from, so an address that is already active
// moves no row and is refused rather than reported as a change that happened. No lock is taken:
// reactivation only ever adds to the active set, so AC-07 has nothing to decide here.
@Injectable()
export class ReactivateCustomerDeliveryAddressCommand {
  constructor(
    private readonly customerAddressBookRepository: CustomerAddressBookRepository,
    private readonly customerAddressBookService: CustomerAddressBookService,
    @Optional()
    private readonly reactivateCustomerDeliveryAddressRuntime: ReactivateCustomerDeliveryAddressRuntime = defaultReactivateCustomerDeliveryAddressRuntime,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    customerId: string,
    deliveryAddressId: string,
  ): Promise<Customer> {
    // AC-12 — resolved in the acting Warehouse first, so a Customer of another Warehouse is refused
    // exactly as one that does not exist and its addresses are never reached.
    const customer = await this.customerAddressBookService.resolveCustomer(
      customerId,
      currentUser.warehouseId,
    );

    const reactivatedAt = this.reactivateCustomerDeliveryAddressRuntime.now();
    const outcome =
      await this.customerAddressBookRepository.reactivateDeliveryAddress(
        deliveryAddressId,
        customerId,
        reactivatedAt,
      );

    // An address of another Customer, a missing one and one that is already active all reach here
    // as zero affected rows, and all three are the one non-enumerating refusal.
    assertCustomerWriteApplied(outcome);

    const deliveryAddresses =
      await this.customerAddressBookRepository.listDeliveryAddresses(
        customerId,
      );

    return toCustomer(customer, deliveryAddresses);
  }
}
