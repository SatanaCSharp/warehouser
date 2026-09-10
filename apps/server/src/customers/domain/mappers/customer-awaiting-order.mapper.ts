import type { Customer } from 'customers/domain/mappers/customer.mapper';
import type { AwaitingCustomerOrderRead } from 'shared/domain/repositories/customer-awaiting-demand.repository';

// Where one Customer Order's goods are going — openapi.yaml `CustomerOrderDestination`. `isMain`
// and `deactivatedAt` report *why* it is this address (sad.md §6.6 step 6): the Customer's current
// Main one, one the member stated instead, or one that has since been made Inactive while the order
// keeps naming it and keeps counting exactly as before (AC-06a). Both are read live, never as they
// stood when the order was recorded.
export interface CustomerOrderDestination {
  readonly deliveryAddressId: string;
  readonly addressText: string;
  readonly accessNotes: string | null;
  readonly isMain: boolean;
  readonly deactivatedAt: Date | null;
}

// One Unfulfilled Customer Order of one Customer — openapi.yaml `CustomerAwaitingOrder`.
export interface CustomerAwaitingOrder {
  readonly customerOrderId: string;
  readonly itemId: string;
  readonly itemSku: string;
  readonly itemDescription: string;
  readonly unitOfMeasure: string;
  readonly outstandingQuantity: number;
  // `customer_orders.needed_by DATE` — a calendar date the repository casts to text, never an
  // instant a reader's time zone could shift.
  readonly neededBy: string;
  readonly destination: CustomerOrderDestination;
}

// openapi.yaml `CustomerDetail` — the Customer plus everything they are still waiting for (US-04).
export interface CustomerDetail extends Customer {
  readonly awaitingCustomerOrders: readonly CustomerAwaitingOrder[];
}

// creating-a-server-repository.md — the repository returns the read flat, because a repository
// returns persistence-oriented values only; the nesting the contract shows is the owning feature's
// work, above the repository boundary.
export const toCustomerAwaitingOrder = (
  read: AwaitingCustomerOrderRead,
): CustomerAwaitingOrder => ({
  customerOrderId: read.customerOrderId,
  itemId: read.itemId,
  itemSku: read.itemSku,
  itemDescription: read.itemDescription,
  unitOfMeasure: read.unitOfMeasure,
  outstandingQuantity: read.outstandingQuantity,
  neededBy: read.neededBy,
  destination: {
    deliveryAddressId: read.deliveryAddressId,
    addressText: read.addressText,
    accessNotes: read.accessNotes,
    isMain: read.addressIsMain,
    deactivatedAt: read.addressDeactivatedAt,
  },
});
