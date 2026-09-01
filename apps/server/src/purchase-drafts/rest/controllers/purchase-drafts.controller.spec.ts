import 'reflect-metadata';

import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { PermissionId } from '@warehouser/shared-types/enums';
import { PurchaseDraftsController } from 'purchase-drafts/rest/controllers/purchase-drafts.controller';
import { READ_TOLERANT_KEY } from 'shared/access/archived-tolerant-read.decorator';
import { REQUIRED_PERMISSION_KEY } from 'shared/decorators/required-permission.decorator';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';
import { WriteRateLimitGuard } from 'shared/guards/write-rate-limit.guard';
import { WRITE_RATE_LIMITED_KEY } from 'shared/guards/write-rate-limited.decorator';

// T16 — the guard and metadata proof `purchase-drafts-http-contract.integration.spec.ts` cannot
// itself make: which Permission a route declares, whether it tolerates an archived Warehouse and
// whether it is rate limited are transport-adapter metadata, not observable HTTP behaviour. Mirrors
// `customer-orders.controller.spec.ts` and `items.controller.spec.ts`.
//
// `PurchaseDraftsController` does not exist yet on this branch, so this import fails to resolve and
// the whole suite reports "Cannot find module" (GOOD red). The declared surface below — every
// handler, its path, its method, its one Permission and its guard chain — is the contract the
// implementer builds the controller against; the controller is never constructed here, because
// which queries and commands it injects is the implementer's choice.
//
// AC-15/T16 §Notes — `readiness`, `arrival`, `closure` and the draft-level `DELETE` (discard) are
// each their own sub-resource with their own `PermissionId`, never a `state` field on a general
// draft `PATCH` (sad.md §7). AC-22 requires each of `:CREATE`, `:READY` and `:RECEIVE` to gate
// exactly one handler apiece so a Role missing one is denied only that one.
const method = (name: keyof PurchaseDraftsController): object =>
  Object.getOwnPropertyDescriptor(PurchaseDraftsController.prototype, name)
    ?.value as object;

describe('PurchaseDraftsController', () => {
  it('mounts every Purchase Draft handler under the named Warehouse', () => {
    expect(Reflect.getMetadata(PATH_METADATA, PurchaseDraftsController)).toBe(
      'api/v1/warehouses/:warehouseId/purchase-drafts',
    );
  });

  // sad.md §7's route-shape table plus the transition sub-resources of T13/T14/T15. `readiness`,
  // `arrival` and `closure` are `POST`-only sub-resources; discard is the draft-level `DELETE`.
  it.each([
    ['listPurchaseDrafts', RequestMethod.GET, '/'],
    ['createPurchaseDraft', RequestMethod.POST, '/'],
    ['readPurchaseDraft', RequestMethod.GET, ':purchaseDraftId'],
    ['revisePurchaseDraft', RequestMethod.PATCH, ':purchaseDraftId'],
    ['discardPurchaseDraft', RequestMethod.DELETE, ':purchaseDraftId'],
    ['addPurchaseDraftLine', RequestMethod.POST, ':purchaseDraftId/lines'],
    [
      'revisePurchaseDraftLine',
      RequestMethod.PATCH,
      ':purchaseDraftId/lines/:purchaseDraftLineId',
    ],
    [
      'removePurchaseDraftLine',
      RequestMethod.DELETE,
      ':purchaseDraftId/lines/:purchaseDraftLineId',
    ],
    [
      'linkPurchaseDraftLine',
      RequestMethod.POST,
      ':purchaseDraftId/lines/:purchaseDraftLineId/links',
    ],
    [
      'requantifyPurchaseDraftLineLink',
      RequestMethod.PATCH,
      ':purchaseDraftId/lines/:purchaseDraftLineId/links/:purchaseDraftLineLinkId',
    ],
    [
      'unlinkPurchaseDraftLine',
      RequestMethod.DELETE,
      ':purchaseDraftId/lines/:purchaseDraftLineId/links/:purchaseDraftLineLinkId',
    ],
    ['readyPurchaseDraft', RequestMethod.POST, ':purchaseDraftId/readiness'],
    [
      'confirmPurchaseDraftArrival',
      RequestMethod.POST,
      ':purchaseDraftId/arrival',
    ],
    ['closePurchaseDraft', RequestMethod.POST, ':purchaseDraftId/closure'],
  ] as const)('%s is served as %s %s', (handlerName, httpMethod, path) => {
    expect(Reflect.getMetadata(METHOD_METADATA, method(handlerName))).toBe(
      httpMethod,
    );
    expect(Reflect.getMetadata(PATH_METADATA, method(handlerName))).toBe(path);
  });

  // AC-22 — each handler declares exactly one Permission, so a Role carrying `:WATCH` alone is
  // denied `:CREATE`, `:READY` and `:RECEIVE` individually while keeping every read.
  // ADR 0003 — a mutating handler also names `WriteRateLimitGuard` **last**, after the access
  // guards, so an unauthorized actor never reaches the counter.
  it.each([
    [
      'listPurchaseDrafts',
      PermissionId.PURCHASE_DRAFTS_WATCH,
      [SessionAuthGuard, WarehouseAccessGuard],
    ],
    [
      'readPurchaseDraft',
      PermissionId.PURCHASE_DRAFTS_WATCH,
      [SessionAuthGuard, WarehouseAccessGuard],
    ],
    [
      'createPurchaseDraft',
      PermissionId.PURCHASE_DRAFTS_CREATE,
      [SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard],
    ],
    [
      'revisePurchaseDraft',
      PermissionId.PURCHASE_DRAFTS_UPDATE,
      [SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard],
    ],
    [
      'discardPurchaseDraft',
      PermissionId.PURCHASE_DRAFTS_DISCARD,
      [SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard],
    ],
    [
      'addPurchaseDraftLine',
      PermissionId.PURCHASE_DRAFTS_UPDATE,
      [SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard],
    ],
    [
      'revisePurchaseDraftLine',
      PermissionId.PURCHASE_DRAFTS_UPDATE,
      [SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard],
    ],
    [
      'removePurchaseDraftLine',
      PermissionId.PURCHASE_DRAFTS_UPDATE,
      [SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard],
    ],
    [
      'linkPurchaseDraftLine',
      PermissionId.PURCHASE_DRAFTS_UPDATE,
      [SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard],
    ],
    [
      'requantifyPurchaseDraftLineLink',
      PermissionId.PURCHASE_DRAFTS_UPDATE,
      [SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard],
    ],
    [
      'unlinkPurchaseDraftLine',
      PermissionId.PURCHASE_DRAFTS_UPDATE,
      [SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard],
    ],
    [
      'readyPurchaseDraft',
      PermissionId.PURCHASE_DRAFTS_READY,
      [SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard],
    ],
    [
      'confirmPurchaseDraftArrival',
      PermissionId.PURCHASE_DRAFTS_RECEIVE,
      [SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard],
    ],
    [
      'closePurchaseDraft',
      PermissionId.PURCHASE_DRAFTS_CLOSE,
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

  // AC-23 — reads tolerate an archived Warehouse; every mutation, transition included, does not.
  it.each([
    ['listPurchaseDrafts', true],
    ['readPurchaseDraft', true],
    ['createPurchaseDraft', undefined],
    ['revisePurchaseDraft', undefined],
    ['discardPurchaseDraft', undefined],
    ['addPurchaseDraftLine', undefined],
    ['revisePurchaseDraftLine', undefined],
    ['removePurchaseDraftLine', undefined],
    ['linkPurchaseDraftLine', undefined],
    ['requantifyPurchaseDraftLineLink', undefined],
    ['unlinkPurchaseDraftLine', undefined],
    ['readyPurchaseDraft', undefined],
    ['confirmPurchaseDraftArrival', undefined],
    ['closePurchaseDraft', undefined],
  ] as const)(
    '%s declares archived tolerance %s (AC-23)',
    (handlerName, tolerant) => {
      expect(Reflect.getMetadata(READ_TOLERANT_KEY, method(handlerName))).toBe(
        tolerant,
      );
    },
  );

  // T4/ADR 0003 — creating a draft is one of the rate-limited writes (spec.md §6.1 "Draft and
  // demand spam"); the assembly, transition and closure writes are not named by that abuse case
  // but still compose `WriteRateLimitGuard` as every mutation here does.
  it.each([
    ['listPurchaseDrafts', undefined],
    ['readPurchaseDraft', undefined],
    ['createPurchaseDraft', true],
    ['revisePurchaseDraft', true],
    ['discardPurchaseDraft', true],
    ['addPurchaseDraftLine', true],
    ['revisePurchaseDraftLine', true],
    ['removePurchaseDraftLine', true],
    ['linkPurchaseDraftLine', true],
    ['requantifyPurchaseDraftLineLink', true],
    ['unlinkPurchaseDraftLine', true],
    ['readyPurchaseDraft', true],
    ['confirmPurchaseDraftArrival', true],
    ['closePurchaseDraft', true],
  ] as const)(
    '%s declares write-rate-limit metadata %s',
    (handlerName, rateLimited) => {
      expect(
        Reflect.getMetadata(WRITE_RATE_LIMITED_KEY, method(handlerName)),
      ).toBe(rateLimited);
    },
  );
});
