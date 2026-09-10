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
import { CustomerDirectoryRepository } from 'shared/domain/repositories/customer-directory.repository';

export interface DeactivateCustomerRuntime {
  readonly now: () => Date;
}

const defaultDeactivateCustomerRuntime: DeactivateCustomerRuntime = {
  now: () => new Date(),
};

// AC-06/AC-12 — records a Customer Inactive (sad.md §6.3 steps 1 and 2). The write is the customer
// row alone: its name stays taken so no new Customer may reuse it, every Customer Order already
// naming it keeps reading and counting exactly as before, and **every one of its Delivery
// Addresses is left in the state it was already in** — which is why no address write appears here.
@Injectable()
export class DeactivateCustomerCommand {
  constructor(
    private readonly customerDirectoryRepository: CustomerDirectoryRepository,
    private readonly customerAddressBookRepository: CustomerAddressBookRepository,
    private readonly customerAddressBookService: CustomerAddressBookService,
    @Optional()
    private readonly deactivateCustomerRuntime: DeactivateCustomerRuntime = defaultDeactivateCustomerRuntime,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    customerId: string,
  ): Promise<Customer> {
    // AC-12 — a Customer of another Warehouse is refused exactly as one that does not exist.
    const customer = await this.customerAddressBookService.resolveCustomer(
      customerId,
      currentUser.warehouseId,
    );

    const deactivatedAt = this.deactivateCustomerRuntime.now();
    const outcome =
      await this.customerDirectoryRepository.setCustomerDeactivation(
        customerId,
        currentUser.warehouseId,
        deactivatedAt,
        deactivatedAt,
      );

    // The write is guarded on the state the transition starts from, so a Customer already Inactive
    // moves no row.
    assertCustomerWriteApplied(outcome);

    const deliveryAddresses =
      await this.customerAddressBookRepository.listDeliveryAddresses(
        customerId,
      );

    return toCustomer(
      { ...customer, deactivatedAt, updatedAt: deactivatedAt },
      deliveryAddresses,
    );
  }
}
