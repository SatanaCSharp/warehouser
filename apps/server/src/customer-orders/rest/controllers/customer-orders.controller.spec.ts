import 'reflect-metadata';

import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { PermissionId } from '@warehouser/shared-types/enums';
import { CustomerOrdersController } from 'customer-orders/rest/controllers/customer-orders.controller.js';
import { READ_TOLERANT_KEY } from 'shared/access/archived-tolerant-read.decorator.js';
import { OBSERVED_PERMISSION_KEY } from 'shared/decorators/observed-permission.decorator.js';
import { REQUIRED_PERMISSION_KEY } from 'shared/decorators/required-permission.decorator.js';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard.js';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard.js';
import { WriteRateLimitGuard } from 'shared/guards/write-rate-limit.guard.js';
import { WRITE_RATE_LIMITED_KEY } from 'shared/guards/write-rate-limited.decorator.js';
import { describe, expect, it } from 'vitest';

// T11 — the guard and metadata proof `customer-orders-http-contract.integration.spec.ts` cannot
// itself make: which Permission a route declares, whether it tolerates an archived Warehouse and
// whether it is rate limited are transport-adapter metadata, not observable HTTP behaviour. Mirrors
// `items.controller.spec.ts`.
//
// The four handlers are named for openapi.yaml's `operationId`s. The controller is not constructed
// here on purpose: which queries and commands it injects is the implementer's choice, while the
// declared surface below is the contract.
const method = (name: keyof CustomerOrdersController): object =>
  Object.getOwnPropertyDescriptor(CustomerOrdersController.prototype, name)
    ?.value as object;

describe('CustomerOrdersController', () => {
  it('mounts every Customer Order handler under the named Warehouse', () => {
    expect(Reflect.getMetadata(PATH_METADATA, CustomerOrdersController)).toBe(
      'api/v1/warehouses/:warehouseId/customer-orders',
    );
  });

  // Cancellation is addressed as its own sub-resource so it can declare `CUSTOMER_ORDERS:CANCEL`
  // separately from `:UPDATE` (T11 §Notes, openapi.yaml `/customer-orders/{id}/cancellation`).
  it.each([
    ['listCustomerOrders', RequestMethod.GET, '/'],
    ['recordCustomerOrder', RequestMethod.POST, '/'],
    ['amendCustomerOrder', RequestMethod.PATCH, ':customerOrderId'],
    [
      'cancelCustomerOrder',
      RequestMethod.POST,
      ':customerOrderId/cancellation',
    ],
    // AC-11b/AC-11c — redirection is its own sub-resource, not a field on the amendment: its rules
    // are its own and a shared payload would let the amendment's validation stand in for them
    // (openapi.yaml `redirectCustomerOrder`, sad.md §7). `PUT`, because redirecting to the address
    // the order is already going to changes nothing.
    [
      'redirectCustomerOrder',
      RequestMethod.PUT,
      ':customerOrderId/delivery-address',
    ],
  ] as const)('%s is served as %s %s', (handlerName, httpMethod, path) => {
    expect(Reflect.getMetadata(METHOD_METADATA, method(handlerName))).toBe(
      httpMethod,
    );
    expect(Reflect.getMetadata(PATH_METADATA, method(handlerName))).toBe(path);
  });

  // AC-01/AC-19/AC-19a — every handler declares exactly one Permission, so a member denied one
  // capability keeps the others their Role carries.
  // ADR 0003 — a mutating handler also names `WriteRateLimitGuard`, and names it **last**: the
  // counter composes after the access guards so an unauthorized actor is refused by those and never
  // reaches it, which is what makes a rate-limit refusal non-enumerating. The guard is declared per
  // route rather than with `APP_GUARD` because Nest runs global guards *before* route-scoped ones,
  // which would invert that required order.
  it.each([
    [
      'listCustomerOrders',
      PermissionId.CUSTOMER_ORDERS_WATCH,
      [SessionAuthGuard, WarehouseAccessGuard],
    ],
    [
      'recordCustomerOrder',
      PermissionId.CUSTOMER_ORDERS_CREATE,
      [SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard],
    ],
    [
      'amendCustomerOrder',
      PermissionId.CUSTOMER_ORDERS_UPDATE,
      [SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard],
    ],
    [
      'cancelCustomerOrder',
      PermissionId.CUSTOMER_ORDERS_CANCEL,
      [SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard],
    ],
    [
      'redirectCustomerOrder',
      PermissionId.CUSTOMER_ORDERS_UPDATE,
      [SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard],
    ],
  ] as const)(
    '%s declares exactly one Permission and its guard chain in order',
    (handlerName, permission, guards) => {
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSION_KEY, method(handlerName)),
      ).toEqual([permission]);
      expect(Reflect.getMetadata(GUARDS_METADATA, method(handlerName))).toEqual(
        guards,
      );
    },
  );

  // T13/AC-09a — **every** handler declares `CUSTOMERS:WATCH` observed beside its one required
  // Permission, because every one of them answers with openapi.yaml `CustomerOrder`, whose
  // identified form carries a customer name, a Delivery Address and its access notes. A surface
  // that can carry identity and does not declare the Permission governing it is exactly the silent
  // failure sad.md §11 calls "the largest and least visible part of this feature".
  //
  // The cancellation is included although this feature otherwise leaves it untouched: what decides
  // the declaration is the response schema, not whether the operation changed.
  it.each([
    'listCustomerOrders',
    'recordCustomerOrder',
    'amendCustomerOrder',
    'cancelCustomerOrder',
    'redirectCustomerOrder',
  ] as const)(
    '%s declares CUSTOMERS:WATCH observed (AC-09a, ADR 0001)',
    (handlerName) => {
      expect(
        Reflect.getMetadata(OBSERVED_PERMISSION_KEY, method(handlerName)),
      ).toEqual([PermissionId.CUSTOMERS_WATCH]);
    },
  );

  // ADR 0001 — the two declarations are separate metadata keys precisely so one can never be
  // mistaken for the other. `CUSTOMERS:WATCH` required on any of these handlers would **deny**
  // AC-09a's member the read or the write their own Permissions admit, which is the failure this
  // whole mechanism exists to avoid; it is asserted rather than left to naming.
  it.each([
    'listCustomerOrders',
    'recordCustomerOrder',
    'amendCustomerOrder',
    'cancelCustomerOrder',
    'redirectCustomerOrder',
  ] as const)('%s never requires CUSTOMERS:WATCH (AC-09a)', (handlerName) => {
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION_KEY, method(handlerName)),
    ).not.toContain(PermissionId.CUSTOMERS_WATCH);
  });

  // AC-23 — reads tolerate an archived Warehouse; mutations do not.
  it.each([
    ['listCustomerOrders', true],
    ['recordCustomerOrder', undefined],
    ['amendCustomerOrder', undefined],
    ['cancelCustomerOrder', undefined],
    ['redirectCustomerOrder', undefined],
  ] as const)(
    '%s declares archived tolerance %s (AC-23)',
    (handlerName, tolerant) => {
      expect(Reflect.getMetadata(READ_TOLERANT_KEY, method(handlerName))).toBe(
        tolerant,
      );
    },
  );

  // T4 — recording demand is one of the rate-limited writes (spec.md §6.1 "Draft and demand spam").
  // This asserts the declaration only; `WriteRateLimitGuard` owns the counting behaviour.
  it.each([
    ['listCustomerOrders', undefined],
    ['recordCustomerOrder', true],
    ['amendCustomerOrder', true],
    ['cancelCustomerOrder', true],
    ['redirectCustomerOrder', true],
  ] as const)(
    '%s declares write-rate-limit metadata %s (T4)',
    (handlerName, rateLimited) => {
      expect(
        Reflect.getMetadata(WRITE_RATE_LIMITED_KEY, method(handlerName)),
      ).toBe(rateLimited);
    },
  );
});
