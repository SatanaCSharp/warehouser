import { find, map } from 'lodash';
import type { CustomerEntity } from 'shared/domain/entities/customer.entity';
import type { CustomerDeliveryAddressEntity } from 'shared/domain/entities/customer-delivery-address.entity';

// A Customer's Delivery Address as the application boundary returns it — openapi.yaml
// `CustomerDeliveryAddress`. It carries no `warehouseId`: the Warehouse is the request's, never a
// field the caller reads back, exactly as `customer-orders`' mapper has it.
export interface CustomerDeliveryAddress {
  readonly id: string;
  readonly customerId: string;
  readonly addressText: string;
  readonly accessNotes: string | null;
  readonly isMain: boolean;
  readonly deactivatedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// The Customer as the application boundary returns it — openapi.yaml `Customer`.
export interface Customer {
  readonly id: string;
  readonly name: string;
  readonly deactivatedAt: Date | null;
  readonly mainDeliveryAddressId: string | null;
  readonly deliveryAddresses: readonly CustomerDeliveryAddress[];
  readonly recordedByUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// creating-a-server-repository.md — conversion between the shared persistence entity and the
// feature's own object lives in the owning feature's `domain/mappers/`, invoked above the
// repository boundary, never inside it.
export const toCustomerDeliveryAddress = (
  entity: CustomerDeliveryAddressEntity,
): CustomerDeliveryAddress => ({
  id: entity.id,
  customerId: entity.customerId,
  addressText: entity.addressText,
  accessNotes: entity.accessNotes,
  isMain: entity.isMain,
  deactivatedAt: entity.deactivatedAt,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
});

// Every Delivery Address of the Customer travels, active and Inactive alike, in the order the read
// returned them — an Inactive one stops being offered while every record already naming it keeps
// reading exactly as before (AC-06a).
//
// `mainDeliveryAddressId` is the flag the rows carry rather than a second source of truth: the
// partial unique index on `(customer_id) WHERE is_main` holds that at most one carries it, and
// `chk_customer_delivery_addresses_main_is_active` that an Inactive one never does. `null` is
// therefore only the Customer with no active address at all, which AC-07 keeps no member action
// able to reach.
export const toCustomer = (
  entity: CustomerEntity,
  addressEntities: readonly CustomerDeliveryAddressEntity[],
): Customer => ({
  id: entity.id,
  name: entity.name,
  deactivatedAt: entity.deactivatedAt,
  mainDeliveryAddressId:
    find(addressEntities, (address) => address.isMain)?.id ?? null,
  deliveryAddresses: map(addressEntities, toCustomerDeliveryAddress),
  recordedByUserId: entity.recordedByUserId,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
});
