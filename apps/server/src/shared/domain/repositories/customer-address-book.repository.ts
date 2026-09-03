import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { CustomerDeliveryAddressEntity } from 'shared/domain/entities/customer-delivery-address.entity';
import { DataSource, IsNull, Not } from 'typeorm';

export interface ReviseDeliveryAddressPersistenceInput {
  readonly addressText: string;
  readonly accessNotes: string | null;
  readonly revisedAt: Date;
}

/** The outcome of a conditional write against one Delivery Address.
 * `delivery-address-unavailable` is what zero affected rows means — data-model.md § "Concurrency,
 * locks and transactions": "zero affected rows is a typed concurrency refusal, never a silent
 * no-op". An address of another Customer, a missing one, and one already in the state the
 * transition would move it to all resolve to it identically, so no refusal discloses which of the
 * three it was (`spec.md` §6.1). */
export type DeliveryAddressWriteOutcome =
  'applied' | 'delivery-address-unavailable';

const toDeliveryAddressWriteOutcome = (
  affected: number | null | undefined,
): DeliveryAddressWriteOutcome =>
  affected === 1 ? 'applied' : 'delivery-address-unavailable';

// AC-04/AC-05/AC-06a/AC-06b/AC-07 — one Customer's address book. It is one repository rather than a
// table-shaped set of writes because of `lockDeliveryAddresses`: `sad.md` §6.3 step 4 requires the
// last-active-address condition to be evaluated over the Customer's address rows **under lock**, so
// that two concurrent deactivations cannot both see two remaining. Splitting the locking read from
// the write would make AC-07 decidable against a set another transaction is already changing.
//
// The condition itself is not decided here: `customers/domain` owns the predicate and this
// repository returns the locked rows it is decided over, keeping persistence free of feature
// concepts (creating-a-server-repository.md § "Keep repositories isolated and operation-oriented").
@Injectable()
export class CustomerAddressBookRepository {
  constructor(private readonly dataSource: DataSource) {}

  // openapi.yaml `Customer.deliveryAddresses` — "every Delivery Address of this Customer, active
  // and Inactive alike, ordered by creation time", because an Inactive one keeps reading exactly as
  // before wherever a record already names it (AC-06a). The identifier breaks a creation-time tie
  // so two reads never disagree about the order.
  listDeliveryAddresses(
    customerId: string,
  ): Promise<CustomerDeliveryAddressEntity[]> {
    return getEntityManager(this.dataSource)
      .getRepository(CustomerDeliveryAddressEntity)
      .find({
        where: { customerId },
        order: { createdAt: 'ASC', id: 'ASC' },
      });
  }

  // openapi.yaml `listCustomers` 200 — the same address set for **every** Customer of one
  // Warehouse, in one read. `CustomerDirectoryRepository.listCustomers` answers which Customers
  // there are and in what order; this answers what each one's addresses are, so the list projection
  // costs two reads whatever the number of Customers rather than one per Customer. Ordered by
  // Customer and then by creation time, so the caller groups without re-sorting and each group
  // arrives in exactly the order `listDeliveryAddresses` returns it in for one Customer.
  //
  // The Warehouse scope lives in the query — `customer_delivery_addresses.warehouse_id` is half of
  // the composite reference `(customer_id, warehouse_id)` into `customers` — so an address of
  // another Warehouse is not in the set at all (AC-12).
  listWarehouseDeliveryAddresses(
    warehouseId: string,
  ): Promise<CustomerDeliveryAddressEntity[]> {
    return getEntityManager(this.dataSource)
      .getRepository(CustomerDeliveryAddressEntity)
      .find({
        where: { warehouseId },
        order: { customerId: 'ASC', createdAt: 'ASC', id: 'ASC' },
      });
  }

  // `sad.md` §6.3 step 4 — "the read is `FOR UPDATE` over the Customer's address rows so two
  // concurrent deactivations cannot both see two remaining". The Inactive rows are locked too: the
  // condition is "at least one **active** address remains", and a caller counting only the rows it
  // was handed would otherwise decide AC-07 against the wrong set. Ascending identifier order is
  // the lock order data-model.md § "Concurrency, locks and transactions" fixes for `customers`, so
  // two transactions never take the same rows in opposite orders.
  lockDeliveryAddresses(
    customerId: string,
  ): Promise<CustomerDeliveryAddressEntity[]> {
    return getEntityManager(this.dataSource)
      .getRepository(CustomerDeliveryAddressEntity)
      .createQueryBuilder('address')
      .where('address.customerId = :customerId', { customerId })
      .orderBy('address.id', 'ASC')
      .setLock('pessimistic_write')
      .getMany();
  }

  // AC-04 — the address and its access notes are recorded against the Customer. It arrives ordinary;
  // making it the Main one is `setMainDeliveryAddress`, so the two decisions stay separable and the
  // partial unique index is never asked to hold two Main rows at once.
  async addDeliveryAddress(
    address: CustomerDeliveryAddressEntity,
  ): Promise<CustomerDeliveryAddressEntity> {
    await getEntityManager(this.dataSource)
      .getRepository(CustomerDeliveryAddressEntity)
      .insert(address);

    return address;
  }

  // openapi.yaml `correctCustomerDeliveryAddress` — the text and the notes are corrected in place,
  // which is the point of holding the address by reference (`sad.md` §4): every live record naming
  // it reads the correction, and no frozen line does, because a frozen line holds captured text and
  // no reference at all.
  async reviseDeliveryAddress(
    deliveryAddressId: string,
    customerId: string,
    changes: ReviseDeliveryAddressPersistenceInput,
  ): Promise<DeliveryAddressWriteOutcome> {
    const result = await getEntityManager(this.dataSource)
      .getRepository(CustomerDeliveryAddressEntity)
      .update(
        { id: deliveryAddressId, customerId },
        {
          addressText: changes.addressText,
          accessNotes: changes.accessNotes,
          updatedAt: changes.revisedAt,
        },
      );

    return toDeliveryAddressWriteOutcome(result.affected);
  }

  // AC-04/AC-05 — "makes the second one Main and the first one no longer". Two statements and one
  // operation, because `uq_customer_delivery_addresses_customer_main` admits one Main row per
  // Customer and would reject both flags standing at once.
  //
  // The clear carries the target's own condition as an `EXISTS`, so an address that is not this
  // Customer's, is missing, or is Inactive leaves the existing Main flag exactly where it was
  // instead of clearing it and then failing to set the replacement. `is_main = false OR
  // deactivated_at IS NULL` is the check the second statement's `deactivatedAt IS NULL` keeps on
  // the right side of.
  async setMainDeliveryAddress(
    deliveryAddressId: string,
    customerId: string,
    changedAt: Date,
  ): Promise<DeliveryAddressWriteOutcome> {
    const manager = getEntityManager(this.dataSource);

    const targetIsAvailable = manager
      .createQueryBuilder()
      .select('1')
      .from(CustomerDeliveryAddressEntity, 'target')
      .where('target.id = :deliveryAddressId')
      .andWhere('target.customerId = :customerId')
      .andWhere('target.deactivatedAt IS NULL')
      .getQuery();

    await manager
      .createQueryBuilder()
      .update(CustomerDeliveryAddressEntity)
      .set({ isMain: false, updatedAt: changedAt })
      .where('customer_id = :customerId')
      .andWhere('is_main')
      .andWhere(`EXISTS (${targetIsAvailable})`)
      .setParameters({ customerId, deliveryAddressId })
      .execute();

    const result = await manager
      .getRepository(CustomerDeliveryAddressEntity)
      .update(
        { id: deliveryAddressId, customerId, deactivatedAt: IsNull() },
        { isMain: true, updatedAt: changedAt },
      );

    return toDeliveryAddressWriteOutcome(result.affected);
  }

  // AC-06a — the address is recorded Inactive and stops being offered, while every Customer Order
  // and every frozen Purchase Draft Line naming it keeps reading and counting exactly as before.
  // The Main flag is cleared in the same statement, because
  // `chk_customer_delivery_addresses_main_is_active` refuses an Inactive Main address — and because
  // that is what frees the partial unique index for the replacement AC-06b promotes next.
  async deactivateDeliveryAddress(
    deliveryAddressId: string,
    customerId: string,
    deactivatedAt: Date,
  ): Promise<DeliveryAddressWriteOutcome> {
    const result = await getEntityManager(this.dataSource)
      .getRepository(CustomerDeliveryAddressEntity)
      .update(
        { id: deliveryAddressId, customerId, deactivatedAt: IsNull() },
        { isMain: false, deactivatedAt, updatedAt: deactivatedAt },
      );

    return toDeliveryAddressWriteOutcome(result.affected);
  }

  // openapi.yaml `CustomerDeliveryAddress.deactivatedAt` — "a reactivated once-Main address comes
  // back as an **ordinary** address, never as a second Main one", which is why the flag is written
  // false here rather than left to whatever it held before deactivation.
  async reactivateDeliveryAddress(
    deliveryAddressId: string,
    customerId: string,
    reactivatedAt: Date,
  ): Promise<DeliveryAddressWriteOutcome> {
    const result = await getEntityManager(this.dataSource)
      .getRepository(CustomerDeliveryAddressEntity)
      .update(
        { id: deliveryAddressId, customerId, deactivatedAt: Not(IsNull()) },
        { isMain: false, deactivatedAt: null, updatedAt: reactivatedAt },
      );

    return toDeliveryAddressWriteOutcome(result.affected);
  }
}
