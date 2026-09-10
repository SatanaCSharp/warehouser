import { Injectable, Optional } from '@nestjs/common';
import type { Customer } from 'customers/domain/mappers/customer.mapper.js';
import { toCustomer } from 'customers/domain/mappers/customer.mapper.js';
import {
  assertCustomerWriteApplied,
  CustomerAddressBookService,
} from 'customers/domain/services/customer-address-book.service.js';
import type { AccessCurrentUser } from 'shared/access/access-current-user.js';
import { Transactional } from 'shared/decorators/transactional.decorator.js';
import { CustomerAddressBookRepository } from 'shared/domain/repositories/customer-address-book.repository.js';
import { CustomerDirectoryRepository } from 'shared/domain/repositories/customer-directory.repository.js';

export interface ReactivateCustomerRuntime {
  readonly now: () => Date;
}

const defaultReactivateCustomerRuntime: ReactivateCustomerRuntime = {
  now: () => new Date(),
};

// AC-06 "and lets the member make it active again" — the deactivation inverted (sad.md §6.3), and
// the same Permission governs both directions (openapi.yaml `reactivateCustomer`). Clearing the
// instant is the whole change: the Customer's Delivery Addresses are, once more, in whatever state
// they were left in.
@Injectable()
export class ReactivateCustomerCommand {
  constructor(
    private readonly customerDirectoryRepository: CustomerDirectoryRepository,
    private readonly customerAddressBookRepository: CustomerAddressBookRepository,
    private readonly customerAddressBookService: CustomerAddressBookService,
    @Optional()
    private readonly reactivateCustomerRuntime: ReactivateCustomerRuntime = defaultReactivateCustomerRuntime,
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

    const reactivatedAt = this.reactivateCustomerRuntime.now();
    const outcome =
      await this.customerDirectoryRepository.setCustomerDeactivation(
        customerId,
        currentUser.warehouseId,
        null,
        reactivatedAt,
      );

    // Guarded on the Customer being Inactive, so reactivating an active one moves no row and is
    // refused rather than reported as a change that happened.
    assertCustomerWriteApplied(outcome);

    const deliveryAddresses =
      await this.customerAddressBookRepository.listDeliveryAddresses(
        customerId,
      );

    return toCustomer(
      { ...customer, deactivatedAt: null, updatedAt: reactivatedAt },
      deliveryAddresses,
    );
  }
}
