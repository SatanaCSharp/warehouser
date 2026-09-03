import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { CustomerDeliveryAddressEntity } from 'shared/domain/entities/customer-delivery-address.entity';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { DataSource } from 'typeorm';

// openapi.yaml `CustomerAwaitingOrder` + `CustomerOrderDestination`, flattened. The nesting the
// contract shows is the `customers` feature mapper's work above this boundary; a repository returns
// persistence-oriented values only (creating-a-server-repository.md § "Keep repositories isolated
// and operation-oriented").
//
// The destination columns are never null: `chk_customer_orders_customer_identity` admits an order
// naming a Customer only together with one of that Customer's Delivery Addresses, so a read bounded
// by `customerId` never meets an order without one. That is what makes the join inner rather than
// left, and it is the same constraint that keeps a typed-name order out of this read entirely
// (AC-11a, AC-24).
export interface AwaitingCustomerOrderRead {
  readonly customerOrderId: string;
  readonly itemId: string;
  readonly itemSku: string;
  readonly itemDescription: string;
  readonly unitOfMeasure: string;
  readonly outstandingQuantity: number;
  readonly neededBy: string;
  readonly deliveryAddressId: string;
  readonly addressText: string;
  readonly accessNotes: string | null;
  // `isMain` and `deactivatedAt` report *why* it is this address (`sad.md` §6.6 step 6): the
  // Customer's current Main one, one the member stated instead, or one that has since been made
  // Inactive while the order keeps naming it and keeps counting exactly as before (AC-06a). Both
  // are read live, never as they stood when the order was recorded.
  readonly addressIsMain: boolean;
  readonly addressDeactivatedAt: Date | null;
}

// AC-08 — one Customer's awaiting list: "every Unfulfilled Customer Order of that Customer with its
// Item, its Outstanding Quantity, the date it is needed by, and the Delivery Address it is going
// to", omitting the Fulfilled and cancelled ones. One query: the Item and the destination are
// joined in rather than dereferenced per order, which is what keeps the read inside the 250 ms p95
// `spec.md` §6 sets.
@Injectable()
export class CustomerAwaitingDemandRepository {
  constructor(private readonly dataSource: DataSource) {}

  // Bounded by `idx_customer_orders_customer_unfulfilled`, whose `state = 'unfulfilled'` predicate
  // and `(customer_id, needed_by)` columns mean the cost follows what the Customer is still waiting
  // for rather than everything they ever ordered, and the rows arrive in needed-by order with no
  // sort step (data-model.md § Indexes). The identifier breaks a date tie so two reads never
  // disagree about the order.
  readAwaitingCustomerOrders(
    customerId: string,
  ): Promise<AwaitingCustomerOrderRead[]> {
    return (
      getEntityManager(this.dataSource)
        .getRepository(CustomerOrderEntity)
        .createQueryBuilder('awaitingOrder')
        .select('awaitingOrder.id', 'customerOrderId')
        .addSelect('item.id', 'itemId')
        .addSelect('item.sku', 'itemSku')
        .addSelect('item.description', 'itemDescription')
        .addSelect('item.unitOfMeasure', 'unitOfMeasure')
        .addSelect('awaitingOrder.outstandingQuantity', 'outstandingQuantity')
        // A raw select bypasses the entity's `date` handling, so the cast is what makes this the
        // calendar day openapi.yaml promises rather than an instant a reader's time zone could shift.
        // `CAST(… AS text)` rather than `…::text`, because TypeORM resolves `alias.property` only
        // where the property is not immediately followed by the cast operator.
        .addSelect('CAST(awaitingOrder.neededBy AS text)', 'neededBy')
        .addSelect('destination.id', 'deliveryAddressId')
        .addSelect('destination.addressText', 'addressText')
        .addSelect('destination.accessNotes', 'accessNotes')
        .addSelect('destination.isMain', 'addressIsMain')
        .addSelect('destination.deactivatedAt', 'addressDeactivatedAt')
        .innerJoin(ItemEntity, 'item', 'item.id = awaitingOrder.itemId')
        .innerJoin(
          CustomerDeliveryAddressEntity,
          'destination',
          'destination.id = awaitingOrder.customerDeliveryAddressId',
        )
        .where('awaitingOrder.customerId = :customerId', { customerId })
        .andWhere("awaitingOrder.state = 'unfulfilled'")
        .orderBy('awaitingOrder.neededBy', 'ASC')
        .addOrderBy('awaitingOrder.id', 'ASC')
        .getRawMany<AwaitingCustomerOrderRead>()
    );
  }
}
