import { Injectable } from '@nestjs/common';
import zipWith from 'lodash/zipWith.js';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { CustomerEntity } from 'shared/domain/entities/customer.entity';
import { CustomerDeliveryAddressEntity } from 'shared/domain/entities/customer-delivery-address.entity';
import { DataSource, IsNull, Not } from 'typeorm';

// openapi.yaml `Customer` — one directory row: the Customer as it stands, which of its addresses is
// Main, and how many of them are still active. The address rows themselves are the address book's
// (`CustomerAddressBookRepository`); the list carries the count because that is all the list needs
// (data-model.md § "Repository boundaries").
export interface CustomerDirectoryEntry {
  readonly customer: CustomerEntity;
  readonly mainDeliveryAddressId: string | null;
  readonly activeDeliveryAddressCount: number;
}

export interface ListCustomersFilter {
  // openapi.yaml `listCustomers?active=true` — the picker read used while recording demand (AC-06).
  readonly activeOnly?: boolean;
}

export interface RecordCustomerPersistenceInput {
  readonly customer: CustomerEntity;
  readonly mainDeliveryAddress: CustomerDeliveryAddressEntity;
}

/** The outcome of a conditional write against one Customer row. `customer-unavailable` is what zero
 * affected rows means, and it is returned rather than swallowed: data-model.md § "Concurrency,
 * locks and transactions" — "zero affected rows is a typed concurrency refusal, never a silent
 * no-op". A Customer of another Warehouse resolves to it identically to a missing one, so no
 * refusal discloses that the target exists elsewhere (`spec.md` §6.1). */
export type CustomerWriteOutcome = 'applied' | 'customer-unavailable';

const toCustomerWriteOutcome = (
  affected: number | null | undefined,
): CustomerWriteOutcome =>
  affected === 1 ? 'applied' : 'customer-unavailable';

interface CustomerDirectoryRawRow {
  readonly mainDeliveryAddressId: string | null;
  readonly activeDeliveryAddressCount: number;
}

// AC-01/AC-03/AC-03a/AC-03b/AC-06 — the Customer row's own repository: whether a name is free in a
// Warehouse, the Warehouse's Customer list, and the four writes that record and maintain a Customer.
// `listCustomers` is why this is one repository rather than a table-shaped pair: data-model.md
// § "Repository boundaries" requires the list and each Customer's active-address count to come back
// "in one read, rather than exposing a table-shaped read per relation that every caller must
// combine". The count and the Main identifier are correlated subqueries in the outer `SELECT`, so
// the read is one round trip whatever the number of Customers.
@Injectable()
export class CustomerDirectoryRepository {
  constructor(private readonly dataSource: DataSource) {}

  // AC-03 — "a customer name identifies at most one Customer within a Warehouse, whether that
  // Customer is active or Inactive", and the refusal names the holder, so the row comes back rather
  // than a boolean. Scoped to one Warehouse, because the same name elsewhere is not a conflict and
  // is never consulted (AC-03a). Case-sensitive and non-normalising, following `customers.name`'s
  // collation `C` (`spec.md` §8, seventh question).
  findCustomerByName(
    warehouseId: string,
    name: string,
  ): Promise<CustomerEntity | null> {
    return getEntityManager(this.dataSource)
      .getRepository(CustomerEntity)
      .findOneBy({ warehouseId, name });
  }

  // The Warehouse scope lives in the query, so a Customer of another Warehouse resolves to nothing
  // exactly as a missing one does and the two are indistinguishable to the caller (AC-09).
  findCustomer(
    customerId: string,
    warehouseId: string,
  ): Promise<CustomerEntity | null> {
    return getEntityManager(this.dataSource)
      .getRepository(CustomerEntity)
      .findOneBy({ id: customerId, warehouseId });
  }

  // openapi.yaml `listCustomers` 200 — "Every Customer of the named Warehouse ordered by name",
  // which `uq_customers_warehouse_name` returns without a sort step (data-model.md § Indexes).
  async listCustomers(
    warehouseId: string,
    filter: ListCustomersFilter = {},
  ): Promise<CustomerDirectoryEntry[]> {
    const manager = getEntityManager(this.dataSource);

    const activeDeliveryAddressCount = manager
      .createQueryBuilder()
      .select('COUNT(*)::int')
      .from(CustomerDeliveryAddressEntity, 'activeAddress')
      .where('activeAddress.customerId = customer.id')
      .andWhere('activeAddress.deactivatedAt IS NULL')
      .getQuery();

    // At most one row by `uq_customer_delivery_addresses_customer_main`, and `null` only for a
    // Customer with no active address at all — a state no member action can reach, because AC-07
    // refuses the deactivation that would produce it (openapi.yaml `Customer.mainDeliveryAddressId`).
    const mainDeliveryAddressId = manager
      .createQueryBuilder()
      .select('mainAddress.id')
      .from(CustomerDeliveryAddressEntity, 'mainAddress')
      .where('mainAddress.customerId = customer.id')
      .andWhere('mainAddress.isMain')
      .getQuery();

    const query = manager
      .getRepository(CustomerEntity)
      .createQueryBuilder('customer')
      .addSelect(
        `(${activeDeliveryAddressCount})`,
        'activeDeliveryAddressCount',
      )
      .addSelect(`(${mainDeliveryAddressId})`, 'mainDeliveryAddressId')
      .where('customer.warehouseId = :warehouseId', { warehouseId })
      .orderBy('customer.name', 'ASC');

    if (filter.activeOnly === true) {
      query.andWhere('customer.deactivatedAt IS NULL');
    }

    const found = await query.getRawAndEntities<CustomerDirectoryRawRow>();

    return zipWith(
      found.entities,
      found.raw,
      (customer, row): CustomerDirectoryEntry => ({
        customer,
        mainDeliveryAddressId: row.mainDeliveryAddressId,
        activeDeliveryAddressCount: row.activeDeliveryAddressCount,
      }),
    );
  }

  // AC-01 — "the system records the Customer in that Warehouse as active with that address as its
  // Main Delivery Address". One method rather than two, because `sad.md` §6.2 step 4 writes both
  // rows in one transaction and a caller that could write one without the other could leave a
  // Customer with no address at all. `uq_customers_warehouse_name` stays the final arbiter under
  // concurrency; its violation propagates untouched to the universal error boundary.
  async recordCustomer(
    input: RecordCustomerPersistenceInput,
  ): Promise<CustomerEntity> {
    const manager = getEntityManager(this.dataSource);

    await manager.getRepository(CustomerEntity).insert(input.customer);
    await manager
      .getRepository(CustomerDeliveryAddressEntity)
      .insert(input.mainDeliveryAddress);

    return input.customer;
  }

  // AC-03b — the correction rewrites the customer row alone. Every Customer Order and every frozen
  // Purchase Draft Line names the Customer's identifier and never its name, so nothing else moves.
  async correctCustomerName(
    customerId: string,
    warehouseId: string,
    name: string,
    correctedAt: Date,
  ): Promise<CustomerWriteOutcome> {
    const result = await getEntityManager(this.dataSource)
      .getRepository(CustomerEntity)
      .update(
        { id: customerId, warehouseId },
        { name, updatedAt: correctedAt },
      );

    return toCustomerWriteOutcome(result.affected);
  }

  // AC-06 — "records it as Inactive … and lets the member make it active again", the same operation
  // inverted. Guarded on the activation state the transition starts from, so a repeated
  // deactivation affects no row and is refused rather than reported as a change that happened. The
  // Customer's Delivery Addresses are deliberately untouched: they stay in the state they were in.
  async setCustomerDeactivation(
    customerId: string,
    warehouseId: string,
    deactivatedAt: Date | null,
    updatedAt: Date,
  ): Promise<CustomerWriteOutcome> {
    const result = await getEntityManager(this.dataSource)
      .getRepository(CustomerEntity)
      .update(
        {
          id: customerId,
          warehouseId,
          deactivatedAt: deactivatedAt === null ? Not(IsNull()) : IsNull(),
        },
        { deactivatedAt, updatedAt },
      );

    return toCustomerWriteOutcome(result.affected);
  }
}
