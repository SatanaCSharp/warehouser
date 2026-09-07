import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  customerOrderSchema,
  demandLineSchema,
} from '@warehouser/contracts/customer-orders';
import { AppModule } from 'app.module';
import { digestSessionSecret } from 'auth/domain/security/session-secret';
import { AUTH_SESSION_COOKIE } from 'auth/rest/auth-cookie';
import { ZodValidationPipe } from 'nestjs-zod';
import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { CustomerEntity } from 'shared/domain/entities/customer.entity';
import { CustomerDeliveryAddressEntity } from 'shared/domain/entities/customer-delivery-address.entity';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { PermissionEntity } from 'shared/domain/entities/permission.entity';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import { PurchaseDraftLineLinkEntity } from 'shared/domain/entities/purchase-draft-line-link.entity';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { RolePermissionEntity } from 'shared/domain/entities/role-permission.entity';
import { SessionEntity } from 'shared/domain/entities/session.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { GlobalHttpExceptionFilter } from 'shared/errors/global-http-exception.filter';
import { z } from 'zod';

// Fixed clock for every seeded row, mirroring `items-http-contract.integration.spec.ts`:
// `chk_warehouses_archival_order` rejects `archivedAt < createdAt`, so seeding and archival share
// one instant.
const seededAt = new Date('2026-08-25T09:00:00.000Z');

// A needed-by date is a calendar date the lifecycle service compares against **today**, so it is
// derived from the real clock rather than pinned: a fixture date would start failing AC-02a's
// "has already passed" rule the day it went by.
const calendarDaysFromToday = (days: number): string =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const workspaceId = '00000000-0000-4000-8000-000000000700';
const warehouseId = '00000000-0000-4000-8000-000000000701';
// A second Warehouse of the same Workspace the actor also holds a membership in. It carries no
// Items and no demand, and is the control the AC-05 non-disclosure comparison is made against.
const otherWarehouseId = '00000000-0000-4000-8000-000000000702';

const roleId = '00000000-0000-4000-8000-000000000801';
const otherWarehouseRoleId = '00000000-0000-4000-8000-000000000802';
// A second Role *of the acting Warehouse* that is never granted anything. `seedActor` grants onto
// the shared `roleId`, so a permissionless actor cannot share it: in a test that also seeds a
// holder of the Permission, the grant would reach both members through that one Role.
const deniedRoleId = '00000000-0000-4000-8000-000000000803';

const CUSTOMER_ORDERS_WATCH = 'CUSTOMER_ORDERS:WATCH';
// T13/AC-09a — the Permission every Customer Order route declares **observed**. It is never
// required by any of them: an actor holding only the `CUSTOMER_ORDERS:*` Permission of the
// operation is admitted exactly as before and reads the redacted form.
const CUSTOMERS_WATCH = 'CUSTOMERS:WATCH';
const CUSTOMER_ORDERS_CREATE = 'CUSTOMER_ORDERS:CREATE';
const CUSTOMER_ORDERS_UPDATE = 'CUSTOMER_ORDERS:UPDATE';
const CUSTOMER_ORDERS_CANCEL = 'CUSTOMER_ORDERS:CANCEL';

// T11 DoD — the `/api/v1/warehouses/{warehouseId}/demand` and `.../customer-orders*` HTTP contract
// of `contracts/openapi.yaml` (AC-01, AC-03, AC-04, AC-05, AC-19, AC-19a, AC-23). Driven over real
// HTTP against the real Nest module graph, exactly as the items surface is, because the point is
// the composition — guards, the global Zod pipe, the use cases and the one exception filter — not
// any one of them in isolation. `CustomerOrdersModule` is not on the graph yet, so every request
// below currently resolves to nothing (GOOD red).
//
// Per endpoint this proves: the declared Permission is required and sufficient; the shared schema
// is validated; the stable `customer_orders.*` codes are mapped; reads survive archival and
// mutations do not (AC-23); and no denial or refusal discloses a customer, a quantity or an Item.
/* eslint-disable max-lines -- this file is one HTTP contract suite over two surfaces (`/demand`
   and `/customer-orders*`) sharing one harness; splitting it would duplicate the seeding closure
   rather than shorten anything, and the harness-extraction precedent
   (`test/harnesses/warehouse-http-contract.harness.ts`) exists for surfaces split across several
   spec files, which this is not */
// eslint-disable-next-line max-lines-per-function -- one HTTP contract suite covering one surface is inherently long, matching the items and access precedents
describe('customer-orders HTTP contract', () => {
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
      'TRUNCATE arrival_allocations, purchase_draft_demand_snapshots, purchase_draft_line_links, purchase_draft_lines, purchase_drafts, item_stock_adjustments, customer_orders, customer_delivery_addresses, customers, items, warehouse_memberships, role_permissions, roles, warehouses, workspaces, sessions, users, accounts, permissions CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
    await app.close();
  });

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

  /** Seeds a Warehouse Member of `warehouseId` holding exactly `permissionIds`. */
  const seedActor = async (
    permissionIds: readonly string[],
  ): Promise<{ userId: string; cookie: string }> => {
    const userId = randomUUID();
    await seedIdentity(userId, `member.${userId}@example.test`);
    if (permissionIds.length > 0) {
      await grantPermissions(roleId, permissionIds);
    }
    await seedMembership(userId, warehouseId, roleId);
    return { userId, cookie: await seedSessionCookie(userId) };
  };

  /** Seeds a Warehouse Member of `warehouseId` on a Role carrying no Permission at all. Distinct
   * from `seedActor([])` because this member stays permissionless even when the same test grants
   * Permissions to the shared `roleId`. */
  const seedPermissionlessActor = async (): Promise<{
    userId: string;
    cookie: string;
  }> => {
    const userId = randomUUID();
    await seedIdentity(userId, `denied.${userId}@example.test`);
    await seedMembership(userId, warehouseId, deniedRoleId);
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

  /** A user row to hang `recorded_by_user_id` on when the test does not care who recorded it. */
  const seedRecorder = async (): Promise<string> => {
    const userId = randomUUID();
    await seedIdentity(userId, `recorder.${userId}@example.test`);
    return userId;
  };

  /** A Customer of the acting Warehouse with one active Main Delivery Address — the destination
   * AC-11 records demand against, and the row the identified projection joins its live name from. */
  const seedCustomerWithMainAddress = async (
    name: string,
  ): Promise<{
    customerId: string;
    deliveryAddressId: string;
    secondDeliveryAddressId: string;
  }> => {
    const customerId = randomUUID();
    const deliveryAddressId = randomUUID();
    const secondDeliveryAddressId = randomUUID();
    const recordedByUserId = await seedRecorder();

    await dataSource.manager.getRepository(CustomerEntity).insert({
      id: customerId,
      warehouseId,
      name,
      deactivatedAt: null,
      recordedByUserId,
      createdAt: seededAt,
      updatedAt: seededAt,
    });
    await dataSource.manager
      .getRepository(CustomerDeliveryAddressEntity)
      .insert([
        {
          id: deliveryAddressId,
          customerId,
          warehouseId,
          addressText: 'Test Address 1, Test City',
          accessNotes: 'Gate code on the intercom; deliveries 09:00-17:00',
          isMain: true,
          deactivatedAt: null,
          createdAt: seededAt,
          updatedAt: seededAt,
        },
        // AC-11b — the second active address a redirection moves an outstanding order to.
        {
          id: secondDeliveryAddressId,
          customerId,
          warehouseId,
          addressText: 'Test Address 2, Test City',
          accessNotes: null,
          isMain: false,
          deactivatedAt: null,
          createdAt: seededAt,
          updatedAt: seededAt,
        },
      ]);

    return { customerId, deliveryAddressId, secondDeliveryAddressId };
  };

  const seedCustomerOrder = async (
    itemId: string,
    overrides: Partial<{
      id: string;
      warehouseId: string;
      customerName: string;
      // A Customer-naming order, as `customer_orders` holds one since this feature: the identifier
      // and the address it is going to, with `customer_name` left null. Omit both and the order is
      // the free-text form every case before AC-11b seeds.
      customerId: string;
      customerDeliveryAddressId: string;
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
    // `chk_customer_orders_cancellation_attribution` — the reason, the member and the time arrive
    // together or not at all (AC-19a), so a seeded cancelled order carries all three.
    const cancelled = state === 'cancelled';
    await dataSource.manager.getRepository(CustomerOrderEntity).insert({
      id,
      warehouseId: overrides.warehouseId ?? warehouseId,
      itemId,
      // `chk_customer_orders_customer_identity` — an order names a Customer or carries the free-text
      // name, never both, so supplying `customerId` clears `customer_name`.
      customerId: overrides.customerId ?? null,
      customerDeliveryAddressId: overrides.customerDeliveryAddressId ?? null,
      customerName:
        overrides.customerId === undefined
          ? (overrides.customerName ?? 'Test Customer North')
          : null,
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

  /** AC-20 — a Purchase Draft with one line linking to `customerOrderId` for `statedQuantity`,
   * i.e. one Coverage entry. `purchase_drafts.reference` is minted by the column DEFAULT, so the
   * reference is read back from the row the database wrote rather than supplied here. */
  const seedCoveringDraft = async (
    itemId: string,
    customerOrderId: string,
    statedQuantity: number,
  ): Promise<{ purchaseDraftId: string; reference: string }> => {
    const purchaseDraftId = randomUUID();
    const purchaseDraftLineId = randomUUID();
    await dataSource.manager.getRepository(PurchaseDraftEntity).insert({
      id: purchaseDraftId,
      warehouseId,
      state: 'draft',
      expectedArrivalDate: null,
      createdByUserId: await seedRecorder(),
      readiedByUserId: null,
      readiedAt: null,
      closedByUserId: null,
      closedAt: null,
      closureReason: null,
      arrivalConfirmedByUserId: null,
      arrivalConfirmedAt: null,
      discardedByUserId: null,
      discardedAt: null,
      createdAt: seededAt,
      updatedAt: seededAt,
    });
    await dataSource.manager.getRepository(PurchaseDraftLineEntity).insert({
      id: purchaseDraftLineId,
      purchaseDraftId,
      warehouseId,
      itemId,
      orderedQuantity: statedQuantity,
      packagingTypeId: null,
      valueAddingNote: null,
      createdAt: seededAt,
      updatedAt: seededAt,
    });
    await dataSource.manager.getRepository(PurchaseDraftLineLinkEntity).insert({
      id: randomUUID(),
      purchaseDraftLineId,
      purchaseDraftId,
      warehouseId,
      customerOrderId,
      statedQuantity,
      createdAt: seededAt,
      updatedAt: seededAt,
    });
    const draft = await dataSource.manager
      .getRepository(PurchaseDraftEntity)
      .findOneByOrFail({ id: purchaseDraftId });
    return { purchaseDraftId, reference: draft.reference! };
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

  // -- GET /demand -- the consolidated read (AC-04, AC-05, AC-23) ------------------------------

  describe('GET /api/v1/warehouses/:warehouseId/demand', () => {
    it('shows one Demand Line per Item with its total, earliest date and On-hand Quantity, omitting Fulfilled and cancelled orders, ordered by earliest needed-by then SKU (AC-04)', async () => {
      await seedWarehouses();
      const cableId = await seedItem({
        sku: 'TEST-SKU-0001',
        description: 'Test Item — 2 m cable',
        unitOfMeasure: 'metres',
        onHandQuantity: 12,
      });
      const cartonId = await seedItem({
        sku: 'TEST-SKU-0002',
        description: 'Test Item — labelled carton insert',
        onHandQuantity: 0,
      });
      // A third Item whose earliest date ties with the cable's, so the SKU tiebreak is exercised
      // rather than merely assumed.
      const palletId = await seedItem({
        sku: 'TEST-SKU-0003',
        description: 'Test Item — pallet collar',
        onHandQuantity: 5,
      });
      await seedCustomerOrder(cableId, {
        quantity: 100,
        neededBy: calendarDaysFromToday(40),
      });
      await seedCustomerOrder(cableId, {
        customerName: 'Test Customer South',
        quantity: 40,
        neededBy: calendarDaysFromToday(10),
      });
      await seedCustomerOrder(cartonId, {
        quantity: 70,
        neededBy: calendarDaysFromToday(5),
      });
      await seedCustomerOrder(palletId, {
        quantity: 25,
        neededBy: calendarDaysFromToday(10),
      });
      // Neither of these counts: a Fulfilled order is waiting for nothing and a cancelled one
      // ended (AC-04, AC-17a). Both are large enough that leaking either into its Item's total
      // would be unmistakable.
      await seedCustomerOrder(cableId, { quantity: 500, state: 'fulfilled' });
      await seedCustomerOrder(cartonId, { quantity: 500, state: 'cancelled' });
      const actor = await seedActor([CUSTOMER_ORDERS_WATCH]);

      const { status, body } = await request(
        'GET',
        `/api/v1/warehouses/${warehouseId}/demand`,
        actor.cookie,
      );

      expect(status).toBe(200);
      // AC-04 "one Demand Line per Item", and openapi.yaml's documented order for this response:
      // "ordered by earliest needed-by date then SKU". The carton is needed soonest so it leads
      // even though its SKU sorts after the cable's; the cable and the pallet tie on the date and
      // fall back to SKU, putting the cable first.
      expect(body).toEqual([
        {
          itemId: cartonId,
          sku: 'TEST-SKU-0002',
          description: 'Test Item — labelled carton insert',
          unitOfMeasure: 'pieces',
          totalOutstandingQuantity: 70,
          earliestNeededBy: calendarDaysFromToday(5),
          onHandQuantity: 0,
          unfulfilledCustomerOrderCount: 1,
          coverage: [],
        },
        {
          itemId: cableId,
          sku: 'TEST-SKU-0001',
          description: 'Test Item — 2 m cable',
          unitOfMeasure: 'metres',
          totalOutstandingQuantity: 140,
          earliestNeededBy: calendarDaysFromToday(10),
          onHandQuantity: 12,
          unfulfilledCustomerOrderCount: 2,
          coverage: [],
        },
        {
          itemId: palletId,
          sku: 'TEST-SKU-0003',
          description: 'Test Item — pallet collar',
          unitOfMeasure: 'pieces',
          totalOutstandingQuantity: 25,
          earliestNeededBy: calendarDaysFromToday(10),
          onHandQuantity: 5,
          unfulfilledCustomerOrderCount: 1,
          coverage: [],
        },
      ]);
    });

    // The web validates the whole demand array against this exact schema and turns any parse
    // failure into `api.unexpected`, blanking the Demand screen — so asserting the shared schema
    // here, rather than a hand-written `toMatchObject`, is what makes that class of failure
    // impossible to ship. It covers `earliestNeededBy` being a calendar day rather than a
    // date-time shifted a day early (the `getRawMany()` date defect), and each Coverage entry
    // carrying the draft reference the `COVERED BY` chip is drawn from (AC-20, `PD-0142 · 800`).
    it('answers the consolidated demand in the exact shape the shared contract accepts, naming every covering draft (AC-04, AC-20)', async () => {
      await seedWarehouses();
      const itemId = await seedItem({
        sku: 'TEST-SKU-0001',
        description: 'Test Item — 2 m cable',
        unitOfMeasure: 'metres',
        onHandQuantity: 12,
      });
      const neededBy = calendarDaysFromToday(8);
      const orderId = await seedCustomerOrder(itemId, {
        quantity: 800,
        neededBy,
      });
      const covering = await seedCoveringDraft(itemId, orderId, 800);
      const other = await seedCoveringDraft(itemId, orderId, 120);
      const actor = await seedActor([CUSTOMER_ORDERS_WATCH]);

      const { status, body } = await request(
        'GET',
        `/api/v1/warehouses/${warehouseId}/demand`,
        actor.cookie,
      );

      expect(status).toBe(200);
      const lines = demandLineSchema.array().parse(body);
      expect(lines).toHaveLength(1);
      expect(lines[0]?.earliestNeededBy).toBe(neededBy);
      expect(
        [...(lines[0]?.coverage ?? [])].sort(
          (a, b) => a.statedQuantity - b.statedQuantity,
        ),
      ).toEqual([
        {
          purchaseDraftId: other.purchaseDraftId,
          purchaseDraftReference: other.reference,
          purchaseDraftLineId: expect.any(String),
          purchaseDraftState: 'draft',
          statedQuantity: 120,
        },
        {
          purchaseDraftId: covering.purchaseDraftId,
          purchaseDraftReference: covering.reference,
          purchaseDraftLineId: expect.any(String),
          purchaseDraftState: 'draft',
          statedQuantity: 800,
        },
      ]);
      expect(covering.reference).toMatch(/^PD-\d{4,}$/u);
      expect(covering.reference).not.toBe(other.reference);
    });

    // AC-05 — the denial names no customer, quantity or Item, and it is byte-for-byte the denial a
    // Warehouse holding no demand at all produces, so probing the two apart is impossible.
    it('denies the read without CUSTOMER_ORDERS:WATCH and discloses neither the demand nor its existence (AC-05)', async () => {
      await seedWarehouses();
      const itemId = await seedItem({ sku: 'TEST-SKU-0001' });
      await seedCustomerOrder(itemId, {
        customerName: 'Test Customer North',
        quantity: 100,
      });
      const actor = await seedActor([]);
      await seedMembership(
        actor.userId,
        otherWarehouseId,
        otherWarehouseRoleId,
      );

      const denied = await request(
        'GET',
        `/api/v1/warehouses/${warehouseId}/demand`,
        actor.cookie,
      );
      const emptyWarehouse = await request(
        'GET',
        `/api/v1/warehouses/${otherWarehouseId}/demand`,
        actor.cookie,
      );

      expect(denied.status).toBe(403);
      expect(denied.body).toMatchObject({ code: 'access.denied' });

      const serialized = JSON.stringify(denied.body);
      expect(serialized).not.toContain('Test Customer North');
      expect(serialized).not.toContain('TEST-SKU-0001');
      expect(serialized).not.toContain(itemId);
      expect(serialized).not.toContain('100');

      // "the denial does not reveal whether any demand exists" — the Warehouse holding demand and
      // the one holding none are refused identically.
      expect(denied).toEqual(emptyWarehouse);
    });

    // AC-23 — a watch Permission keeps authorizing the read after archival, and the member without
    // it is refused exactly as before archiving.
    it('still reads the demand of an archived Warehouse, and refuses it without the Permission exactly as before (AC-23)', async () => {
      await seedWarehouses();
      const itemId = await seedItem({
        sku: 'TEST-SKU-0001',
        onHandQuantity: 3,
      });
      await seedCustomerOrder(itemId, { quantity: 100 });
      const watcher = await seedActor([CUSTOMER_ORDERS_WATCH]);
      const withoutPermission = await seedPermissionlessActor();
      const demandPath = `/api/v1/warehouses/${warehouseId}/demand`;

      const watchedBefore = await request('GET', demandPath, watcher.cookie);
      const refusedBefore = await request(
        'GET',
        demandPath,
        withoutPermission.cookie,
      );
      await setWarehouseArchived(warehouseId, seededAt);
      const watchedAfter = await request('GET', demandPath, watcher.cookie);
      const refusedAfter = await request(
        'GET',
        demandPath,
        withoutPermission.cookie,
      );

      // "a member whose Role carries the matching watch Permission reads its recorded demand
      // exactly as before archiving".
      expect(watchedBefore.status).toBe(200);
      expect(watchedAfter).toEqual(watchedBefore);

      // "and a member whose Role carries no such Permission is refused the read exactly as before
      // archiving" — AC-23's second clause, asserted here as the identical denial.
      //
      // This does **not** pin the order of `WarehouseAccessGuard`'s two checks, and must not be
      // read as doing so: the demand read is `@ArchivedTolerantRead()`, so the archival branch is
      // never reached on this route and a permissionless member is refused identically whichever
      // check runs first. The ordering is observable only on a mutation, and is pinned by
      // "refuses a member without the Permission identically before and after archival" in the
      // `POST /customer-orders` block below.
      expect(refusedBefore.status).toBe(403);
      expect(refusedBefore.body).toMatchObject({ code: 'access.denied' });
      expect(refusedAfter).toEqual(refusedBefore);
    });
  });

  // -- GET /customer-orders -- the orders behind a Demand Line ---------------------------------

  describe('GET /api/v1/warehouses/:warehouseId/customer-orders', () => {
    it('lists the Warehouse Customer Orders and narrows by Item and state', async () => {
      await seedWarehouses();
      const itemId = await seedItem({ sku: 'TEST-SKU-0001' });
      const otherItemId = await seedItem({ sku: 'TEST-SKU-0002' });
      const unfulfilledId = await seedCustomerOrder(itemId, { quantity: 100 });
      await seedCustomerOrder(itemId, { quantity: 60, state: 'cancelled' });
      await seedCustomerOrder(otherItemId, { quantity: 20 });
      const actor = await seedActor([CUSTOMER_ORDERS_WATCH]);

      const all = await request(
        'GET',
        `/api/v1/warehouses/${warehouseId}/customer-orders`,
        actor.cookie,
      );
      const narrowed = await request(
        'GET',
        `/api/v1/warehouses/${warehouseId}/customer-orders?itemId=${itemId}&state=unfulfilled`,
        actor.cookie,
      );

      expect(all.status).toBe(200);
      expect(all.body).toHaveLength(3);
      expect(narrowed.status).toBe(200);
      expect(narrowed.body).toEqual([
        expect.objectContaining({
          id: unfulfilledId,
          itemId,
          state: 'unfulfilled',
          outstandingQuantity: 100,
        }),
      ]);
    });

    it('denies the list without CUSTOMER_ORDERS:WATCH (AC-05)', async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      await seedCustomerOrder(itemId);
      const actor = await seedActor([CUSTOMER_ORDERS_CREATE]);

      const { status, body } = await request(
        'GET',
        `/api/v1/warehouses/${warehouseId}/customer-orders`,
        actor.cookie,
      );

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'access.denied' });
      expect(JSON.stringify(body)).not.toContain('Test Customer North');
    });

    it('rejects a query parameter the shared schema does not define', async () => {
      await seedWarehouses();
      const actor = await seedActor([CUSTOMER_ORDERS_WATCH]);

      const { status, body } = await request(
        'GET',
        `/api/v1/warehouses/${warehouseId}/customer-orders?state=pending`,
        actor.cookie,
      );

      expect(status).toBe(400);
      expect(body).toMatchObject({ code: 'request.invalid' });
    });

    it('still lists the Customer Orders of an archived Warehouse (AC-23)', async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      await seedCustomerOrder(itemId, { quantity: 100 });
      const actor = await seedActor([CUSTOMER_ORDERS_WATCH]);
      await setWarehouseArchived(warehouseId, seededAt);

      const { status, body } = await request(
        'GET',
        `/api/v1/warehouses/${warehouseId}/customer-orders`,
        actor.cookie,
      );

      expect(status).toBe(200);
      expect(body).toHaveLength(1);
    });
  });

  // -- POST /customer-orders -- record demand (AC-01, AC-02, AC-03, AC-23) ---------------------

  describe('POST /api/v1/warehouses/:warehouseId/customer-orders', () => {
    it('records the order Unfulfilled with its Outstanding Quantity equal to the quantity, the member and the time (AC-01)', async () => {
      await seedWarehouses();
      const itemId = await seedItem({ sku: 'TEST-SKU-0001' });
      const actor = await seedActor([CUSTOMER_ORDERS_CREATE]);
      const neededBy = calendarDaysFromToday(30);

      const { status, body } = await request(
        'POST',
        `/api/v1/warehouses/${warehouseId}/customer-orders`,
        actor.cookie,
        {
          itemId,
          customerName: 'Test Customer North',
          quantity: 100,
          neededBy,
        },
      );

      expect(status).toBe(201);
      expect(body).toMatchObject({
        id: expect.any(String),
        itemId,
        quantity: 100,
        outstandingQuantity: 100,
        neededBy,
        state: 'unfulfilled',
        cancellationReason: null,
        recordedByUserId: actor.userId,
        cancelledByUserId: null,
        cancelledAt: null,
        createdAt: expect.any(String),
      });
      // T13/AC-09a — this actor holds `CUSTOMER_ORDERS:CREATE` and **not** `CUSTOMERS:WATCH`, so
      // the order they just recorded comes back with the name they typed onto it withheld: the
      // property is absent, not null, and nothing else they are entitled to has changed. The
      // withholding is asserted over the serialized body rather than over one property, because a
      // `null`, an empty string or a nested survivor would all pass a property check.
      expect(JSON.stringify(body)).not.toContain('Test Customer North');
      expect(body).not.toHaveProperty('customerName');
      expect(body).not.toHaveProperty('customer');
      expect(body).not.toHaveProperty('destination');
      // `toMatchObject` above cannot see an *extra* field, and both forms of openapi.yaml
      // `CustomerOrder` are `additionalProperties: false` and carry no `warehouseId` — "the
      // Warehouse is the request's, never a field the caller reads back". Parsing the live body
      // through the strict shared schema is what holds the wire response to the contract rather
      // than to this test's expectations, and it is what makes a half-redacted response — one that
      // nulled the identity instead of omitting it — a failure here.
      expect(() => customerOrderSchema.parse(body)).not.toThrow();
    });

    it('denies a record to an actor without CUSTOMER_ORDERS:CREATE', async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const actor = await seedActor([CUSTOMER_ORDERS_WATCH]);

      const { status, body } = await request(
        'POST',
        `/api/v1/warehouses/${warehouseId}/customer-orders`,
        actor.cookie,
        {
          itemId,
          customerName: 'Test Customer North',
          quantity: 100,
          neededBy: calendarDaysFromToday(30),
        },
      );

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'access.denied' });
    });

    // AC-03 — demand names an Item of the Warehouse the request applies to. An Item that exists
    // only elsewhere is refused exactly as a missing one, so its existence is never disclosed.
    it('refuses an Item of another Warehouse exactly as a missing one (AC-03)', async () => {
      await seedWarehouses();
      const crossWarehouseItemId = await seedItem({
        warehouseId: otherWarehouseId,
        sku: 'TEST-SKU-ELSEWHERE',
      });
      const actor = await seedActor([CUSTOMER_ORDERS_CREATE]);
      const payload = {
        customerName: 'Test Customer North',
        quantity: 100,
        neededBy: calendarDaysFromToday(30),
      };

      const crossWarehouse = await request(
        'POST',
        `/api/v1/warehouses/${warehouseId}/customer-orders`,
        actor.cookie,
        { ...payload, itemId: crossWarehouseItemId },
      );
      const missing = await request(
        'POST',
        `/api/v1/warehouses/${warehouseId}/customer-orders`,
        actor.cookie,
        { ...payload, itemId: randomUUID() },
      );

      expect(crossWarehouse.status).toBe(404);
      expect(crossWarehouse.body).toMatchObject({
        code: 'items.target_unavailable',
      });
      expect(crossWarehouse).toEqual(missing);
      expect(JSON.stringify(crossWarehouse.body)).not.toContain(
        'TEST-SKU-ELSEWHERE',
      );
    });

    it('refuses a quantity that is not a positive whole number and a needed-by date that has passed (AC-02, AC-02a)', async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const actor = await seedActor([CUSTOMER_ORDERS_CREATE]);

      const zeroQuantity = await request(
        'POST',
        `/api/v1/warehouses/${warehouseId}/customer-orders`,
        actor.cookie,
        {
          itemId,
          customerName: 'Test Customer North',
          quantity: 0,
          neededBy: calendarDaysFromToday(30),
        },
      );
      const datePassed = await request(
        'POST',
        `/api/v1/warehouses/${warehouseId}/customer-orders`,
        actor.cookie,
        {
          itemId,
          customerName: 'Test Customer North',
          quantity: 100,
          neededBy: calendarDaysFromToday(-1),
        },
      );

      // Two correct answers exist for a zero quantity and the contract does not choose between
      // them: the shared schema refuses it at the global Zod pipe (`request.invalid`) and, were it
      // to reach the service, `isDemandQuantity` refuses it as `customer_orders.invalid_input`.
      // Either is a 400 that changes nothing and names the value; the test pins the observable
      // outcome rather than which layer got there first.
      expect(zeroQuantity.status).toBe(400);
      expect(zeroQuantity.body).toMatchObject({
        code: expect.stringMatching(
          /^(?:request\.invalid|customer_orders\.invalid_input)$/u,
        ),
      });
      expect(datePassed.status).toBe(400);
      expect(datePassed.body).toMatchObject({
        code: 'customer_orders.needed_by_in_past',
      });
    });

    // AC-05/AC-23 — the guard-ordering regression. `WarehouseAccessGuard` decides the missing
    // Permission *before* it decides archival. Reverse those two checks and this member — who holds
    // nothing — receives `409 access.warehouse_archived` on the archived Warehouse instead of the
    // `403 access.denied` they get on an active one, learning from the refusal alone that the
    // Warehouse is archived. A mutation is what exposes the ordering: the archived-tolerant reads
    // never reach the archival branch at all, so they cannot pin it.
    it('refuses a member without the Permission identically before and after archival, disclosing neither (AC-05, AC-23)', async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const withoutPermission = await seedPermissionlessActor();
      const payload = {
        itemId,
        customerName: 'Test Customer North',
        quantity: 100,
        neededBy: calendarDaysFromToday(30),
      };
      const path = `/api/v1/warehouses/${warehouseId}/customer-orders`;

      const beforeArchival = await request(
        'POST',
        path,
        withoutPermission.cookie,
        payload,
      );
      await setWarehouseArchived(warehouseId, seededAt);
      const afterArchival = await request(
        'POST',
        path,
        withoutPermission.cookie,
        payload,
      );

      expect(beforeArchival.status).toBe(403);
      expect(beforeArchival.body).toMatchObject({ code: 'access.denied' });
      expect(afterArchival).toEqual(beforeArchival);
    });

    it('refuses to record demand on an archived Warehouse (AC-23)', async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const actor = await seedActor([CUSTOMER_ORDERS_CREATE]);
      await setWarehouseArchived(warehouseId, seededAt);

      const { status, body } = await request(
        'POST',
        `/api/v1/warehouses/${warehouseId}/customer-orders`,
        actor.cookie,
        {
          itemId,
          customerName: 'Test Customer North',
          quantity: 100,
          neededBy: calendarDaysFromToday(30),
        },
      );

      expect(status).toBe(409);
      expect(body).toMatchObject({ code: 'access.warehouse_archived' });
    });
  });

  // -- PATCH /customer-orders/:id -- amend (AC-19, AC-23) --------------------------------------

  // -- POST /customer-orders -- the customer identity a recorded order carries (AC-09a, AC-11) --

  describe('POST /api/v1/warehouses/:warehouseId/customer-orders — customer identity', () => {
    // T13/AC-11a/AC-24 — the same request by an actor who **does** hold the observed Permission.
    // Both bodies validate against the one `CustomerOrder` contract, which is what "both forms are
    // modelled deliberately" means in practice (sad.md §7, ADR 0001).
    it('returns the typed customer name to an actor holding CUSTOMERS:WATCH (AC-11a, AC-24)', async () => {
      await seedWarehouses();
      const itemId = await seedItem({ sku: 'TEST-SKU-0001' });
      const actor = await seedActor([CUSTOMER_ORDERS_CREATE, CUSTOMERS_WATCH]);
      const neededBy = calendarDaysFromToday(30);

      const { status, body } = await request(
        'POST',
        `/api/v1/warehouses/${warehouseId}/customer-orders`,
        actor.cookie,
        {
          itemId,
          customerName: 'Test Customer North',
          quantity: 100,
          neededBy,
        },
      );

      expect(status).toBe(201);
      expect(body).toMatchObject({
        itemId,
        // AC-11a — a typed name names **no** Customer and no Delivery Address, and that absence is
        // what tells the member which kind of row they are looking at.
        customer: null,
        customerName: 'Test Customer North',
        destination: null,
        quantity: 100,
        outstandingQuantity: 100,
        state: 'unfulfilled',
      });
      expect(() => customerOrderSchema.parse(body)).not.toThrow();
    });

    // T13/AC-11/AC-24 — demand recorded **against a Customer**, with no address stated, takes that
    // Customer's current Main one. The response reads the Customer's name live and carries the
    // address it is going to with its access notes, which is the identified form of the contract
    // exercised over real SQL: the two joins of `listIdentifiedCustomerOrders` are what produce it.
    it('records demand against a Customer and returns it with the Main address it is going to (AC-11)', async () => {
      await seedWarehouses();
      const itemId = await seedItem({ sku: 'TEST-SKU-0002' });
      const { customerId, deliveryAddressId } =
        await seedCustomerWithMainAddress('Test Customer North');
      const actor = await seedActor([CUSTOMER_ORDERS_CREATE, CUSTOMERS_WATCH]);

      const { status, body } = await request(
        'POST',
        `/api/v1/warehouses/${warehouseId}/customer-orders`,
        actor.cookie,
        {
          itemId,
          customerId,
          quantity: 100,
          neededBy: calendarDaysFromToday(30),
        },
      );

      expect(status).toBe(201);
      expect(body).toMatchObject({
        itemId,
        customer: { id: customerId, name: 'Test Customer North' },
        // AC-03b — the name is read live from the Customer, so the order carries none of its own.
        customerName: null,
        destination: {
          deliveryAddressId,
          addressText: 'Test Address 1, Test City',
          accessNotes: 'Gate code on the intercom; deliveries 09:00-17:00',
          isMain: true,
          deactivatedAt: null,
        },
        quantity: 100,
        outstandingQuantity: 100,
        state: 'unfulfilled',
      });
      expect(() => customerOrderSchema.parse(body)).not.toThrow();
    });

    // T13/AC-09a — the same order, read by a member of the same Warehouse who holds
    // `CUSTOMER_ORDERS:WATCH` and **not** `CUSTOMERS:WATCH`. This is the criterion's member and the
    // case sad.md §11 calls the one that "leaks silently and forever": the Customer's name, the
    // address it is going to and the gate code beside it must not be in the response at all, while
    // the quantity, the date, the Item and the state are returned unchanged.
    it('withholds the Customer, the address and the access notes from a member without CUSTOMERS:WATCH (AC-09a)', async () => {
      await seedWarehouses();
      const itemId = await seedItem({ sku: 'TEST-SKU-0003' });
      const { customerId } = await seedCustomerWithMainAddress(
        'Test Customer North',
      );
      const recorder = await seedActor([
        CUSTOMER_ORDERS_CREATE,
        CUSTOMERS_WATCH,
      ]);
      const neededBy = calendarDaysFromToday(30);

      const recorded = await request(
        'POST',
        `/api/v1/warehouses/${warehouseId}/customer-orders`,
        recorder.cookie,
        { itemId, customerId, quantity: 100, neededBy },
      );
      expect(recorded.status).toBe(201);

      const watcher = await seedPermissionlessActor();
      await grantPermissions(deniedRoleId, [CUSTOMER_ORDERS_WATCH]);

      const { status, body } = await request(
        'GET',
        `/api/v1/warehouses/${warehouseId}/customer-orders`,
        watcher.cookie,
      );

      expect(status).toBe(200);
      expect(body).toHaveLength(1);

      // Parsing the live body through the strict shared schema is what holds the wire response to
      // the contract; the parsed value is what the assertions below read, so a half-redacted body
      // fails before they run.
      const [listed] = z.array(customerOrderSchema).parse(body);
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain('Test Customer North');
      expect(serialized).not.toContain('Test Address 1, Test City');
      expect(serialized).not.toContain('Gate code on the intercom');
      expect(serialized).not.toContain(customerId);
      expect(listed).not.toHaveProperty('customer');
      expect(listed).not.toHaveProperty('customerName');
      expect(listed).not.toHaveProperty('destination');
      // AC-09a's closing clause — everything this member's own Permissions do admit is unchanged.
      expect(listed).toMatchObject({
        itemId,
        quantity: 100,
        outstandingQuantity: 100,
        neededBy,
        state: 'unfulfilled',
      });
    });
  });

  // -- PUT /customer-orders/{id}/delivery-address -- redirection (AC-11b, AC-11c) --------------

  describe('PUT /api/v1/warehouses/:warehouseId/customer-orders/:customerOrderId/delivery-address', () => {
    // AC-11b — the order goes to the stated address and keeps naming the same Customer. Redirection
    // is its own sub-resource, so this is also the proof the route is served at all.
    it('redirects an outstanding order to another active address of the same Customer (AC-11b)', async () => {
      await seedWarehouses();
      const itemId = await seedItem({ sku: 'TEST-SKU-0004' });
      const { customerId, secondDeliveryAddressId } =
        await seedCustomerWithMainAddress('Test Customer North');
      const actor = await seedActor([
        CUSTOMER_ORDERS_CREATE,
        CUSTOMER_ORDERS_UPDATE,
        CUSTOMERS_WATCH,
      ]);

      const recorded = await request(
        'POST',
        `/api/v1/warehouses/${warehouseId}/customer-orders`,
        actor.cookie,
        {
          itemId,
          customerId,
          quantity: 100,
          neededBy: calendarDaysFromToday(30),
        },
      );
      expect(recorded.status).toBe(201);
      const created = customerOrderSchema.parse(recorded.body);

      const { status, body } = await request(
        'PUT',
        `/api/v1/warehouses/${warehouseId}/customer-orders/${created.id}/delivery-address`,
        actor.cookie,
        { customerDeliveryAddressId: secondDeliveryAddressId },
      );

      expect(status).toBe(200);
      expect(body).toMatchObject({
        id: created.id,
        customer: { id: customerId, name: 'Test Customer North' },
        destination: {
          deliveryAddressId: secondDeliveryAddressId,
          addressText: 'Test Address 2, Test City',
          accessNotes: null,
          isMain: false,
          deactivatedAt: null,
        },
        state: 'unfulfilled',
      });
      expect(() => customerOrderSchema.parse(body)).not.toThrow();
    });

    it('denies a redirection to an actor without CUSTOMER_ORDERS:UPDATE', async () => {
      await seedWarehouses();
      const itemId = await seedItem({ sku: 'TEST-SKU-0005' });
      const { secondDeliveryAddressId } = await seedCustomerWithMainAddress(
        'Test Customer North',
      );
      const recorderId = await seedRecorder();
      const customerOrderId = await seedCustomerOrder(itemId, {
        recordedByUserId: recorderId,
      });
      const actor = await seedActor([CUSTOMER_ORDERS_WATCH]);

      const { status } = await request(
        'PUT',
        `/api/v1/warehouses/${warehouseId}/customer-orders/${customerOrderId}/delivery-address`,
        actor.cookie,
        { customerDeliveryAddressId: secondDeliveryAddressId },
      );

      expect(status).toBe(403);
    });

    // AC-09a — the other side of the observed Permission this route declares. The success case above
    // holds `CUSTOMERS:WATCH`, so without this one no test drives the redirection response as an
    // actor who may move an order but may not read customers, which
    // server-request-authorization.md §Verify requires of a handler declaring an observed Permission
    // (2026-09-04 backend re-review, finding 4). Asserted over the serialized body, so a withheld
    // field that came back `null` or empty-stringed would fail here rather than pass a shape check.
    it('withholds the Customer and the destination from a redirection without CUSTOMERS:WATCH (AC-09a)', async () => {
      await seedWarehouses();
      const itemId = await seedItem({ sku: 'TEST-SKU-0010' });
      const { customerId, deliveryAddressId, secondDeliveryAddressId } =
        await seedCustomerWithMainAddress('Test Customer North');

      // Seeded directly rather than recorded through the API, because `seedActor` grants onto one
      // shared Role: a second actor created to record the order would hand this one its
      // `CUSTOMERS:WATCH` too, and the withheld side would never be exercised. The order has to name
      // the Customer — a redirection of an order naming none is refused before any projection.
      const customerOrderId = await seedCustomerOrder(itemId, {
        recordedByUserId: await seedRecorder(),
        customerId,
        customerDeliveryAddressId: deliveryAddressId,
      });
      const actor = await seedActor([CUSTOMER_ORDERS_UPDATE]);

      const { status, body } = await request(
        'PUT',
        `/api/v1/warehouses/${warehouseId}/customer-orders/${customerOrderId}/delivery-address`,
        actor.cookie,
        { customerDeliveryAddressId: secondDeliveryAddressId },
      );

      expect(status).toBe(200);
      const serialized = JSON.stringify(body);
      // The redirection still happened — it is the identity in the response that is withheld, not
      // the write that is refused.
      for (const withheld of [
        'Test Customer North',
        'Test Address 2, Test City',
        'Gate code on the intercom; deliveries 09:00-17:00',
      ]) {
        expect(serialized).not.toContain(withheld);
      }
      for (const property of ['"customer"', '"destination"']) {
        expect(serialized).not.toContain(property);
      }
    });

    // AC-23 — redirection is a mutation and declares no `@ArchivedTolerantRead()`, so it is refused
    // over an archived Warehouse exactly as recording, amending and cancelling are. Each of those
    // three carries its own case; this one did not until the 2026-09-04 backend review (finding 14),
    // and server-request-authorization.md §Verify requires it of every new protected handler.
    it('refuses a redirection on an archived Warehouse (AC-23)', async () => {
      await seedWarehouses();
      const itemId = await seedItem({ sku: 'TEST-SKU-0009' });
      const { secondDeliveryAddressId } = await seedCustomerWithMainAddress(
        'Test Customer North',
      );
      const recorderId = await seedRecorder();
      const customerOrderId = await seedCustomerOrder(itemId, {
        recordedByUserId: recorderId,
      });
      const actor = await seedActor([CUSTOMER_ORDERS_UPDATE]);
      await setWarehouseArchived(warehouseId, seededAt);

      const { status, body } = await request(
        'PUT',
        `/api/v1/warehouses/${warehouseId}/customer-orders/${customerOrderId}/delivery-address`,
        actor.cookie,
        { customerDeliveryAddressId: secondDeliveryAddressId },
      );

      expect(status).toBe(409);
      expect(body).toMatchObject({ code: 'access.warehouse_archived' });
    });
  });

  describe('PATCH /api/v1/warehouses/:warehouseId/customer-orders/:customerOrderId', () => {
    it('records the change, recalculates the Outstanding Quantity and reflects it in the consolidated demand immediately (AC-19)', async () => {
      await seedWarehouses();
      const itemId = await seedItem({
        sku: 'TEST-SKU-0001',
        onHandQuantity: 0,
      });
      const customerOrderId = await seedCustomerOrder(itemId, {
        quantity: 100,
        neededBy: calendarDaysFromToday(20),
      });
      const actor = await seedActor([
        CUSTOMER_ORDERS_UPDATE,
        CUSTOMER_ORDERS_WATCH,
      ]);
      const movedTo = calendarDaysFromToday(40);

      const amended = await request(
        'PATCH',
        `/api/v1/warehouses/${warehouseId}/customer-orders/${customerOrderId}`,
        actor.cookie,
        { quantity: 120, neededBy: movedTo },
      );
      const demand = await request(
        'GET',
        `/api/v1/warehouses/${warehouseId}/demand`,
        actor.cookie,
      );

      expect(amended.status).toBe(200);
      expect(amended.body).toMatchObject({
        id: customerOrderId,
        quantity: 120,
        outstandingQuantity: 120,
        neededBy: movedTo,
        state: 'unfulfilled',
        updatedAt: expect.any(String),
      });
      expect(demand.body).toEqual([
        expect.objectContaining({
          itemId,
          totalOutstandingQuantity: 120,
          earliestNeededBy: movedTo,
        }),
      ]);
    });

    // The amendment Permission is `:UPDATE` alone — holding `:CANCEL` authorizes nothing here.
    it('denies an amendment to an actor without CUSTOMER_ORDERS:UPDATE', async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const customerOrderId = await seedCustomerOrder(itemId);
      const actor = await seedActor([CUSTOMER_ORDERS_CANCEL]);

      const { status, body } = await request(
        'PATCH',
        `/api/v1/warehouses/${warehouseId}/customer-orders/${customerOrderId}`,
        actor.cookie,
        { quantity: 120 },
      );

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'access.denied' });
    });

    it('reports a Customer Order of another Warehouse exactly as a missing one', async () => {
      await seedWarehouses();
      const crossWarehouseItemId = await seedItem({
        warehouseId: otherWarehouseId,
      });
      const crossWarehouseOrderId = await seedCustomerOrder(
        crossWarehouseItemId,
        { warehouseId: otherWarehouseId, customerName: 'Elsewhere Customer' },
      );
      const actor = await seedActor([CUSTOMER_ORDERS_UPDATE]);

      const crossWarehouse = await request(
        'PATCH',
        `/api/v1/warehouses/${warehouseId}/customer-orders/${crossWarehouseOrderId}`,
        actor.cookie,
        { quantity: 120 },
      );
      const missing = await request(
        'PATCH',
        `/api/v1/warehouses/${warehouseId}/customer-orders/${randomUUID()}`,
        actor.cookie,
        { quantity: 120 },
      );

      expect(crossWarehouse.status).toBe(404);
      expect(crossWarehouse.body).toMatchObject({
        code: 'customer_orders.target_unavailable',
      });
      expect(crossWarehouse).toEqual(missing);
      expect(JSON.stringify(crossWarehouse.body)).not.toContain(
        'Elsewhere Customer',
      );
    });

    it('refuses an empty amendment and a needed-by date that has passed (AC-19)', async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const customerOrderId = await seedCustomerOrder(itemId);
      const actor = await seedActor([CUSTOMER_ORDERS_UPDATE]);

      const empty = await request(
        'PATCH',
        `/api/v1/warehouses/${warehouseId}/customer-orders/${customerOrderId}`,
        actor.cookie,
        {},
      );
      const datePassed = await request(
        'PATCH',
        `/api/v1/warehouses/${warehouseId}/customer-orders/${customerOrderId}`,
        actor.cookie,
        { neededBy: calendarDaysFromToday(-1) },
      );

      expect(empty.status).toBe(400);
      expect(empty.body).toMatchObject({ code: 'request.invalid' });
      expect(datePassed.status).toBe(400);
      expect(datePassed.body).toMatchObject({
        code: 'customer_orders.needed_by_in_past',
      });
    });

    it('refuses to amend a Customer Order on an archived Warehouse (AC-23)', async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const customerOrderId = await seedCustomerOrder(itemId);
      const actor = await seedActor([CUSTOMER_ORDERS_UPDATE]);
      await setWarehouseArchived(warehouseId, seededAt);

      const { status, body } = await request(
        'PATCH',
        `/api/v1/warehouses/${warehouseId}/customer-orders/${customerOrderId}`,
        actor.cookie,
        { quantity: 120 },
      );

      expect(status).toBe(409);
      expect(body).toMatchObject({ code: 'access.warehouse_archived' });
    });
  });

  // -- POST /customer-orders/:id/cancellation -- cancel (AC-19a, AC-23) ------------------------

  describe('POST /api/v1/warehouses/:warehouseId/customer-orders/:customerOrderId/cancellation', () => {
    it('records the cancellation with its reason, the member and the time, and removes it from the consolidated demand (AC-19a)', async () => {
      await seedWarehouses();
      const itemId = await seedItem({ sku: 'TEST-SKU-0001' });
      const customerOrderId = await seedCustomerOrder(itemId, {
        quantity: 100,
      });
      const actor = await seedActor([
        CUSTOMER_ORDERS_CANCEL,
        CUSTOMER_ORDERS_WATCH,
      ]);

      const cancelled = await request(
        'POST',
        `/api/v1/warehouses/${warehouseId}/customer-orders/${customerOrderId}/cancellation`,
        actor.cookie,
        { cancellationReason: 'The customer no longer needs the goods' },
      );
      const demand = await request(
        'GET',
        `/api/v1/warehouses/${warehouseId}/demand`,
        actor.cookie,
      );

      expect(cancelled.status).toBe(200);
      expect(cancelled.body).toMatchObject({
        id: customerOrderId,
        state: 'cancelled',
        cancellationReason: 'The customer no longer needs the goods',
        cancelledByUserId: actor.userId,
        cancelledAt: expect.any(String),
      });
      expect(demand.body).toEqual([]);
    });

    // The cancellation sub-resource declares `:CANCEL` separately from `:UPDATE` (T11 §Notes), so
    // an actor who may amend may not cancel.
    it('denies a cancellation to an actor holding only CUSTOMER_ORDERS:UPDATE', async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const customerOrderId = await seedCustomerOrder(itemId);
      const actor = await seedActor([CUSTOMER_ORDERS_UPDATE]);

      const { status, body } = await request(
        'POST',
        `/api/v1/warehouses/${warehouseId}/customer-orders/${customerOrderId}/cancellation`,
        actor.cookie,
        { cancellationReason: 'The customer no longer needs the goods' },
      );

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'access.denied' });
    });

    it('refuses a cancellation submitted without a reason (AC-19a)', async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const customerOrderId = await seedCustomerOrder(itemId);
      const actor = await seedActor([CUSTOMER_ORDERS_CANCEL]);

      const { status, body } = await request(
        'POST',
        `/api/v1/warehouses/${warehouseId}/customer-orders/${customerOrderId}/cancellation`,
        actor.cookie,
        {},
      );

      expect(status).toBe(400);
      expect(body).toMatchObject({ code: 'request.invalid' });
    });

    it('refuses to cancel a Customer Order that is already cancelled', async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const customerOrderId = await seedCustomerOrder(itemId, {
        state: 'cancelled',
      });
      const actor = await seedActor([CUSTOMER_ORDERS_CANCEL]);

      const { status, body } = await request(
        'POST',
        `/api/v1/warehouses/${warehouseId}/customer-orders/${customerOrderId}/cancellation`,
        actor.cookie,
        { cancellationReason: 'Again' },
      );

      expect(status).toBe(409);
      expect(body).toMatchObject({ code: 'customer_orders.invalid_state' });
    });

    it('refuses to cancel a Customer Order on an archived Warehouse (AC-23)', async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const customerOrderId = await seedCustomerOrder(itemId);
      const actor = await seedActor([CUSTOMER_ORDERS_CANCEL]);
      await setWarehouseArchived(warehouseId, seededAt);

      const { status, body } = await request(
        'POST',
        `/api/v1/warehouses/${warehouseId}/customer-orders/${customerOrderId}/cancellation`,
        actor.cookie,
        { cancellationReason: 'The customer no longer needs the goods' },
      );

      expect(status).toBe(409);
      expect(body).toMatchObject({ code: 'access.warehouse_archived' });
    });
  });
});
