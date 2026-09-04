/* eslint-disable max-lines -- one HTTP contract suite covering the whole purchase-drafts
   surface: nine route families and eight acceptance criteria, matching the items and
   customer-orders precedents. Splitting it would separate assertions from the shared
   fixture they are read against. */
import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  purchaseDraftDetailSchema,
  purchaseDraftSummarySchema,
} from '@warehouser/contracts/purchase-drafts';
import { AppModule } from 'app.module';
import { digestSessionSecret } from 'auth/domain/security/session-secret';
import { AUTH_SESSION_COOKIE } from 'auth/rest/auth-cookie';
import { ZodValidationPipe } from 'nestjs-zod';
import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { PackagingTypeEntity } from 'shared/domain/entities/packaging-type.entity';
import { PermissionEntity } from 'shared/domain/entities/permission.entity';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { RolePermissionEntity } from 'shared/domain/entities/role-permission.entity';
import { SessionEntity } from 'shared/domain/entities/session.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { GlobalHttpExceptionFilter } from 'shared/errors/global-http-exception.filter';

// Fixed clock for every seeded row, mirroring `customer-orders-http-contract.integration.spec.ts`:
// `chk_warehouses_archival_order` and `chk_purchase_drafts_readiness_attribution` both compare
// against `created_at`, so seeding and archival/freeze share one instant.
const seededAt = new Date('2026-08-25T09:00:00.000Z');
// When a seeded Customer Order moved, for the scenarios that move one. Later than `seededAt`, which
// is what makes it a change rather than the row's own creation (AC-16 `lastChangedAt`).
const movedAt = new Date('2026-08-27T14:20:00.000Z');

const calendarDaysFromToday = (days: number): string =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const workspaceId = '00000000-0000-4000-8000-000000000900';
const warehouseId = '00000000-0000-4000-8000-000000000901';
const otherWarehouseId = '00000000-0000-4000-8000-000000000902';

const roleId = '00000000-0000-4000-8000-000000000911';
const otherWarehouseRoleId = '00000000-0000-4000-8000-000000000912';
const deniedRoleId = '00000000-0000-4000-8000-000000000913';

const PURCHASE_DRAFTS_WATCH = 'PURCHASE_DRAFTS:WATCH';
// `/demand` belongs to `customer-orders` and is gated on its own Permission. AC-21 and AC-24 assert
// what a closure/discard leaves the linked demand looking like, so those actors must be able to
// read it — the Permission is part of the fixture, not part of what is under test.
const CUSTOMER_ORDERS_WATCH = 'CUSTOMER_ORDERS:WATCH';
const PURCHASE_DRAFTS_CREATE = 'PURCHASE_DRAFTS:CREATE';
const PURCHASE_DRAFTS_UPDATE = 'PURCHASE_DRAFTS:UPDATE';
const PURCHASE_DRAFTS_READY = 'PURCHASE_DRAFTS:READY';
const PURCHASE_DRAFTS_RECEIVE = 'PURCHASE_DRAFTS:RECEIVE';
const PURCHASE_DRAFTS_CLOSE = 'PURCHASE_DRAFTS:CLOSE';
const PURCHASE_DRAFTS_DISCARD = 'PURCHASE_DRAFTS:DISCARD';

// T16 DoD — the `/api/v1/warehouses/{warehouseId}/purchase-drafts*` and `.../packaging-types` HTTP
// contract of `contracts/openapi.yaml` (AC-10, AC-14, AC-15, AC-17, AC-21, AC-22, AC-23, AC-24).
// Driven over real HTTP against the real Nest module graph, exactly as the items and
// customer-orders surfaces are.
// eslint-disable-next-line max-lines-per-function -- one HTTP contract suite covering one large surface is inherently long, matching the items and customer-orders precedents
describe('purchase-drafts HTTP contract', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    app.useGlobalFilters(new GlobalHttpExceptionFilter());
    await app.init();
    await app.listen(0);

    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;

    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE arrival_allocations, purchase_draft_demand_snapshots, purchase_draft_line_links, purchase_draft_lines, purchase_drafts, item_stock_adjustments, customer_orders, items, warehouse_memberships, role_permissions, roles, warehouses, workspaces, sessions, users, accounts, permissions CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
    await app.close();
  });

  const seedPackagingTypes = async (): Promise<void> => {
    await dataSource.manager.getRepository(PackagingTypeEntity).upsert(
      [
        { id: 'loose_items', label: 'Loose items' },
        { id: 'cartons', label: 'Cartons' },
        { id: 'pallets', label: 'Pallets' },
        { id: 'cable_coil', label: 'Cable coil' },
      ].map((row) => ({ ...row, createdAt: seededAt, updatedAt: seededAt })),
      ['id'],
    );
  };

  const grantPermissions = async (
    targetRoleId: string,
    permissionIds: readonly string[],
  ): Promise<void> => {
    await dataSource.manager.getRepository(PermissionEntity).upsert(
      permissionIds.map((id) => ({
        id,
        label: id,
        kind: 'assignable' as const,
        createdAt: seededAt,
        updatedAt: seededAt,
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
      name: null,
      createdAt: seededAt,
      updatedAt: seededAt,
    });
    // Both Warehouses have their own Delivery Address recorded, which is the ordinary state of a
    // Warehouse that freezes drafts: since T16 a draft holding a Via Warehouse line cannot be moved
    // to Ready for Ordering before one exists (AC-16a), and that refusal has its own coverage in
    // `usecases/commands/ready-purchase-draft.command.integration.spec.ts`. Every case here is
    // about something else.
    await dataSource.manager.getRepository(WarehouseEntity).insert([
      {
        id: warehouseId,
        workspaceId,
        name: 'Warehouse A',
        archivedAt: null,
        deliveryAddressText: 'Dock 4, Test Industrial Estate, Test City',
        deliveryAccessNotes: 'Report to the gatehouse; deliveries 07:00-15:00',
        createdAt: seededAt,
        updatedAt: seededAt,
      },
      {
        id: otherWarehouseId,
        workspaceId,
        name: 'Warehouse B',
        archivedAt: null,
        deliveryAddressText: 'Unit 12, Other Estate, Other City',
        deliveryAccessNotes: null,
        createdAt: seededAt,
        updatedAt: seededAt,
      },
    ]);
    await dataSource.manager.getRepository(RoleEntity).insert([
      {
        id: roleId,
        warehouseId,
        name: 'Custodian',
        kind: 'custom',
        createdAt: seededAt,
        updatedAt: seededAt,
      },
      {
        id: otherWarehouseRoleId,
        warehouseId: otherWarehouseId,
        name: 'Other Warehouse Role',
        kind: 'custom',
        createdAt: seededAt,
        updatedAt: seededAt,
      },
      {
        id: deniedRoleId,
        warehouseId,
        name: 'Observer Without Permissions',
        kind: 'custom',
        createdAt: seededAt,
        updatedAt: seededAt,
      },
    ]);
    await seedPackagingTypes();
  };

  const setWarehouseArchived = async (
    id: string,
    archivedAt: Date | null,
  ): Promise<void> => {
    await dataSource.manager
      .getRepository(WarehouseEntity)
      .update({ id }, { archivedAt });
  };

  const seedIdentity = async (
    userId: string,
    normalizedEmail: string,
  ): Promise<void> => {
    await dataSource.transaction(async (manager) => {
      await manager.getRepository(AccountEntity).insert({
        id: userId,
        userId,
        normalizedEmail,
        passwordHash: 'synthetic-hash',
        passwordHashAlgorithm: 'scrypt',
        passwordHashParameters: { cost: 1_024 },
        createdAt: seededAt,
        updatedAt: seededAt,
      });
      await manager.getRepository(UserEntity).insert({
        id: userId,
        accountId: userId,
        workspaceId,
        createdAt: seededAt,
        updatedAt: seededAt,
      });
    });
  };

  const seedMembership = async (
    userId: string,
    userWarehouseId: string,
    userRoleId: string,
  ): Promise<void> => {
    await dataSource.manager.getRepository(WarehouseMembershipEntity).insert({
      userId,
      warehouseId: userWarehouseId,
      workspaceId,
      roleId: userRoleId,
      roleKind: 'custom',
      createdAt: seededAt,
      updatedAt: seededAt,
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

  // Each actor gets its OWN Role. Granting onto one shared Role would make every grant cumulative
  // across actors in a test — seeding a `:WATCH` actor after a `:CREATE` one would hand `:WATCH` to
  // the `:CREATE` actor too, and AC-22's whole point is that a Role carrying one Permission is
  // denied the others. A denial assertion against a shared Role can only ever pass by accident.
  const seedActorIn = async (
    actorWarehouseId: string,
    permissionIds: readonly string[],
  ): Promise<{ userId: string; cookie: string }> => {
    const userId = randomUUID();
    const actorRoleId = randomUUID();
    await seedIdentity(userId, `member.${userId}@example.test`);
    await dataSource.manager.getRepository(RoleEntity).insert({
      id: actorRoleId,
      warehouseId: actorWarehouseId,
      name: `Role ${actorRoleId}`,
      kind: 'custom',
      createdAt: seededAt,
      updatedAt: seededAt,
    });
    if (permissionIds.length > 0) {
      await grantPermissions(actorRoleId, permissionIds);
    }
    await seedMembership(userId, actorWarehouseId, actorRoleId);
    return { userId, cookie: await seedSessionCookie(userId) };
  };

  const seedActor = (
    permissionIds: readonly string[],
  ): Promise<{ userId: string; cookie: string }> =>
    seedActorIn(warehouseId, permissionIds);

  const seedItem = async (
    overrides: Partial<{
      id: string;
      warehouseId: string;
      sku: string;
      description: string;
      unitOfMeasure: string;
      onHandQuantity: number;
    }> = {},
  ): Promise<string> => {
    const id = overrides.id ?? randomUUID();
    await dataSource.manager.getRepository(ItemEntity).insert({
      id,
      warehouseId: overrides.warehouseId ?? warehouseId,
      sku: overrides.sku ?? `TEST-SKU-${id.slice(0, 8)}`,
      description: overrides.description ?? 'Test Item',
      unitOfMeasure: overrides.unitOfMeasure ?? 'pieces',
      onHandQuantity: overrides.onHandQuantity ?? 0,
      deactivatedAt: null,
      createdAt: seededAt,
      updatedAt: seededAt,
    });
    return id;
  };

  const seedRecorder = async (): Promise<string> => {
    const userId = randomUUID();
    await seedIdentity(userId, `recorder.${userId}@example.test`);
    return userId;
  };

  const seedCustomerOrder = async (
    itemId: string,
    overrides: Partial<{
      id: string;
      warehouseId: string;
      customerName: string;
      quantity: number;
      outstandingQuantity: number;
      neededBy: string;
      state: 'unfulfilled' | 'fulfilled' | 'cancelled';
      recordedByUserId: string;
      updatedAt: Date;
    }> = {},
  ): Promise<string> => {
    const id = overrides.id ?? randomUUID();
    const quantity = overrides.quantity ?? 100;
    const state = overrides.state ?? 'unfulfilled';
    const recordedByUserId =
      overrides.recordedByUserId ?? (await seedRecorder());
    const cancelled = state === 'cancelled';
    await dataSource.manager.getRepository(CustomerOrderEntity).insert({
      id,
      warehouseId: overrides.warehouseId ?? warehouseId,
      itemId,
      customerName: overrides.customerName ?? 'Test Customer North',
      quantity,
      outstandingQuantity:
        overrides.outstandingQuantity ?? (state === 'fulfilled' ? 0 : quantity),
      neededBy: overrides.neededBy ?? calendarDaysFromToday(30),
      state,
      cancellationReason: cancelled ? 'Seeded cancellation' : null,
      recordedByUserId,
      cancelledByUserId: cancelled ? recordedByUserId : null,
      cancelledAt: cancelled ? seededAt : null,
      createdAt: seededAt,
      // Left equal to `created_at` unless the scenario says the order moved, which is what
      // `LinkedCustomerOrderState.lastChangedAt` projects (AC-16).
      updatedAt: overrides.updatedAt ?? seededAt,
    });
    return id;
  };

  const request = async (
    method: string,
    path: string,
    cookie: string,
    body?: unknown,
  ): Promise<{ status: number; body: unknown }> => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text ? JSON.parse(text) : undefined,
    };
  };

  const purchaseDraftsPath = (warehouse: string): string =>
    `/api/v1/warehouses/${warehouse}/purchase-drafts`;

  // -- GET /packaging-types -- AC-13, AC-23 ------------------------------------------------------

  describe('GET /api/v1/warehouses/:warehouseId/packaging-types', () => {
    it('serves the four-row catalogue at its own segment, not under /purchase-drafts (AC-13)', async () => {
      await seedWarehouses();
      const actor = await seedActor([PURCHASE_DRAFTS_WATCH]);

      const { status, body } = await request(
        'GET',
        `/api/v1/warehouses/${warehouseId}/packaging-types`,
        actor.cookie,
      );

      expect(status).toBe(200);
      expect(body).toEqual(
        expect.arrayContaining([
          { id: 'loose_items', label: 'Loose items' },
          { id: 'cartons', label: 'Cartons' },
          { id: 'pallets', label: 'Pallets' },
          { id: 'cable_coil', label: 'Cable coil' },
        ]),
      );
    });

    it('still serves the catalogue on an archived Warehouse (AC-23)', async () => {
      await seedWarehouses();
      const actor = await seedActor([PURCHASE_DRAFTS_WATCH]);
      await setWarehouseArchived(warehouseId, seededAt);

      const { status, body } = await request(
        'GET',
        `/api/v1/warehouses/${warehouseId}/packaging-types`,
        actor.cookie,
      );

      expect(status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
    });
  });

  // -- POST /purchase-drafts -- AC-10, AC-11a, AC-22, AC-23 --------------------------------------

  describe('POST /api/v1/warehouses/:warehouseId/purchase-drafts', () => {
    it('records the draft in the Draft state with its lines, links and stated quantities (AC-10)', async () => {
      await seedWarehouses();
      const itemId = await seedItem({ sku: 'TEST-SKU-0001' });
      const orderOneId = await seedCustomerOrder(itemId, { quantity: 100 });
      const orderTwoId = await seedCustomerOrder(itemId, { quantity: 40 });
      const actor = await seedActor([PURCHASE_DRAFTS_CREATE]);

      const { status, body } = await request(
        'POST',
        purchaseDraftsPath(warehouseId),
        actor.cookie,
        {
          expectedArrivalDate: calendarDaysFromToday(10),
          lines: [
            {
              itemId,
              orderedQuantity: 150,
              packagingTypeId: 'cable_coil',
              valueAddingNote: 'Translated sticker on each coil',
              links: [
                { customerOrderId: orderOneId, statedQuantity: 100 },
                { customerOrderId: orderTwoId, statedQuantity: 40 },
              ],
            },
          ],
        },
      );

      expect(status).toBe(201);
      expect(body).toMatchObject({
        id: expect.any(String),
        state: 'draft',
        lineCount: 1,
        hasDriftSignal: false,
        createdByUserId: actor.userId,
        lines: [
          expect.objectContaining({
            itemId,
            orderedQuantity: 150,
            packagingTypeId: 'cable_coil',
            links: expect.arrayContaining([
              expect.objectContaining({
                customerOrderId: orderOneId,
                statedQuantity: 100,
              }),
              expect.objectContaining({
                customerOrderId: orderTwoId,
                statedQuantity: 40,
              }),
            ]),
          }),
        ],
      });
    });

    // AC-11a — overlapping links and links whose quantities do not add up to the line are both
    // accepted unchanged; coverage is the member's decision.
    it('accepts two links to the same Customer Order from different lines, unadjusted (AC-11a)', async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const orderId = await seedCustomerOrder(itemId, { quantity: 100 });
      const actor = await seedActor([PURCHASE_DRAFTS_CREATE]);

      const { status, body } = await request(
        'POST',
        purchaseDraftsPath(warehouseId),
        actor.cookie,
        {
          lines: [
            {
              itemId,
              orderedQuantity: 50,
              links: [{ customerOrderId: orderId, statedQuantity: 50 }],
            },
            {
              itemId,
              orderedQuantity: 80,
              links: [{ customerOrderId: orderId, statedQuantity: 80 }],
            },
          ],
        },
      );

      expect(status).toBe(201);
      expect((body as { lines: unknown[] }).lines).toHaveLength(2);
    });

    // AC-22 — a Role carrying only `:WATCH` is denied `:CREATE`.
    it('denies a create to an actor without PURCHASE_DRAFTS:CREATE (AC-22)', async () => {
      await seedWarehouses();
      const actor = await seedActor([PURCHASE_DRAFTS_WATCH]);

      const { status, body } = await request(
        'POST',
        purchaseDraftsPath(warehouseId),
        actor.cookie,
        { lines: [] },
      );

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'access.denied' });
    });

    // AC-11 — an Item of another Warehouse is refused as a missing one.
    it('refuses a line naming an Item of another Warehouse (AC-11)', async () => {
      await seedWarehouses();
      const crossWarehouseItemId = await seedItem({
        warehouseId: otherWarehouseId,
      });
      const actor = await seedActor([PURCHASE_DRAFTS_CREATE]);

      const { status, body } = await request(
        'POST',
        purchaseDraftsPath(warehouseId),
        actor.cookie,
        { lines: [{ itemId: crossWarehouseItemId, orderedQuantity: 10 }] },
      );

      expect(status).toBe(404);
      expect(body).toMatchObject({
        code: 'purchase_drafts.target_unavailable',
      });
    });

    // AC-23 — a mutation is refused on an archived Warehouse.
    it('refuses to create a draft on an archived Warehouse (AC-23)', async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const actor = await seedActor([PURCHASE_DRAFTS_CREATE]);
      await setWarehouseArchived(warehouseId, seededAt);

      const { status, body } = await request(
        'POST',
        purchaseDraftsPath(warehouseId),
        actor.cookie,
        { lines: [{ itemId, orderedQuantity: 10 }] },
      );

      expect(status).toBe(409);
      expect(body).toMatchObject({ code: 'access.warehouse_archived' });
    });
  });

  // -- GET /purchase-drafts, GET /purchase-drafts/:id -- AC-16a, AC-22, AC-23 --------------------

  describe('GET reads', () => {
    it('lists Purchase Drafts and reads one, denying without PURCHASE_DRAFTS:WATCH but not disclosing existence (AC-22)', async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const creator = await seedActor([PURCHASE_DRAFTS_CREATE]);
      const created = await request(
        'POST',
        purchaseDraftsPath(warehouseId),
        creator.cookie,
        { lines: [{ itemId, orderedQuantity: 10 }] },
      );
      const draftId = (created.body as { id: string }).id;
      const watcher = await seedActor([PURCHASE_DRAFTS_WATCH]);

      const list = await request(
        'GET',
        purchaseDraftsPath(warehouseId),
        watcher.cookie,
      );
      const single = await request(
        'GET',
        `${purchaseDraftsPath(warehouseId)}/${draftId}`,
        watcher.cookie,
      );
      const deniedList = await request(
        'GET',
        purchaseDraftsPath(warehouseId),
        creator.cookie,
      );

      expect(list.status).toBe(200);
      expect(list.body).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: draftId })]),
      );
      expect(single.status).toBe(200);
      expect(single.body).toMatchObject({ id: draftId, state: 'draft' });
      // The creator holds only `:CREATE`, not `:WATCH` — AC-22's "continues to read the drafts
      // their Role does permit" cuts both ways: no Permission, no read either.
      expect(deniedList.status).toBe(403);
    });

    // The web validates every response against these exact schemas and turns any parse failure
    // into `api.unexpected`; the list is validated as a whole array, so a single malformed draft
    // blanks the entire Purchase Drafts screen. Asserting the shared schemas here — rather than a
    // hand-written `toMatchObject` — is what makes that class of failure impossible to ship: it
    // covers `expectedArrivalDate` being a calendar day rather than a shifted date-time (AC-10)
    // and `reference` being present on both projections.
    it('answers the list and the detail in the exact shape the shared contract accepts (AC-10, AC-16a)', async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const movedOrderId = await seedCustomerOrder(itemId, {
        quantity: 100,
        updatedAt: movedAt,
      });
      const untouchedOrderId = await seedCustomerOrder(itemId, {
        quantity: 40,
      });
      const actor = await seedActor([
        PURCHASE_DRAFTS_CREATE,
        PURCHASE_DRAFTS_WATCH,
      ]);
      const created = await request(
        'POST',
        purchaseDraftsPath(warehouseId),
        actor.cookie,
        {
          expectedArrivalDate: '2026-09-25',
          lines: [
            {
              itemId,
              orderedQuantity: 10,
              links: [
                { customerOrderId: movedOrderId, statedQuantity: 6 },
                { customerOrderId: untouchedOrderId, statedQuantity: 4 },
              ],
            },
          ],
        },
      );
      const draftId = (created.body as { id: string }).id;

      const list = await request(
        'GET',
        purchaseDraftsPath(warehouseId),
        actor.cookie,
      );
      const single = await request(
        'GET',
        `${purchaseDraftsPath(warehouseId)}/${draftId}`,
        actor.cookie,
      );

      const summaries = purchaseDraftSummarySchema.array().parse(list.body);
      const detail = purchaseDraftDetailSchema.parse(single.body);

      expect(summaries).toHaveLength(1);
      expect(summaries[0]?.expectedArrivalDate).toBe('2026-09-25');
      expect(detail.expectedArrivalDate).toBe('2026-09-25');
      expect(detail.reference).toMatch(/^PD-\d{4,}$/u);
      expect(summaries[0]?.reference).toBe(detail.reference);
      // The draft the creation answered with names the same draft as the reads do.
      expect(purchaseDraftDetailSchema.parse(created.body).reference).toBe(
        detail.reference,
      );

      // AC-16 — `lastChangedAt` is what dates a drift statement (`Cancelled on 24 Aug`,
      // design frame `F0SpRx.png`). Parsing it through `purchaseDraftDetailSchema` above is the
      // assertion that matters: `z.string().datetime()` refuses a timestamp carrying the session's
      // own UTC offset instead of a `Z`, which is what an uncast `timestamptz` inside
      // `json_build_object` would produce. An order still standing as it was recorded reports no
      // moment rather than its creation time.
      const linkFor = (
        customerOrderId: string,
      ): (typeof detail.lines)[number]['links'][number] | undefined =>
        detail.lines
          .flatMap((line) => line.links)
          .find((link) => link.customerOrderId === customerOrderId);
      expect(linkFor(movedOrderId)?.current.lastChangedAt).toBe(
        movedAt.toISOString(),
      );
      expect(linkFor(untouchedOrderId)?.current.lastChangedAt).toBeNull();
    });

    it('still reads Purchase Drafts of an archived Warehouse with a watch Permission (AC-23)', async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const creator = await seedActor([
        PURCHASE_DRAFTS_CREATE,
        PURCHASE_DRAFTS_WATCH,
      ]);
      await request('POST', purchaseDraftsPath(warehouseId), creator.cookie, {
        lines: [{ itemId, orderedQuantity: 10 }],
      });
      await setWarehouseArchived(warehouseId, seededAt);

      const { status, body } = await request(
        'GET',
        purchaseDraftsPath(warehouseId),
        creator.cookie,
      );

      expect(status).toBe(200);
      expect(body).toHaveLength(1);
    });
  });

  // -- POST /purchase-drafts/:id/readiness -- AC-14, AC-14a, AC-22, AC-23 ------------------------

  describe('POST /api/v1/warehouses/:warehouseId/purchase-drafts/:purchaseDraftId/readiness', () => {
    it('freezes the draft, capturing the linked demand as it stands (AC-14)', async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const orderId = await seedCustomerOrder(itemId, {
        quantity: 100,
        neededBy: calendarDaysFromToday(20),
      });
      const actor = await seedActor([
        PURCHASE_DRAFTS_CREATE,
        PURCHASE_DRAFTS_READY,
      ]);
      const created = await request(
        'POST',
        purchaseDraftsPath(warehouseId),
        actor.cookie,
        {
          lines: [
            {
              itemId,
              orderedQuantity: 100,
              links: [{ customerOrderId: orderId, statedQuantity: 100 }],
            },
          ],
        },
      );
      const draftId = (created.body as { id: string }).id;

      const { status, body } = await request(
        'POST',
        `${purchaseDraftsPath(warehouseId)}/${draftId}/readiness`,
        actor.cookie,
      );

      expect(status).toBe(200);
      expect(body).toMatchObject({
        id: draftId,
        state: 'ready_for_ordering',
        readiedByUserId: actor.userId,
        readiedAt: expect.any(String),
      });
    });

    // AC-14a — an empty draft cannot be made ready.
    it('refuses to ready a draft holding no lines (AC-14a)', async () => {
      await seedWarehouses();
      const actor = await seedActor([
        PURCHASE_DRAFTS_CREATE,
        PURCHASE_DRAFTS_READY,
      ]);
      const created = await request(
        'POST',
        purchaseDraftsPath(warehouseId),
        actor.cookie,
        { lines: [] },
      );
      const draftId = (created.body as { id: string }).id;

      const { status, body } = await request(
        'POST',
        `${purchaseDraftsPath(warehouseId)}/${draftId}/readiness`,
        actor.cookie,
      );

      expect(status).toBe(409);
      expect(body).toMatchObject({ code: 'purchase_drafts.draft_empty' });
    });

    // AC-22 — a Role carrying only `:WATCH` is denied `:READY`, and nothing changes.
    it('denies the freeze to an actor without PURCHASE_DRAFTS:READY, changing nothing (AC-22)', async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const creator = await seedActor([PURCHASE_DRAFTS_CREATE]);
      const created = await request(
        'POST',
        purchaseDraftsPath(warehouseId),
        creator.cookie,
        { lines: [{ itemId, orderedQuantity: 10 }] },
      );
      const draftId = (created.body as { id: string }).id;
      const watcher = await seedActor([PURCHASE_DRAFTS_WATCH]);

      const { status, body } = await request(
        'POST',
        `${purchaseDraftsPath(warehouseId)}/${draftId}/readiness`,
        watcher.cookie,
      );
      const stillDraft = await request(
        'GET',
        `${purchaseDraftsPath(warehouseId)}/${draftId}`,
        watcher.cookie,
      );

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'access.denied' });
      expect((stillDraft.body as { state: string }).state).toBe('draft');
    });
  });

  // -- AC-15 — a frozen draft refuses every assembly write, and no frozen field is reachable ------
  // through the arrival or closure payload -------------------------------------------------------

  describe('a frozen Purchase Draft (AC-15)', () => {
    const freezeADraft = async (): Promise<{
      draftId: string;
      itemId: string;
      orderId: string;
      cookie: string;
      userId: string;
    }> => {
      await seedWarehouses();
      const itemId = await seedItem();
      const orderId = await seedCustomerOrder(itemId, { quantity: 100 });
      const actor = await seedActor([
        PURCHASE_DRAFTS_CREATE,
        PURCHASE_DRAFTS_UPDATE,
        PURCHASE_DRAFTS_READY,
        PURCHASE_DRAFTS_CLOSE,
        PURCHASE_DRAFTS_RECEIVE,
        PURCHASE_DRAFTS_DISCARD,
      ]);
      const created = await request(
        'POST',
        purchaseDraftsPath(warehouseId),
        actor.cookie,
        {
          lines: [
            {
              itemId,
              orderedQuantity: 100,
              links: [{ customerOrderId: orderId, statedQuantity: 100 }],
            },
          ],
        },
      );
      const draftId = (created.body as { id: string }).id;
      await request(
        'POST',
        `${purchaseDraftsPath(warehouseId)}/${draftId}/readiness`,
        actor.cookie,
      );
      return {
        draftId,
        itemId,
        orderId,
        cookie: actor.cookie,
        userId: actor.userId,
      };
    };

    it('refuses to revise the draft, add or revise a line, and add or revise a link once frozen', async () => {
      const { draftId, itemId, orderId, cookie } = await freezeADraft();
      const draftPath = `${purchaseDraftsPath(warehouseId)}/${draftId}`;

      const reviseDraft = await request('PATCH', draftPath, cookie, {
        expectedArrivalDate: calendarDaysFromToday(5),
      });
      const addLine = await request('POST', `${draftPath}/lines`, cookie, {
        itemId,
        orderedQuantity: 5,
      });

      expect(reviseDraft.status).toBe(409);
      expect(reviseDraft.body).toMatchObject({
        code: 'purchase_drafts.draft_frozen',
      });
      expect(addLine.status).toBe(409);
      expect(addLine.body).toMatchObject({
        code: 'purchase_drafts.draft_frozen',
      });
      // Confirms the identifiers exist so the refusal above is proven to be the frozen-record
      // rule and not an unrelated 404.
      expect(orderId).toEqual(expect.any(String));
    });

    it('cannot be discarded once ready — a ready draft is closed with a reason instead (AC-24a)', async () => {
      const { draftId, cookie } = await freezeADraft();

      const { status, body } = await request(
        'DELETE',
        `${purchaseDraftsPath(warehouseId)}/${draftId}`,
        cookie,
      );

      expect(status).toBe(409);
      expect(body).toMatchObject({
        code: 'purchase_drafts.discard_unavailable',
      });
    });

    // AC-15's central assertion: the arrival and closure payload schemas carry none of the
    // frozen fields, so submitting one alongside a legal request is refused at validation, never
    // reaching a write.
    it('refuses a frozen field submitted on the per-line ending payload', async () => {
      const { draftId, cookie } = await freezeADraft();

      const { status, body } = await request(
        'POST',
        `${purchaseDraftsPath(warehouseId)}/${draftId}/lines/${randomUUID()}/arrival`,
        cookie,
        {
          receivedQuantity: 10,
          expectedArrivalDate: calendarDaysFromToday(1),
        },
      );

      expect(status).toBe(400);
      expect(body).toMatchObject({ code: 'request.invalid' });
    });

    it('refuses a frozen field submitted on the closure payload', async () => {
      const { draftId, cookie } = await freezeADraft();

      const { status, body } = await request(
        'POST',
        `${purchaseDraftsPath(warehouseId)}/${draftId}/closure`,
        cookie,
        { closureReason: 'The supplier cannot fulfil the order', lines: [] },
      );

      expect(status).toBe(400);
      expect(body).toMatchObject({ code: 'request.invalid' });
    });
  });

  // -- POST /purchase-drafts/:id/lines/:lineId/arrival -- AC-19, AC-22, AC-23 ---------------------

  describe('POST /api/v1/warehouses/:warehouseId/purchase-drafts/:purchaseDraftId/lines/:purchaseDraftLineId/arrival', () => {
    it('records what arrived on the line and allocates it across the linked Customer Orders, closing the draft because it was its last line (AC-19)', async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const orderOneId = await seedCustomerOrder(itemId, { quantity: 100 });
      const orderTwoId = await seedCustomerOrder(itemId, { quantity: 40 });
      const actor = await seedActor([
        PURCHASE_DRAFTS_CREATE,
        PURCHASE_DRAFTS_READY,
        PURCHASE_DRAFTS_RECEIVE,
        // The setup below reads the draft back to resolve its line and link ids.
        PURCHASE_DRAFTS_WATCH,
      ]);
      const created = await request(
        'POST',
        purchaseDraftsPath(warehouseId),
        actor.cookie,
        {
          lines: [
            {
              itemId,
              orderedQuantity: 140,
              links: [
                { customerOrderId: orderOneId, statedQuantity: 100 },
                { customerOrderId: orderTwoId, statedQuantity: 40 },
              ],
            },
          ],
        },
      );
      const draftId = (created.body as { id: string }).id;
      const draftDetail = (
        await request(
          'GET',
          `${purchaseDraftsPath(warehouseId)}/${draftId}`,
          actor.cookie,
        )
      ).body as {
        lines: readonly {
          id: string;
          links: readonly { id: string; customerOrderId: string }[];
        }[];
      };
      const lineId = draftDetail.lines[0].id;
      const linkOneId = draftDetail.lines[0].links.find(
        (link) => link.customerOrderId === orderOneId,
      )!.id;
      const linkTwoId = draftDetail.lines[0].links.find(
        (link) => link.customerOrderId === orderTwoId,
      )!.id;
      await request(
        'POST',
        `${purchaseDraftsPath(warehouseId)}/${draftId}/readiness`,
        actor.cookie,
      );

      const { status, body } = await request(
        'POST',
        `${purchaseDraftsPath(warehouseId)}/${draftId}/lines/${lineId}/arrival`,
        actor.cookie,
        {
          receivedQuantity: 140,
          allocations: [
            { purchaseDraftLineLinkId: linkOneId, allocatedQuantity: 100 },
            { purchaseDraftLineLinkId: linkTwoId, allocatedQuantity: 40 },
          ],
        },
      );

      expect(status).toBe(200);
      expect(body).toMatchObject({
        id: draftId,
        // AC-19 — the draft closes because this was its **last** line without an ending, not
        // because an ending was recorded at all. The attribution now lives on the line
        // (`ending`), not on the draft: `arrivalConfirmedByUserId` belonged to the withdrawn
        // whole-draft act and stays null on a draft closed by per-line endings (ADR 0002).
        state: 'closed',
        lines: [
          expect.objectContaining({
            ending: expect.objectContaining({
              kind: 'arrival',
              quantity: 140,
              recordedByUserId: actor.userId,
            }),
            links: expect.arrayContaining([
              expect.objectContaining({
                id: linkOneId,
                allocation: expect.objectContaining({ allocatedQuantity: 100 }),
              }),
              expect.objectContaining({
                id: linkTwoId,
                allocation: expect.objectContaining({ allocatedQuantity: 40 }),
              }),
            ]),
          }),
        ],
      });
    });

    // AC-22 — a Role carrying only `:WATCH` is denied `:RECEIVE`.
    it("denies the line's ending to an actor without PURCHASE_DRAFTS:RECEIVE (AC-22)", async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const actor = await seedActor([
        PURCHASE_DRAFTS_CREATE,
        PURCHASE_DRAFTS_READY,
      ]);
      const created = await request(
        'POST',
        purchaseDraftsPath(warehouseId),
        actor.cookie,
        { lines: [{ itemId, orderedQuantity: 10 }] },
      );
      const draftId = (created.body as { id: string }).id;
      await request(
        'POST',
        `${purchaseDraftsPath(warehouseId)}/${draftId}/readiness`,
        actor.cookie,
      );

      const { status, body } = await request(
        'POST',
        `${purchaseDraftsPath(warehouseId)}/${draftId}/lines/${randomUUID()}/arrival`,
        actor.cookie,
        { receivedQuantity: 0 },
      );

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'access.denied' });
    });

    // AC-22 for the *other* half of the same act. ADR 0002 splits one ending into two routes under
    // one Permission, so the guard has to be proven on both — the arrival case above cannot stand
    // for the direct-delivery one (server-request-authorization.md §Verify).
    it("denies the line's direct delivery to an actor without PURCHASE_DRAFTS:RECEIVE (AC-22)", async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const actor = await seedActor([
        PURCHASE_DRAFTS_CREATE,
        PURCHASE_DRAFTS_READY,
      ]);
      const created = await request(
        'POST',
        purchaseDraftsPath(warehouseId),
        actor.cookie,
        { lines: [{ itemId, orderedQuantity: 10 }] },
      );
      const draftId = (created.body as { id: string }).id;
      await request(
        'POST',
        `${purchaseDraftsPath(warehouseId)}/${draftId}/readiness`,
        actor.cookie,
      );

      const { status, body } = await request(
        'POST',
        `${purchaseDraftsPath(warehouseId)}/${draftId}/lines/${randomUUID()}/direct-delivery`,
        actor.cookie,
        { deliveredQuantity: 0 },
      );

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'access.denied' });
    });
  });

  // -- POST /purchase-drafts/:id/closure -- AC-21, AC-22, AC-23 -----------------------------------

  describe('POST /api/v1/warehouses/:warehouseId/purchase-drafts/:purchaseDraftId/closure', () => {
    it('closes a frozen draft with a reason, leaving the linked demand untouched (AC-21)', async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const orderId = await seedCustomerOrder(itemId, { quantity: 100 });
      const actor = await seedActor([
        PURCHASE_DRAFTS_CREATE,
        PURCHASE_DRAFTS_READY,
        PURCHASE_DRAFTS_CLOSE,
        PURCHASE_DRAFTS_WATCH,
        CUSTOMER_ORDERS_WATCH,
      ]);
      const created = await request(
        'POST',
        purchaseDraftsPath(warehouseId),
        actor.cookie,
        {
          lines: [
            {
              itemId,
              orderedQuantity: 100,
              links: [{ customerOrderId: orderId, statedQuantity: 100 }],
            },
          ],
        },
      );
      const draftId = (created.body as { id: string }).id;
      await request(
        'POST',
        `${purchaseDraftsPath(warehouseId)}/${draftId}/readiness`,
        actor.cookie,
      );

      const { status, body } = await request(
        'POST',
        `${purchaseDraftsPath(warehouseId)}/${draftId}/closure`,
        actor.cookie,
        { closureReason: 'The supplier cannot fulfil the order' },
      );
      const demand = await request(
        'GET',
        `/api/v1/warehouses/${warehouseId}/demand`,
        actor.cookie,
      );

      expect(status).toBe(200);
      expect(body).toMatchObject({
        id: draftId,
        state: 'closed',
        closureReason: 'The supplier cannot fulfil the order',
      });
      // AC-21/AC-21a — a Closed draft never presents as Coverage, and the linked demand's
      // Outstanding Quantity is untouched.
      expect(demand.body).toEqual([
        expect.objectContaining({
          itemId,
          totalOutstandingQuantity: 100,
          coverage: [],
        }),
      ]);
    });

    // AC-22 — a Role carrying only `:WATCH` is denied `:CLOSE`.
    it('denies the closure to an actor without PURCHASE_DRAFTS:CLOSE (AC-22)', async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const actor = await seedActor([
        PURCHASE_DRAFTS_CREATE,
        PURCHASE_DRAFTS_READY,
      ]);
      const created = await request(
        'POST',
        purchaseDraftsPath(warehouseId),
        actor.cookie,
        { lines: [{ itemId, orderedQuantity: 10 }] },
      );
      const draftId = (created.body as { id: string }).id;
      await request(
        'POST',
        `${purchaseDraftsPath(warehouseId)}/${draftId}/readiness`,
        actor.cookie,
      );

      const { status, body } = await request(
        'POST',
        `${purchaseDraftsPath(warehouseId)}/${draftId}/closure`,
        actor.cookie,
        { closureReason: 'The supplier cannot fulfil the order' },
      );

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'access.denied' });
    });
  });

  // -- DELETE /purchase-drafts/:id -- AC-24, AC-22, AC-23 -----------------------------------------

  describe('DELETE /api/v1/warehouses/:warehouseId/purchase-drafts/:purchaseDraftId', () => {
    it('discards a Draft-state draft, leaving every linked Customer Order untouched (AC-24)', async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const orderId = await seedCustomerOrder(itemId, { quantity: 100 });
      const actor = await seedActor([
        PURCHASE_DRAFTS_CREATE,
        PURCHASE_DRAFTS_DISCARD,
        PURCHASE_DRAFTS_WATCH,
        CUSTOMER_ORDERS_WATCH,
      ]);
      const created = await request(
        'POST',
        purchaseDraftsPath(warehouseId),
        actor.cookie,
        {
          lines: [
            {
              itemId,
              orderedQuantity: 100,
              links: [{ customerOrderId: orderId, statedQuantity: 100 }],
            },
          ],
        },
      );
      const draftId = (created.body as { id: string }).id;

      const { status, body } = await request(
        'DELETE',
        `${purchaseDraftsPath(warehouseId)}/${draftId}`,
        actor.cookie,
      );
      const demand = await request(
        'GET',
        `/api/v1/warehouses/${warehouseId}/demand`,
        actor.cookie,
      );

      expect(status).toBe(200);
      expect(body).toMatchObject({
        id: draftId,
        state: 'discarded',
        discardedByUserId: actor.userId,
      });
      expect(demand.body).toEqual([
        expect.objectContaining({
          itemId,
          totalOutstandingQuantity: 100,
          coverage: [],
        }),
      ]);
    });

    // AC-22 — a Role carrying only `:WATCH` is denied `:DISCARD`.
    it('denies the discard to an actor without PURCHASE_DRAFTS:DISCARD (AC-22)', async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const creator = await seedActor([PURCHASE_DRAFTS_CREATE]);
      const created = await request(
        'POST',
        purchaseDraftsPath(warehouseId),
        creator.cookie,
        { lines: [{ itemId, orderedQuantity: 10 }] },
      );
      const draftId = (created.body as { id: string }).id;
      const watcher = await seedActor([PURCHASE_DRAFTS_WATCH]);

      const { status, body } = await request(
        'DELETE',
        `${purchaseDraftsPath(warehouseId)}/${draftId}`,
        watcher.cookie,
      );

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'access.denied' });
    });
  });

  // -- openapi.yaml `PurchaseDraftTargetUnavailable`, the `unknownLine` example -------------------

  describe('POST /api/v1/warehouses/:warehouseId/purchase-drafts/:purchaseDraftId/lines/:lineId/links', () => {
    // `purchaseDraftLineId` is caller-supplied and reaches the INSERT as half of
    // `fk_purchase_draft_line_links_line`'s composite reference. Unchecked, a line belonging to a
    // sibling draft raised a `QueryFailedError` the global filter could only answer 500
    // `system.internal_error` with — where openapi.yaml declares 404 and carries an `unknownLine`
    // example written for exactly this case.
    it('answers 404 target_unavailable for a line of another draft, never 500 (openapi.yaml unknownLine)', async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const orderId = await seedCustomerOrder(itemId, { quantity: 100 });
      const actor = await seedActor([
        PURCHASE_DRAFTS_CREATE,
        PURCHASE_DRAFTS_UPDATE,
        PURCHASE_DRAFTS_WATCH,
      ]);
      const target = await request(
        'POST',
        purchaseDraftsPath(warehouseId),
        actor.cookie,
        { lines: [{ itemId, orderedQuantity: 10 }] },
      );
      const sibling = await request(
        'POST',
        purchaseDraftsPath(warehouseId),
        actor.cookie,
        { lines: [{ itemId, orderedQuantity: 20 }] },
      );
      const targetDraftId = (target.body as { id: string }).id;
      const siblingLineId = (sibling.body as { lines: { id: string }[] })
        .lines[0].id;

      const ofASiblingDraft = await request(
        'POST',
        `${purchaseDraftsPath(warehouseId)}/${targetDraftId}/lines/${siblingLineId}/links`,
        actor.cookie,
        { customerOrderId: orderId, statedQuantity: 5 },
      );
      const ofNoDraft = await request(
        'POST',
        `${purchaseDraftsPath(warehouseId)}/${targetDraftId}/lines/${randomUUID()}/links`,
        actor.cookie,
        { customerOrderId: orderId, statedQuantity: 5 },
      );

      expect(ofASiblingDraft.status).toBe(404);
      expect(ofASiblingDraft.body).toMatchObject({
        code: 'purchase_drafts.target_unavailable',
      });
      // A line that exists on a sibling draft and a line id that names nothing answer identically,
      // so the refusal does not disclose that the line exists elsewhere.
      expect(ofASiblingDraft.status).toBe(ofNoDraft.status);
      expect(ofASiblingDraft.body).toEqual(ofNoDraft.body);

      // Neither draft gained a link.
      const siblingAfter = await request(
        'GET',
        `${purchaseDraftsPath(warehouseId)}/${(sibling.body as { id: string }).id}`,
        actor.cookie,
      );
      expect(
        (siblingAfter.body as { lines: { links: unknown[] }[] }).lines[0].links,
      ).toEqual([]);
    });
  });

  // -- spec.md §6.1 "Cross-Warehouse demand reach" — the headline claim of the scoping work -------

  describe('a Purchase Draft of another Warehouse (spec.md §6.1)', () => {
    // The claim the whole scoping change rests on is not "a foreign draft is refused" — it is that
    // the refusal is *indistinguishable* from the one a draft id naming nothing at all produces. A
    // member holding `PURCHASE_DRAFTS:UPDATE` in Warehouse A who learns a Warehouse B draft id must
    // not be able to tell, from any answer this API gives, that the draft exists. Status alone does
    // not prove that: a differing `code` or `message` in the body enumerates just as effectively,
    // so both halves are compared. Asserted per route rather than once, because each route reaches
    // its guard by its own path — some through the guarded `UPDATE`'s own `WHERE`, some through a
    // command's pre-read — and a regression would land on one of them, not all.
    it('refuses every mutation exactly as it refuses a draft that does not exist', async () => {
      await seedWarehouses();

      // Warehouse B assembles a real draft, through its own member, with a line and a link.
      const foreignActor = await seedActorIn(otherWarehouseId, [
        PURCHASE_DRAFTS_CREATE,
        PURCHASE_DRAFTS_WATCH,
      ]);
      const foreignItemId = await seedItem({ warehouseId: otherWarehouseId });
      const foreignOrderId = await seedCustomerOrder(foreignItemId, {
        warehouseId: otherWarehouseId,
      });
      const foreignDraft = await request(
        'POST',
        purchaseDraftsPath(otherWarehouseId),
        foreignActor.cookie,
        {
          lines: [
            {
              itemId: foreignItemId,
              orderedQuantity: 10,
              links: [{ customerOrderId: foreignOrderId, statedQuantity: 4 }],
            },
          ],
        },
      );
      expect(foreignDraft.status).toBe(201);
      const foreignDetail = foreignDraft.body as {
        id: string;
        lines: { id: string; links: { id: string }[] }[];
      };
      const foreign = {
        draftId: foreignDetail.id,
        lineId: foreignDetail.lines[0].id,
        linkId: foreignDetail.lines[0].links[0].id,
      };
      const missing = {
        draftId: randomUUID(),
        lineId: randomUUID(),
        linkId: randomUUID(),
      };

      // Warehouse A's member holds every write Permission these routes require — the refusal under
      // test has to be the scoping one, never an authorization one.
      const actor = await seedActor([
        PURCHASE_DRAFTS_UPDATE,
        PURCHASE_DRAFTS_READY,
        PURCHASE_DRAFTS_CLOSE,
        PURCHASE_DRAFTS_DISCARD,
      ]);
      // Every Item and Customer Order named below belongs to Warehouse A, so each request passes
      // its own availability checks and is refused for the draft alone.
      const itemId = await seedItem();
      const orderId = await seedCustomerOrder(itemId, { quantity: 100 });
      const base = purchaseDraftsPath(warehouseId);

      const routes = (target: {
        draftId: string;
        lineId: string;
        linkId: string;
      }): { name: string; method: string; path: string; body?: unknown }[] => [
        {
          name: 'PATCH /:draftId',
          method: 'PATCH',
          path: `${base}/${target.draftId}`,
          body: { expectedArrivalDate: calendarDaysFromToday(10) },
        },
        {
          name: 'POST /:draftId/lines',
          method: 'POST',
          path: `${base}/${target.draftId}/lines`,
          body: { itemId, orderedQuantity: 5 },
        },
        {
          name: 'PATCH /:draftId/lines/:lineId',
          method: 'PATCH',
          path: `${base}/${target.draftId}/lines/${target.lineId}`,
          body: { orderedQuantity: 7 },
        },
        {
          name: 'DELETE /:draftId/lines/:lineId',
          method: 'DELETE',
          path: `${base}/${target.draftId}/lines/${target.lineId}`,
        },
        {
          name: 'POST /:draftId/lines/:lineId/links',
          method: 'POST',
          path: `${base}/${target.draftId}/lines/${target.lineId}/links`,
          body: { customerOrderId: orderId, statedQuantity: 3 },
        },
        {
          name: 'PATCH /:draftId/lines/:lineId/links/:linkId',
          method: 'PATCH',
          path: `${base}/${target.draftId}/lines/${target.lineId}/links/${target.linkId}`,
          body: { statedQuantity: 2 },
        },
        {
          name: 'DELETE /:draftId/lines/:lineId/links/:linkId',
          method: 'DELETE',
          path: `${base}/${target.draftId}/lines/${target.lineId}/links/${target.linkId}`,
        },
        {
          name: 'POST /:draftId/readiness',
          method: 'POST',
          path: `${base}/${target.draftId}/readiness`,
        },
        {
          name: 'POST /:draftId/closure',
          method: 'POST',
          path: `${base}/${target.draftId}/closure`,
          body: { closureReason: 'The supplier cannot fulfil the order' },
        },
        {
          name: 'DELETE /:draftId',
          method: 'DELETE',
          path: `${base}/${target.draftId}`,
        },
      ];

      const foreignRoutes = routes(foreign);
      const missingRoutes = routes(missing);
      const answers: {
        name: string;
        onForeign: { status: number; body: unknown };
        onMissing: { status: number; body: unknown };
      }[] = [];

      for (const [index, route] of foreignRoutes.entries()) {
        const onForeign = await request(
          route.method,
          route.path,
          actor.cookie,
          route.body,
        );
        const absent = missingRoutes[index];
        const onMissing = await request(
          absent.method,
          absent.path,
          actor.cookie,
          absent.body,
        );
        answers.push({ name: route.name, onForeign, onMissing });
      }

      for (const answer of answers) {
        expect({
          route: answer.name,
          status: answer.onForeign.status,
          body: answer.onForeign.body,
        }).toEqual({
          route: answer.name,
          status: answer.onMissing.status,
          body: answer.onMissing.body,
        });
        // And the shared answer is the non-enumerating one, not an incidental 500 or a refusal
        // that names the draft's real state.
        expect(answer.onForeign.status).toBe(404);
        expect(answer.onForeign.body).toEqual({
          code: 'purchase_drafts.target_unavailable',
          message: expect.any(String),
        });
      }

      // Nothing reached Warehouse B: its draft is still the Draft-state draft it assembled.
      const untouched = await request(
        'GET',
        `${purchaseDraftsPath(otherWarehouseId)}/${foreign.draftId}`,
        foreignActor.cookie,
      );
      expect(untouched.status).toBe(200);
      expect(untouched.body).toMatchObject({
        id: foreign.draftId,
        state: 'draft',
        lines: [expect.objectContaining({ orderedQuantity: 10 })],
      });
    });
  });

  // -- AC-23 — every mutation is denied on an archived Warehouse ----------------------------------

  describe('archived Warehouse (AC-23)', () => {
    it("denies creating a draft, moving one to Ready for Ordering, and recording a line's ending, while reads keep working", async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const orderId = await seedCustomerOrder(itemId, { quantity: 100 });
      const actor = await seedActor([
        PURCHASE_DRAFTS_CREATE,
        PURCHASE_DRAFTS_READY,
        PURCHASE_DRAFTS_RECEIVE,
        PURCHASE_DRAFTS_WATCH,
      ]);
      const created = await request(
        'POST',
        purchaseDraftsPath(warehouseId),
        actor.cookie,
        {
          lines: [
            {
              itemId,
              orderedQuantity: 100,
              links: [{ customerOrderId: orderId, statedQuantity: 100 }],
            },
          ],
        },
      );
      const draftId = (created.body as { id: string }).id;
      await setWarehouseArchived(warehouseId, seededAt);

      const create = await request(
        'POST',
        purchaseDraftsPath(warehouseId),
        actor.cookie,
        { lines: [{ itemId, orderedQuantity: 10 }] },
      );
      const ready = await request(
        'POST',
        `${purchaseDraftsPath(warehouseId)}/${draftId}/readiness`,
        actor.cookie,
      );
      const arrival = await request(
        'POST',
        `${purchaseDraftsPath(warehouseId)}/${draftId}/lines/${randomUUID()}/arrival`,
        actor.cookie,
        { receivedQuantity: 0 },
      );
      const directDelivery = await request(
        'POST',
        `${purchaseDraftsPath(warehouseId)}/${draftId}/lines/${randomUUID()}/direct-delivery`,
        actor.cookie,
        { deliveredQuantity: 0 },
      );
      const stillReads = await request(
        'GET',
        purchaseDraftsPath(warehouseId),
        actor.cookie,
      );

      expect(create.status).toBe(409);
      expect(create.body).toMatchObject({ code: 'access.warehouse_archived' });
      expect(ready.status).toBe(409);
      expect(ready.body).toMatchObject({ code: 'access.warehouse_archived' });
      expect(arrival.status).toBe(409);
      expect(arrival.body).toMatchObject({ code: 'access.warehouse_archived' });
      // Both halves of the ending are refused over an archived Warehouse, not just the arrival.
      expect(directDelivery.status).toBe(409);
      expect(directDelivery.body).toMatchObject({
        code: 'access.warehouse_archived',
      });
      expect(stillReads.status).toBe(200);
    });
  });
});
