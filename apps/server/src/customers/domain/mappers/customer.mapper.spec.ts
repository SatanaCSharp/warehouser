import {
  toCustomer,
  toCustomerDeliveryAddress,
} from 'customers/domain/mappers/customer.mapper.js';
import { CustomerEntity } from 'shared/domain/entities/customer.entity.js';
import { CustomerDeliveryAddressEntity } from 'shared/domain/entities/customer-delivery-address.entity.js';
import { describe, expect, it } from 'vitest';

const customerEntity = (
  overrides: Partial<CustomerEntity> = {},
): CustomerEntity =>
  Object.assign(new CustomerEntity(), {
    id: 'customer-1',
    warehouseId: 'warehouse-1',
    name: 'Test Customer North',
    deactivatedAt: null,
    recordedByUserId: 'user-1',
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides,
  });

const addressEntity = (
  overrides: Partial<CustomerDeliveryAddressEntity> = {},
): CustomerDeliveryAddressEntity =>
  Object.assign(new CustomerDeliveryAddressEntity(), {
    id: 'address-1',
    customerId: 'customer-1',
    warehouseId: 'warehouse-1',
    addressText: 'Test Address 1, Test City',
    accessNotes: 'Gate code on the intercom',
    isMain: true,
    deactivatedAt: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides,
  });

describe('customer mappers', () => {
  // openapi.yaml `CustomerDeliveryAddress`.
  it('maps a Delivery Address row to the boundary shape', () => {
    expect(toCustomerDeliveryAddress(addressEntity())).toEqual({
      id: 'address-1',
      customerId: 'customer-1',
      addressText: 'Test Address 1, Test City',
      accessNotes: 'Gate code on the intercom',
      isMain: true,
      deactivatedAt: null,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    });
  });

  // The Warehouse is the request's, never a field the caller reads back — the same rule
  // `customer-orders/domain/mappers/customer-order.mapper.ts` follows.
  it('carries no warehouseId across the boundary', () => {
    expect(toCustomerDeliveryAddress(addressEntity())).not.toHaveProperty(
      'warehouseId',
    );
    expect(toCustomer(customerEntity(), [addressEntity()])).not.toHaveProperty(
      'warehouseId',
    );
  });

  // openapi.yaml `Customer` — every address of the Customer, active and Inactive alike, ordered by
  // creation time, with the Main one named separately (AC-06a).
  it('maps a Customer with its addresses and names the Main one', () => {
    const main = addressEntity({ id: 'address-main', isMain: true });
    const retired = addressEntity({
      id: 'address-retired',
      isMain: false,
      deactivatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });

    const customer = toCustomer(customerEntity(), [main, retired]);

    expect(customer.mainDeliveryAddressId).toBe('address-main');
    expect(customer.deliveryAddresses.map(({ id }) => id)).toEqual([
      'address-main',
      'address-retired',
    ]);
    expect(customer.name).toBe('Test Customer North');
    expect(customer.recordedByUserId).toBe('user-1');
    expect(customer.deactivatedAt).toBeNull();
  });

  // openapi.yaml `Customer.mainDeliveryAddressId` — `null` only for a Customer with no active
  // address at all, a state AC-07 keeps no member action able to reach.
  it('reports no Main address when none of the rows carries the flag', () => {
    expect(
      toCustomer(customerEntity(), [addressEntity({ isMain: false })])
        .mainDeliveryAddressId,
    ).toBeNull();
  });
});
