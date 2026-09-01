import type {
  CustomerOrderEntity,
  CustomerOrderState,
} from 'shared/domain/entities/customer-order.entity';

// The Customer Order as the application boundary returns it — openapi.yaml `CustomerOrder`. It
// carries no `warehouseId`: the Warehouse is the request's, never a field the caller reads back.
export interface CustomerOrder {
  readonly id: string;
  readonly itemId: string;
  readonly customerName: string;
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
