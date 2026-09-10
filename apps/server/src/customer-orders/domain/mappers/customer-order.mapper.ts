import type {
  CustomerOrderEntity,
  CustomerOrderState,
} from 'shared/domain/entities/customer-order.entity';

// The Customer Order as the application boundary returns it — openapi.yaml `CustomerOrder`. It
// carries no `warehouseId`: the Warehouse is the request's, never a field the caller reads back.
export interface CustomerOrder {
  readonly id: string;
  readonly itemId: string;
  // The Customer this demand names and the one of that Customer's Delivery Addresses it is going
  // to, or `null` on both when the order was recorded by typing a customer name (AC-11, AC-11a).
  // `chk_customer_orders_customer_identity` admits exactly those two shapes, which is why the three
  // fields below are never nullable independently of one another.
  readonly customerId: string | null;
  readonly customerDeliveryAddressId: string | null;
  readonly customerName: string | null;
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

// creating-a-server-repository.md — conversion between the shared persistence entity and the
// feature's own object lives in the owning feature's `domain/mappers/`, invoked above the
// repository boundary, never inside it.
export const toCustomerOrder = (
  entity: CustomerOrderEntity,
): CustomerOrder => ({
  id: entity.id,
  itemId: entity.itemId,
  customerId: entity.customerId,
  customerDeliveryAddressId: entity.customerDeliveryAddressId,
  // `customer_name` is nullable because an order naming a Customer reads that name live from
  // `customers` and carries none of its own (AC-11a) — which is what makes correcting a Customer's
  // name change every order that names it without rewriting a row (AC-03b). The value travels
  // through unchanged, `null` included; nothing narrows it here.
  customerName: entity.customerName,
  quantity: entity.quantity,
  outstandingQuantity: entity.outstandingQuantity,
  neededBy: entity.neededBy,
  state: entity.state,
  cancellationReason: entity.cancellationReason,
  recordedByUserId: entity.recordedByUserId,
  cancelledByUserId: entity.cancelledByUserId,
  cancelledAt: entity.cancelledAt,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
});
