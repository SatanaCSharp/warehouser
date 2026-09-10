import 'reflect-metadata';

import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { PermissionId } from '@warehouser/shared-types/enums';
import { CustomerDeliveryAddressesController } from 'customers/rest/controllers/customer-delivery-addresses.controller.js';
import { READ_TOLERANT_KEY } from 'shared/access/archived-tolerant-read.decorator.js';
import { REQUIRED_PERMISSION_KEY } from 'shared/decorators/required-permission.decorator.js';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard.js';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard.js';
import { WriteRateLimitGuard } from 'shared/guards/write-rate-limit.guard.js';
import { WRITE_RATE_LIMITED_KEY } from 'shared/guards/write-rate-limited.decorator.js';
import { describe, expect, it } from 'vitest';

// T10 — the address book's own transport metadata. A second controller rather than five more
// handlers on `CustomersController`: the URL prefix is the Customer's address collection, and
// ADR 18-08-2026 keeps both in the `customers` module because the Customer is the entity whose
// behaviour they exercise — a Delivery Address "has no life apart from the Customer that owns it"
// (openapi.yaml `CustomerDeliveryAddress`).
const method = (name: keyof CustomerDeliveryAddressesController): object =>
  Object.getOwnPropertyDescriptor(
    CustomerDeliveryAddressesController.prototype,
    name,
  )?.value as object;

describe('CustomerDeliveryAddressesController', () => {
  it("mounts every address handler under the named Warehouse's named Customer", () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, CustomerDeliveryAddressesController),
    ).toBe(
      'api/v1/warehouses/:warehouseId/customers/:customerId/delivery-addresses',
    );
  });

  it.each([
    ['addCustomerDeliveryAddress', RequestMethod.POST, '/'],
    [
      'correctCustomerDeliveryAddress',
      RequestMethod.PATCH,
      ':deliveryAddressId',
    ],
    [
      'setMainCustomerDeliveryAddress',
      RequestMethod.PUT,
      ':deliveryAddressId/main',
    ],
    [
      'deactivateCustomerDeliveryAddress',
      RequestMethod.POST,
      ':deliveryAddressId/deactivation',
    ],
    [
      'reactivateCustomerDeliveryAddress',
      RequestMethod.DELETE,
      ':deliveryAddressId/deactivation',
    ],
  ] as const)('%s is served as %s %s', (handlerName, httpMethod, path) => {
    expect(Reflect.getMetadata(METHOD_METADATA, method(handlerName))).toBe(
      httpMethod,
    );
    expect(Reflect.getMetadata(PATH_METADATA, method(handlerName))).toBe(path);
  });

  // spec.md §6.1 — "maintaining a Customer's addresses is an aspect of updating the Customer, not
  // of deactivating it", so all five declare `CUSTOMERS:UPDATE` and none declares
  // `CUSTOMERS:DEACTIVATE`: deactivating an *address* is not deactivating the Customer.
  it.each([
    'addCustomerDeliveryAddress',
    'correctCustomerDeliveryAddress',
    'setMainCustomerDeliveryAddress',
    'deactivateCustomerDeliveryAddress',
    'reactivateCustomerDeliveryAddress',
  ] as const)(
    '%s declares exactly CUSTOMERS:UPDATE and its guard chain in order',
    (handlerName) => {
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSION_KEY, method(handlerName)),
      ).toEqual([PermissionId.CUSTOMERS_UPDATE]);
      expect(Reflect.getMetadata(GUARDS_METADATA, method(handlerName))).toEqual(
        [SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard],
      );
    },
  );

  // AC-23 — every handler here mutates, so none tolerates an archived Warehouse and every one is
  // rate limited.
  it.each([
    'addCustomerDeliveryAddress',
    'correctCustomerDeliveryAddress',
    'setMainCustomerDeliveryAddress',
    'deactivateCustomerDeliveryAddress',
    'reactivateCustomerDeliveryAddress',
  ] as const)(
    '%s is a rate-limited write that does not tolerate an archived Warehouse (AC-23, T4)',
    (handlerName) => {
      expect(
        Reflect.getMetadata(READ_TOLERANT_KEY, method(handlerName)),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(WRITE_RATE_LIMITED_KEY, method(handlerName)),
      ).toBe(true);
    },
  );
});
