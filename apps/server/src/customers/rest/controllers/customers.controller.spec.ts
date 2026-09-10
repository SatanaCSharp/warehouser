import 'reflect-metadata';

import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { PermissionId } from '@warehouser/shared-types/enums';
import { CustomersController } from 'customers/rest/controllers/customers.controller.js';
import { READ_TOLERANT_KEY } from 'shared/access/archived-tolerant-read.decorator.js';
import { OBSERVED_PERMISSION_KEY } from 'shared/decorators/observed-permission.decorator.js';
import { REQUIRED_PERMISSION_KEY } from 'shared/decorators/required-permission.decorator.js';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard.js';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard.js';
import { WriteRateLimitGuard } from 'shared/guards/write-rate-limit.guard.js';
import { WRITE_RATE_LIMITED_KEY } from 'shared/guards/write-rate-limited.decorator.js';
import { describe, expect, it } from 'vitest';

// T10 — the guard and metadata proof `customers-http-contract.integration.spec.ts` cannot itself
// make: which Permission a route declares, whether it tolerates an archived Warehouse and whether
// it is rate limited are transport-adapter metadata, not observable HTTP behaviour. Mirrors
// `customer-orders/rest/controllers/customer-orders.controller.spec.ts`.
//
// The handlers are named for openapi.yaml's `operationId`s. The controller is not constructed here
// on purpose: which queries and commands it injects is the implementer's choice, while the declared
// surface below is the contract.
const method = (name: keyof CustomersController): object =>
  Object.getOwnPropertyDescriptor(CustomersController.prototype, name)
    ?.value as object;

describe('CustomersController', () => {
  it('mounts every Customer handler under the named Warehouse', () => {
    expect(Reflect.getMetadata(PATH_METADATA, CustomersController)).toBe(
      'api/v1/warehouses/:warehouseId/customers',
    );
  });

  // Deactivation is addressed as its own sub-resource so it declares `CUSTOMERS:DEACTIVATE`
  // separately from `:UPDATE`, and reactivation is the same transition inverted under the same
  // Permission (openapi.yaml `/customers/{customerId}/deactivation`, sad.md §6.3).
  it.each([
    ['listCustomers', RequestMethod.GET, '/'],
    ['recordCustomer', RequestMethod.POST, '/'],
    ['readCustomer', RequestMethod.GET, ':customerId'],
    ['correctCustomerName', RequestMethod.PATCH, ':customerId'],
    ['deactivateCustomer', RequestMethod.POST, ':customerId/deactivation'],
    ['reactivateCustomer', RequestMethod.DELETE, ':customerId/deactivation'],
  ] as const)('%s is served as %s %s', (handlerName, httpMethod, path) => {
    expect(Reflect.getMetadata(METHOD_METADATA, method(handlerName))).toBe(
      httpMethod,
    );
    expect(Reflect.getMetadata(PATH_METADATA, method(handlerName))).toBe(path);
  });

  // spec.md §6.1 — every handler declares exactly **one** Permission, so a member denied one
  // capability keeps the others their Role carries. `@RequiredPermission` is variadic and the guard
  // evaluates only the first identifier, so a second one would be silently ignored
  // (server-request-authorization.md § "Declare the Permission a handler requires").
  //
  // ADR 0003 — a mutating handler also names `WriteRateLimitGuard`, and names it **last**: the
  // counter composes after the access guards so an unauthorized actor is refused by those and never
  // reaches it, which is what makes a rate-limit refusal non-enumerating.
  it.each([
    [
      'listCustomers',
      PermissionId.CUSTOMERS_WATCH,
      [SessionAuthGuard, WarehouseAccessGuard],
    ],
    [
      'recordCustomer',
      PermissionId.CUSTOMERS_CREATE,
      [SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard],
    ],
    [
      'readCustomer',
      PermissionId.CUSTOMERS_WATCH,
      [SessionAuthGuard, WarehouseAccessGuard],
    ],
    [
      'correctCustomerName',
      PermissionId.CUSTOMERS_UPDATE,
      [SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard],
    ],
    [
      'deactivateCustomer',
      PermissionId.CUSTOMERS_DEACTIVATE,
      [SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard],
    ],
    [
      'reactivateCustomer',
      PermissionId.CUSTOMERS_DEACTIVATE,
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

  // AC-23 — reads tolerate an archived Warehouse; mutations do not.
  it.each([
    ['listCustomers', true],
    ['recordCustomer', undefined],
    ['readCustomer', true],
    ['correctCustomerName', undefined],
    ['deactivateCustomer', undefined],
    ['reactivateCustomer', undefined],
  ] as const)(
    '%s declares archived tolerance %s (AC-23)',
    (handlerName, tolerant) => {
      expect(Reflect.getMetadata(READ_TOLERANT_KEY, method(handlerName))).toBe(
        tolerant,
      );
    },
  );

  // T4 — every Customer mutation is rate limited on the same terms as the `ordering` ones
  // (spec.md §6.1 "Draft and demand spam"). This asserts the declaration only;
  // `WriteRateLimitGuard` owns the counting behaviour.
  it.each([
    ['listCustomers', undefined],
    ['recordCustomer', true],
    ['readCustomer', undefined],
    ['correctCustomerName', true],
    ['deactivateCustomer', true],
    ['reactivateCustomer', true],
  ] as const)(
    '%s declares write-rate-limit metadata %s (T4)',
    (handlerName, rateLimited) => {
      expect(
        Reflect.getMetadata(WRITE_RATE_LIMITED_KEY, method(handlerName)),
      ).toBe(rateLimited);
    },
  );

  // AC-09 — no read on this surface declares an observed Permission. Every one of them already
  // *requires* `CUSTOMERS:WATCH`, so there is no field a second Permission could withhold:
  // openapi.yaml records that `Customer` "has no redacted form". An `@ObservedPermission` here
  // would be inert metadata suggesting a redaction that does not exist
  // (server-request-authorization.md § "Declare the Permissions a projection observes").
  it.each(['listCustomers', 'readCustomer'] as const)(
    '%s declares no observed Permission, because it requires CUSTOMERS:WATCH outright (AC-09)',
    (handlerName) => {
      expect(
        Reflect.getMetadata(OBSERVED_PERMISSION_KEY, method(handlerName)),
      ).toBeUndefined();
    },
  );
});
