import { Injectable } from '@nestjs/common';
import { assert, assertFail } from '@warehouser/utils/asserts';
import {
  customerInvalidDeliveryAddressError,
  customerLastActiveDeliveryAddressError,
  customerNameTakenError,
  customerTargetUnavailableError,
} from 'customers/domain/errors/customer.errors';
import type {
  CustomerNameHolder,
  DeliveryAddressState,
} from 'customers/domain/predicates/customer.predicates';
import {
  canDeactivateDeliveryAddress,
  isActiveDeliveryAddress,
  isDeliveryAddressOfCustomer,
  isMainDeliveryAddressOf,
} from 'customers/domain/predicates/customer.predicates';
import { compact, filter, find, orderBy } from 'lodash';
import type { CustomerEntity } from 'shared/domain/entities/customer.entity';
import type { DeliveryAddressWriteOutcome } from 'shared/domain/repositories/customer-address-book.repository';
import type { CustomerWriteOutcome } from 'shared/domain/repositories/customer-directory.repository';
import { CustomerDirectoryRepository } from 'shared/domain/repositories/customer-directory.repository';

// The Customer identity and Delivery Address book rules that more than one command needs
// (sad.md §5, `customers/domain/services`), in two layers.
//
// The functions below **state the rules**: each receives every value it decides over, returns or
// throws, and reaches nothing — so each is testable, and readable, without a database. The
// `CustomerAddressBookService` at the foot of this file is **the collaboration**: it injects the
// directory repository once and performs the two reads more than one command needs, then calls the
// functions to state the rules. That is the split server-architecture.md §Services draws — "a shared
// operation that reaches a repository belongs in an injectable service, so the repository is
// injected once rather than threaded through every caller as an argument" — and
// `customer-orders/domain/services/customer-order-lifecycle.service.ts` is the same shape,
// `assertNeededByStillAhead` beside `CustomerOrderLifecycleService`.
//
// The address-book writes and the lock they are decided under are **not** here: each belongs to the
// one command that owns its transaction, which is where the 2026-09-04 backend review put them
// (findings 2 and 3). The functions above are what those commands share.

// Where a Customer is, as far as an authorization-shaped refusal is concerned.
export interface CustomerLocation {
  readonly id: string;
  readonly warehouseId: string;
}

// AC-12/AC-23 — the Customer resolves in the acting Warehouse, or it does not resolve at all. A
// Customer of another Warehouse and one that does not exist are one non-enumerating outcome, so a
// denial never discloses that the target exists elsewhere (spec.md §6.1 abuse cases).
// Annotated on the binding rather than the arrow, which is what TypeScript requires of an assertion
// function's call target (TS2775) and the shape `@warehouser/utils/asserts` declares `assert` with.
// The narrowing is the point: a caller that resolved the Customer keeps a non-null reference.
type AssertCustomerOfWarehouse = <T extends CustomerLocation>(
  customer: T | null,
  warehouseId: string,
) => asserts customer is T;

// Selectors, not conditions — they return the row and the set the callers below need, so
// server-error-handling.md §1 ("Return `boolean` or a TypeScript type predicate") keeps them out of
// `customer.predicates.ts`, which now exports only conditions. They live beside the assertions and
// the promotion that consume them (2026-09-04 backend review, finding 12).

// The Customer of this Warehouse already holding `name`, or `null`. Returns the holder rather than
// a boolean because the refusal names it: `customerNameTakenError(holder.id, holder.name)`.
//
// **Active and Inactive alike**: deactivation does not release a name, so `deactivatedAt` is never
// consulted. Case-sensitive and non-normalising, following the `items.sku` precedent — `"Acme Ltd"`
// and `"ACME LTD"` are two Customers (data-model.md, seventh open question).
//
// `correctedCustomerId` is the Customer whose own name is being corrected, which never conflicts
// with itself (AC-03b).
export const customerHoldingName = (
  name: string,
  warehouseCustomers: readonly CustomerNameHolder[],
  correctedCustomerId: string | null = null,
): CustomerNameHolder | null =>
  find(
    warehouseCustomers,
    (customer) => customer.name === name && customer.id !== correctedCustomerId,
  ) ?? null;

// The active addresses the Customer would still have if `addressId` were deactivated — the set the
// AC-06b promotion orders. `canDeactivateDeliveryAddress` no longer goes through this: it asks only
// whether *any* remains, which `some` answers without building the set.
export const remainingActiveDeliveryAddresses = (
  addressId: string,
  addresses: readonly DeliveryAddressState[],
): readonly DeliveryAddressState[] =>
  filter(
    addresses,
    (address) => address.id !== addressId && isActiveDeliveryAddress(address),
  );

export const assertCustomerOfWarehouse: AssertCustomerOfWarehouse = (
  customer,
  warehouseId,
) => {
  assert(
    customer !== null && customer.warehouseId === warehouseId,
    customerTargetUnavailableError(),
  );
};

// AC-03/AC-03c/AC-06 — a customer name identifies at most one Customer within a Warehouse, whether
// the holder is active or Inactive, and the refusal names the holder. `correctedCustomerId` is the
// Customer whose own name is being corrected, which never conflicts with itself (AC-03b).
//
// The holder is read once and the refusal is raised from it, which is why this is an early return
// rather than a bare condition: the error the member sees carries the holder the read found.
export const assertCustomerNameAvailable = (
  name: string,
  warehouseCustomers: readonly CustomerNameHolder[],
  correctedCustomerId: string | null = null,
): void => {
  const holder = customerHoldingName(
    name,
    warehouseCustomers,
    correctedCustomerId,
  );

  if (holder === null) {
    return;
  }

  assertFail(customerNameTakenError(holder.id, holder.name));
};

// AC-12/AC-06a — the address belongs to the Customer that was named and is one a member may still
// choose. A missing address and one of another Customer fail identically; an **Inactive** address of
// this Customer is the different refusal `chk_customer_delivery_addresses_main_is_active` names,
// because the Customer does hold it and nothing is disclosed by saying so.
type AssertDeliveryAddressUsable = <T extends DeliveryAddressState>(
  address: T | null,
  customerId: string,
) => asserts address is T;

export const assertDeliveryAddressUsable: AssertDeliveryAddressUsable = (
  address,
  customerId,
) => {
  assert(
    address !== null && isDeliveryAddressOfCustomer(address, customerId),
    customerTargetUnavailableError(),
  );
  assert(
    isActiveDeliveryAddress(address),
    customerInvalidDeliveryAddressError(),
  );
};

// AC-07 — a Customer always keeps at least one active Delivery Address, whether or not it has
// Unfulfilled Customer Orders. The set is the one read under lock at the moment of the change
// (sad.md §6.3), so two concurrent deactivations cannot both see two remaining.
export const assertDeliveryAddressDeactivatable = (
  addressId: string,
  addresses: readonly DeliveryAddressState[],
): void => {
  assert(
    canDeactivateDeliveryAddress(addressId, addresses),
    customerLastActiveDeliveryAddressError(),
  );
};

// AC-06b — deactivating the Main Delivery Address makes one of the remaining active addresses the
// Main one, in the same transaction, and the response names which. This decides *which*, and
// returns `null` when there is nothing to reassign: the address being deactivated is not the Main
// one, or no active address remains — the case AC-07 refuses before this is ever asked.
//
// The earliest-recorded remaining address is chosen so the promotion is deterministic: the same
// deactivation names the same successor to every member, and the address rows the command locks in
// ascending identifier order settle a same-instant tie.
export const nextMainDeliveryAddress = (
  deactivatedAddressId: string,
  addresses: readonly DeliveryAddressState[],
): DeliveryAddressState | null => {
  if (!isMainDeliveryAddressOf(deactivatedAddressId, addresses)) {
    return null;
  }

  const remaining = remainingActiveDeliveryAddresses(
    deactivatedAddressId,
    addresses,
  );

  return orderBy(remaining, ['createdAt', 'id'], ['asc', 'asc'])[0] ?? null;
};

// data-model.md § "Concurrency, locks and transactions" — "zero affected rows is a typed
// concurrency refusal, never a silent no-op". Every conditional write in `customers` carries the
// state its transition starts from, so a write that affects no row means the Customer or the
// Delivery Address is not there to be changed: a Customer of another Warehouse, one that does not
// exist, an address of another Customer, or one already in the state the transition would move it
// to. AC-12 / spec.md §6.1 make those **one** non-enumerating refusal, which is why one assertion
// serves every one of them and no caller composes the error itself.
//
// A plain exported function rather than a method: it needs no collaborator at all, so the commands
// that need only it are not coupled to repositories they never touch (server-architecture.md
// §Services, "stateless helpers stay module-level").
export const assertCustomerWriteApplied = (
  outcome: CustomerWriteOutcome | DeliveryAddressWriteOutcome,
): void => {
  assert(outcome === 'applied', customerTargetUnavailableError());
};

// The same rule where the row is one this transaction **already holds** under
// `lockDeliveryAddresses`: a write that affects none is then not a member-facing rejection at all,
// it is a broken invariant, and it stays an `AssertionError` the global filter reports as an
// internal defect (server-error-handling.md §2, §6).
export const assertLockedDeliveryAddressWriteApplied = (
  outcome: DeliveryAddressWriteOutcome,
): void => {
  assert(
    outcome === 'applied',
    'A Delivery Address write affected no row the address book had locked',
  );
};

// The two reads more than one command needs (sad.md §5): resolve the Customer in the acting
// Warehouse, and refuse a name another Customer of that Warehouse already holds. Both are questions;
// each caller decides what to do with the answer, and every write stays in the command that owns it
// (server-architecture.md §Services, "the commands still own their operations").
//
// Registered on `CustomersUsecaseModule` and **not** exported: nothing outside `customers` calls it,
// which `usecases/usecase.module.di.spec.ts` proves by compiling a consumer that tries.
//
// It opens no transaction of its own and takes no lock. It runs inside the boundary the calling
// command declares, so its reads are that command's reads.
@Injectable()
export class CustomerAddressBookService {
  constructor(
    private readonly customerDirectoryRepository: CustomerDirectoryRepository,
  ) {}

  // AC-12/AC-23 — the read is scoped to the acting Warehouse, so a Customer of another Warehouse
  // comes back as nothing exactly as a missing one does and the refusal cannot distinguish them
  // (spec.md §6.1 abuse cases).
  async resolveCustomer(
    customerId: string,
    warehouseId: string,
  ): Promise<CustomerEntity> {
    const customer = await this.customerDirectoryRepository.findCustomer(
      customerId,
      warehouseId,
    );

    assertCustomerOfWarehouse(customer, warehouseId);

    return customer;
  }

  // AC-03/AC-03c/AC-06 — recording a Customer and correcting a Customer's name both need this, which
  // is why it is here rather than in either command. The read is per-Warehouse and case-sensitive,
  // so the same name in another Warehouse is never consulted (AC-03a), and the holder it returns is
  // what lets the refusal name the Customer that already holds it.
  async assertNameAvailable(
    warehouseId: string,
    name: string,
    correctedCustomerId: string | null = null,
  ): Promise<void> {
    const holder = await this.customerDirectoryRepository.findCustomerByName(
      warehouseId,
      name,
    );

    assertCustomerNameAvailable(name, compact([holder]), correctedCustomerId);
  }
}
