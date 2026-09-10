import { randomUUID } from 'node:crypto';

import { Injectable, Optional } from '@nestjs/common';
import type { Customer } from 'customers/domain/mappers/customer.mapper';
import { toCustomer } from 'customers/domain/mappers/customer.mapper';
import {
  assertCustomerWriteApplied,
  CustomerAddressBookService,
} from 'customers/domain/services/customer-address-book.service';
import { AccessNotes } from 'customers/domain/value-objects/access-notes';
import { DeliveryAddressText } from 'customers/domain/value-objects/delivery-address-text';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { CustomerAddressBookRepository } from 'shared/domain/repositories/customer-address-book.repository';

export interface AddCustomerDeliveryAddressRuntime {
  readonly deliveryAddressId: () => string;
  readonly now: () => Date;
}

const defaultAddCustomerDeliveryAddressRuntime: AddCustomerDeliveryAddressRuntime =
  {
    deliveryAddressId: randomUUID,
    now: () => new Date(),
  };

// openapi.yaml `CustomerDeliveryAddressCreate`. `main` is the contract's own `default: false`,
// supplied by the request schema, so an address arrives ordinary unless the member says otherwise.
export interface AddCustomerDeliveryAddressInput {
  readonly addressText: string;
  readonly accessNotes: string | null;
  readonly main: boolean;
}

// AC-04/AC-05/AC-12 — a further Delivery Address for a Customer that already has one, with its
// access notes, optionally as the Main one.
//
// The two writes are ordered rather than combined: the row is inserted **ordinary** and
// `setMainDeliveryAddress` moves the flag afterwards, so `uq_customer_delivery_addresses_customer_
// main` is never asked to hold two Main rows at once. Both run inside this command's transaction,
// which is what makes "the second one Main and the first one no longer" one change (AC-04).
@Injectable()
export class AddCustomerDeliveryAddressCommand {
  constructor(
    private readonly customerAddressBookRepository: CustomerAddressBookRepository,
    private readonly customerAddressBookService: CustomerAddressBookService,
    @Optional()
    private readonly addCustomerDeliveryAddressRuntime: AddCustomerDeliveryAddressRuntime = defaultAddCustomerDeliveryAddressRuntime,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    customerId: string,
    input: AddCustomerDeliveryAddressInput,
  ): Promise<Customer> {
    // AC-12 — the Customer resolves in the acting Warehouse or it does not resolve at all, so an
    // address is never recorded against a Customer of another Warehouse and the refusal cannot be
    // told from the one a missing Customer raises.
    const customer = await this.customerAddressBookService.resolveCustomer(
      customerId,
      currentUser.warehouseId,
    );

    // AC-02 — decided before persistence is consulted. The field name is the one the address-book
    // submission actually carries, which is what the web application highlights.
    const addressText = DeliveryAddressText.create(
      input.addressText,
      'addressText',
    );
    const accessNotes = AccessNotes.create(input.accessNotes);

    const addedAt = this.addCustomerDeliveryAddressRuntime.now();
    const address = {
      id: this.addCustomerDeliveryAddressRuntime.deliveryAddressId(),
      customerId,
      warehouseId: currentUser.warehouseId,
      addressText: addressText.value,
      accessNotes: accessNotes.value,
      isMain: false,
      deactivatedAt: null,
      createdAt: addedAt,
      updatedAt: addedAt,
    };

    await this.customerAddressBookRepository.addDeliveryAddress(address);

    if (input.main) {
      const outcome =
        await this.customerAddressBookRepository.setMainDeliveryAddress(
          address.id,
          customerId,
          addedAt,
        );

      assertCustomerWriteApplied(outcome);
    }

    // Read back rather than assembled: the promotion moved the flag on a row this command never
    // held, so the Customer's addresses are what the address book now says they are.
    const deliveryAddresses =
      await this.customerAddressBookRepository.listDeliveryAddresses(
        customerId,
      );

    return toCustomer(customer, deliveryAddresses);
  }
}
