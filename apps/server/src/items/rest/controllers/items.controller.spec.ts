import 'reflect-metadata';

import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { PermissionId } from '@warehouser/shared-types/enums';
import { ItemsController } from 'items/rest/controllers/items.controller';
import type { AdjustItemOnHandCommand } from 'items/usecases/commands/adjust-item-on-hand.command';
import type { CorrectItemCommand } from 'items/usecases/commands/correct-item.command';
import type { CreateItemCommand } from 'items/usecases/commands/create-item.command';
import type { DeactivateItemCommand } from 'items/usecases/commands/deactivate-item.command';
import type { ReactivateItemCommand } from 'items/usecases/commands/reactivate-item.command';
import type { ListItemCatalogueQuery } from 'items/usecases/queries/list-item-catalogue.query';
import type { ReadItemCatalogueEntryQuery } from 'items/usecases/queries/read-item-catalogue-entry.query';
import { READ_TOLERANT_KEY } from 'shared/access/archived-tolerant-read.decorator';
import { REQUIRED_PERMISSION_KEY } from 'shared/decorators/required-permission.decorator';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';
import { WRITE_RATE_LIMITED_KEY } from 'shared/guards/write-rate-limited.decorator';

// T7 — the guard/metadata proof `items-http-contract.integration.spec.ts` does not itself exercise
// (permission uniqueness, archived tolerance and rate-limit declaration are transport-adapter
// metadata, not observable HTTP behaviour). Mirrors `access.controller.spec.ts`'s reflection idiom.
// A 60-request rate-limit integration test is deliberately not written here: T4 owns
// `WriteRateLimitGuard`'s counting behaviour, and this spec proves only that every mutating
// handler *declares* `@WriteRateLimited()` — the cheap, correct proof of wiring.
const method = (name: keyof ItemsController): object =>
  Object.getOwnPropertyDescriptor(ItemsController.prototype, name)
    ?.value as object;

describe('ItemsController', () => {
  const listItemCatalogueQuery = {
    execute: jest.fn(),
  } as unknown as ListItemCatalogueQuery;
  const readItemCatalogueEntryQuery = {
    execute: jest.fn(),
  } as unknown as ReadItemCatalogueEntryQuery;
  const createItemCommand = {
    execute: jest.fn(),
  } as unknown as CreateItemCommand;
  const correctItemCommand = {
    execute: jest.fn(),
  } as unknown as CorrectItemCommand;
  const deactivateItemCommand = {
    execute: jest.fn(),
  } as unknown as DeactivateItemCommand;
  const reactivateItemCommand = {
    execute: jest.fn(),
  } as unknown as ReactivateItemCommand;
  const adjustItemOnHandCommand = {
    execute: jest.fn(),
  } as unknown as AdjustItemOnHandCommand;

  new ItemsController(
    listItemCatalogueQuery,
    readItemCatalogueEntryQuery,
    createItemCommand,
    correctItemCommand,
    deactivateItemCommand,
    reactivateItemCommand,
    adjustItemOnHandCommand,
  );

  it('mounts every Item handler under the named Warehouse (AC-03a)', () => {
    expect(Reflect.getMetadata(PATH_METADATA, ItemsController)).toBe(
      'api/v1/warehouses/:warehouseId/items',
    );
  });

  it.each([
    ['listItems', PermissionId.ITEMS_WATCH],
    ['createItem', PermissionId.ITEMS_CREATE],
    ['correctItem', PermissionId.ITEMS_UPDATE],
    ['deactivateItem', PermissionId.ITEMS_DEACTIVATE],
    ['reactivateItem', PermissionId.ITEMS_DEACTIVATE],
    ['adjustOnHand', PermissionId.ITEM_STOCK_ADJUST],
  ] as const)(
    '%s declares exactly one Permission and both access guards',
    (handlerName, permission) => {
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSION_KEY, method(handlerName)),
      ).toEqual([permission]);
      expect(Reflect.getMetadata(GUARDS_METADATA, method(handlerName))).toEqual(
        [SessionAuthGuard, WarehouseAccessGuard],
      );
    },
  );

  it.each([
    ['listItems', true],
    ['createItem', undefined],
    ['correctItem', undefined],
    ['deactivateItem', undefined],
    ['reactivateItem', undefined],
    ['adjustOnHand', undefined],
  ] as const)(
    '%s declares archived tolerance %s — reads tolerate an archived Warehouse, mutations do not (AC-23)',
    (handlerName, tolerant) => {
      expect(Reflect.getMetadata(READ_TOLERANT_KEY, method(handlerName))).toBe(
        tolerant,
      );
    },
  );

  it.each([
    ['listItems', undefined],
    ['createItem', true],
    ['correctItem', true],
    ['deactivateItem', true],
    ['reactivateItem', true],
    ['adjustOnHand', true],
  ] as const)(
    '%s declares write-rate-limit metadata %s (T4)',
    (handlerName, rateLimited) => {
      expect(
        Reflect.getMetadata(WRITE_RATE_LIMITED_KEY, method(handlerName)),
      ).toBe(rateLimited);
    },
  );
});
