import 'reflect-metadata';

import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { PermissionId } from '@warehouser/shared-types/enums';
import { PurchaseDraftLinesController } from 'purchase-drafts/rest/controllers/purchase-draft-lines.controller';
import { PurchaseDraftsController } from 'purchase-drafts/rest/controllers/purchase-drafts.controller';
import { READ_TOLERANT_KEY } from 'shared/access/archived-tolerant-read.decorator';
import { OBSERVED_PERMISSION_KEY } from 'shared/decorators/observed-permission.decorator';
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

// eslint-disable-next-line max-lines-per-function -- one metadata suite covering one large controller surface is inherently long, matching the customer-orders precedent
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
      'recordPurchaseDraftLineArrival',
      RequestMethod.POST,
      ':purchaseDraftId/lines/:purchaseDraftLineId/arrival',
    ],
    [
      'recordPurchaseDraftLineDirectDelivery',
      RequestMethod.POST,
      ':purchaseDraftId/lines/:purchaseDraftLineId/direct-delivery',
    ],
    ['closePurchaseDraft', RequestMethod.POST, ':purchaseDraftId/closure'],
    // T13/sad.md §7 — the amendment of one recorded Rejection, a sub-resource of the line mirroring
    // the shape `ordering` §7 established for links and endings.
    [
      'amendPurchaseDraftLineRejection',
      RequestMethod.PATCH,
      ':purchaseDraftId/lines/:purchaseDraftLineId/rejections/:rejectionId',
    ],
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
      'recordPurchaseDraftLineArrival',
      PermissionId.PURCHASE_DRAFTS_RECEIVE,
      [SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard],
    ],
    [
      'recordPurchaseDraftLineDirectDelivery',
      PermissionId.PURCHASE_DRAFTS_RECEIVE,
      [SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard],
    ],
    [
      'closePurchaseDraft',
      PermissionId.PURCHASE_DRAFTS_CLOSE,
      [SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard],
    ],
    // T13/AC-20/AC-26 — the amendment reaches only a Rejection, never the draft or its lines, so it
    // names `REJECTIONS:UPDATE` alone rather than `PURCHASE_DRAFTS:RECEIVE`.
    [
      'amendPurchaseDraftLineRejection',
      PermissionId.REJECTIONS_UPDATE,
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
    ['recordPurchaseDraftLineArrival', undefined],
    ['recordPurchaseDraftLineDirectDelivery', undefined],
    ['closePurchaseDraft', undefined],
    // T13/sad.md §"Authorization coverage" — the amendment writes a Closed draft's Rejection, so it
    // must not tolerate an archived Warehouse: no mutating handler in this feature does.
    ['amendPurchaseDraftLineRejection', undefined],
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
    ['recordPurchaseDraftLineArrival', true],
    ['recordPurchaseDraftLineDirectDelivery', true],
    ['closePurchaseDraft', true],
    ['amendPurchaseDraftLineRejection', true],
  ] as const)(
    '%s declares write-rate-limit metadata %s',
    (handlerName, rateLimited) => {
      expect(
        Reflect.getMetadata(WRITE_RATE_LIMITED_KEY, method(handlerName)),
      ).toBe(rateLimited);
    },
  );

  // T19/AC-09a/ADR 0001 — **every** handler of this controller declares the observed
  // `CUSTOMERS:WATCH` beside its one required Permission, because every one of them answers with a
  // `PurchaseDraftDetail` or a `PurchaseDraftSummary`, and a detail's lines carry a Direct to
  // Customer line's `customerDestination` and each link's customer and both captured and current
  // addresses.
  //
  // Asserted for the whole surface rather than for the reads alone: an observed Permission can
  // neither admit nor deny (`warehouse-access.guard.spec.ts` proves that structurally), so
  // declaring it costs a mutation nothing and its **absence** is what would silently disclose. A
  // handler added here without it is the failure this case exists to catch.
  // 2026-09-08 review — exact equality restored for these twelve: T13 widened
  // `recordPurchaseDraftLineArrival`, `recordPurchaseDraftLineDirectDelivery` and `readPurchaseDraft`
  // beyond `[CUSTOMERS_WATCH]`, and each of those three carries its own exact-equality case below,
  // so this list is deliberately theirs to exclude. Weakening this case to `arrayContaining` for
  // all fifteen — as an earlier revision of this file did — would stop catching an observed
  // Permission accidentally **added** to any of these twelve, which is exactly what this case's own
  // comment above says it exists to catch.
  it.each([
    'listPurchaseDrafts',
    'createPurchaseDraft',
    'revisePurchaseDraft',
    'discardPurchaseDraft',
    'addPurchaseDraftLine',
    'revisePurchaseDraftLine',
    'removePurchaseDraftLine',
    'linkPurchaseDraftLine',
    'requantifyPurchaseDraftLineLink',
    'unlinkPurchaseDraftLine',
    'readyPurchaseDraft',
    'closePurchaseDraft',
  ] as const)('%s declares the observed CUSTOMERS:WATCH', (handlerName) => {
    expect(
      Reflect.getMetadata(OBSERVED_PERMISSION_KEY, method(handlerName)),
    ).toEqual([PermissionId.CUSTOMERS_WATCH]);
  });

  // T13/AC-01a/AC-01b/sad.md §7 — an ending that may carry a Rejection observes `REJECTIONS:CREATE`
  // beside the unchanged `CUSTOMERS:WATCH`, in the order sad.md §7's HTTP table states, so the
  // command's capability assertion (`ArrivalInspectionService`) has a granted set to read from
  // `WarehouseAccessGuard` without a second membership lookup.
  it.each([
    'recordPurchaseDraftLineArrival',
    'recordPurchaseDraftLineDirectDelivery',
  ] as const)(
    '%s observes REJECTIONS:CREATE beside CUSTOMERS:WATCH (AC-01a, AC-01b)',
    (handlerName) => {
      expect(
        Reflect.getMetadata(OBSERVED_PERMISSION_KEY, method(handlerName)),
      ).toEqual([PermissionId.REJECTIONS_CREATE, PermissionId.CUSTOMERS_WATCH]);
    },
  );

  // T13/AC-21/AC-22/sad.md §7 — the one-draft read gains `REJECTIONS:WATCH` in its observed list, so
  // `ReadPurchaseDraftQuery` can decide the cause-withheld shape from the same guard-resolved grant
  // set `readsRejectionCause` already consults. The draft *list* is deliberately absent: a
  // `PurchaseDraftSummary` carries no line and therefore no Rejection to withhold.
  it('readPurchaseDraft observes REJECTIONS:WATCH beside CUSTOMERS:WATCH (AC-21, AC-22)', () => {
    expect(
      Reflect.getMetadata(OBSERVED_PERMISSION_KEY, method('readPurchaseDraft')),
    ).toEqual(
      expect.arrayContaining([
        PermissionId.CUSTOMERS_WATCH,
        PermissionId.REJECTIONS_WATCH,
      ]),
    );
    expect(
      Reflect.getMetadata(OBSERVED_PERMISSION_KEY, method('readPurchaseDraft')),
    ).toHaveLength(2);
  });

  // T13 — the amendment answers with an `AmendedRejection`, never a draft projection, so it has
  // nothing to observe: declaring `CUSTOMERS:WATCH` here would be dead metadata nobody reads.
  it('amendPurchaseDraftLineRejection observes nothing', () => {
    expect(
      Reflect.getMetadata(
        OBSERVED_PERMISSION_KEY,
        method('amendPurchaseDraftLineRejection'),
      ),
    ).toBeUndefined();
  });

  // server-request-authorization.md — the two metadata keys exist so one can never be mistaken for
  // the other. The observed Permission must never appear as the required one on any handler here,
  // or a member holding only `CUSTOMERS:WATCH` would be admitted to a draft they may not read.
  it.each([
    'listPurchaseDrafts',
    'readPurchaseDraft',
    'createPurchaseDraft',
    'readyPurchaseDraft',
    'closePurchaseDraft',
  ] as const)(
    '%s never requires the Permission it merely observes',
    (handlerName) => {
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSION_KEY, method(handlerName)),
      ).not.toContain(PermissionId.CUSTOMERS_WATCH);
    },
  );
});

// T19/AC-22 — the by-line read, served at `/purchase-draft-lines` at the **top level** rather than
// as `/purchase-drafts/lines`, so no literal segment competes with a `{purchaseDraftId}` parameter
// (sad.md §7). Its own controller because a controller carries exactly one prefix;
// `tests/refactor/route-table.spec.mjs` proves the split serves no method-and-path pair twice.
describe('PurchaseDraftLinesController', () => {
  const lineMethod = (name: keyof PurchaseDraftLinesController): object =>
    Object.getOwnPropertyDescriptor(
      PurchaseDraftLinesController.prototype,
      name,
    )?.value as object;

  it('mounts the by-line read at the top level under the named Warehouse', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, PurchaseDraftLinesController),
    ).toBe('api/v1/warehouses/:warehouseId/purchase-draft-lines');
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        lineMethod('listPurchaseDraftLines'),
      ),
    ).toBe(RequestMethod.GET);
    expect(
      Reflect.getMetadata(PATH_METADATA, lineMethod('listPurchaseDraftLines')),
    ).toBe('/');
  });

  // AC-22/AC-09a/AC-23 — one required Permission, the observed one beside it because
  // `PurchaseDraftLineListEntry` carries a `PurchaseDraftLine`, and archived tolerance because it
  // is a read.
  it('declares its Permissions, its guard chain and its archived tolerance', () => {
    const handler = lineMethod('listPurchaseDraftLines');

    expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, handler)).toEqual([
      PermissionId.PURCHASE_DRAFTS_WATCH,
    ]);
    // T13/AC-22/sad.md §7 — the by-line read gains `REJECTIONS:WATCH` alongside `CUSTOMERS:WATCH`:
    // its `PurchaseDraftLineListEntry` carries a `PurchaseDraftLine` whose ending can name a
    // Rejection's cause, the same fact `readPurchaseDraft` observes.
    expect(Reflect.getMetadata(OBSERVED_PERMISSION_KEY, handler)).toEqual(
      expect.arrayContaining([
        PermissionId.CUSTOMERS_WATCH,
        PermissionId.REJECTIONS_WATCH,
      ]),
    );
    expect(Reflect.getMetadata(OBSERVED_PERMISSION_KEY, handler)).toHaveLength(
      2,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
      SessionAuthGuard,
      WarehouseAccessGuard,
    ]);
    expect(Reflect.getMetadata(READ_TOLERANT_KEY, handler)).toBe(true);
    // A read carries no rate-limit metadata, and this controller carries no mutation at all.
    expect(
      Reflect.getMetadata(WRITE_RATE_LIMITED_KEY, handler),
    ).toBeUndefined();
  });
});
