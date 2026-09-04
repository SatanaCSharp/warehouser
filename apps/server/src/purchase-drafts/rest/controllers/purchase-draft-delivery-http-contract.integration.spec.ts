import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  purchaseDraftDetailSchema,
  purchaseDraftLineListEntrySchema,
  purchaseDraftSummarySchema,
} from '@warehouser/contracts/purchase-drafts';
import { AppModule } from 'app.module';
import { digestSessionSecret } from 'auth/domain/security/session-secret';
import { AUTH_SESSION_COOKIE } from 'auth/rest/auth-cookie';
import { ZodValidationPipe } from 'nestjs-zod';
import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { CustomerEntity } from 'shared/domain/entities/customer.entity';
import { CustomerDeliveryAddressEntity } from 'shared/domain/entities/customer-delivery-address.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { PermissionEntity } from 'shared/domain/entities/permission.entity';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { RolePermissionEntity } from 'shared/domain/entities/role-permission.entity';
import { SessionEntity } from 'shared/domain/entities/session.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { GlobalHttpExceptionFilter } from 'shared/errors/global-http-exception.filter';

// T19 — the delivery half of the purchase-drafts HTTP surface, driven over real HTTP against the
// real Nest module graph and a real schema (AC-09a, AC-10, AC-12, AC-13, AC-16, AC-17, AC-22,
// AC-23). A file of its own beside `purchase-drafts-http-contract.integration.spec.ts`, which T16
// owns: that suite covers the assembly and transition surface, this one covers what the observed
// Permission decides, the by-line read, and the two refusals AC-12 asks for.
//
// **Redaction fails open.** The dangerous direction is a field leaking, not one missing, so every
// redaction assertion below is made against the **serialized response body** rather than against a
// parsed object: a `null` in place of an omitted property, an empty string in its place, or a
// differing key set all disclose something, and a matcher that only looks at one key would miss
// two of the three.

const seededAt = new Date('2026-08-25T09:00:00.000Z');

const WAREHOUSE_ADDRESS = 'Dock 4, Test Industrial Estate, Test City';
const WAREHOUSE_ACCESS_NOTES =
  'Report to the gatehouse; deliveries 07:00-15:00';
const CUSTOMER_NAME = 'Test Customer North';
const CUSTOMER_ADDRESS = 'Test Address 1, Test City';
const CUSTOMER_ACCESS_NOTES = 'Gate code 4417 on the intercom';

const PURCHASE_DRAFTS_WATCH = 'PURCHASE_DRAFTS:WATCH';
const PURCHASE_DRAFTS_UPDATE = 'PURCHASE_DRAFTS:UPDATE';
const PURCHASE_DRAFTS_READY = 'PURCHASE_DRAFTS:READY';
const PURCHASE_DRAFTS_RECEIVE = 'PURCHASE_DRAFTS:RECEIVE';
const CUSTOMERS_WATCH = 'CUSTOMERS:WATCH';

// eslint-disable-next-line max-lines-per-function -- one HTTP contract suite over one shared fixture
describe('purchase-drafts delivery HTTP contract', () => {
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

    baseUrl = `http://127.0.0.1:${app.getHttpServer().address().port}`;

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

  const workspaceId = randomUUID();
  const warehouseId = randomUUID();
  const otherWarehouseId = randomUUID();

  const seedWorld = async (): Promise<void> => {
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
        deliveryAddressText: WAREHOUSE_ADDRESS,
        deliveryAccessNotes: WAREHOUSE_ACCESS_NOTES,
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
  };

  const seedActorIn = async (
    actorWarehouseId: string,
    permissionIds: readonly string[],
  ): Promise<string> => {
    const userId = randomUUID();
    const actorRoleId = randomUUID();

    await dataSource.transaction(async (manager) => {
      await manager.getRepository(AccountEntity).insert({
        id: userId,
        userId,
        normalizedEmail: `member.${userId}@example.test`,
        passwordHash: 'synthetic-hash',
        passwordHashAlgorithm: 'scrypt',
        passwordHashParameters: { cost: 1_024 },
        createdAt: seededAt,
        updatedAt: seededAt,
      });
      // **No `workspace_memberships` row at all.** T11 could only prove half of "the address is
      // readable from the Warehouse-scoped draft and line projections by a member holding no
      // Workspace Role at all"; this fixture is the other half, and every actor in this suite is
      // built this way.
      await manager.getRepository(UserEntity).insert({
        id: userId,
        accountId: userId,
        workspaceId,
        createdAt: seededAt,
        updatedAt: seededAt,
      });
    });

    await dataSource.manager.getRepository(RoleEntity).insert({
      id: actorRoleId,
      warehouseId: actorWarehouseId,
      name: `Role ${actorRoleId}`,
      kind: 'custom',
      createdAt: seededAt,
      updatedAt: seededAt,
    });

    if (permissionIds.length > 0) {
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
          roleId: actorRoleId,
          permissionId,
          roleKind: 'custom' as const,
          permissionKind: 'assignable' as const,
        })),
      );
    }

    await dataSource.manager.getRepository(WarehouseMembershipEntity).insert({
      userId,
      warehouseId: actorWarehouseId,
      workspaceId,
      roleId: actorRoleId,
      roleKind: 'custom',
      createdAt: seededAt,
      updatedAt: seededAt,
    });

    const secret = randomUUID();
    const establishedAt = new Date();
    await dataSource.manager.getRepository(SessionEntity).insert({
      id: randomUUID(),
      accountId: userId,
      secretDigest: digestSessionSecret(secret),
      establishedAt,
      expiresAt: new Date(establishedAt.getTime() + 60 * 60 * 1000),
      revokedAt: null,
    });

    return `${AUTH_SESSION_COOKIE}=${secret}`;
  };

  const seedActor = (permissionIds: readonly string[]): Promise<string> =>
    seedActorIn(warehouseId, permissionIds);

  const seedCustomerAddress = async (
    ownerWarehouseId = warehouseId,
    deactivatedAt: Date | null = null,
  ): Promise<{ customerId: string; addressId: string }> => {
    const customerId = randomUUID();
    const addressId = randomUUID();
    const recordedByUserId = randomUUID();

    await dataSource.transaction(async (manager) => {
      await manager.getRepository(AccountEntity).insert({
        id: recordedByUserId,
        userId: recordedByUserId,
        normalizedEmail: `recorder.${recordedByUserId}@example.test`,
        passwordHash: 'synthetic-hash',
        passwordHashAlgorithm: 'scrypt',
        passwordHashParameters: { cost: 1_024 },
        createdAt: seededAt,
        updatedAt: seededAt,
      });
      await manager.getRepository(UserEntity).insert({
        id: recordedByUserId,
        accountId: recordedByUserId,
        workspaceId,
        createdAt: seededAt,
        updatedAt: seededAt,
      });
    });

    await dataSource.manager.getRepository(CustomerEntity).insert({
      id: customerId,
      warehouseId: ownerWarehouseId,
      name: `${CUSTOMER_NAME} ${customerId.slice(0, 4)}`,
      deactivatedAt: null,
      recordedByUserId,
      createdAt: seededAt,
      updatedAt: seededAt,
    });
    await dataSource.manager
      .getRepository(CustomerDeliveryAddressEntity)
      .insert({
        id: addressId,
        customerId,
        warehouseId: ownerWarehouseId,
        addressText: CUSTOMER_ADDRESS,
        accessNotes: CUSTOMER_ACCESS_NOTES,
        // `chk_customer_delivery_addresses_main_is_active` — an Inactive address is never the Main
        // one (AC-06b), so the seed cannot state both.
        isMain: deactivatedAt === null,
        deactivatedAt,
        createdAt: seededAt,
        updatedAt: seededAt,
      });

    return { customerId, addressId };
  };

  const seedItem = async (): Promise<string> => {
    const id = randomUUID();
    await dataSource.manager.getRepository(ItemEntity).insert({
      id,
      warehouseId,
      sku: `TEST-SKU-${id.slice(0, 8)}`,
      description: 'Test Item',
      unitOfMeasure: 'pieces',
      onHandQuantity: 0,
      deactivatedAt: null,
      createdAt: seededAt,
      updatedAt: seededAt,
    });
    return id;
  };

  const seedDraftWithLine = async (
    delivery: {
      deliveryMode?: 'via_warehouse' | 'direct_to_customer';
      customerDeliveryAddressId?: string | null;
      frozen?: boolean;
      frozenCustomerName?: string | null;
    } = {},
  ): Promise<{ draftId: string; lineId: string }> => {
    const draftId = randomUUID();
    const lineId = randomUUID();
    const itemId = await seedItem();
    const createdByUserId = randomUUID();

    await dataSource.transaction(async (manager) => {
      await manager.getRepository(AccountEntity).insert({
        id: createdByUserId,
        userId: createdByUserId,
        normalizedEmail: `author.${createdByUserId}@example.test`,
        passwordHash: 'synthetic-hash',
        passwordHashAlgorithm: 'scrypt',
        passwordHashParameters: { cost: 1_024 },
        createdAt: seededAt,
        updatedAt: seededAt,
      });
      await manager.getRepository(UserEntity).insert({
        id: createdByUserId,
        accountId: createdByUserId,
        workspaceId,
        createdAt: seededAt,
        updatedAt: seededAt,
      });
    });

    const frozen = delivery.frozen ?? false;
    await dataSource.manager.getRepository(PurchaseDraftEntity).insert({
      id: draftId,
      warehouseId,
      state: frozen ? 'ready_for_ordering' : 'draft',
      expectedArrivalDate: null,
      closureReason: null,
      createdByUserId,
      readiedByUserId: frozen ? createdByUserId : null,
      readiedAt: frozen ? seededAt : null,
      closedByUserId: null,
      closedAt: null,
      arrivalConfirmedByUserId: null,
      arrivalConfirmedAt: null,
      discardedByUserId: null,
      discardedAt: null,
      createdAt: seededAt,
      updatedAt: seededAt,
    });

    const deliveryMode = delivery.deliveryMode ?? 'via_warehouse';
    await dataSource.manager.getRepository(PurchaseDraftLineEntity).insert({
      id: lineId,
      purchaseDraftId: draftId,
      warehouseId,
      itemId,
      orderedQuantity: 100,
      packagingTypeId: null,
      valueAddingNote: null,
      deliveryMode,
      customerDeliveryAddressId: delivery.customerDeliveryAddressId ?? null,
      frozenDeliveryAddressText: frozen
        ? deliveryMode === 'via_warehouse'
          ? WAREHOUSE_ADDRESS
          : CUSTOMER_ADDRESS
        : null,
      frozenAccessNotes: frozen
        ? deliveryMode === 'via_warehouse'
          ? WAREHOUSE_ACCESS_NOTES
          : CUSTOMER_ACCESS_NOTES
        : null,
      frozenCustomerName: frozen ? (delivery.frozenCustomerName ?? null) : null,
      endingQuantity: null,
      endingKind: null,
      endingRecordedByUserId: null,
      endingRecordedAt: null,
      createdAt: seededAt,
      updatedAt: seededAt,
    });

    return { draftId, lineId };
  };

  const archive = (id: string): Promise<unknown> =>
    dataSource.manager
      .getRepository(WarehouseEntity)
      .update({ id }, { archivedAt: seededAt });

  const request = async (
    method: string,
    path: string,
    cookie: string,
    body?: unknown,
  ): Promise<{ status: number; body: unknown; text: string }> => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'content-type': 'application/json', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();

    return {
      status: response.status,
      body: text ? JSON.parse(text) : undefined,
      text,
    };
  };

  const draftsPath = `/api/v1/warehouses/${warehouseId}/purchase-drafts`;
  const linesPath = `/api/v1/warehouses/${warehouseId}/purchase-draft-lines`;

  // Every value an actor without `CUSTOMERS:WATCH` must not see anywhere in a response, whichever
  // key it might arrive under. Values, not only property names: a redaction that kept the key and
  // emptied it, and one that renamed the key, both fail here.
  const withheldValues = [
    CUSTOMER_NAME,
    CUSTOMER_ADDRESS,
    CUSTOMER_ACCESS_NOTES,
  ];
  const withheldProperties = [
    '"customerDestination"',
    '"customer"',
    '"customerName"',
    '"capturedDeliveryAddressId"',
    '"capturedDeliveryAddressText"',
    '"deliveryAddress"',
  ];

  // -- AC-09a on the direct-delivery route -------------------------------------------------------
  //
  // The route declares `@ObservedPermission(CUSTOMERS_WATCH)` and answers with a full
  // `PurchaseDraftDetail`, so its response is a redaction surface like any read.
  // server-request-authorization.md §Verify requires "the response on both sides of that
  // Permission" for every handler declaring one; before the 2026-09-04 backend review (finding 5)
  // this route had no HTTP coverage at all.
  describe('POST /purchase-drafts/{id}/lines/{lineId}/direct-delivery serves both projection forms (AC-09a)', () => {
    it('withholds the Customer destination from an actor without CUSTOMERS:WATCH', async () => {
      await seedWorld();
      const { addressId } = await seedCustomerAddress();
      const { draftId, lineId } = await seedDraftWithLine({
        deliveryMode: 'direct_to_customer',
        customerDeliveryAddressId: addressId,
        frozen: true,
      });
      const cookie = await seedActor([PURCHASE_DRAFTS_RECEIVE]);

      const { status, text } = await request(
        'POST',
        `${draftsPath}/${draftId}/lines/${lineId}/direct-delivery`,
        cookie,
        { deliveredQuantity: 100 },
      );

      expect(status).toBe(200);
      for (const property of withheldProperties) {
        expect(text).not.toContain(property);
      }
      for (const value of withheldValues) {
        expect(text).not.toContain(value);
      }
    });

    it('serves the Customer destination to an actor holding CUSTOMERS:WATCH', async () => {
      await seedWorld();
      const { addressId } = await seedCustomerAddress();
      const { draftId, lineId } = await seedDraftWithLine({
        deliveryMode: 'direct_to_customer',
        customerDeliveryAddressId: addressId,
        frozen: true,
      });
      const cookie = await seedActor([
        PURCHASE_DRAFTS_RECEIVE,
        CUSTOMERS_WATCH,
      ]);

      const { status, text } = await request(
        'POST',
        `${draftsPath}/${draftId}/lines/${lineId}/direct-delivery`,
        cookie,
        { deliveredQuantity: 100 },
      );

      expect(status).toBe(200);
      expect(text).toContain(CUSTOMER_NAME);
    });
  });

  // -- AC-09a: the two projection forms of one draft ---------------------------------------------

  describe('GET /purchase-drafts/{id} serves both projection forms (AC-09a)', () => {
    it('withholds the Customer destination entirely from an actor without CUSTOMERS:WATCH', async () => {
      await seedWorld();
      const { addressId } = await seedCustomerAddress();
      const { draftId } = await seedDraftWithLine({
        deliveryMode: 'direct_to_customer',
        customerDeliveryAddressId: addressId,
      });
      const cookie = await seedActor([PURCHASE_DRAFTS_WATCH]);

      const { status, body, text } = await request(
        'GET',
        `${draftsPath}/${draftId}`,
        cookie,
      );

      expect(status).toBe(200);
      // The response validates as the contract's `PurchaseDraftDetail`, which is `oneOf` the two
      // line forms — a half-redacted line matches neither branch and would fail here.
      expect(purchaseDraftDetailSchema.safeParse(body).success).toBe(true);
      for (const property of withheldProperties) {
        expect(text).not.toContain(property);
      }
      for (const value of withheldValues) {
        expect(text).not.toContain(value);
      }
    });

    it('serves the Customer destination to an actor holding CUSTOMERS:WATCH', async () => {
      await seedWorld();
      const { customerId, addressId } = await seedCustomerAddress();
      const { draftId } = await seedDraftWithLine({
        deliveryMode: 'direct_to_customer',
        customerDeliveryAddressId: addressId,
      });
      const cookie = await seedActor([PURCHASE_DRAFTS_WATCH, CUSTOMERS_WATCH]);

      const { status, body } = await request(
        'GET',
        `${draftsPath}/${draftId}`,
        cookie,
      );

      expect(status).toBe(200);
      expect(purchaseDraftDetailSchema.safeParse(body).success).toBe(true);
      const line = (body as { lines: { customerDestination: unknown }[] })
        .lines[0];
      expect(line?.customerDestination).toEqual({
        customerDeliveryAddressId: addressId,
        customerId,
        customerName: expect.stringContaining(CUSTOMER_NAME),
        addressText: CUSTOMER_ADDRESS,
        accessNotes: CUSTOMER_ACCESS_NOTES,
        // AC-16/AC-17 — a `draft`-state line reads its destination **live**, so a correction of the
        // address in place still reaches it. `frozen` becomes true only at Ready for Ordering.
        frozen: false,
      });
    });

    // AC-10/sad.md §7 — the Warehouse's own Delivery Address is the operator's own premises data
    // rather than a third party's (spec.md § "Personal data touched"), so it is read under
    // `PURCHASE_DRAFTS:WATCH` alone and **never** gated on `CUSTOMERS:WATCH`. openapi.yaml
    // `LineWarehouseDestination` requires `accessNotes` on the same terms:
    // `WAREHOUSES:ADDRESS_UPDATE` gates **recording** the address, not reading it.
    //
    // T11's precondition, asserted end to end: the actor here holds `PURCHASE_DRAFTS:WATCH` and has
    // **no `workspace_memberships` row at all** — no Workspace Role whatsoever.
    it('serves the Warehouse destination to a member holding no Workspace Role at all (AC-10)', async () => {
      await seedWorld();
      const { draftId } = await seedDraftWithLine({
        deliveryMode: 'via_warehouse',
      });
      const cookie = await seedActor([PURCHASE_DRAFTS_WATCH]);

      const { status, body } = await request(
        'GET',
        `${draftsPath}/${draftId}`,
        cookie,
      );

      expect(status).toBe(200);
      expect(
        (body as { lines: { warehouseDestination: unknown }[] }).lines[0]
          ?.warehouseDestination,
      ).toEqual({
        addressText: WAREHOUSE_ADDRESS,
        accessNotes: WAREHOUSE_ACCESS_NOTES,
        frozen: false,
      });
    });

    // AC-16/AC-17 — from Ready for Ordering the destination is the statement captured at the
    // freeze, not the reference: correcting the Warehouse's address in place afterwards has nowhere
    // to travel.
    it('serves the frozen statement rather than the live address once the draft is ready', async () => {
      await seedWorld();
      const { draftId } = await seedDraftWithLine({
        deliveryMode: 'via_warehouse',
        frozen: true,
      });
      await dataSource.manager.getRepository(WarehouseEntity).update(
        { id: warehouseId },
        {
          deliveryAddressText: 'A corrected address the supplier never saw',
          deliveryAccessNotes: 'Corrected notes',
        },
      );
      const cookie = await seedActor([PURCHASE_DRAFTS_WATCH]);

      const { body } = await request('GET', `${draftsPath}/${draftId}`, cookie);

      expect(
        (body as { lines: { warehouseDestination: unknown }[] }).lines[0]
          ?.warehouseDestination,
      ).toEqual({
        addressText: WAREHOUSE_ADDRESS,
        accessNotes: WAREHOUSE_ACCESS_NOTES,
        frozen: true,
      });
    });
  });

  // -- AC-22: the by-line read --------------------------------------------------------------------

  describe('GET /purchase-draft-lines (AC-22)', () => {
    it('serves the by-line split at the top level, narrowable by Delivery Mode', async () => {
      await seedWorld();
      const { addressId } = await seedCustomerAddress();
      const { lineId: viaLineId } = await seedDraftWithLine({
        deliveryMode: 'via_warehouse',
      });
      const { lineId: directLineId } = await seedDraftWithLine({
        deliveryMode: 'direct_to_customer',
        customerDeliveryAddressId: addressId,
      });
      const cookie = await seedActor([PURCHASE_DRAFTS_WATCH, CUSTOMERS_WATCH]);

      const all = await request('GET', linesPath, cookie);
      expect(all.status).toBe(200);
      expect(
        (all.body as unknown[]).every(
          (entry) => purchaseDraftLineListEntrySchema.safeParse(entry).success,
        ),
      ).toBe(true);
      expect(
        (all.body as { line: { id: string } }[])
          .map((entry) => entry.line.id)
          .sort(),
      ).toEqual([directLineId, viaLineId].sort());

      const direct = await request(
        'GET',
        `${linesPath}?deliveryMode=direct_to_customer`,
        cookie,
      );
      expect(
        (direct.body as { line: { id: string } }[]).map(
          (entry) => entry.line.id,
        ),
      ).toEqual([directLineId]);
    });

    it('withholds the Customer destination from an actor without CUSTOMERS:WATCH, and keeps the Warehouse one (AC-09a, AC-10)', async () => {
      await seedWorld();
      const { addressId } = await seedCustomerAddress();
      await seedDraftWithLine({ deliveryMode: 'via_warehouse' });
      await seedDraftWithLine({
        deliveryMode: 'direct_to_customer',
        customerDeliveryAddressId: addressId,
      });
      const cookie = await seedActor([PURCHASE_DRAFTS_WATCH]);

      const { status, body, text } = await request('GET', linesPath, cookie);

      expect(status).toBe(200);
      expect(
        (body as unknown[]).every(
          (entry) => purchaseDraftLineListEntrySchema.safeParse(entry).success,
        ),
      ).toBe(true);
      for (const property of withheldProperties) {
        expect(text).not.toContain(property);
      }
      for (const value of withheldValues) {
        expect(text).not.toContain(value);
      }
      // …and the Warehouse's own address is still there in full, access notes included.
      expect(text).toContain(WAREHOUSE_ADDRESS);
      expect(text).toContain(WAREHOUSE_ACCESS_NOTES);
    });

    it('serves no line of another Warehouse', async () => {
      await seedWorld();
      await seedDraftWithLine({ deliveryMode: 'via_warehouse' });
      const cookie = await seedActorIn(otherWarehouseId, [
        PURCHASE_DRAFTS_WATCH,
      ]);

      const { status, body } = await request(
        'GET',
        `/api/v1/warehouses/${otherWarehouseId}/purchase-draft-lines`,
        cookie,
      );

      expect(status).toBe(200);
      expect(body).toEqual([]);
    });

    it('refuses an actor whose Role does not carry PURCHASE_DRAFTS:WATCH', async () => {
      await seedWorld();
      const cookie = await seedActor([CUSTOMERS_WATCH]);

      const { status } = await request('GET', linesPath, cookie);

      // An observed Permission can never admit: holding `CUSTOMERS:WATCH` alone is denied exactly
      // as holding nothing is (server-request-authorization.md § "Why an observed Permission
      // cannot deny").
      expect(status).toBe(403);
    });
  });

  // -- AC-23: the archived read/write split --------------------------------------------------------

  describe('an archived Warehouse serves every read and refuses every mutation (AC-23)', () => {
    it.each([
      ['the draft list', () => draftsPath],
      ['one draft', (draftId: string) => `${draftsPath}/${draftId}`],
      ['the by-line read', () => linesPath],
    ] as const)('serves %s on an archived Warehouse', async (_case, path) => {
      await seedWorld();
      const { draftId } = await seedDraftWithLine({
        deliveryMode: 'via_warehouse',
      });
      const cookie = await seedActor([PURCHASE_DRAFTS_WATCH]);
      await archive(warehouseId);

      const { status } = await request('GET', path(draftId), cookie);

      expect(status).toBe(200);
    });

    it.each([
      [
        'the line-delivery revision',
        'PATCH',
        (draftId: string, lineId: string) =>
          `${draftsPath}/${draftId}/lines/${lineId}`,
        { deliveryMode: 'via_warehouse' },
      ],
      [
        'the readiness transition',
        'POST',
        (draftId: string) => `${draftsPath}/${draftId}/readiness`,
        undefined,
      ],
      [
        'the closure',
        'POST',
        (draftId: string) => `${draftsPath}/${draftId}/closure`,
        { closureReason: 'The supplier cannot fulfil the order' },
      ],
    ] as const)(
      'refuses %s on an archived Warehouse',
      async (_case, method, path, payload) => {
        await seedWorld();
        const { draftId, lineId } = await seedDraftWithLine({
          deliveryMode: 'via_warehouse',
        });
        const cookie = await seedActor([
          PURCHASE_DRAFTS_WATCH,
          PURCHASE_DRAFTS_UPDATE,
          PURCHASE_DRAFTS_READY,
          'PURCHASE_DRAFTS:CLOSE',
        ]);
        await archive(warehouseId);

        const { status, body } = await request(
          method,
          path(draftId, lineId),
          cookie,
          payload,
        );

        expect(status).toBe(409);
        expect(body).toMatchObject({ code: 'access.warehouse_archived' });
      },
    );
  });

  // -- AC-12: the address a Direct to Customer line ships to ---------------------------------------

  describe('PATCH a line’s destination proves the address (AC-12)', () => {
    // The defect T15 left open: before T19 this reached
    // `fk_purchase_draft_lines_delivery_address` and the resulting `QueryFailedError` surfaced as a
    // **500**, on an operation whose contract declares no internal failure at all.
    it.each([
      ['an address that does not exist', () => Promise.resolve(randomUUID())],
      [
        'an address of another Warehouse',
        async () => (await seedCustomerAddress(otherWarehouseId)).addressId,
      ],
    ])(
      'refuses %s with the declared 404 and never an internal error',
      async (_case, addressOf) => {
        await seedWorld();
        const { draftId, lineId } = await seedDraftWithLine();
        const addressId = await addressOf();
        const cookie = await seedActor([
          PURCHASE_DRAFTS_WATCH,
          PURCHASE_DRAFTS_UPDATE,
        ]);

        const { status, body } = await request(
          'PATCH',
          `${draftsPath}/${draftId}/lines/${lineId}`,
          cookie,
          {
            deliveryMode: 'direct_to_customer',
            customerDeliveryAddressId: addressId,
          },
        );

        expect(status).toBe(404);
        expect(body).toMatchObject({ code: 'customers.target_unavailable' });
        // The refusal enumerates nothing: an address of another Warehouse and a missing one are
        // indistinguishable from the outside (spec.md §6.1).
        expect(body).not.toHaveProperty('details');
      },
    );

    it('refuses an Inactive address with the declared 409, and writes nothing', async () => {
      await seedWorld();
      const { addressId } = await seedCustomerAddress(warehouseId, seededAt);
      const { draftId, lineId } = await seedDraftWithLine();
      const cookie = await seedActor([
        PURCHASE_DRAFTS_WATCH,
        PURCHASE_DRAFTS_UPDATE,
      ]);

      const { status, body } = await request(
        'PATCH',
        `${draftsPath}/${draftId}/lines/${lineId}`,
        cookie,
        {
          deliveryMode: 'direct_to_customer',
          customerDeliveryAddressId: addressId,
        },
      );

      expect(status).toBe(409);
      expect(body).toMatchObject({
        code: 'customers.invalid_delivery_address',
      });

      const line = await dataSource.manager
        .getRepository(PurchaseDraftLineEntity)
        .findOneByOrFail({ id: lineId });
      expect(line.deliveryMode).toBe('via_warehouse');
      expect(line.customerDeliveryAddressId).toBeNull();
    });

    it('records the destination when the address is an active one of this Warehouse', async () => {
      await seedWorld();
      const { addressId } = await seedCustomerAddress();
      const { draftId, lineId } = await seedDraftWithLine();
      const cookie = await seedActor([
        PURCHASE_DRAFTS_WATCH,
        PURCHASE_DRAFTS_UPDATE,
        CUSTOMERS_WATCH,
      ]);

      const { status, body } = await request(
        'PATCH',
        `${draftsPath}/${draftId}/lines/${lineId}`,
        cookie,
        {
          deliveryMode: 'direct_to_customer',
          customerDeliveryAddressId: addressId,
        },
      );

      expect(status).toBe(200);
      expect(purchaseDraftDetailSchema.safeParse(body).success).toBe(true);
      expect(
        (
          body as {
            lines: {
              customerDestination: { customerDeliveryAddressId: string } | null;
            }[];
          }
        ).lines[0]?.customerDestination?.customerDeliveryAddressId,
      ).toBe(addressId);
    });

    // AC-13/openapi.yaml — "setting `via_warehouse` clears it". The REST adapter folds the payload's
    // two flat properties into the one the use case takes and normalizes the address to `null`.
    it('clears the address when the line comes back to the dock', async () => {
      await seedWorld();
      const { addressId } = await seedCustomerAddress();
      const { draftId, lineId } = await seedDraftWithLine({
        deliveryMode: 'direct_to_customer',
        customerDeliveryAddressId: addressId,
      });
      const cookie = await seedActor([
        PURCHASE_DRAFTS_WATCH,
        PURCHASE_DRAFTS_UPDATE,
      ]);

      const { status } = await request(
        'PATCH',
        `${draftsPath}/${draftId}/lines/${lineId}`,
        cookie,
        { deliveryMode: 'via_warehouse' },
      );

      expect(status).toBe(200);
      const line = await dataSource.manager
        .getRepository(PurchaseDraftLineEntity)
        .findOneByOrFail({ id: lineId });
      expect(line.deliveryMode).toBe('via_warehouse');
      expect(line.customerDeliveryAddressId).toBeNull();
    });

    // openapi.yaml `dependentRequired: { customerDeliveryAddressId: [deliveryMode] }` — refused by
    // the shared schema at 400, before any route code runs.
    it.each([
      ['an address with no Delivery Mode', { customerDeliveryAddressId: null }],
      [
        'a Via Warehouse line naming a Customer Delivery Address',
        {
          deliveryMode: 'via_warehouse',
          customerDeliveryAddressId: '00000000-0000-4000-8000-000000000401',
        },
      ],
      ['an unknown Delivery Mode', { deliveryMode: 'courier' }],
    ])('refuses %s at 400', async (_case, payload) => {
      await seedWorld();
      const { draftId, lineId } = await seedDraftWithLine();
      const cookie = await seedActor([
        PURCHASE_DRAFTS_WATCH,
        PURCHASE_DRAFTS_UPDATE,
      ]);

      const { status } = await request(
        'PATCH',
        `${draftsPath}/${draftId}/lines/${lineId}`,
        cookie,
        payload,
      );

      expect(status).toBe(400);
    });
  });

  // -- AC-17: no frozen delivery column is writable ------------------------------------------------

  // Proved on the **payloads** rather than on the handlers: a handler that merely ignores an unknown
  // key is one refactor away from reading it, while a `strictObject` that refuses it cannot be
  // widened without this failing (spec.md §6 "Frozen-address integrity").
  describe('no frozen delivery column is reachable through any payload (AC-17)', () => {
    const frozenColumns = {
      frozenDeliveryAddressText: 'An address the supplier was never told',
      frozenAccessNotes: 'A gate code',
      frozenCustomerName: 'Another customer entirely',
      warehouseDestination: {
        addressText: 'x',
        accessNotes: null,
        frozen: false,
      },
      customerDestination: null,
    };

    it.each(Object.entries(frozenColumns))(
      'refuses %s on the line-delivery payload',
      async (field, value) => {
        await seedWorld();
        const { draftId, lineId } = await seedDraftWithLine();
        const cookie = await seedActor([
          PURCHASE_DRAFTS_WATCH,
          PURCHASE_DRAFTS_UPDATE,
        ]);

        const { status } = await request(
          'PATCH',
          `${draftsPath}/${draftId}/lines/${lineId}`,
          cookie,
          { deliveryMode: 'via_warehouse', [field]: value },
        );

        expect(status).toBe(400);
      },
    );

    it.each(Object.entries(frozenColumns))(
      'refuses %s on the closure payload',
      async (field, value) => {
        await seedWorld();
        const { draftId } = await seedDraftWithLine({ frozen: true });
        const cookie = await seedActor([
          PURCHASE_DRAFTS_WATCH,
          'PURCHASE_DRAFTS:CLOSE',
        ]);

        const { status } = await request(
          'POST',
          `${draftsPath}/${draftId}/closure`,
          cookie,
          { closureReason: 'The supplier cannot fulfil', [field]: value },
        );

        expect(status).toBe(400);
      },
    );

    // AC-17 — and after Ready for Ordering the two destination properties are unwritable by
    // construction rather than by a check: the write path resolves no frozen draft at all.
    it('refuses a destination revision on a frozen draft, changing nothing', async () => {
      await seedWorld();
      const { addressId } = await seedCustomerAddress();
      const { draftId, lineId } = await seedDraftWithLine({
        deliveryMode: 'via_warehouse',
        frozen: true,
      });
      const cookie = await seedActor([
        PURCHASE_DRAFTS_WATCH,
        PURCHASE_DRAFTS_UPDATE,
      ]);

      const { status } = await request(
        'PATCH',
        `${draftsPath}/${draftId}/lines/${lineId}`,
        cookie,
        {
          deliveryMode: 'direct_to_customer',
          customerDeliveryAddressId: addressId,
        },
      );

      expect(status).toBe(409);
      const line = await dataSource.manager
        .getRepository(PurchaseDraftLineEntity)
        .findOneByOrFail({ id: lineId });
      expect(line.deliveryMode).toBe('via_warehouse');
      expect(line.frozenDeliveryAddressText).toBe(WAREHOUSE_ADDRESS);
    });
  });

  // -- AC-16a/AC-18a: the summary's two drift flags -------------------------------------------------

  it('carries both drift flags on the draft list, which has one projection form (AC-16a, AC-18a)', async () => {
    await seedWorld();
    await seedDraftWithLine({ deliveryMode: 'via_warehouse' });
    const cookie = await seedActor([PURCHASE_DRAFTS_WATCH]);

    const { status, body } = await request('GET', draftsPath, cookie);

    expect(status).toBe(200);
    const [summary] = body as unknown[];
    expect(purchaseDraftSummarySchema.safeParse(summary).success).toBe(true);
    // Always `false` for a draft that was never frozen; both are derived on this read and stored
    // nowhere (spec.md §6 "Address-drift freshness").
    expect(summary).toMatchObject({
      hasDriftSignal: false,
      hasDirectToCustomerAddressDrift: false,
    });
  });
});
