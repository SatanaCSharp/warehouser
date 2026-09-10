import { Injectable, Optional } from '@nestjs/common';
import type { Customer } from 'customers/domain/mappers/customer.mapper';
import { toCustomer } from 'customers/domain/mappers/customer.mapper';
import {
  assertCustomerWriteApplied,
  CustomerAddressBookService,
} from 'customers/domain/services/customer-address-book.service';
import { CustomerName } from 'customers/domain/value-objects/customer-name';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { CustomerAddressBookRepository } from 'shared/domain/repositories/customer-address-book.repository';
import { CustomerDirectoryRepository } from 'shared/domain/repositories/customer-directory.repository';

export interface CorrectCustomerNameRuntime {
  readonly now: () => Date;
}

const defaultCorrectCustomerNameRuntime: CorrectCustomerNameRuntime = {
  now: () => new Date(),
};

export interface CorrectCustomerNameInput {
  readonly name: string;
}

// AC-03b/AC-03c/AC-12 — corrects a Customer's name (sad.md §6.2 step 6). The write is the customer
// row alone: every Customer Order names the Customer's identifier and carries no copy of its name,
// and every frozen Purchase Draft Line carries the name it captured at Ready for Ordering, so no
// cascade exists and none is needed (data-model.md §`customers`).
@Injectable()
export class CorrectCustomerNameCommand {
  constructor(
    private readonly customerDirectoryRepository: CustomerDirectoryRepository,
    private readonly customerAddressBookRepository: CustomerAddressBookRepository,
    private readonly customerAddressBookService: CustomerAddressBookService,
    @Optional()
    private readonly correctCustomerNameRuntime: CorrectCustomerNameRuntime = defaultCorrectCustomerNameRuntime,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    customerId: string,
    input: CorrectCustomerNameInput,
  ): Promise<Customer> {
    // AC-12 — resolved within the acting Warehouse before anything else, so a Customer of another
    // Warehouse is refused exactly as one that does not exist and the name below is never even
    // looked up on its behalf.
    const customer = await this.customerAddressBookService.resolveCustomer(
      customerId,
      currentUser.warehouseId,
    );

    const name = CustomerName.create(input.name);

    // AC-03c — the name another Customer of this Warehouse holds, active or Inactive alike, is
    // refused; this Customer never conflicts with itself.
    await this.customerAddressBookService.assertNameAvailable(
      currentUser.warehouseId,
      name.value,
      customerId,
    );

    const correctedAt = this.correctCustomerNameRuntime.now();
    const outcome = await this.customerDirectoryRepository.correctCustomerName(
      customerId,
      currentUser.warehouseId,
      name.value,
      correctedAt,
    );

    assertCustomerWriteApplied(outcome);

    // The corrected row as it now stands. Its addresses are read rather than assumed, because the
    // response carries them and the correction leaves every one of them untouched.
    const deliveryAddresses =
      await this.customerAddressBookRepository.listDeliveryAddresses(
        customerId,
      );

    return toCustomer(
      { ...customer, name: name.value, updatedAt: correctedAt },
      deliveryAddresses,
    );
  }
}
