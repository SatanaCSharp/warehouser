import { Injectable } from '@nestjs/common';
import type { Customer } from 'customers/domain/mappers/customer.mapper';
import { toCustomer } from 'customers/domain/mappers/customer.mapper';
import groupBy from 'lodash/groupBy.js';
import map from 'lodash/map.js';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { CustomerAddressBookRepository } from 'shared/domain/repositories/customer-address-book.repository';
import type { ListCustomersFilter } from 'shared/domain/repositories/customer-directory.repository';
import { CustomerDirectoryRepository } from 'shared/domain/repositories/customer-directory.repository';

// `GET /api/v1/warehouses/{warehouseId}/customers` (openapi.yaml `listCustomers`) — every Customer
// of the acting Warehouse ordered by name, each with its Delivery Addresses and which of them is
// Main. `active=true` narrows it to the Customers a picker may still offer while demand is recorded
// (AC-06); without it the response carries active and Inactive alike, because a Customer Order
// already naming an Inactive Customer stays readable and keeps counting exactly as before.
//
// One query serves both readings rather than two: the picker read is this read with the filter set,
// returns the same projection from the same two repository calls, and openapi.yaml addresses both
// through one operation. A second query class would differ only in a boolean it does not choose.
//
// **Why the addresses rather than the count.** `CustomerDirectoryRepository.listCustomers` returns
// each Customer's `activeDeliveryAddressCount`, which sad.md §5 names as this query's shape; the
// shipped contract's list item is `Customer`, which carries the address rows. The contract wins,
// for two reasons that agree: the picker this same endpoint serves must offer "the active Customers
// **and addresses**" (sad.md §5), which a count cannot do, and a projection narrower than the
// schema the web validates against would be a contract violation on the very endpoint the count was
// meant to keep cheap. The cost stays bounded because the addresses arrive in **one** further read
// for the whole Warehouse rather than one per Customer, so the list is two round trips at any
// number of Customers. Nothing in the response is a count, so AC-09's "no count reaches a member
// lacking `CUSTOMERS:WATCH`" is not weakened either — this read requires that Permission outright.
@Injectable()
export class ListCustomersQuery {
  constructor(
    private readonly customerDirectoryRepository: CustomerDirectoryRepository,
    private readonly customerAddressBookRepository: CustomerAddressBookRepository,
  ) {}

  async execute(
    currentUser: AccessCurrentUser,
    filter: ListCustomersFilter = {},
  ): Promise<Customer[]> {
    const entries = await this.customerDirectoryRepository.listCustomers(
      currentUser.warehouseId,
      filter,
    );
    const addresses =
      await this.customerAddressBookRepository.listWarehouseDeliveryAddresses(
        currentUser.warehouseId,
      );
    const addressesByCustomer = groupBy(addresses, 'customerId');

    // A Customer with no address row at all is not a state AC-07 lets a member reach, and the
    // mapper already reads `mainDeliveryAddressId` as `null` for an empty set rather than refusing
    // it, so the read reports what is stored instead of failing on it.
    return map(entries, (entry) =>
      toCustomer(entry.customer, addressesByCustomer[entry.customer.id] ?? []),
    );
  }
}
