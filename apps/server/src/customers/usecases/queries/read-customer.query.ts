import { Injectable } from '@nestjs/common';
import { toCustomer } from 'customers/domain/mappers/customer.mapper';
import type { CustomerDetail } from 'customers/domain/mappers/customer-awaiting-order.mapper';
import { toCustomerAwaitingOrder } from 'customers/domain/mappers/customer-awaiting-order.mapper';
import { CustomerAddressBookService } from 'customers/domain/services/customer-address-book.service';
import map from 'lodash/map.js';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { CustomerAddressBookRepository } from 'shared/domain/repositories/customer-address-book.repository';
import { CustomerAwaitingDemandRepository } from 'shared/domain/repositories/customer-awaiting-demand.repository';

// `GET /api/v1/warehouses/{warehouseId}/customers/{customerId}` (openapi.yaml `readCustomer`) —
// the Customer, its Delivery Addresses, and every **Unfulfilled** Customer Order of that Customer
// with its Item, Outstanding Quantity, needed-by date and the address it is going to; Fulfilled and
// cancelled orders are omitted (AC-08, sad.md §6.6 steps 5 to 6).
//
// The Customer is resolved in the acting Warehouse **first**, so a Customer of another Warehouse is
// refused exactly as a missing one is and its addresses and demand are never read at all (AC-12).
// That refusal is the shared non-enumerating `customers.target_unavailable`, raised by the same
// service every command resolves through, which is what makes the two indistinguishable rather than
// merely similar.
@Injectable()
export class ReadCustomerQuery {
  constructor(
    private readonly customerAddressBookService: CustomerAddressBookService,
    private readonly customerAddressBookRepository: CustomerAddressBookRepository,
    private readonly customerAwaitingDemandRepository: CustomerAwaitingDemandRepository,
  ) {}

  async execute(
    currentUser: AccessCurrentUser,
    customerId: string,
  ): Promise<CustomerDetail> {
    const customer = await this.customerAddressBookService.resolveCustomer(
      customerId,
      currentUser.warehouseId,
    );
    const addresses =
      await this.customerAddressBookRepository.listDeliveryAddresses(
        customerId,
      );
    const awaiting =
      await this.customerAwaitingDemandRepository.readAwaitingCustomerOrders(
        customerId,
      );

    return {
      ...toCustomer(customer, addresses),
      awaitingCustomerOrders: map(awaiting, toCustomerAwaitingOrder),
    };
  }
}
