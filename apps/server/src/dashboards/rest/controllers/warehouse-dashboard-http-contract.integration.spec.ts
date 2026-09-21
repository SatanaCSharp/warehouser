import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { INestApplication } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryModule, DiscoveryService } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  arrivalTimingPanelSchema,
  coverageGapPanelSchema,
  purchasingPipelinePanelSchema,
  reasonConcentrationPanelSchema,
} from '@warehouser/contracts/dashboards';
import { PermissionId } from '@warehouser/shared-types/enums';
import { AppModule } from 'app.module';
import { digestSessionSecret } from 'auth/domain/security/session-secret';
import { AUTH_SESSION_COOKIE } from 'auth/rest/auth-cookie';
import { without } from 'lodash-es';
import { ZodValidationPipe } from 'nestjs-zod';
import { READ_TOLERANT_KEY } from 'shared/access/archived-tolerant-read.decorator';
import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { CustomerEntity } from 'shared/domain/entities/customer.entity';
import { CustomerDeliveryAddressEntity } from 'shared/domain/entities/customer-delivery-address.entity';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { PermissionEntity } from 'shared/domain/entities/permission.entity';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import { PurchaseDraftLineRejectionEntity } from 'shared/domain/entities/purchase-draft-line-rejection.entity';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { RolePermissionEntity } from 'shared/domain/entities/role-permission.entity';
import { SessionEntity } from 'shared/domain/entities/session.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { GlobalHttpExceptionFilter } from 'shared/errors/global-http-exception.filter';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

// T12 RED — the `/api/v1/warehouses/{warehouseId}/dashboard/*` HTTP contract of
// `docs/features/dashboards/contracts/openapi.yaml`, driven over real HTTP against the real Nest
// module graph exactly as `items-http-contract.integration.spec.ts` does. `DashboardsRestModule`
// does not exist yet, so every request below is expected to 404 until T12 wires it into
// `AppModule`.
//
// It proves, per endpoint (task DoD, spec.md §5 AC-01/AC-02/AC-13/AC-23/AC-24):
//   - admitted for a member holding the whole Permission set, answering the shared contract shape;
//   - refused with the single non-enumerating `access.denied` without the **required** Permission;
//   - refused identically for a member whose every watch Permission is held in **another**
//     Warehouse of the same Workspace (AC-24);
//   - served over an archived Warehouse **with** `@ArchivedTolerantRead()` and refused **without**
//     it, both directions (AC-23);
//   - for both conjunction Panels, asserted on **both sides** of every observed Permission
//     (AC-02, AC-13) — the withheld side is the same `access.denied`, never a redacted body;
//   - carrying no Customer identity in any form.

const now = new Date('2026-09-21T09:00:00.000Z');

const workspaceId = '00000000-0000-4000-8000-000000000700';
const warehouseId = '00000000-0000-4000-8000-000000000701';
// The second Warehouse of the same Workspace AC-24 is argued over: a membership there carrying
// every watch Permission must resolve nothing against `warehouseId`.
const otherWarehouseId = '00000000-0000-4000-8000-000000000702';

const roleId = '00000000-0000-4000-8000-000000000801';
const otherWarehouseRoleId = '00000000-0000-4000-8000-000000000802';

const WATCH_PERMISSIONS = [
  PermissionId.ITEMS_WATCH,
  PermissionId.CUSTOMER_ORDERS_WATCH,
  PermissionId.PURCHASE_DRAFTS_WATCH,
  PermissionId.REJECTIONS_WATCH,
] as const;

// The route table of the task brief, carried as data so every property below is asserted for all
// four endpoints rather than for whichever one a hand-written case remembered.
const PANELS = [
  {
    panel: 'coverage-gap',
    required: PermissionId.ITEMS_WATCH,
    schema: coverageGapPanelSchema,
  },
  {
    panel: 'arrival-timing',
    required: PermissionId.CUSTOMER_ORDERS_WATCH,
    schema: arrivalTimingPanelSchema,
  },
  {
    panel: 'purchasing-pipeline',
    required: PermissionId.PURCHASE_DRAFTS_WATCH,
    schema: purchasingPipelinePanelSchema,
  },
  {
    panel: 'reason-concentration',
    required: PermissionId.REJECTIONS_WATCH,
    schema: reasonConcentrationPanelSchema,
  },
] as const;

// Each conjunction Panel once per observed Permission: the actor holds the required Permission and
// every watch Permission **but** the observed one under test (ADR 0001, sad.md §6.2).
const OBSERVED_CASES = [
  {
    panel: 'coverage-gap',
    withheld: PermissionId.CUSTOMER_ORDERS_WATCH,
    held: [PermissionId.ITEMS_WATCH, PermissionId.PURCHASE_DRAFTS_WATCH],
  },
  {
    panel: 'coverage-gap',
    withheld: PermissionId.PURCHASE_DRAFTS_WATCH,
    held: [PermissionId.ITEMS_WATCH, PermissionId.CUSTOMER_ORDERS_WATCH],
  },
  {
    panel: 'arrival-timing',
    withheld: PermissionId.PURCHASE_DRAFTS_WATCH,
    held: [PermissionId.CUSTOMER_ORDERS_WATCH],
  },
] as const;

// `spec.md` §6.1 "Personal data touched: none presented" and the task DoD: no response may carry
// Customer identity under any spelling the model uses.
const CUSTOMER_FIELD_SPELLINGS = [
  'customer_id',
  'customerId',
  'customer_delivery_address_id',
  'customerDeliveryAddressId',
  'customer_name',
  'customerName',
  'frozen_customer_name',
  'frozenCustomerName',
] as const;

// Seeded into every Customer-bearing column the Panels' source tables hold, so "no Customer
// identity" is asserted over values that genuinely exist behind the read rather than over an
// absence the fixture arranged.
const CUSTOMER_CANARY = 'Canary Customer North';

const ACCESS_DENIED = {
  code: 'access.denied',
  message: 'Access is not permitted.',
} as const;

const ACCESS_WAREHOUSE_ARCHIVED_CODE = 'access.warehouse_archived';

interface HttpResponse {
  readonly status: number;
  readonly body: unknown;
  readonly text: string;
}

type RouteHandler = (...args: readonly unknown[]) => unknown;
type ControllerClass = new (...args: readonly never[]) => object;

let app: INestApplication;
let baseUrl: string;
let discovery: DiscoveryService;

const panelPath = (targetWarehouseId: string, panel: string): string =>
  `/api/v1/warehouses/${targetWarehouseId}/dashboard/${panel}`;

const request = async (
  method: string,
  path: string,
  cookie: string,
): Promise<HttpResponse> => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie },
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : undefined,
    text,
  };
};

const metadataOf = (target: object, key: string): string =>
  String(Reflect.getMetadata(key, target) ?? '');

const prototypeMethods = (controller: ControllerClass): RouteHandler[] =>
  Object.getOwnPropertyNames(controller.prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => (controller.prototype as Record<string, unknown>)[name])
    .filter((value): value is RouteHandler => typeof value === 'function');

const isWarehouseDashboardRoute = (
  controller: ControllerClass,
  handler: RouteHandler,
): boolean => {
  const route = `${metadataOf(controller, PATH_METADATA)}/${metadataOf(handler, PATH_METADATA)}`;
  return route.includes('warehouses') && route.includes('dashboard');
};

/** Every handler serving the Warehouse Dashboard prefix, located through the running module graph
 * rather than by importing the controller — so the suite loads (and fails on HTTP) before T12
 * writes that file. */
const warehouseDashboardHandlers = (): RouteHandler[] =>
  discovery.getControllers().flatMap((wrapper) => {
    const controller = wrapper.metatype as ControllerClass | undefined;
    if (controller === undefined) {
      return [];
    }
    return prototypeMethods(controller).filter((handler) =>
      isWarehouseDashboardRoute(controller, handler),
    );
  });

/** Removes the `@ArchivedTolerantRead()` declaration from all four handlers and returns the undo,
 * which is how the AC-23 denial direction is asserted on the very handlers that serve it: without
 * the decorator the same archived Warehouse must refuse. */
const withoutArchivedTolerance = (): (() => void) => {
  const declared = warehouseDashboardHandlers().filter(
    (handler) => Reflect.getMetadata(READ_TOLERANT_KEY, handler) === true,
  );

  // DoD — all four declare it, and they declare the key `shared/access/` owns.
  expect(declared).toHaveLength(PANELS.length);

  declared.forEach((handler) => {
    Reflect.deleteMetadata(READ_TOLERANT_KEY, handler);
  });

  return () => {
    declared.forEach((handler) => {
      Reflect.defineMetadata(READ_TOLERANT_KEY, true, handler);
    });
  };
};

const grantPermissions = async (
  targetRoleId: string,
  permissionIds: readonly string[],
): Promise<void> => {
  if (permissionIds.length === 0) {
    return;
  }
  await dataSource.manager.getRepository(PermissionEntity).upsert(
    permissionIds.map((id) => ({
      id,
      label: id,
      kind: 'assignable' as const,
      createdAt: now,
      updatedAt: now,
    })),
    ['id'],
  );
  await dataSource.manager.getRepository(RolePermissionEntity).insert(
    permissionIds.map((permissionId) => ({
      roleId: targetRoleId,
      permissionId,
      roleKind: 'custom' as const,
      permissionKind: 'assignable' as const,
    })),
  );
};

const seedWarehouses = async (): Promise<void> => {
  await dataSource.manager.getRepository(WorkspaceEntity).insert({
    id: workspaceId,
    name: 'Test Workspace',
    createdAt: now,
    updatedAt: now,
  });
  await dataSource.manager.getRepository(WarehouseEntity).insert([
    {
      id: warehouseId,
      workspaceId,
      name: 'Warehouse North',
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: otherWarehouseId,
      workspaceId,
      name: 'Warehouse South',
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    },
  ]);
  await dataSource.manager.getRepository(RoleEntity).insert([
    {
      id: roleId,
      warehouseId,
      name: 'Supervisor',
      kind: 'custom',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: otherWarehouseRoleId,
      warehouseId: otherWarehouseId,
      name: 'Supervisor South',
      kind: 'custom',
      createdAt: now,
      updatedAt: now,
    },
  ]);
};

const setWarehouseArchived = async (
  id: string,
  archivedAt: Date | null,
): Promise<void> => {
  await dataSource.manager
    .getRepository(WarehouseEntity)
    .update({ id }, { archivedAt });
};

// `accounts.user_id` / `users.account_id` form a deferred circular FK pair, so both inserts must
// run inside one transaction.
const seedIdentity = async (userId: string): Promise<void> => {
  await dataSource.transaction(async (manager) => {
    await manager.getRepository(AccountEntity).insert({
      id: userId,
      userId,
      normalizedEmail: `member.${userId}@example.test`,
      passwordHash: 'synthetic-hash',
      passwordHashAlgorithm: 'scrypt',
      passwordHashParameters: { cost: 1_024 },
      createdAt: now,
      updatedAt: now,
    });
    await manager.getRepository(UserEntity).insert({
      id: userId,
      accountId: userId,
      workspaceId,
      createdAt: now,
      updatedAt: now,
    });
  });
};

const seedSessionCookie = async (accountId: string): Promise<string> => {
  const secret = randomUUID();
  const establishedAt = new Date();
  await dataSource.manager.getRepository(SessionEntity).insert({
    id: randomUUID(),
    accountId,
    secretDigest: digestSessionSecret(secret),
    establishedAt,
    expiresAt: new Date(establishedAt.getTime() + 60 * 60 * 1000),
    revokedAt: null,
  });
  return `${AUTH_SESSION_COOKIE}=${secret}`;
};

/** A Warehouse Member of `membershipWarehouseId` (the Warehouse under test by default) whose Role
 * carries exactly `permissionIds`. */
const seedActor = async (
  permissionIds: readonly string[],
  membershipWarehouseId: string = warehouseId,
): Promise<{ userId: string; cookie: string }> => {
  const userId = randomUUID();
  const membershipRoleId =
    membershipWarehouseId === warehouseId ? roleId : otherWarehouseRoleId;
  await seedIdentity(userId);
  await grantPermissions(membershipRoleId, permissionIds);
  await dataSource.manager.getRepository(WarehouseMembershipEntity).insert({
    userId,
    warehouseId: membershipWarehouseId,
    workspaceId,
    roleId: membershipRoleId,
    roleKind: 'custom',
    createdAt: now,
    updatedAt: now,
  });
  return { userId, cookie: await seedSessionCookie(userId) };
};

const isoDaysFromToday = (days: number): string => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

interface PanelFixture {
  readonly itemId: string;
  readonly sku: string;
}

const seedPurchaseDraft = async (
  state: 'draft' | 'ready_for_ordering' | 'closed',
  recordedByUserId: string,
  expectedArrivalDate: string | null,
): Promise<string> => {
  const id = randomUUID();
  const isClosed = state === 'closed';
  const isReadied = state === 'ready_for_ordering' || isClosed;
  await dataSource.manager.getRepository(PurchaseDraftEntity).insert({
    id,
    warehouseId,
    state,
    expectedArrivalDate,
    createdByUserId: recordedByUserId,
    readiedByUserId: isReadied ? recordedByUserId : null,
    readiedAt: isReadied ? now : null,
    arrivalConfirmedByUserId: null,
    arrivalConfirmedAt: null,
    closedByUserId: isClosed ? recordedByUserId : null,
    closedAt: isClosed ? now : null,
    closureReason: isClosed ? 'Supplier discontinued the line' : null,
    discardedByUserId: null,
    discardedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
};

const seedCustomerDeliveryAddress = async (
  recordedByUserId: string,
): Promise<string> => {
  const customerId = randomUUID();
  const addressId = randomUUID();
  await dataSource.manager.getRepository(CustomerEntity).insert({
    id: customerId,
    warehouseId,
    name: CUSTOMER_CANARY,
    deactivatedAt: null,
    recordedByUserId,
    createdAt: now,
    updatedAt: now,
  });
  await dataSource.manager.getRepository(CustomerDeliveryAddressEntity).insert({
    id: addressId,
    customerId,
    warehouseId,
    addressText: `${CUSTOMER_CANARY} Street 1`,
    accessNotes: null,
    isMain: true,
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return addressId;
};

/** One Rejection on its own line — `uq_purchase_draft_line_rejections_line_reason` pairs them, and
 * `chk_purchase_draft_line_rejections_source_matches_mode` ties the Source to the Delivery Mode. */
const seedEndedLineWithRejection = async (
  draftId: string,
  fixture: PanelFixture,
  recordedByUserId: string,
  rejectionReasonId: string,
  source: 'inspected' | 'customer_reported',
  quantity: number,
): Promise<void> => {
  const isCustomerReported = source === 'customer_reported';
  const deliveryMode = isCustomerReported
    ? 'direct_to_customer'
    : 'via_warehouse';
  const customerDeliveryAddressId = isCustomerReported
    ? await seedCustomerDeliveryAddress(recordedByUserId)
    : null;
  const lineId = randomUUID();

  await dataSource.manager.getRepository(PurchaseDraftLineEntity).insert({
    id: lineId,
    purchaseDraftId: draftId,
    warehouseId,
    itemId: fixture.itemId,
    orderedQuantity: 50,
    packagingTypeId: null,
    valueAddingNote: null,
    deliveryMode,
    customerDeliveryAddressId,
    frozenDeliveryAddressText: isCustomerReported
      ? `${CUSTOMER_CANARY} Street 1`
      : null,
    frozenAccessNotes: null,
    frozenCustomerName: isCustomerReported ? CUSTOMER_CANARY : null,
    endingQuantity: 50,
    endingKind: isCustomerReported ? 'direct_delivery' : 'arrival',
    endingRecordedByUserId: recordedByUserId,
    endingRecordedAt: now,
    preReceiptConformance: null,
    preReceiptConformanceNote: null,
    createdAt: now,
    updatedAt: now,
  });

  await dataSource.manager
    .getRepository(PurchaseDraftLineRejectionEntity)
    .insert({
      id: randomUUID(),
      purchaseDraftLineId: lineId,
      warehouseId,
      deliveryMode,
      rejectionReasonId,
      quantity,
      source,
      description: null,
      disposition: 'undecided',
      raisedByUserId: recordedByUserId,
      amendedByUserId: null,
      amendedAt: null,
      createdAt: now,
      updatedAt: now,
    });
};

/** The Warehouse every Panel reads: one Item held 40, one Unfulfilled Customer Order owing 100
 * inside the horizon, one Ready for Ordering draft with 25 on order arriving inside the horizon,
 * and two Rejections of 7 and 3 on a Closed draft's ended lines. */
const seedPanelRecords = async (
  recordedByUserId: string,
): Promise<PanelFixture> => {
  const itemId = randomUUID();
  const sku = 'TEST-SKU-0001';
  await dataSource.manager.getRepository(ItemEntity).insert({
    id: itemId,
    warehouseId,
    sku,
    description: 'Cable reel, 50m',
    unitOfMeasure: 'each',
    onHandQuantity: 40,
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  const fixture: PanelFixture = { itemId, sku };

  await dataSource.manager.getRepository(CustomerOrderEntity).insert({
    id: randomUUID(),
    warehouseId,
    itemId,
    customerName: CUSTOMER_CANARY,
    quantity: 100,
    outstandingQuantity: 100,
    neededBy: isoDaysFromToday(7),
    state: 'unfulfilled',
    cancellationReason: null,
    recordedByUserId,
    cancelledByUserId: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
  });

  const readyDraftId = await seedPurchaseDraft(
    'ready_for_ordering',
    recordedByUserId,
    isoDaysFromToday(14),
  );
  await dataSource.manager.getRepository(PurchaseDraftLineEntity).insert({
    id: randomUUID(),
    purchaseDraftId: readyDraftId,
    warehouseId,
    itemId,
    orderedQuantity: 25,
    packagingTypeId: null,
    valueAddingNote: null,
    deliveryMode: 'via_warehouse',
    customerDeliveryAddressId: null,
    frozenDeliveryAddressText: null,
    frozenAccessNotes: null,
    frozenCustomerName: null,
    endingQuantity: null,
    endingKind: null,
    endingRecordedByUserId: null,
    endingRecordedAt: null,
    preReceiptConformance: null,
    preReceiptConformanceNote: null,
    createdAt: now,
    updatedAt: now,
  });

  const closedDraftId = await seedPurchaseDraft(
    'closed',
    recordedByUserId,
    null,
  );
  await seedEndedLineWithRejection(
    closedDraftId,
    fixture,
    recordedByUserId,
    'damaged_in_transit',
    'inspected',
    7,
  );
  await seedEndedLineWithRejection(
    closedDraftId,
    fixture,
    recordedByUserId,
    'wrong_item_supplied',
    'customer_reported',
    3,
  );

  return fixture;
};

/** A fully permitted member over the fully seeded Warehouse — the AC-01 starting point. */
const seedPermittedActorWithRecords = async (): Promise<{
  cookie: string;
  fixture: PanelFixture;
}> => {
  await seedWarehouses();
  const actor = await seedActor(WATCH_PERMISSIONS);
  const fixture = await seedPanelRecords(actor.userId);
  return { cookie: actor.cookie, fixture };
};

const setupHarness = (): void => {
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, DiscoveryModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    app.useGlobalFilters(new GlobalHttpExceptionFilter());
    await app.init();
    await app.listen(0);

    const address = (app.getHttpServer() as Server).address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    discovery = app.get(DiscoveryService);

    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE purchase_draft_line_rejections, purchase_draft_lines, purchase_drafts, customer_orders, customer_delivery_addresses, customers, items, role_permissions, roles, warehouse_memberships, warehouses, workspaces, sessions, users, accounts, permissions CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
    await app.close();
  });
};

interface QuantityBucket {
  readonly owedQuantity: number;
  readonly expectedQuantity: number;
}

interface PipelinePanel {
  readonly states: readonly {
    readonly state: string;
    readonly bands: readonly { readonly draftCount: number }[];
  }[];
}

const sumOf = (
  buckets: readonly QuantityBucket[],
  key: keyof QuantityBucket,
): number => buckets.reduce((total, bucket) => total + bucket[key], 0);

const countIn = (pipeline: PipelinePanel, state: string): number =>
  pipeline.states
    .filter((row) => row.state === state)
    .flatMap((row) => row.bands)
    .reduce((total, band) => total + band.draftCount, 0);

// AC-01 — a member holding every watch Permission is admitted by all four reads, each answering
// the shape the shared contracts subpath the web consumes accepts.
const registerHappyPathTests = (): void => {
  it.each(PANELS)(
    'answers $panel in the shape the shared contract accepts (AC-01)',
    async ({ panel, schema }) => {
      const { cookie } = await seedPermittedActorWithRecords();

      const { status, body } = await request(
        'GET',
        panelPath(warehouseId, panel),
        cookie,
      );

      expect(status).toBe(200);
      expect(() => schema.parse(body)).not.toThrow();
    },
  );

  it('states what the Warehouse holds on every Panel (AC-01)', async () => {
    const { cookie, fixture } = await seedPermittedActorWithRecords();

    const coverageGap = coverageGapPanelSchema.parse(
      (await request('GET', panelPath(warehouseId, 'coverage-gap'), cookie))
        .body,
    );
    const arrivalTiming = arrivalTimingPanelSchema.parse(
      (await request('GET', panelPath(warehouseId, 'arrival-timing'), cookie))
        .body,
    );
    const pipeline = purchasingPipelinePanelSchema.parse(
      (
        await request(
          'GET',
          panelPath(warehouseId, 'purchasing-pipeline'),
          cookie,
        )
      ).body,
    );
    const reasons = reasonConcentrationPanelSchema.parse(
      (
        await request(
          'GET',
          panelPath(warehouseId, 'reason-concentration'),
          cookie,
        )
      ).body,
    );

    // On hand 40, owed 100, on order 25 from the one Ready draft — the Closed draft's 100 is
    // history to this Panel (AC-11).
    expect(coverageGap.rows).toEqual([
      {
        itemId: fixture.itemId,
        sku: fixture.sku,
        totalOutstandingQuantity: 100,
        onHandQuantity: 40,
        inboundQuantity: 25,
        uncoveredQuantity: 35,
      },
    ]);
    expect(coverageGap.remainder).toBeNull();

    expect(arrivalTiming.buckets).toHaveLength(9);
    expect(sumOf(arrivalTiming.buckets, 'owedQuantity')).toBe(100);
    expect(sumOf(arrivalTiming.buckets, 'expectedQuantity')).toBe(25);

    expect(countIn(pipeline, 'ready_for_ordering')).toBe(1);
    expect(countIn(pipeline, 'draft')).toBe(0);

    expect(reasons.totalRefusedQuantity).toBe(10);
    expect(reasons.rows.map((row) => row.rejectionReasonId)).toEqual([
      'damaged_in_transit',
      'wrong_item_supplied',
    ]);
  });
};

// AC-02 — the required Permission is what admits the read, and its absence is the single
// non-enumerating denial: the actor below holds every *other* watch Permission, so nothing but the
// required one can be what refused.
const registerRequiredPermissionTests = (): void => {
  it.each(PANELS)(
    'refuses $panel without its required Permission, disclosing nothing (AC-02)',
    async ({ panel, required }) => {
      await seedWarehouses();
      const actor = await seedActor(without(WATCH_PERMISSIONS, required));
      await seedPanelRecords(actor.userId);

      const { status, body } = await request(
        'GET',
        panelPath(warehouseId, panel),
        actor.cookie,
      );

      expect(status).toBe(403);
      expect(body).toEqual(ACCESS_DENIED);
    },
  );
};

// AC-24 — authority is the membership held in the Warehouse being read. A membership carrying every
// watch Permission in another Warehouse of the same Workspace resolves nothing here, and the refusal
// is byte-identical to the refusal a member holding nothing receives, so it discloses neither that
// the other membership exists nor whether this Warehouse holds anything.
const registerCrossWarehouseTests = (): void => {
  it.each(PANELS)(
    'refuses $panel to a member holding every watch Permission in another Warehouse of the Workspace (AC-24)',
    async ({ panel }) => {
      await seedWarehouses();
      const insider = await seedActor(WATCH_PERMISSIONS);
      await seedPanelRecords(insider.userId);
      const outsider = await seedActor(WATCH_PERMISSIONS, otherWarehouseId);
      const stranger = await seedActor([], otherWarehouseId);

      const refused = await request(
        'GET',
        panelPath(warehouseId, panel),
        outsider.cookie,
      );
      const baseline = await request(
        'GET',
        panelPath(warehouseId, panel),
        stranger.cookie,
      );

      expect(refused.status).toBe(403);
      expect(refused.body).toEqual(ACCESS_DENIED);
      // Identical to the refusal of a member with nothing at all: the two are indistinguishable.
      expect(refused.status).toBe(baseline.status);
      expect(refused.text).toBe(baseline.text);
    },
  );
};

// AC-23 — both directions. An archived Warehouse serves every Panel on exactly the Permission terms
// that applied before archiving *because* each handler declares `@ArchivedTolerantRead()`; strip the
// declaration and the same request over the same fixture is refused as archived.
const registerArchivedToleranceTests = (): void => {
  it.each(PANELS)(
    'serves $panel over an archived Warehouse with the archived-tolerant declaration (AC-23)',
    async ({ panel, schema }) => {
      const { cookie } = await seedPermittedActorWithRecords();
      await setWarehouseArchived(warehouseId, now);

      const { status, body } = await request(
        'GET',
        panelPath(warehouseId, panel),
        cookie,
      );

      expect(status).toBe(200);
      expect(() => schema.parse(body)).not.toThrow();
    },
  );

  it.each(PANELS)(
    'refuses $panel over an archived Warehouse without the archived-tolerant declaration (AC-23)',
    async ({ panel }) => {
      const { cookie } = await seedPermittedActorWithRecords();
      await setWarehouseArchived(warehouseId, now);
      const restore = withoutArchivedTolerance();

      try {
        const { status, body } = await request(
          'GET',
          panelPath(warehouseId, panel),
          cookie,
        );

        // 409, not 403: `global-http-exception.filter.ts` maps
        // `ErrorCode.ACCESS_WAREHOUSE_ARCHIVED` to 409 at the single normalization boundary, and
        // four existing suites pin it there (`access-http-contract.integration.spec.ts` among
        // them). `openapi.yaml` records no 409 on these routes because the archived branch is
        // unreachable while all four handlers declare the tolerance — which is exactly what this
        // case removes in order to assert the other direction of AC-23.
        expect(status).toBe(409);
        expect(body).toMatchObject({
          code: ACCESS_WAREHOUSE_ARCHIVED_CODE,
        });
      } finally {
        restore();
      }
    },
  );
};

// AC-02/AC-13 — both sides of every observed Permission on both conjunction Panels. The granted
// side is the happy path above; the withheld side is asserted here, and it is the same
// non-enumerating denial rather than a redacted body, so the reader learns neither which member of
// the conjunction fell short nor that the records behind it exist at all.
const registerObservedPermissionTests = (): void => {
  it.each(OBSERVED_CASES)(
    'refuses $panel when $withheld is not held, disclosing nothing (AC-02, AC-13)',
    async ({ panel, held }) => {
      await seedWarehouses();
      const actor = await seedActor(held);
      const recorder = await seedActor(WATCH_PERMISSIONS, otherWarehouseId);
      await seedPanelRecords(recorder.userId);

      const { status, body } = await request(
        'GET',
        panelPath(warehouseId, panel),
        actor.cookie,
      );

      expect(status).toBe(403);
      expect(body).toEqual(ACCESS_DENIED);
    },
  );

  it.each(OBSERVED_CASES)(
    'answers $panel once $withheld is held too (AC-02, AC-13)',
    async ({ panel, withheld, held }) => {
      await seedWarehouses();
      const actor = await seedActor([...held, withheld]);
      await seedPanelRecords(actor.userId);

      const { status } = await request(
        'GET',
        panelPath(warehouseId, panel),
        actor.cookie,
      );

      expect(status).toBe(200);
    },
  );
};

// spec.md §6.1 — no figure on either surface is keyed by a Customer, so no response may carry
// Customer identity under any spelling, and none may echo a Customer value the records behind it
// hold.
const registerDisclosureTests = (): void => {
  it.each(PANELS)(
    'carries no Customer identity in the $panel response',
    async ({ panel }) => {
      const { cookie } = await seedPermittedActorWithRecords();

      const { status, text } = await request(
        'GET',
        panelPath(warehouseId, panel),
        cookie,
      );

      expect(status).toBe(200);
      CUSTOMER_FIELD_SPELLINGS.forEach((spelling) => {
        expect(text).not.toContain(spelling);
      });
      expect(text).not.toContain(CUSTOMER_CANARY);
    },
  );
};

describe('Warehouse Dashboard HTTP contract', () => {
  setupHarness();
  registerHappyPathTests();
  registerRequiredPermissionTests();
  registerCrossWarehouseTests();
  registerArchivedToleranceTests();
  registerObservedPermissionTests();
  registerDisclosureTests();
});
