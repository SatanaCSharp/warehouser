/* eslint-disable max-lines -- one HTTP contract suite covering the whole purchase-drafts
   surface: nine route families and eight acceptance criteria, matching the items and
   customer-orders precedents. Splitting it would separate assertions from the shared
   fixture they are read against. */
import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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
    await dataSource.manager.getRepository(WarehouseEntity).insert([
      {
        id: warehouseId,
        workspaceId,
        name: 'Warehouse A',
        archivedAt: null,
        createdAt: seededAt,
        updatedAt: seededAt,
      },
      {
        id: otherWarehouseId,
        workspaceId,
        name: 'Warehouse B',
        archivedAt: null,
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
  const seedActor = async (
    permissionIds: readonly string[],
  ): Promise<{ userId: string; cookie: string }> => {
    const userId = randomUUID();
    const actorRoleId = randomUUID();
    await seedIdentity(userId, `member.${userId}@example.test`);
    await dataSource.manager.getRepository(RoleEntity).insert({
      id: actorRoleId,
      warehouseId,
      name: `Role ${actorRoleId}`,
      kind: 'custom',
      createdAt: seededAt,
      updatedAt: seededAt,
    });
    if (permissionIds.length > 0) {
      await grantPermissions(actorRoleId, permissionIds);
    }
    await seedMembership(userId, warehouseId, actorRoleId);
    return { userId, cookie: await seedSessionCookie(userId) };
  };

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
      updatedAt: seededAt,
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
    it('refuses a frozen field submitted on the arrival confirmation payload', async () => {
      const { draftId, cookie } = await freezeADraft();

      const { status, body } = await request(
        'POST',
        `${purchaseDraftsPath(warehouseId)}/${draftId}/arrival`,
        cookie,
        {
          lines: [{ purchaseDraftLineId: randomUUID(), receivedQuantity: 10 }],
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

  // -- POST /purchase-drafts/:id/arrival -- AC-17, AC-22, AC-23 -----------------------------------

  describe('POST /api/v1/warehouses/:warehouseId/purchase-drafts/:purchaseDraftId/arrival', () => {
    it('records what arrived and allocates it across the linked Customer Orders, then closes the draft (AC-17)', async () => {
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
        `${purchaseDraftsPath(warehouseId)}/${draftId}/arrival`,
        actor.cookie,
        {
          lines: [
            {
              purchaseDraftLineId: lineId,
              receivedQuantity: 140,
              allocations: [
                { purchaseDraftLineLinkId: linkOneId, allocatedQuantity: 100 },
                { purchaseDraftLineLinkId: linkTwoId, allocatedQuantity: 40 },
              ],
            },
          ],
        },
      );

      expect(status).toBe(200);
      expect(body).toMatchObject({
        id: draftId,
        state: 'closed',
        arrivalConfirmedByUserId: actor.userId,
        lines: [
          expect.objectContaining({
            receivedQuantity: 140,
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
    it('denies the confirmation to an actor without PURCHASE_DRAFTS:RECEIVE (AC-22)', async () => {
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
        `${purchaseDraftsPath(warehouseId)}/${draftId}/arrival`,
        actor.cookie,
        { lines: [{ purchaseDraftLineId: randomUUID(), receivedQuantity: 0 }] },
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

  // -- AC-23 — every mutation is denied on an archived Warehouse ----------------------------------

  describe('archived Warehouse (AC-23)', () => {
    it('denies creating a draft, moving one to Ready for Ordering, and confirming arrival, while reads keep working', async () => {
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
        `${purchaseDraftsPath(warehouseId)}/${draftId}/arrival`,
        actor.cookie,
        { lines: [{ purchaseDraftLineId: randomUUID(), receivedQuantity: 0 }] },
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
      expect(stillReads.status).toBe(200);
    });
  });
});
