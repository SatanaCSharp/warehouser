import type { CustomerOrder } from '@warehouser/contracts/customer-orders';
import type {
  CustomerOrderProjection,
  IdentifiedCustomerOrder,
  RedactedCustomerOrder,
} from 'customer-orders/domain/mappers/customer-order-projection.mapper';
import { identifiesCustomer } from 'customer-orders/domain/mappers/customer-order-projection.mapper';

// openapi.yaml `CustomerOrder` — the transport form of the projection, in the two shapes the
// contract models as `oneOf` (AC-09a, ADR 0001).
//
// The application boundary returns instants as `Date`; the contract carries them as date-times.
// `neededBy` is already a calendar date and is passed through untouched.
//
// Every property is named rather than spread, for the reason `DemandController` gives: a spread
// satisfies the contract type without excess-property checking, so a field later added to the
// projection would reach the wire even though both forms of openapi.yaml `CustomerOrder` are
// `additionalProperties: false`. Here that also carries the confidentiality boundary — the redacted
// branch below cannot name `customer`, `customerName` or `destination`, because
// `RedactedCustomerOrder` has no such property to read.

const toRedactedResponse = (order: RedactedCustomerOrder) => ({
  id: order.id,
  itemId: order.itemId,
  quantity: order.quantity,
  outstandingQuantity: order.outstandingQuantity,
  neededBy: order.neededBy,
  state: order.state,
  cancellationReason: order.cancellationReason,
  recordedByUserId: order.recordedByUserId,
  cancelledByUserId: order.cancelledByUserId,
  cancelledAt: order.cancelledAt?.toISOString() ?? null,
  createdAt: order.createdAt.toISOString(),
  updatedAt: order.updatedAt.toISOString(),
});

// AC-11/AC-11a/AC-24 — an order naming a Customer carries `customerName: null` and reads that name
// live through `customer`; one recorded by typing a name carries `customer: null` and **no**
// destination, and that absence is what tells the member which kind of row they are looking at.
const toIdentifiedResponse = (order: IdentifiedCustomerOrder) => ({
  ...toRedactedResponse(order),
  customer: order.customer,
  customerName: order.customerName,
  destination:
    order.destination === null
      ? null
      : {
          deliveryAddressId: order.destination.deliveryAddressId,
          addressText: order.destination.addressText,
          accessNotes: order.destination.accessNotes,
          isMain: order.destination.isMain,
          deactivatedAt: order.destination.deactivatedAt?.toISOString() ?? null,
        },
});

export const toCustomerOrderResponse = (
  order: CustomerOrderProjection,
): CustomerOrder =>
  identifiesCustomer(order)
    ? toIdentifiedResponse(order)
    : toRedactedResponse(order);
