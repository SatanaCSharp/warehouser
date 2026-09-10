import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service.js';
import { ArrivalAllocationEntity } from 'shared/domain/entities/arrival-allocation.entity.js';
import type { CustomerOrderState } from 'shared/domain/entities/customer-order.entity.js';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity.js';
import { PurchaseDraftLineLinkEntity } from 'shared/domain/entities/purchase-draft-line-link.entity.js';
import { DataSource, In } from 'typeorm';

export interface LockedCustomerOrderForLink {
  readonly purchaseDraftLineLinkId: string;
  readonly order: CustomerOrderEntity;
}

export interface ArrivalAllocationPersistenceInput {
  readonly purchaseDraftLineLinkId: string;
  readonly purchaseDraftLineId: string;
  readonly customerOrderId: string;
  readonly allocatedQuantity: number;
  readonly allocatedByUserId: string;
  readonly createdAt: Date;
}

export interface CustomerOrderAllocationUpdate {
  readonly id: string;
  readonly outstandingQuantity: number;
  readonly state: CustomerOrderState;
}

export interface ApplyAllocationsInput {
  readonly allocations: readonly ArrivalAllocationPersistenceInput[];
  readonly orderUpdates: readonly CustomerOrderAllocationUpdate[];
}

// sad.md §6.9/§8 — the demand half of Arrival Confirmation reaches the Customer Order rows through
// one locking read and one write, so ADR 0002's re-check happens against rows genuinely locked in
// the caller's transaction rather than against a value composed before it opened. Named around the
// operation it performs rather than one table (creating-a-server-repository.md).
@Injectable()
export class DemandAllocationRepository {
  constructor(private readonly dataSource: DataSource) {}

  // sad.md §6.9 step 2 / data-model.md "Concurrency, locks and transactions" — "the Customer Orders
  // in ascending identifier order", the same order §6.10's amendment path takes on the same rows, so
  // the two flows never deadlock on each other. openapi.yaml `ArrivalAllocationCreate` carries only
  // `purchaseDraftLineLinkId` and `allocatedQuantity` (`additionalProperties: false`), so the
  // Customer Order is resolved through the link itself — `purchase_draft_line_links.customer_order_id`
  // — rather than from a value the caller supplies. Scoped to the acting Warehouse on both sides of
  // the join: a link or order of another Warehouse resolves to nothing, exactly as a missing one does.
  async lockCustomerOrdersForLinks(
    purchaseDraftLineLinkIds: readonly string[],
    warehouseId: string,
  ): Promise<LockedCustomerOrderForLink[]> {
    if (purchaseDraftLineLinkIds.length === 0) {
      return [];
    }

    const manager = getEntityManager(this.dataSource);

    const { entities, raw } = await manager
      .getRepository(CustomerOrderEntity)
      .createQueryBuilder('demand')
      .innerJoin(
        PurchaseDraftLineLinkEntity,
        'link',
        'link.customerOrderId = demand.id',
      )
      .addSelect('link.id', 'link_id')
      .where('link.id IN (:...purchaseDraftLineLinkIds)', {
        purchaseDraftLineLinkIds,
      })
      .andWhere('link.warehouseId = :warehouseId', { warehouseId })
      .andWhere('demand.warehouseId = :warehouseId', { warehouseId })
      .orderBy('demand.id', 'ASC')
      .setLock('pessimistic_write')
      .getRawAndEntities();

    // One raw row per matched link, but `entities` is TypeORM's **deduplicated** entity list: two
    // links of one confirmation may reach the same Customer Order (one draft may hold two lines for
    // one Item, both linked to that order), and then the two lists have different lengths and
    // different meanings. Pairing them by position would silently drop the surplus links, and a
    // dropped link resolves to no order at all — which the caller can only read as "cancelled",
    // refusing a healthy order with the wrong reason (AC-18 requires the member be told which
    // assignment is refused *and why*). Correlating through the order identifier carried on each
    // raw row is what keeps every requested link represented.
    // `demand_id` is the alias TypeORM already gives the root entity's own key; do not re-select
    // it under a custom alias, which replaces rather than supplements that alias and leaves the
    // hydrated entities without their identifiers.
    const rawRows = raw as Array<{ link_id: string; demand_id: string }>;
    const orderById = new Map(entities.map((order) => [order.id, order]));

    return rawRows.flatMap((row) => {
      const order = orderById.get(row.demand_id);
      return order === undefined
        ? []
        : [{ purchaseDraftLineLinkId: row.link_id, order }];
    });
  }

  // sad.md §6.9 step 6 — "the Allocation rows and the Customer Order recompute land together or not
  // at all". One persistence operation across both tables rather than two table-shaped writes a
  // caller would have to coordinate.
  async applyAllocations(
    input: ApplyAllocationsInput,
  ): Promise<CustomerOrderEntity[]> {
    const manager = getEntityManager(this.dataSource);

    if (input.allocations.length > 0) {
      await manager.getRepository(ArrivalAllocationEntity).insert(
        input.allocations.map((allocation) => ({
          purchaseDraftLineLinkId: allocation.purchaseDraftLineLinkId,
          purchaseDraftLineId: allocation.purchaseDraftLineId,
          customerOrderId: allocation.customerOrderId,
          allocatedQuantity: allocation.allocatedQuantity,
          allocatedByUserId: allocation.allocatedByUserId,
          createdAt: allocation.createdAt,
        })),
      );
    }

    if (input.orderUpdates.length === 0) {
      return [];
    }

    const updatedAt = new Date();

    await Promise.all(
      input.orderUpdates.map((update) =>
        manager.getRepository(CustomerOrderEntity).update(
          { id: update.id },
          {
            outstandingQuantity: update.outstandingQuantity,
            state: update.state,
            updatedAt,
          },
        ),
      ),
    );

    return manager.getRepository(CustomerOrderEntity).findBy({
      id: In(input.orderUpdates.map((update) => update.id)),
    });
  }
}
