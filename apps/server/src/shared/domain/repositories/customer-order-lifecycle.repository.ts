import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { ArrivalAllocationEntity } from 'shared/domain/entities/arrival-allocation.entity';
import { CustomerEntity } from 'shared/domain/entities/customer.entity';
import { CustomerDeliveryAddressEntity } from 'shared/domain/entities/customer-delivery-address.entity';
import type { CustomerOrderState } from 'shared/domain/entities/customer-order.entity';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import type { EntityManager, SelectQueryBuilder } from 'typeorm';
import { DataSource } from 'typeorm';

export interface CreateCustomerOrderPersistenceInput {
  readonly id: string;
  readonly warehouseId: string;
  readonly itemId: string;
  // The two destination shapes `chk_customer_orders_customer_identity` admits, carried as the
  // persistence-oriented values they are: a Customer with one of its Delivery Addresses and no
  // typed name, or a typed name with neither (AC-11, AC-11a). Which of them a caller supplies is a
  // decision above this boundary.
  readonly customerId: string | null;
  readonly customerDeliveryAddressId: string | null;
  readonly customerName: string | null;
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
  // The one order a mutation just wrote, read back through the same projection the list serves
  // (openapi.yaml `recordCustomerOrder`, `amendCustomerOrder`, `redirectCustomerOrder`).
  readonly customerOrderId?: string;
}

/** One Customer Order as an actor **without** `CUSTOMERS:WATCH` may read it — everything
 * `CUSTOMER_ORDERS:WATCH` alone admits and not one identity column more (AC-09a, ADR 0001).
 *
 * The two reads below are separate methods rather than one method with a flag precisely so that
 * this shape can be produced by a statement that never names `customer_id`, `customer_name` or
 * `customer_delivery_address_id` at all: the withheld values are not selected, not selected and
 * dropped (server-request-authorization.md § "Consume the observed set"). */
export interface RedactedCustomerOrderRead {
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

/** The same order with the customer identity an actor holding `CUSTOMERS:WATCH` may read: the
 * Customer's **live** name joined from `customers`, the typed name column for an order that names
 * no Customer, and the Delivery Address the order is going to joined from
 * `customer_delivery_addresses` (AC-11, AC-11a, AC-24).
 *
 * Persistence-oriented values only — flat columns, no feature object. Assembling `customer` and
 * `destination` from them is the owning feature's mapper's work, above this boundary
 * (creating-a-server-repository.md). */
export interface IdentifiedCustomerOrderRead extends RedactedCustomerOrderRead {
  readonly customerId: string | null;
  readonly customerCurrentName: string | null;
  readonly typedCustomerName: string | null;
  readonly deliveryAddressId: string | null;
  readonly addressText: string | null;
  readonly accessNotes: string | null;
  readonly isMain: boolean | null;
  readonly deactivatedAt: Date | null;
}

/** Which of the two orderings `listCustomerOrders` returns. `creation` is the default the picker
 * and the Demand sub-rows have always read (`idx_customer_orders_warehouse_created`); `needed_by`
 * is the order `GET /customer-orders` promises — "ordered by needed-by date then creation time"
 * (contracts/openapi.yaml `listCustomerOrders`). Both break ties on `id`, so neither can return two
 * equal rows in a different order between reads. */
export type CustomerOrderListOrder = 'creation' | 'needed_by';

/** The narrowing, the ordering and the non-identity columns both projection reads share.
 *
 * A module-level function rather than a method, because a repository class carries no private
 * method (creating-a-server-repository.md) and because the alternative — writing the twelve common
 * `addSelect`s twice — is how the redacted statement acquires a thirteenth by a copy-paste nobody
 * reviews. Each public read adds only what distinguishes it: the identified one its two joins and
 * their columns, the redacted one nothing at all.
 *
 * `needed_by` is a `DATE` and is cast to text in the projection, because a raw select returns what
 * the driver parses rather than what TypeORM's entity hydration would produce — the same reason
 * `ConsolidatedDemandRepository` writes `MIN(demand.neededBy)::text`. `CAST(… AS text)` rather than
 * `::text`, because TypeORM rewrites `alias.property` only where a delimiter follows it, and the
 * alias is `demand` rather than `order` because an unrewritten `order.` is a reserved word that
 * makes the whole statement a syntax error rather than a wrong column. */
const customerOrderProjection = (
  manager: EntityManager,
  warehouseId: string,
  filter: ListCustomerOrdersFilter,
  order: CustomerOrderListOrder,
): SelectQueryBuilder<CustomerOrderEntity> => {
  const queryBuilder = manager
    .getRepository(CustomerOrderEntity)
    .createQueryBuilder('demand')
    .select('demand.id', 'id')
    .addSelect('demand.itemId', 'itemId')
    .addSelect('demand.quantity', 'quantity')
    .addSelect('demand.outstandingQuantity', 'outstandingQuantity')
    .addSelect('CAST(demand.neededBy AS text)', 'neededBy')
    .addSelect('demand.state', 'state')
    .addSelect('demand.cancellationReason', 'cancellationReason')
    .addSelect('demand.recordedByUserId', 'recordedByUserId')
    .addSelect('demand.cancelledByUserId', 'cancelledByUserId')
    .addSelect('demand.cancelledAt', 'cancelledAt')
    .addSelect('demand.createdAt', 'createdAt')
    .addSelect('demand.updatedAt', 'updatedAt')
    .where('demand.warehouseId = :warehouseId', { warehouseId });

  if (order === 'needed_by') {
    queryBuilder.orderBy('demand.neededBy', 'ASC');
  }

  queryBuilder
    .addOrderBy('demand.createdAt', 'ASC')
    .addOrderBy('demand.id', 'ASC');

  if (filter.customerOrderId !== undefined) {
    queryBuilder.andWhere('demand.id = :customerOrderId', {
      customerOrderId: filter.customerOrderId,
    });
  }

  if (filter.itemId !== undefined) {
    queryBuilder.andWhere('demand.itemId = :itemId', { itemId: filter.itemId });
  }

  if (filter.state !== undefined) {
    queryBuilder.andWhere('demand.state = :state', { state: filter.state });
  }

  return queryBuilder;
};

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
      customerId: input.customerId,
      customerDeliveryAddressId: input.customerDeliveryAddressId,
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

  // AC-11b — the redirection writes **one column on one Customer Order** and nothing else, so no
  // frozen column of any Purchase Draft can appear in the statement it issues (AC-17, sad.md §8).
  // The Address Drift it causes is derived on the next read of the affected drafts and is never
  // written here.
  //
  // Only ever called on a row `lockOrderWithAllocatedTotal` locked in this same transaction, which
  // is what makes the eligibility decision belong to the locked row rather than to the values the
  // member composed against. The criteria carry the Customer the order names as well as its
  // identifier, so the statement can never name a row whose Customer is not the one the destination
  // was resolved against; `fk_customer_orders_delivery_address (id, customer_id)` is the structural
  // backstop for the same rule (AC-11c).
  async redirectCustomerOrder(
    customerOrderId: string,
    customerId: string,
    customerDeliveryAddressId: string,
    redirectedAt: Date,
  ): Promise<CustomerOrderEntity> {
    const manager = getEntityManager(this.dataSource);

    await manager
      .getRepository(CustomerOrderEntity)
      .update(
        { id: customerOrderId, customerId },
        { customerDeliveryAddressId, updatedAt: redirectedAt },
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

  // AC-09a — the read an actor **without** `CUSTOMERS:WATCH` is served. The statement it issues
  // names no identity column, so there is no customer name, no address, no access note and no
  // reference to either anywhere in the result set: the withholding is a property of the SQL rather
  // than of a mapping downstream of it (server-request-authorization.md § "Consume the observed
  // set", ADR 0001).
  listRedactedCustomerOrders(
    warehouseId: string,
    filter: ListCustomerOrdersFilter = {},
    order: CustomerOrderListOrder = 'creation',
  ): Promise<RedactedCustomerOrderRead[]> {
    return customerOrderProjection(
      getEntityManager(this.dataSource),
      warehouseId,
      filter,
      order,
    ).getRawMany<RedactedCustomerOrderRead>();
  }

  // AC-11/AC-11a/AC-24 — the read an actor holding the observed `CUSTOMERS:WATCH` is served: the
  // same orders with the Customer's **live** name and the Delivery Address each is going to, joined
  // in one statement rather than fetched per row.
  //
  // Both joins are `LEFT`: an order recorded by typing a customer name names neither a Customer nor
  // an address, and must still be returned and counted exactly as one naming a Customer is. Both
  // are to-one, so neither can multiply the rows. The Customer join carries the acting Warehouse as
  // well as the reference, so no name can be joined in from another Warehouse's record whatever a
  // stored reference says (AC-12).
  listIdentifiedCustomerOrders(
    warehouseId: string,
    filter: ListCustomerOrdersFilter = {},
    order: CustomerOrderListOrder = 'creation',
  ): Promise<IdentifiedCustomerOrderRead[]> {
    return (
      customerOrderProjection(
        getEntityManager(this.dataSource),
        warehouseId,
        filter,
        order,
      )
        .leftJoin(
          CustomerEntity,
          'customer',
          'customer.id = demand.customerId AND customer.warehouseId = demand.warehouseId',
        )
        .leftJoin(
          CustomerDeliveryAddressEntity,
          'destination',
          'destination.id = demand.customerDeliveryAddressId AND destination.customerId = demand.customerId',
        )
        .addSelect('demand.customerId', 'customerId')
        // The Customer's name **now**, never a copy taken when the order was recorded — which is what
        // makes correcting a Customer's name change every order that names it (AC-03b).
        .addSelect('customer.name', 'customerCurrentName')
        .addSelect('demand.customerName', 'typedCustomerName')
        .addSelect('destination.id', 'deliveryAddressId')
        .addSelect('destination.addressText', 'addressText')
        .addSelect('destination.accessNotes', 'accessNotes')
        .addSelect('destination.isMain', 'isMain')
        .addSelect('destination.deactivatedAt', 'deactivatedAt')
        .getRawMany<IdentifiedCustomerOrderRead>()
    );
  }
}
