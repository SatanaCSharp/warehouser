import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { ArrivalAllocationEntity } from 'shared/domain/entities/arrival-allocation.entity';
import type { CustomerOrderState } from 'shared/domain/entities/customer-order.entity';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { DataSource } from 'typeorm';

export interface CreateCustomerOrderPersistenceInput {
  readonly id: string;
  readonly warehouseId: string;
  readonly itemId: string;
  readonly customerName: string;
  readonly quantity: number;
  readonly outstandingQuantity: number;
  readonly neededBy: string;
  readonly state: CustomerOrderState;
  readonly recordedByUserId: string;
  readonly recordedAt: Date;
}

export interface AmendCustomerOrderPersistenceInput {
  readonly quantity: number;
  readonly outstandingQuantity: number;
  readonly neededBy: string;
  readonly state: CustomerOrderState;
  readonly amendedAt: Date;
}

export interface CancelCustomerOrderPersistenceInput {
  readonly cancellationReason: string;
  readonly cancelledByUserId: string;
  readonly cancelledAt: Date;
}

export interface LockedCustomerOrderRead {
  readonly order: CustomerOrderEntity;
  readonly allocatedQuantity: number;
}

export interface ListCustomerOrdersFilter {
  readonly itemId?: string;
  readonly state?: CustomerOrderState;
}

/** Which of the two orderings `listCustomerOrders` returns. `creation` is the default the picker
 * and the Demand sub-rows have always read (`idx_customer_orders_warehouse_created`); `needed_by`
 * is the order `GET /customer-orders` promises — "ordered by needed-by date then creation time"
 * (contracts/openapi.yaml `listCustomerOrders`). Both break ties on `id`, so neither can return two
 * equal rows in a different order between reads. */
export type CustomerOrderListOrder = 'creation' | 'needed_by';

// AC-01/AC-19/AC-19a/AC-19b — the Customer Order write path. Its reason for existing as one
// repository rather than a table-shaped one is `lockOrderWithAllocatedTotal`: `sad.md` §6.10
// requires the row to be locked and the total already allocated to it to be read **in the same
// transaction**, and `sad.md` §8 requires the AC-19b floor to be decided against that locked value
// rather than against what the member composed against. Splitting the lock from the sum would make
// the floor decidable against a value another member is already changing, so the two are one query
// and one public method — creating-a-server-repository.md, "Prefer one purpose-built query".
@Injectable()
export class CustomerOrderLifecycleRepository {
  constructor(private readonly dataSource: DataSource) {}

  // AC-01 — the order is written Unfulfilled with its Outstanding Quantity equal to the quantity
  // recorded, plus the member who recorded it and when. Cross-Warehouse demand is refused by
  // `fk_customer_orders_item`'s composite `(item_id, warehouse_id)` reference rather than by a
  // check this method repeats (AC-03).
  async createCustomerOrder(
    input: CreateCustomerOrderPersistenceInput,
  ): Promise<CustomerOrderEntity> {
    const manager = getEntityManager(this.dataSource);
    const row: CustomerOrderEntity = {
      id: input.id,
      warehouseId: input.warehouseId,
      itemId: input.itemId,
      customerName: input.customerName,
      quantity: input.quantity,
      outstandingQuantity: input.outstandingQuantity,
      neededBy: input.neededBy,
      state: input.state,
      cancellationReason: null,
      recordedByUserId: input.recordedByUserId,
      cancelledByUserId: null,
      cancelledAt: null,
      createdAt: input.recordedAt,
      updatedAt: input.recordedAt,
    };

    await manager.getRepository(CustomerOrderEntity).insert(row);

    return row;
  }

  // sad.md §6.10 — "locks the Customer Order and reads the total already allocated to it in the
  // same transaction". One round trip: the sum is a correlated subquery in the outer `SELECT`, so
  // `FOR UPDATE` still applies to `customer_orders` alone and the lock and the floor cannot come
  // from two different moments. `COALESCE` makes an order nothing has arrived for report a floor of
  // `0` rather than `null`, which is what keeps AC-19b's comparison evaluable. Scoped to the acting
  // Warehouse, so an order of another Warehouse resolves to nothing exactly as a missing one does.
  async lockOrderWithAllocatedTotal(
    customerOrderId: string,
    warehouseId: string,
  ): Promise<LockedCustomerOrderRead | null> {
    const manager = getEntityManager(this.dataSource);

    const allocatedTotal = manager
      .createQueryBuilder()
      .select('COALESCE(SUM(allocation.allocatedQuantity), 0)')
      .from(ArrivalAllocationEntity, 'allocation')
      .where('allocation.customerOrderId = demand.id')
      .getQuery();

    const found = await manager
      .getRepository(CustomerOrderEntity)
      .createQueryBuilder('demand')
      .addSelect(`(${allocatedTotal})`, 'allocatedQuantity')
      .where('demand.id = :customerOrderId', { customerOrderId })
      .andWhere('demand.warehouseId = :warehouseId', { warehouseId })
      .setLock('pessimistic_write')
      .getRawAndEntities();

    const [order] = found.entities;
    if (order === undefined) {
      return null;
    }

    // PostgreSQL returns `SUM` over `bigint` as a string, so the figure is normalized here rather
    // than left for every caller to remember.
    const [rawRow] = found.raw as Array<{
      allocatedQuantity: string | number;
    }>;

    return {
      order,
      allocatedQuantity: Number(rawRow?.allocatedQuantity ?? 0),
    };
  }

  // AC-19 — the quantity, the recalculated Outstanding Quantity, the needed-by date and the
  // resulting state move together, so `chk_customer_orders_state_outstanding` never sees a
  // half-applied change. Only ever called on a row this transaction already locked.
  async amendCustomerOrder(
    customerOrderId: string,
    changes: AmendCustomerOrderPersistenceInput,
  ): Promise<CustomerOrderEntity> {
    const manager = getEntityManager(this.dataSource);

    await manager.getRepository(CustomerOrderEntity).update(
      { id: customerOrderId },
      {
        quantity: changes.quantity,
        outstandingQuantity: changes.outstandingQuantity,
        neededBy: changes.neededBy,
        state: changes.state,
        updatedAt: changes.amendedAt,
      },
    );

    return manager
      .getRepository(CustomerOrderEntity)
      .findOneByOrFail({ id: customerOrderId });
  }

  // AC-19a / `chk_customer_orders_cancellation_attribution` — "the reason, the member and the time
  // arrive together or not at all", so one write carries all three. What the order asked for is
  // left standing: cancellation removes it from the demand without rewriting its quantity.
  async cancelCustomerOrder(
    customerOrderId: string,
    cancellation: CancelCustomerOrderPersistenceInput,
  ): Promise<CustomerOrderEntity> {
    const manager = getEntityManager(this.dataSource);

    await manager.getRepository(CustomerOrderEntity).update(
      { id: customerOrderId },
      {
        state: 'cancelled',
        cancellationReason: cancellation.cancellationReason,
        cancelledByUserId: cancellation.cancelledByUserId,
        cancelledAt: cancellation.cancelledAt,
        updatedAt: cancellation.cancelledAt,
      },
    );

    return manager
      .getRepository(CustomerOrderEntity)
      .findOneByOrFail({ id: customerOrderId });
  }

  // `GET /customer-orders?itemId=…&state=…` (openapi.yaml) — the acting Warehouse's Customer
  // Orders, optionally narrowed to one Item and/or one state. `idx_customer_orders_warehouse_created`
  // returns them deterministically ordered (data-model.md "Indexes"). `order` defaults to the
  // creation ordering the Demand sub-rows and the draft picker already read, so the endpoint that
  // needs openapi.yaml's needed-by ordering asks for it explicitly rather than changing what those
  // two callers see.
  listCustomerOrders(
    warehouseId: string,
    filter: ListCustomerOrdersFilter = {},
    order: CustomerOrderListOrder = 'creation',
  ): Promise<CustomerOrderEntity[]> {
    const manager = getEntityManager(this.dataSource);

    const queryBuilder = manager
      .getRepository(CustomerOrderEntity)
      .createQueryBuilder('order')
      .where('order.warehouseId = :warehouseId', { warehouseId });

    if (order === 'needed_by') {
      queryBuilder.orderBy('order.neededBy', 'ASC');
    }

    queryBuilder
      .addOrderBy('order.createdAt', 'ASC')
      .addOrderBy('order.id', 'ASC');

    if (filter.itemId !== undefined) {
      queryBuilder.andWhere('order.itemId = :itemId', {
        itemId: filter.itemId,
      });
    }

    if (filter.state !== undefined) {
      queryBuilder.andWhere('order.state = :state', { state: filter.state });
    }

    return queryBuilder.getMany();
  }
}
