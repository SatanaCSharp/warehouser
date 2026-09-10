import { randomUUID } from 'node:crypto';

import { Injectable, Optional } from '@nestjs/common';
import type { Customer } from 'customers/domain/mappers/customer.mapper';
import { toCustomer } from 'customers/domain/mappers/customer.mapper';
import { CustomerAddressBookService } from 'customers/domain/services/customer-address-book.service';
import { AccessNotes } from 'customers/domain/value-objects/access-notes';
import { CustomerName } from 'customers/domain/value-objects/customer-name';
import { DeliveryAddressText } from 'customers/domain/value-objects/delivery-address-text';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { CustomerDirectoryRepository } from 'shared/domain/repositories/customer-directory.repository';

export interface RecordCustomerRuntime {
  readonly customerId: () => string;
  readonly deliveryAddressId: () => string;
  readonly now: () => Date;
}

const defaultRecordCustomerRuntime: RecordCustomerRuntime = {
  customerId: randomUUID,
  deliveryAddressId: randomUUID,
  now: () => new Date(),
};

export interface RecordCustomerDeliveryAddressInput {
  readonly addressText: string;
  readonly accessNotes: string | null;
}

export interface RecordCustomerInput {
  readonly name: string;
  readonly deliveryAddress: RecordCustomerDeliveryAddressInput;
}

// AC-01/AC-02/AC-03/AC-03a — records a Customer with its first Delivery Address (sad.md §6.2 steps
// 2 to 4). The two rows are written by one repository method inside this command's transaction, so
// no path exists that leaves a Customer without an address.
@Injectable()
export class RecordCustomerCommand {
  constructor(
    private readonly customerDirectoryRepository: CustomerDirectoryRepository,
    private readonly customerAddressBookService: CustomerAddressBookService,
    @Optional()
    private readonly recordCustomerRuntime: RecordCustomerRuntime = defaultRecordCustomerRuntime,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    input: RecordCustomerInput,
  ): Promise<Customer> {
    // AC-02 — every submitted value is decided before persistence is consulted, so "changes
    // nothing" is a property of the flow rather than of a rollback. Each value object names the
    // field it refuses and never echoes the submitted text (sad.md §8).
    const name = CustomerName.create(input.name);
    const addressText = DeliveryAddressText.create(
      input.deliveryAddress.addressText,
    );
    const accessNotes = AccessNotes.create(input.deliveryAddress.accessNotes);

    // AC-03/AC-03a — the read is scoped to the acting Warehouse, so the same name elsewhere is
    // never consulted, and the refusal names the Customer of *this* Warehouse that holds it.
    await this.customerAddressBookService.assertNameAvailable(
      currentUser.warehouseId,
      name.value,
    );

    const recordedAt = this.recordCustomerRuntime.now();
    const customerId = this.recordCustomerRuntime.customerId();

    // AC-01 — active, with the recording member and the time, and its one address active and Main.
    const customer = {
      id: customerId,
      warehouseId: currentUser.warehouseId,
      name: name.value,
      deactivatedAt: null,
      recordedByUserId: currentUser.userId,
      createdAt: recordedAt,
      updatedAt: recordedAt,
    };
    const mainDeliveryAddress = {
      id: this.recordCustomerRuntime.deliveryAddressId(),
      customerId,
      warehouseId: currentUser.warehouseId,
      addressText: addressText.value,
      accessNotes: accessNotes.value,
      isMain: true,
      deactivatedAt: null,
      createdAt: recordedAt,
      updatedAt: recordedAt,
    };

    await this.customerDirectoryRepository.recordCustomer({
      customer,
      mainDeliveryAddress,
    });

    return toCustomer(customer, [mainDeliveryAddress]);
  }
}
