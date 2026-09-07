import type { CustomerOrderState } from 'shared/domain/entities/customer-order.entity';
import type {
  IdentifiedCustomerOrderRead,
  RedactedCustomerOrderRead,
} from 'shared/domain/repositories/customer-order-lifecycle.repository';

// The Customer Order as the application boundary projects it — openapi.yaml `CustomerOrder`, in its
// two deliberately modelled forms (AC-09a, ADR 0001).
//
// The redacted form is not the identified one with three fields set to `null`: the properties are
// **absent**, which is what makes a redaction failure a contract violation on the way out rather
// than something a screen has to remember not to render (sad.md §7). TypeScript enforces the same
// thing here — `RedactedCustomerOrder` has no `customer` property to assign, so a mapping that
// meant to withhold identity cannot carry it by accident.

// openapi.yaml `CustomerOrderDestination` — where one order's goods are going, read live from the
// Delivery Address it names, with `isMain` and `deactivatedAt` reporting *why* it is that address
// (AC-06a, sad.md §6.6 step 6).
export interface CustomerOrderDestinationProjection {
  readonly deliveryAddressId: string;
  readonly addressText: string;
  readonly accessNotes: string | null;
  readonly isMain: boolean;
  readonly deactivatedAt: Date | null;
}

// openapi.yaml `CustomerRef` — the Customer by identifier and current name (AC-03b).
export interface CustomerRefProjection {
  readonly id: string;
  readonly name: string;
}

export interface RedactedCustomerOrder {
  readonly id: string;
  readonly itemId: string;
  readonly quantity: number;
  readonly outstandingQuantity: number;
  readonly neededBy: string;
  readonly state: CustomerOrderState;
  readonly cancellationReason: string | null;
  readonly recordedByUserId: string;
  readonly cancelledByUserId: string | null;
  readonly cancelledAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface IdentifiedCustomerOrder extends RedactedCustomerOrder {
  // Exactly one of the two is non-null: an order names a Customer and reads its name live, or it
  // carries a typed name and names no Customer at all (AC-11a, AC-24).
  readonly customer: CustomerRefProjection | null;
  readonly customerName: string | null;
  // `null` exactly when `customer` is — a typed-name order names no address, and that absence is
  // what tells the member which kind of row they are looking at (AC-24).
  readonly destination: CustomerOrderDestinationProjection | null;
}

export type CustomerOrderProjection =
  IdentifiedCustomerOrder | RedactedCustomerOrder;

/** Whether this projection carries customer identity — the one discriminator, so no caller tests
 * for a property name of its own. */
export const identifiesCustomer = (
  projection: CustomerOrderProjection,
): projection is IdentifiedCustomerOrder => 'customer' in projection;

// Every property is named explicitly rather than spread from the row. A spread satisfies the type
// without excess-property checking, so an identity column added to the read later would travel
// straight through this mapper into a redacted response.
export const toRedactedCustomerOrder = (
  row: RedactedCustomerOrderRead,
): RedactedCustomerOrder => ({
  id: row.id,
  itemId: row.itemId,
  quantity: row.quantity,
  outstandingQuantity: row.outstandingQuantity,
  neededBy: row.neededBy,
  state: row.state,
  cancellationReason: row.cancellationReason,
  recordedByUserId: row.recordedByUserId,
  cancelledByUserId: row.cancelledByUserId,
  cancelledAt: row.cancelledAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toIdentifiedCustomerOrder = (
  row: IdentifiedCustomerOrderRead,
): IdentifiedCustomerOrder => ({
  ...toRedactedCustomerOrder(row),
  customer:
    row.customerId === null || row.customerCurrentName === null
      ? null
      : { id: row.customerId, name: row.customerCurrentName },
  customerName: row.typedCustomerName,
  destination:
    row.deliveryAddressId === null || row.addressText === null
      ? null
      : {
          deliveryAddressId: row.deliveryAddressId,
          addressText: row.addressText,
          accessNotes: row.accessNotes,
          isMain: row.isMain === true,
          deactivatedAt: row.deactivatedAt,
        },
});
