import { Injectable } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import { customerOrderInvalidDeliveryAddressError } from 'customer-orders/domain/errors/customer-order.errors';
import { isAvailableDestinationRecord } from 'customer-orders/domain/predicates/customer-order.predicates';
import { find } from 'lodash';
import { CustomerAddressBookRepository } from 'shared/domain/repositories/customer-address-book.repository';

// AC-11/AC-11c — the address resolved for a Customer Order is one the Customer holds and one a
// member may still choose. A missing address, an address of another Customer and an Inactive one
// are the one non-enumerating outcome `CustomerOrderDestinationConflict` names.
//
// Annotated on the binding rather than the arrow, which is what TypeScript requires of an assertion
// function's call target (TS2775) and the shape `customers/domain/services/` already uses. The
// narrowing is the point: a caller that resolved the address keeps a defined reference.
type AssertDestinationAvailable = <T extends { deactivatedAt: Date | null }>(
  address: T | null | undefined,
) => asserts address is T;

export const assertDestinationAvailable: AssertDestinationAvailable = (
  address,
) => {
  assert(
    isAvailableDestinationRecord(address),
    customerOrderInvalidDeliveryAddressError(),
  );
};

// AC-11/AC-11c — where a Customer Order is going: an **active** Delivery Address of the Customer it
// names. Recording and redirecting decide the same condition over the same set, which is the
// extraction trigger server-architecture.md §Services names — "more than one use case needs the
// same operation" — and the collaborator it needs is a repository, so it is an injectable service
// rather than a function threaded with the repository as an argument.
//
// It opens no transaction of its own. It runs inside the boundary the calling command declares,
// which is what makes the redirection's read of the address book part of the same transaction as
// the `FOR UPDATE` read of the Customer Order (sad.md §6.5).
//
// Registered on `CustomerOrdersUsecaseModule` and not exported: nothing outside `customer-orders`
// calls it.
@Injectable()
export class CustomerOrderDestinationService {
  constructor(
    private readonly customerAddressBookRepository: CustomerAddressBookRepository,
  ) {}

  /** The address this order is recorded against: the stated one, or the Customer's Main one when
   * none is stated (AC-11). Resolved and returned as a reference **at record time**, so marking a
   * different address Main afterwards moves no existing order (sad.md §6.5 persist note).
   *
   * The read is scoped to the one Customer, so an address of another Customer — and therefore of
   * another Warehouse, since an address belongs to a Customer and a Customer to a Warehouse — is
   * not in the set at all and is refused exactly as a missing one is (AC-11c, AC-12). The composite
   * reference `fk_customer_orders_delivery_address (id, customer_id)` proves the same thing
   * structurally on the write, so no second ownership comparison is made here.
   */
  async resolveDestination(
    customerId: string,
    statedDeliveryAddressId: string | null,
  ): Promise<string> {
    const addresses =
      await this.customerAddressBookRepository.listDeliveryAddresses(
        customerId,
      );

    const destination =
      statedDeliveryAddressId === null
        ? find(
            addresses,
            (address) =>
              address.isMain && isAvailableDestinationRecord(address),
          )
        : find(addresses, (address) => address.id === statedDeliveryAddressId);

    assertDestinationAvailable(destination);

    return destination.id;
  }
}
