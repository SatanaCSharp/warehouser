import { filter, find, some } from 'lodash';

// Pure predicates for Customer identity and the Delivery Address book (server-error-handling.md
// §1). No NestJS, HTTP or TypeORM import here — `customers/domain/errors/customer.errors.ts` holds
// the named error factories that pair with these conditions and
// `customers/domain/services/customer-address-book.service.ts` enforces them via `assert`.

// The persistence-shaped facts a name-availability decision needs. `deactivatedAt` is carried and
// deliberately never read: it is here so the condition can be *seen* not to consult it.
export interface CustomerNameHolder {
  readonly id: string;
  readonly name: string;
  readonly deactivatedAt: Date | null;
}

// The facts a Delivery Address decision needs. `createdAt` orders the set the way openapi.yaml
// `Customer.deliveryAddresses` states, which is also what makes the AC-06b promotion deterministic.
export interface DeliveryAddressState {
  readonly id: string;
  readonly customerId: string;
  readonly isMain: boolean;
  readonly deactivatedAt: Date | null;
  readonly createdAt: Date;
}

// AC-02 / `chk_customers_name_stored_trimmed` — a name of nothing but whitespace names no customer.
export const isCustomerName = (name: string): boolean => name.trim().length > 0;

// AC-02 / `chk_customer_delivery_addresses_address_text_stored_trimmed` — an address of nothing but
// spaces sends goods nowhere.
export const isDeliveryAddressText = (addressText: string): boolean =>
  addressText.trim().length > 0;

// AC-02 — access notes are "trimmed non-empty when present". Absence is `null` and is not this
// condition's concern; an empty string is neither absence nor notes.
export const isAccessNotes = (accessNotes: string): boolean =>
  accessNotes.trim().length > 0;

// AC-03/AC-03c/AC-06 — the Customer of this Warehouse that already holds the name, or `null`.
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

export const isCustomerNameAvailable = (
  name: string,
  warehouseCustomers: readonly CustomerNameHolder[],
  correctedCustomerId: string | null = null,
): boolean =>
  customerHoldingName(name, warehouseCustomers, correctedCustomerId) === null;

// AC-06a — activation is the absence of a deactivation instant, matching `warehouses.archived_at`
// and `items.deactivated_at`. An Inactive address is not offered where an address is chosen.
export const isActiveDeliveryAddress = (
  address: DeliveryAddressState,
): boolean => address.deactivatedAt === null;

// AC-12/AC-23 — an address belongs to exactly one Customer, and one of another Customer is refused.
export const isDeliveryAddressOfCustomer = (
  address: DeliveryAddressState,
  customerId: string,
): boolean => address.customerId === customerId;

// AC-05 — Main-address membership: is this address the Main one of the set it is read with?
export const isMainDeliveryAddressOf = (
  addressId: string,
  addresses: readonly DeliveryAddressState[],
): boolean =>
  some(addresses, (address) => address.id === addressId && address.isMain);

// AC-05 / `chk_customer_delivery_addresses_main_is_active` — exactly one **active** address of a
// Customer is its Main one at any moment. The rule the address-book commands assert at rest.
export const hasExactlyOneMainActiveDeliveryAddress = (
  addresses: readonly DeliveryAddressState[],
): boolean =>
  filter(
    addresses,
    (address) => address.isMain && isActiveDeliveryAddress(address),
  ).length === 1;

// The active addresses the Customer would still have if `addressId` were deactivated. Shared by the
// condition below and by the AC-06b promotion, so both read the same set.
export const remainingActiveDeliveryAddresses = (
  addressId: string,
  addresses: readonly DeliveryAddressState[],
): readonly DeliveryAddressState[] =>
  filter(
    addresses,
    (address) => address.id !== addressId && isActiveDeliveryAddress(address),
  );

// AC-07 — a Customer always keeps at least one active Delivery Address, whether or not it has
// Unfulfilled Customer Orders. Evaluated against the address rows read under lock at the moment of
// the change (sad.md §6.3), which is why the whole set is the argument.
export const canDeactivateDeliveryAddress = (
  addressId: string,
  addresses: readonly DeliveryAddressState[],
): boolean => remainingActiveDeliveryAddresses(addressId, addresses).length > 0;
