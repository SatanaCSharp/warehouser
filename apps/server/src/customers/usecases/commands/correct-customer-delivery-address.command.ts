import { Injectable, Optional } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import { customerTargetUnavailableError } from 'customers/domain/errors/customer.errors';
import type { Customer } from 'customers/domain/mappers/customer.mapper';
import { toCustomer } from 'customers/domain/mappers/customer.mapper';
import {
  assertCustomerWriteApplied,
  CustomerAddressBookService,
} from 'customers/domain/services/customer-address-book.service';
import { AccessNotes } from 'customers/domain/value-objects/access-notes';
import { DeliveryAddressText } from 'customers/domain/value-objects/delivery-address-text';
import { find, map } from 'lodash';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { CustomerAddressBookRepository } from 'shared/domain/repositories/customer-address-book.repository';

export interface CorrectCustomerDeliveryAddressRuntime {
  readonly now: () => Date;
}

const defaultCorrectCustomerDeliveryAddressRuntime: CorrectCustomerDeliveryAddressRuntime =
  {
    now: () => new Date(),
  };

// openapi.yaml `CustomerDeliveryAddressUpdate` — "both properties are optional; at least one must
// be present. `accessNotes: null` clears them". So `undefined` is "not submitted" and keeps the
// stored value, while `null` is a submitted clearing; the two are deliberately distinguishable.
export interface CorrectCustomerDeliveryAddressInput {
  readonly addressText?: string;
  readonly accessNotes?: string | null;
}

// AC-12 / sad.md §4 — corrects a Delivery Address **in place**, which is the point of holding it by
// reference: every Customer Order and every live Purchase Draft Line naming it follows the
// correction, and a frozen line does not, because it holds captured text and no reference at all.
//
// An Inactive address is corrected too. openapi.yaml `correctCustomerDeliveryAddress` documents no
// `CustomerDeliveryAddressConflict`, and it should not: fixing a typo on an address a Customer
// Order still names is worth doing whether or not the address is still offered.
@Injectable()
export class CorrectCustomerDeliveryAddressCommand {
  constructor(
    private readonly customerAddressBookRepository: CustomerAddressBookRepository,
    private readonly customerAddressBookService: CustomerAddressBookService,
    @Optional()
    private readonly correctCustomerDeliveryAddressRuntime: CorrectCustomerDeliveryAddressRuntime = defaultCorrectCustomerDeliveryAddressRuntime,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    customerId: string,
    deliveryAddressId: string,
    input: CorrectCustomerDeliveryAddressInput,
  ): Promise<Customer> {
    const customer = await this.customerAddressBookService.resolveCustomer(
      customerId,
      currentUser.warehouseId,
    );

    // AC-12 — the read is scoped to this Customer, so an address of another Customer is simply not
    // in the set, exactly as a missing one is not: the refusal below cannot tell them apart because
    // it never saw either (spec.md §6.1 abuse cases).
    const addresses =
      await this.customerAddressBookRepository.listDeliveryAddresses(
        customerId,
      );
    const address =
      find(addresses, (candidate) => candidate.id === deliveryAddressId) ??
      null;

    assert(address !== null, customerTargetUnavailableError());

    // AC-02 — an omitted property keeps what is stored; a submitted one is decided before
    // persistence is consulted and never echoed back in a refusal (sad.md §8).
    const addressText =
      input.addressText === undefined
        ? address.addressText
        : DeliveryAddressText.create(input.addressText, 'addressText').value;
    const accessNotes =
      input.accessNotes === undefined
        ? address.accessNotes
        : AccessNotes.create(input.accessNotes).value;

    const revisedAt = this.correctCustomerDeliveryAddressRuntime.now();
    const outcome =
      await this.customerAddressBookRepository.reviseDeliveryAddress(
        deliveryAddressId,
        customerId,
        { addressText, accessNotes, revisedAt },
      );

    assertCustomerWriteApplied(outcome);

    // The correction touches one row and moves no flag, so the set already read is the set as it
    // now stands with that row's two corrected values in it.
    return toCustomer(
      customer,
      map(addresses, (candidate) =>
        candidate.id === deliveryAddressId
          ? { ...candidate, addressText, accessNotes, updatedAt: revisedAt }
          : candidate,
      ),
    );
  }
}
